const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");

const TEST_POSTGRES_DATABASE_URL = String(process.env.TEST_POSTGRES_DATABASE_URL || "").trim();
const storageModes = [{ label: "sqlite", databaseUrl: "" }];
if (TEST_POSTGRES_DATABASE_URL) {
  storageModes.push({ label: "postgres", databaseUrl: TEST_POSTGRES_DATABASE_URL });
}

const managedEnvKeys = [
  "NODE_ENV",
  "DATA_DIR",
  "RECEIPT_OUTPUT_DIR",
  "RECEIPT_IMMEDIATE_ON_APPROVE",
  "SESSION_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "STUDENT_ROSTER_PATH",
  "TEACHER_ROSTER_PATH",
  "LECTURER_ROSTER_PATH",
  "DEPARTMENT_GROUPS_PATH",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_PUBLIC_KEY",
  "PAYSTACK_WEBHOOK_SECRET",
  "PAYSTACK_CALLBACK_URL",
  "DATABASE_URL",
];

function writeTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(content || ""), "utf8");
}

function closeDatabase(db) {
  if (!db) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}

function buildDepartmentGroupsCsv() {
  return ["science,arts", "science,arts", "physics,"].join("\n");
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
  return agent.post("/login").set("X-CSRF-Token", csrfToken).type("form").send({ username, password });
}

async function createHarness(mode, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `paytec-roster-${mode.label}-`));
  const studentRosterPath = path.join(dataDir, "students.csv");
  const teacherRosterPath = path.join(dataDir, "teachers.csv");
  const departmentGroupsPath = path.join(dataDir, "department-groups.csv");
  const previousEnv = Object.fromEntries(managedEnvKeys.map((key) => [key, process.env[key]]));

  writeTextFile(studentRosterPath, options.studentCsv || "");
  writeTextFile(teacherRosterPath, options.teacherCsv || "");
  writeTextFile(departmentGroupsPath, options.departmentGroupsCsv || buildDepartmentGroupsCsv());

  jest.resetModules();

  process.env.NODE_ENV = "test";
  process.env.DATA_DIR = dataDir;
  process.env.RECEIPT_OUTPUT_DIR = path.join(dataDir, "outputs", "receipts");
  process.env.RECEIPT_IMMEDIATE_ON_APPROVE = "false";
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "admin-pass-123";
  process.env.STUDENT_ROSTER_PATH = studentRosterPath;
  process.env.TEACHER_ROSTER_PATH = teacherRosterPath;
  process.env.LECTURER_ROSTER_PATH = teacherRosterPath;
  process.env.DEPARTMENT_GROUPS_PATH = departmentGroupsPath;
  process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack_secret";
  process.env.PAYSTACK_PUBLIC_KEY = "pk_test_paystack_public";
  process.env.PAYSTACK_WEBHOOK_SECRET = "sk_test_paystack_secret";
  process.env.PAYSTACK_CALLBACK_URL = "http://localhost:3000/api/payments/paystack/callback";
  if (mode.databaseUrl) {
    process.env.DATABASE_URL = mode.databaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }

  const server = require("../server");
  const { app, initDatabase, run, get, all, db } = server;

  await initDatabase();
  await run("DELETE FROM roster_import_state");
  await run("DELETE FROM login_events");
  await run("DELETE FROM messages");
  await run("DELETE FROM message_participants");
  await run("DELETE FROM message_threads");
  await run("DELETE FROM user_password_overrides");
  await run("DELETE FROM user_profiles");
  await run("DELETE FROM audit_logs");
  await run("DELETE FROM auth_roster");
  await run("DELETE FROM users WHERE role != 'admin'");
  await initDatabase();

  return {
    app,
    initDatabase,
    run,
    get,
    all,
    db,
    dataDir,
    studentRosterPath,
    teacherRosterPath,
    cleanup: async () => {
      await closeDatabase(db);
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch (_err) {
        // Windows can hold session-store files briefly after the database closes.
      }
      managedEnvKeys.forEach((key) => {
        if (previousEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previousEnv[key];
        }
      });
      jest.resetModules();
    },
  };
}

describe.each(storageModes)("roster storage ($label)", (mode) => {
  test("startup bootstraps roster once and later restarts keep database as the source of truth", async () => {
    const harness = await createHarness(mode, {
      studentCsv: [
        "matric_number,surname,department,name",
        "std_001,Doe,science,Student One",
        "std_002,Roe,arts,Student Two",
      ].join("\n"),
      teacherCsv: [
        "teacher_code,surname,department,full_name",
        "teach_001,Teach,science,Lecturer One",
      ].join("\n"),
    });

    try {
      const rosterRows = await harness.all(
        "SELECT auth_id, role, department, source_file FROM auth_roster ORDER BY role ASC, auth_id ASC"
      );
      expect(
        rosterRows.map((row) => ({
          auth_id: row.auth_id,
          role: row.role,
          department: row.department,
          source_file: row.source_file,
        }))
      ).toEqual([
        {
          auth_id: "std_001",
          role: "student",
          department: "science",
          source_file: "students.csv",
        },
        {
          auth_id: "std_002",
          role: "student",
          department: "arts",
          source_file: "students.csv",
        },
        {
          auth_id: "teach_001",
          role: "teacher",
          department: "science",
          source_file: "teachers.csv",
        },
      ]);

      const initialStateRows = await harness.all(
        "SELECT role, import_status, imported_count FROM roster_import_state ORDER BY role ASC"
      );
      expect(initialStateRows).toEqual([
        { role: "student", import_status: "imported_from_csv", imported_count: 2 },
        { role: "teacher", import_status: "imported_from_csv", imported_count: 1 },
      ]);

      const studentLogin = await login(request.agent(harness.app), "std_001", "doe");
      expect(studentLogin.status).toBe(302);
      expect(studentLogin.headers.location).toBe("/");

      const teacherLogin = await login(request.agent(harness.app), "teach_001", "teach");
      expect(teacherLogin.status).toBe(302);
      expect(teacherLogin.headers.location).toBe("/lecturer");

      writeTextFile(
        harness.studentRosterPath,
        [
          "matric_number,surname,department,name",
          "std_001,Changed,arts,Student One Updated",
          "std_002,Roe,arts,Student Two",
        ].join("\n")
      );

      await harness.initDatabase();

      const studentRow = await harness.get(
        "SELECT department, source_file FROM auth_roster WHERE auth_id = ? AND role = 'student' LIMIT 1",
        ["std_001"]
      );
      expect(studentRow).toEqual({
        department: "science",
        source_file: "students.csv",
      });

      const oldPasswordStillWorks = await login(request.agent(harness.app), "std_001", "doe");
      expect(oldPasswordStillWorks.status).toBe(302);
      expect(oldPasswordStillWorks.headers.location).toBe("/");

      const changedCsvPasswordFails = await login(request.agent(harness.app), "std_001", "changed");
      expect(changedCsvPasswordFails.status).toBe(302);
      expect(changedCsvPasswordFails.headers.location).toContain("/login?error=invalid");
    } finally {
      await harness.cleanup();
    }
  });

  test("admin preview endpoint keeps duplicate validation behavior and student import writes to auth_roster", async () => {
    const harness = await createHarness(mode);

    try {
      const admin = request.agent(harness.app);
      const adminLogin = await login(admin, "admin", "admin-pass-123");
      expect(adminLogin.status).toBe(302);
      expect(adminLogin.headers.location).toBe("/admin");

      const preview = await postJson(admin, "/api/admin/import/students/preview", {
        csvText: [
          "matric_number,surname,department,name",
          "std_dup,Doe,science,Duplicate One",
          "std_dup,Roe,science,Duplicate Two",
        ].join("\n"),
      });

      expect(preview.status).toBe(200);
      expect(preview.body.summary).toMatchObject({
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
        duplicateRows: 1,
        imported: 1,
      });
      expect(preview.body.rows).toEqual([
        expect.objectContaining({
          lineNumber: 2,
          identifier: "std_dup",
          status: "insert",
        }),
        expect.objectContaining({
          lineNumber: 3,
          identifier: "std_dup",
          status: "duplicate_in_file",
          message: "Duplicate matric_number in this upload.",
        }),
      ]);

      const importedRow = await harness.get(
        "SELECT auth_id FROM auth_roster WHERE auth_id = ? AND role = 'student' LIMIT 1",
        ["std_dup"]
      );
      expect(importedRow).toBeNull();

      const studentImport = await postJson(admin, "/api/admin/import/students", {
        csvText: [
          "matric_number,surname,department,name",
          "std_120,Stone,science,Student Stone",
        ].join("\n"),
      });

      expect(studentImport.status).toBe(200);
      expect(studentImport.body.summary).toMatchObject({
        validRows: 1,
        invalidRows: 0,
        inserts: 1,
        updates: 0,
        imported: 1,
      });

      const studentRow = await harness.get(
        "SELECT auth_id, role, department, source_file FROM auth_roster WHERE auth_id = ? AND role = 'student' LIMIT 1",
        ["std_120"]
      );
      expect(studentRow).toEqual({
        auth_id: "std_120",
        role: "student",
        department: "science",
        source_file: "admin-upload-students.csv",
      });

      const studentProfile = await harness.get(
        "SELECT display_name FROM user_profiles WHERE username = ? LIMIT 1",
        ["std_120"]
      );
      expect(studentProfile).toEqual({ display_name: "Student Stone" });

      const studentLogin = await login(request.agent(harness.app), "std_120", "stone");
      expect(studentLogin.status).toBe(302);
      expect(studentLogin.headers.location).toBe("/");
    } finally {
      await harness.cleanup();
    }
  });

  test("admin import endpoint upserts lecturer roster rows while preserving login and role behavior", async () => {
    const harness = await createHarness(mode);

    try {
      const admin = request.agent(harness.app);
      const adminLogin = await login(admin, "admin", "admin-pass-123");
      expect(adminLogin.status).toBe(302);
      expect(adminLogin.headers.location).toBe("/admin");

      const firstImport = await postJson(admin, "/api/admin/import/lecturers", {
        csvText: [
          "teacher_code,surname,department,full_name",
          "teach_900,Teach,science,Dr Science",
        ].join("\n"),
      });

      expect(firstImport.status).toBe(200);
      expect(firstImport.body.summary).toMatchObject({
        validRows: 1,
        invalidRows: 0,
        inserts: 1,
        updates: 0,
        imported: 1,
      });

      const firstLecturerLogin = await login(request.agent(harness.app), "teach_900", "teach");
      expect(firstLecturerLogin.status).toBe(302);
      expect(firstLecturerLogin.headers.location).toBe("/lecturer");

      const secondImport = await postJson(admin, "/api/admin/import/lecturers", {
        csvText: [
          "lecturer_code,surname,dept,display_name",
          "teach_900,Updated,arts,Dr Updated",
        ].join("\n"),
      });

      expect(secondImport.status).toBe(200);
      expect(secondImport.body.summary).toMatchObject({
        validRows: 1,
        invalidRows: 0,
        inserts: 0,
        updates: 1,
        imported: 1,
      });

      const rosterCount = await harness.get(
        "SELECT COUNT(*) AS count, MIN(department) AS department, MIN(source_file) AS source_file FROM auth_roster WHERE auth_id = ? AND role = 'teacher'",
        ["teach_900"]
      );
      expect(rosterCount).toEqual({
        count: expect.anything(),
        department: "arts",
        source_file: "admin-upload-lecturers.csv",
      });
      expect(Number(rosterCount.count || 0)).toBe(1);

      const profileRow = await harness.get(
        "SELECT display_name FROM user_profiles WHERE username = ? LIMIT 1",
        ["teach_900"]
      );
      expect(profileRow).toEqual({ display_name: "Dr Updated" });

      const oldPasswordRejected = await login(request.agent(harness.app), "teach_900", "teach");
      expect(oldPasswordRejected.status).toBe(302);
      expect(oldPasswordRejected.headers.location).toContain("/login?error=invalid");

      const updatedPasswordAccepted = await login(request.agent(harness.app), "teach_900", "updated");
      expect(updatedPasswordAccepted.status).toBe(302);
      expect(updatedPasswordAccepted.headers.location).toBe("/lecturer");
    } finally {
      await harness.cleanup();
    }
  });

  test("lecturer department-scoped student visibility stays unchanged when roster data comes from the database", async () => {
    const harness = await createHarness(mode, {
      studentCsv: [
        "matric_number,surname,department,name",
        "std_art,Arts,arts,Arts Student",
        "std_phy,Physics,physics,Physics Student",
        "std_sci,Science,science,Science Student",
      ].join("\n"),
      teacherCsv: [
        "teacher_code,surname,department,full_name",
        "teach_art,Teach,arts,Arts Lecturer",
        "teach_sci,Teach,science,Science Lecturer",
      ].join("\n"),
    });

    try {
      const scienceLecturer = request.agent(harness.app);
      const lecturerLogin = await login(scienceLecturer, "teach_sci", "teach");
      expect(lecturerLogin.status).toBe(302);
      expect(lecturerLogin.headers.location).toBe("/lecturer");

      const lecturerDirectory = await scienceLecturer.get("/api/messages/students");
      expect(lecturerDirectory.status).toBe(200);
      expect(lecturerDirectory.body.students.map((student) => student.username)).toEqual(["std_phy", "std_sci"]);

      const blockedThread = await postJson(scienceLecturer, "/api/messages/threads", {
        subject: "Out of scope",
        recipients: ["std_art"],
        message: "This should stay blocked.",
      });
      expect(blockedThread.status).toBe(403);
      expect(String(blockedThread.body.error || "")).toMatch(/department scope/i);

      const admin = request.agent(harness.app);
      const adminLogin = await login(admin, "admin", "admin-pass-123");
      expect(adminLogin.status).toBe(302);
      expect(adminLogin.headers.location).toBe("/admin");

      const adminDirectory = await admin.get("/api/messages/students");
      expect(adminDirectory.status).toBe(200);
      expect(adminDirectory.body.students.map((student) => student.username)).toEqual([
        "std_art",
        "std_phy",
        "std_sci",
      ]);
    } finally {
      await harness.cleanup();
    }
  });
});
