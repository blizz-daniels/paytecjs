const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  isAuthenticated,
  requireAuth,
  requireTeacherOnly,
  requireStudent,
} = require("../lib/server/auth/session-guards");
const { createAuthDomain } = require("../lib/server/auth");
const { createPaymentDomain } = require("../lib/server/payments");
const { createContentAccessService } = require("../lib/server/storage");
const { createContentStorage, parseReactionDetails } = require("../lib/server/content/storage");
const { STATIC_HTML_ROUTES, registerStaticHtmlPageRoutes } = require("../lib/server/pages/static-page-registry");

function createResponseDouble() {
  return {
    statusCode: 200,
    redirectPath: null,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    redirect(target) {
      this.redirectPath = target;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
  };
}

describe("server module extraction", () => {
  test("session guards preserve existing auth and role behavior", () => {
    const next = jest.fn();

    expect(isAuthenticated({ session: { user: { username: "std_001" } } })).toBe(true);
    expect(isAuthenticated({})).toBe(false);

    const authRes = createResponseDouble();
    requireAuth({ session: { user: { username: "std_001", role: "student" } } }, authRes, next);
    expect(next).toHaveBeenCalledTimes(1);

    const adminTeacherOnlyRes = createResponseDouble();
    requireTeacherOnly({ session: { user: { username: "admin", role: "admin" } } }, adminTeacherOnlyRes, jest.fn());
    expect(adminTeacherOnlyRes.redirectPath).toBe("/admin");

    const studentOnlyRes = createResponseDouble();
    requireStudent({ session: { user: { username: "teach_001", role: "teacher" } } }, studentOnlyRes, jest.fn());
    expect(studentOnlyRes.statusCode).toBe(403);
    expect(studentOnlyRes.jsonBody).toEqual({ error: "Only students can perform this action." });
  });

  test("content storage helpers keep file access scoped to managed content roots", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "paytec-content-"));
    const contentFilesDir = path.join(tmpDir, "content-files");
    const handoutsDir = path.join(contentFilesDir, "handouts");
    fs.mkdirSync(handoutsDir, { recursive: true });
    const handoutPath = path.join(handoutsDir, "lesson.pdf");
    fs.writeFileSync(handoutPath, "legacy receipt text", "utf8");

    const storage = createContentStorage({
      fs,
      path,
      contentFilesDir,
      legacyPlainReceiptMaxBytes: 2000,
    });

    try {
      expect(storage.resolveStoredContentPath("/content-files/handouts/lesson.pdf")).toBe(handoutPath);
      expect(storage.resolveStoredContentPath("/content-files/../../secrets.txt")).toBe(null);
      expect(storage.isPathInsideDirectory(contentFilesDir, handoutPath)).toBe(true);
      expect(storage.isPathInsideDirectory(contentFilesDir, path.join(tmpDir, "elsewhere.txt"))).toBe(false);
      expect(storage.isLikelyLegacyPlainReceipt(handoutPath)).toBe(true);
      expect(parseReactionDetails("std_001|like, teach_001|wow")).toEqual([
        { username: "std_001", reaction: "like" },
        { username: "teach_001", reaction: "wow" },
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("static page registry centralizes protected html entry points", () => {
    const calls = [];
    const app = {
      get(paths, ...handlers) {
        calls.push({ paths, handlers });
      },
    };

    const guards = {
      requireAuth: jest.fn(),
      requireTeacher: jest.fn(),
      requireTeacherOnly: jest.fn(),
      requireNonAdmin: jest.fn(),
    };

    registerStaticHtmlPageRoutes(app, {
      path,
      projectRoot: "C:/repo",
      guards,
    });

    expect(calls).toHaveLength(STATIC_HTML_ROUTES.length);
    const paymentsRoute = calls.find((call) => Array.isArray(call.paths) && call.paths.includes("/payments"));
    expect(paymentsRoute).toBeTruthy();
    expect(paymentsRoute.handlers[0]).toBe(guards.requireNonAdmin);
    expect(typeof paymentsRoute.handlers[1]).toBe("function");
  });

  test("storage service centralizes department lookup and scoping helpers", async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ department: "computer science" })
      .mockResolvedValueOnce({ department: "engineering" });
    const all = jest.fn().mockResolvedValue([{ auth_id: "std_001", department: "science" }]);
    const storageService = createContentAccessService({
      get,
      all,
      normalizeIdentifier: (value) => String(value || "").trim().toLowerCase(),
      normalizeDepartment: (value) => String(value || "").trim().toLowerCase(),
      isValidDepartment: (value) => !!String(value || "").trim(),
      departmentScopeMatchesStudent: (target, studentDepartment) => String(target || "") === "all" || target === studentDepartment,
    });

    await expect(storageService.getRosterUserDepartment("Std_001", "student")).resolves.toBe("computer science");
    await expect(
      storageService.getSessionUserDepartment({ actorUsername: "teach_001", actorRole: "teacher" })
    ).resolves.toBe("engineering");
    await expect(
      storageService.resolveContentTargetDepartment({
        actorRole: "admin",
        actorDepartment: "",
        providedDepartment: "science",
      })
    ).resolves.toBe("science");
    await expect(storageService.listStudentDepartmentRows()).resolves.toEqual([{ auth_id: "std_001", department: "science" }]);
    expect(storageService.rowMatchesStudentDepartmentScope({ target_department: "science" }, "science")).toBe(true);
  });

  test("payment domain validates payment item input before route wiring uses it", () => {
    const paymentDomain = createPaymentDomain({
      parseMoneyValue: (value) => Number(value),
      parseCurrency: (value) => (String(value || "").trim().length === 3 ? String(value || "").trim().toUpperCase() : ""),
      parseAvailabilityDays: (value) => {
        const parsed = Number.parseInt(String(value || ""), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      },
      computeAvailableUntil: (days) => `+${days}d`,
      isValidIsoLikeDate: (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value || "")),
      toDateOnly: (value) => String(value || "").slice(0, 10),
      sanitizeTransactionRef: (value) => String(value || "").trim(),
      normalizeReference: (value) => String(value || "").trim().toLowerCase(),
      normalizeWhitespace: (value) => String(value || "").replace(/\s+/g, " ").trim(),
      normalizeStatementName: (value) => String(value || "").trim().toLowerCase(),
      normalizeIdentifier: (value) => String(value || "").trim().toLowerCase(),
      parseResourceId: (value) => Number(value) || null,
      buildTransactionChecksum: () => "checksum",
    });

    expect(
      paymentDomain.validatePaymentItemInput({
        title: "Tuition",
        description: "Core tuition",
        expectedAmount: "25000",
        currency: "ngn",
        dueDate: "2026-09-01",
        availabilityDays: "30",
      })
    ).toEqual(
      expect.objectContaining({
        title: "Tuition",
        expectedAmount: 25000,
        currency: "NGN",
        dueDate: "2026-09-01",
        availabilityDays: 30,
        availableUntil: "+30d",
      })
    );

    expect(() =>
      paymentDomain.validatePaymentItemInput({
        title: "",
        expectedAmount: "0",
        currency: "naira",
      })
    ).toThrow();
  });

  test("auth domain parses checklist toggles consistently across form-style values", () => {
    const authDomain = createAuthDomain();
    expect(authDomain.parseChecklistCompleted(true)).toBe(true);
    expect(authDomain.parseChecklistCompleted("yes")).toBe(true);
    expect(authDomain.parseChecklistCompleted("1")).toBe(true);
    expect(authDomain.parseChecklistCompleted("false")).toBe(false);
  });
});
