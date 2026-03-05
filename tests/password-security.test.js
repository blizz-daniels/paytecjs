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
process.env.PASSWORD_RESET_OTP_TTL_MINUTES = "10";
process.env.PASSWORD_RESET_OTP_LENGTH = "6";
process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS = "5";
process.env.PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS = "0";

const { app, initDatabase, run, db } = require("../server");

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

async function seedRosterAndProfile() {
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
  await run(
    `
      INSERT INTO user_profiles (username, display_name, email, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(username) DO UPDATE SET
        email = excluded.email,
        updated_at = CURRENT_TIMESTAMP
    `,
    ["std_001", "Student One", "std_001@example.com"]
  );
}

beforeAll(async () => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.mkdirSync(testDataDir, { recursive: true });
  await initDatabase();
});

beforeEach(async () => {
  await run("DELETE FROM password_reset_otps");
  await run("DELETE FROM user_password_overrides");
  await run("DELETE FROM user_profiles");
  await run("DELETE FROM auth_roster");
  await run("DELETE FROM users WHERE role != 'admin'");
  await seedRosterAndProfile();
});

afterAll(async () => {
  await new Promise((resolve) => db.close(resolve));
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("student can create stronger password once and second profile change is blocked", async () => {
  const student = request.agent(app);
  const loginResponse = await login(student, "std_001", "doe");
  expect(loginResponse.status).toBe(302);
  expect(loginResponse.headers.location).toBe("/");

  const firstSetup = await postJson(student, "/api/profile/password", {
    currentPassword: "doe",
    newPassword: "MyStr0ng!Pass2026",
    confirmPassword: "MyStr0ng!Pass2026",
  });
  expect(firstSetup.status).toBe(200);
  expect(firstSetup.body.ok).toBe(true);

  const meResponse = await student.get("/api/me");
  expect(meResponse.status).toBe(200);
  expect(meResponse.body.customPasswordEnabled).toBe(true);
  expect(meResponse.body.canSetOneTimeStrongPassword).toBe(false);

  const secondSetup = await postJson(student, "/api/profile/password", {
    currentPassword: "MyStr0ng!Pass2026",
    newPassword: "An0ther!Pass2026",
    confirmPassword: "An0ther!Pass2026",
  });
  expect(secondSetup.status).toBe(403);
  expect(String(secondSetup.body.error || "")).toMatch(/once/i);
});

test("forgot-password reset uses email OTP verification", async () => {
  const student = request.agent(app);
  const loginResponse = await login(student, "std_001", "doe");
  expect(loginResponse.status).toBe(302);

  const setup = await postJson(student, "/api/profile/password", {
    currentPassword: "doe",
    newPassword: "MyStr0ng!Pass2026",
    confirmPassword: "MyStr0ng!Pass2026",
  });
  expect(setup.status).toBe(200);

  const guest = request.agent(app);
  const sendOtp = await postJson(guest, "/api/auth/password-recovery/send-otp", {
    username: "std_001",
  });
  expect(sendOtp.status).toBe(200);
  expect(sendOtp.body.ok).toBe(true);
  expect(String(sendOtp.body.otpCode || "").length).toBe(6);
  const wrongOtp = sendOtp.body.otpCode === "000000" ? "111111" : "000000";

  const wrongOtpReset = await postJson(guest, "/api/auth/password-recovery/reset", {
    username: "std_001",
    otpCode: wrongOtp,
    newPassword: "Reset!Pass2026A",
    confirmPassword: "Reset!Pass2026A",
  });
  expect(wrongOtpReset.status).toBe(403);

  const validOtpReset = await postJson(guest, "/api/auth/password-recovery/reset", {
    username: "std_001",
    otpCode: sendOtp.body.otpCode,
    newPassword: "Reset!Pass2026A",
    confirmPassword: "Reset!Pass2026A",
  });
  expect(validOtpReset.status).toBe(200);
  expect(validOtpReset.body.ok).toBe(true);

  const oldLogin = await login(request.agent(app), "std_001", "MyStr0ng!Pass2026");
  expect(oldLogin.status).toBe(302);
  expect(oldLogin.headers.location).toContain("/login?error=invalid");

  const newLogin = await login(request.agent(app), "std_001", "Reset!Pass2026A");
  expect(newLogin.status).toBe(302);
  expect(newLogin.headers.location).toBe("/");
});
