const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const request = require("supertest");

const testDataDir = path.join(__dirname, "tmp-password-security-data");
process.env.NODE_ENV = "test";
process.env.DATA_DIR = testDataDir;
process.env.RECEIPT_OUTPUT_DIR = path.join(testDataDir, "outputs", "receipts");
process.env.RECEIPT_IMMEDIATE_ON_APPROVE = "false";
process.env.SESSION_SECRET = "test-session-secret";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.STUDENT_ROSTER_PATH = path.join(testDataDir, "students.csv");
process.env.TEACHER_ROSTER_PATH = path.join(testDataDir, "teachers.csv");
process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack_secret";
process.env.PAYSTACK_PUBLIC_KEY = "pk_test_paystack_public";
process.env.PAYSTACK_WEBHOOK_SECRET = "sk_test_paystack_secret";
process.env.PAYSTACK_CALLBACK_URL = "http://localhost:3000/api/payments/paystack/callback";

const { app, initDatabase, run, get, all, db } = require("../server");

const baseSecurityAnswers = {
  home_nickname: "quiet lion 77",
  private_childhood_friend: "Bamidele Akinwale",
  first_phone_details: "Nokia 3310 blue",
  hidden_family_place: "Old market riverside",
  personal_life_motto: "Build before bragging",
};

function normalizeSecurityAnswer(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function getCsrfToken(agent) {
  const response = await agent.get("/api/csrf-token");
  expect(response.status).toBe(200);
  expect(response.body.csrfToken).toBeTruthy();
  return response.body.csrfToken;
}

async function postJson(agent, url, payload) {
  const csrfToken = await getCsrfToken(agent);
  return agent.post(url).set("X-CSRF-Token", csrfToken).send(payload);
}

async function login(agent, username, password) {
  const csrfToken = await getCsrfToken(agent);
  return agent
    .post("/login")
    .set("X-CSRF-Token", csrfToken)
    .type("form")
    .send({ username, password });
}

async function seedRoster() {
  const studentHash = await bcrypt.hash("doe", 12);
  const teacherHash = await bcrypt.hash("teach", 12);
  await run(
    `
      INSERT INTO auth_roster (auth_id, role, password_hash, source_file)
      VALUES
        ('std_001', 'student', ?, 'tests'),
        ('teach_001', 'teacher', ?, 'tests')
    `,
    [studentHash, teacherHash]
  );
}

beforeAll(async () => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.mkdirSync(testDataDir, { recursive: true });
  await initDatabase();
});

beforeEach(async () => {
  await run("DELETE FROM user_security_answers");
  await run("DELETE FROM user_password_overrides");
  await run("DELETE FROM auth_roster");
  await run("DELETE FROM users WHERE role != 'admin'");
  await seedRoster();
});

afterAll(async () => {
  await new Promise((resolve) => db.close(resolve));
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("student stronger password setup stores hashed security answers and blocks second setup", async () => {
  const student = request.agent(app);
  const loginResponse = await login(student, "std_001", "doe");
  expect(loginResponse.status).toBe(302);
  expect(loginResponse.headers.location).toBe("/");

  const firstSetup = await postJson(student, "/api/profile/password", {
    currentPassword: "doe",
    newPassword: "MyStr0ng!Pass2026",
    confirmPassword: "MyStr0ng!Pass2026",
    securityAnswers: baseSecurityAnswers,
  });
  expect(firstSetup.status).toBe(200);
  expect(firstSetup.body.ok).toBe(true);

  const override = await get("SELECT password_hash FROM user_password_overrides WHERE username = ?", ["std_001"]);
  expect(override).toBeTruthy();
  expect(typeof override.password_hash).toBe("string");
  expect(override.password_hash).not.toContain("MyStr0ng!Pass2026");

  const storedAnswers = await all(
    "SELECT question_key, answer_hash FROM user_security_answers WHERE username = ? ORDER BY question_key ASC",
    ["std_001"]
  );
  expect(storedAnswers.length).toBe(5);
  for (const row of storedAnswers) {
    expect(String(row.answer_hash || "")).not.toBe("");
    expect(String(row.answer_hash || "")).not.toContain(" ");
    expect(String(row.answer_hash || "")).not.toContain("quiet lion 77");
  }
  const nicknameRow = storedAnswers.find((row) => row.question_key === "home_nickname");
  expect(nicknameRow).toBeTruthy();
  const nicknameMatch = await bcrypt.compare(normalizeSecurityAnswer(baseSecurityAnswers.home_nickname), nicknameRow.answer_hash);
  expect(nicknameMatch).toBe(true);

  const meResponse = await student.get("/api/me");
  expect(meResponse.status).toBe(200);
  expect(meResponse.body.customPasswordEnabled).toBe(true);
  expect(meResponse.body.canSetOneTimeStrongPassword).toBe(false);

  const secondSetup = await postJson(student, "/api/profile/password", {
    currentPassword: "MyStr0ng!Pass2026",
    newPassword: "An0ther!Pass2026",
    confirmPassword: "An0ther!Pass2026",
    securityAnswers: baseSecurityAnswers,
  });
  expect(secondSetup.status).toBe(403);
  expect(String(secondSetup.body.error || "")).toMatch(/once/i);
});

test("forgot-password reset requires correct security answers and updates custom password", async () => {
  const student = request.agent(app);
  const loginResponse = await login(student, "std_001", "doe");
  expect(loginResponse.status).toBe(302);

  const setup = await postJson(student, "/api/profile/password", {
    currentPassword: "doe",
    newPassword: "MyStr0ng!Pass2026",
    confirmPassword: "MyStr0ng!Pass2026",
    securityAnswers: baseSecurityAnswers,
  });
  expect(setup.status).toBe(200);

  const guest = request.agent(app);
  const wrongReset = await postJson(guest, "/api/auth/password-recovery/reset", {
    username: "std_001",
    newPassword: "Reset!Pass2026A",
    confirmPassword: "Reset!Pass2026A",
    securityAnswers: {
      ...baseSecurityAnswers,
      personal_life_motto: "wrong answer value",
    },
  });
  expect(wrongReset.status).toBe(403);

  const validReset = await postJson(guest, "/api/auth/password-recovery/reset", {
    username: "std_001",
    newPassword: "Reset!Pass2026A",
    confirmPassword: "Reset!Pass2026A",
    securityAnswers: baseSecurityAnswers,
  });
  expect(validReset.status).toBe(200);
  expect(validReset.body.ok).toBe(true);

  const oldLogin = await login(request.agent(app), "std_001", "MyStr0ng!Pass2026");
  expect(oldLogin.status).toBe(302);
  expect(oldLogin.headers.location).toContain("/login?error=invalid");

  const newLogin = await login(request.agent(app), "std_001", "Reset!Pass2026A");
  expect(newLogin.status).toBe(302);
  expect(newLogin.headers.location).toBe("/");
});
