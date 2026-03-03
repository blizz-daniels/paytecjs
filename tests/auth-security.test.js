const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const request = require("supertest");

const testDataDir = path.join(__dirname, "tmp-auth-security-data");
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

const { app, initDatabase, run, db } = require("../server");

async function getCsrfToken(agent) {
  const response = await agent.get("/api/csrf-token");
  expect(response.status).toBe(200);
  expect(response.body.csrfToken).toBeTruthy();
  return response.body.csrfToken;
}

async function login(agent, username, password) {
  const csrfToken = await getCsrfToken(agent);
  const response = await agent
    .post("/login")
    .set("X-CSRF-Token", csrfToken)
    .type("form")
    .send({ username, password });
  return response;
}

async function postJson(agent, url, payload) {
  const csrfToken = await getCsrfToken(agent);
  return agent.post(url).set("X-CSRF-Token", csrfToken).send(payload);
}

async function logout(agent) {
  const csrfToken = await getCsrfToken(agent);
  return agent.post("/logout").set("X-CSRF-Token", csrfToken).send({});
}

beforeAll(async () => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.mkdirSync(testDataDir, { recursive: true });
  await initDatabase();

  await run("DELETE FROM auth_tokens");
  await run("DELETE FROM user_password_overrides");
  await run("DELETE FROM user_profiles");
  await run("DELETE FROM auth_roster");
  await run("DELETE FROM users WHERE role != 'admin'");

  const studentDoeHash = await bcrypt.hash("doe", 12);
  const teacherHash = await bcrypt.hash("teach", 12);
  await run(
    `
      INSERT INTO auth_roster (auth_id, role, password_hash, source_file)
      VALUES
        ('std_001', 'student', ?, 'tests'),
        ('teach_001', 'teacher', ?, 'tests')
    `,
    [studentDoeHash, teacherHash]
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

beforeEach(async () => {
  await run("DELETE FROM auth_tokens");
  await run("DELETE FROM user_password_overrides");
  await run("DELETE FROM user_profiles");
});

afterAll(async () => {
  await new Promise((resolve) => db.close(resolve));
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("profile email is only activated after verification code is confirmed", async () => {
  const student = request.agent(app);
  const loginResponse = await login(student, "std_001", "doe");
  expect(loginResponse.status).toBe(302);

  const saveEmail = await postJson(student, "/api/profile/email", {
    email: "std_001@example.com",
  });
  expect(saveEmail.status).toBe(200);
  expect(saveEmail.body.requiresVerification).toBe(true);
  expect(saveEmail.body.debugCode).toMatch(/^\d{6}$/);

  const beforeVerify = await student.get("/api/me");
  expect(beforeVerify.status).toBe(200);
  expect(beforeVerify.body.email).toBeNull();
  expect(beforeVerify.body.pendingEmailVerification.email).toBe("std_001@example.com");

  const verifyEmail = await postJson(student, "/api/profile/email/verify", {
    code: saveEmail.body.debugCode,
  });
  expect(verifyEmail.status).toBe(200);
  expect(verifyEmail.body.email).toBe("std_001@example.com");

  const afterVerify = await student.get("/api/me");
  expect(afterVerify.status).toBe(200);
  expect(afterVerify.body.email).toBe("std_001@example.com");
  expect(afterVerify.body.emailVerified).toBe(true);
  expect(afterVerify.body.pendingEmailVerification).toBeNull();
});

test("custom password replaces surname login password", async () => {
  const student = request.agent(app);
  const loginResponse = await login(student, "std_001", "doe");
  expect(loginResponse.status).toBe(302);

  const updatePassword = await postJson(student, "/api/profile/password", {
    currentPassword: "doe",
    newPassword: "NewPass!123",
    confirmPassword: "NewPass!123",
  });
  expect(updatePassword.status).toBe(200);
  expect(updatePassword.body.ok).toBe(true);

  const logoutResponse = await logout(student);
  expect(logoutResponse.status).toBe(302);

  const oldPasswordLogin = await login(student, "std_001", "doe");
  expect(oldPasswordLogin.status).toBe(302);
  expect(oldPasswordLogin.headers.location).toContain("/login?error=invalid");

  const newPasswordLogin = await login(student, "std_001", "NewPass!123");
  expect(newPasswordLogin.status).toBe(302);
  expect(newPasswordLogin.headers.location).toBe("/");
});

test("forgot password issues reset code for verified email and sets new login password", async () => {
  const student = request.agent(app);
  const loginResponse = await login(student, "std_001", "doe");
  expect(loginResponse.status).toBe(302);

  const setEmail = await postJson(student, "/api/profile/email", {
    email: "std_001@example.com",
  });
  expect(setEmail.status).toBe(200);
  if (setEmail.body.requiresVerification) {
    const verifyEmail = await postJson(student, "/api/profile/email/verify", {
      code: setEmail.body.debugCode,
    });
    expect(verifyEmail.status).toBe(200);
  }

  const logoutResponse = await logout(student);
  expect(logoutResponse.status).toBe(302);

  const forgotPassword = await postJson(student, "/api/auth/forgot-password", {
    username: "std_001",
  });
  expect(forgotPassword.status).toBe(200);
  expect(forgotPassword.body.debugCode).toMatch(/^\d{6}$/);

  const resetPassword = await postJson(student, "/api/auth/reset-password", {
    username: "std_001",
    code: forgotPassword.body.debugCode,
    newPassword: "Reset!Pass123",
    confirmPassword: "Reset!Pass123",
  });
  expect(resetPassword.status).toBe(200);
  expect(resetPassword.body.ok).toBe(true);

  const oldPasswordLogin = await login(student, "std_001", "NewPass!123");
  expect(oldPasswordLogin.status).toBe(302);
  expect(oldPasswordLogin.headers.location).toContain("/login?error=invalid");

  const originalSurnameLogin = await login(student, "std_001", "doe");
  expect(originalSurnameLogin.status).toBe(302);
  expect(originalSurnameLogin.headers.location).toContain("/login?error=invalid");

  const newPasswordLogin = await login(student, "std_001", "Reset!Pass123");
  expect(newPasswordLogin.status).toBe(302);
  expect(newPasswordLogin.headers.location).toBe("/");
});
