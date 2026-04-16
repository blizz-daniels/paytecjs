const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { openDatabaseClient } = require("../../../services/database-client");
const { resolveDatabaseRuntime } = require("../../../services/runtime-database");
const { createAuthDomain } = require("../auth");
const { createContentAccessService, createObjectStorageService, createFileMetadataService } = require("../storage");
const { createNotificationService } = require("../notifications");
const { createHandoutService } = require("../handouts");
const { createMessageService } = require("../messages");
const { createSharedFileService } = require("../shared-files");
const { isValidHttpUrl, parseResourceId } = require("../http/request-utils");
const { isValidLocalContentUrl, parseReactionDetails } = require("../content/storage");
const { getAuthSessionPayload } = require("../auth/next-auth");
const { normalizeNodeEnv, resolveWritableRuntimePath } = require("../runtime/runtime-paths");

const PROJECT_ROOT = path.resolve(__dirname, "../../../");

let contextPromise = null;
let runtimeConfig = null;

function noop() {}

function getRuntimeConfig() {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  const nodeEnv = normalizeNodeEnv(process.env.NODE_ENV);
  const isProduction = nodeEnv === "production";
  const dataDir = resolveWritableRuntimePath({
    configuredPath: process.env.DATA_DIR,
    envName: "DATA_DIR",
    nodeEnv,
    productionDefault: "/tmp/paytec",
    developmentDefault: path.join(PROJECT_ROOT, "data"),
  });
  const dbPath = path.join(dataDir, "paytec.sqlite");
  const databaseRuntime = resolveDatabaseRuntime({
    nodeEnv,
    databaseUrl: process.env.DATABASE_URL,
    sqlitePath: dbPath,
    dataDir,
  });

  runtimeConfig = {
    isProduction,
    dataDir,
    databaseRuntime,
  };

  return runtimeConfig;
}

async function buildContext() {
  const runtime = getRuntimeConfig();
  const db = openDatabaseClient({
    driver: runtime.databaseRuntime.driver,
    sqlitePath: runtime.databaseRuntime.sqlitePath || undefined,
    databaseUrl: runtime.databaseRuntime.databaseUrl || undefined,
    isProduction: runtime.databaseRuntime.isProduction,
  });

  const run = (sql, params = []) => db.run(sql, params);
  const get = (sql, params = []) => db.get(sql, params);
  const all = (sql, params = []) => db.all(sql, params);
  const withSqlTransaction = (work) => db.transaction(work);

  const authDomain = createAuthDomain({
    fs,
    crypto,
    bcrypt: require("bcryptjs"),
    get,
    run,
    all,
    withSqlTransaction,
    getPasswordOverride: async () => null,
    getUserProfile: async () => null,
    findProfileEmailOwner: async () => null,
    upsertProfileEmail: async () => null,
    upsertPasswordOverride: async () => null,
    getLatestPasswordResetOtp: async () => null,
    invalidateActivePasswordResetOtps: async () => null,
    createPasswordResetOtp: async () => 0,
    markPasswordResetOtpConsumed: async () => null,
    incrementPasswordResetOtpAttempt: async () => null,
    sendPasswordResetOtpEmail: async () => null,
    logPasswordResetAuditEvent: async () => null,
    takePasswordResetRateLimitAttempt: () => ({ limited: false, retryAfterSeconds: 0 }),
    getSessionUserDepartment: async () => "",
    deriveDisplayNameFromIdentifier: (identifier) => String(identifier || ""),
    departmentGroupsPath: path.resolve(process.env.DEPARTMENT_GROUPS_PATH || path.join(PROJECT_ROOT, "data", "department-groups.csv")),
    isTestEnvironment: process.env.NODE_ENV === "test",
  });

  const normalizeIdentifier = authDomain.normalizeIdentifier;
  const normalizeDepartment = authDomain.normalizeDepartment;
  const isValidDepartment = authDomain.isValidDepartment;
  const formatDepartmentLabel = authDomain.formatDepartmentLabel;
  const departmentScopeMatchesStudent = authDomain.departmentScopeMatchesStudent;
  const allowedNotificationReactions = new Set(["like", "love", "haha", "wow", "sad"]);

  const objectStorage = createObjectStorageService({
    fs,
    crypto,
    fetchImpl: typeof global.fetch === "function" ? global.fetch.bind(global) : undefined,
    isProduction: runtime.isProduction,
    dataDir: runtime.dataDir,
  });

  const fileMetadataService = createFileMetadataService({
    get,
    run,
    all,
  });

  async function ensureRuntimeSchema() {
    await run(`
      CREATE TABLE IF NOT EXISTS stored_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        legacy_url TEXT NOT NULL UNIQUE,
        storage_provider TEXT NOT NULL DEFAULT 'supabase',
        bucket TEXT NOT NULL,
        object_path TEXT NOT NULL,
        object_ref TEXT,
        category TEXT NOT NULL DEFAULT 'generic',
        owner_username TEXT,
        owner_role TEXT,
        access_scope TEXT NOT NULL DEFAULT 'authenticated',
        content_type TEXT,
        byte_size INTEGER NOT NULL DEFAULT 0,
        original_filename TEXT,
        linked_table TEXT,
        linked_id INTEGER,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_stored_files_category ON stored_files(category)");
    await run("CREATE INDEX IF NOT EXISTS idx_stored_files_owner ON stored_files(owner_username)");
  }
  await ensureRuntimeSchema();

  function sanitizeStorageSegment(value, fallback = "file") {
    const cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || fallback;
  }

  function toLegacyFileToken(originalName = "", fallbackPrefix = "file") {
    const ext = path.extname(String(originalName || "")).toLowerCase().slice(0, 12);
    const stem = path.basename(String(originalName || ""), path.extname(String(originalName || "")));
    const safeStem = sanitizeStorageSegment(stem, fallbackPrefix).slice(0, 48);
    const nonce = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    return `${safeStem}-${nonce}${ext || ""}`;
  }

  function normalizeStoredContentCategory(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (!normalized) {
      throw new Error("Storage category is required.");
    }
    if (!["avatars", "handouts", "shared", "statements", "approved_receipts", "exports"].includes(normalized)) {
      throw new Error(`Unsupported storage category: ${normalized}`);
    }
    return normalized;
  }

  function buildLegacyUrlForCategory(category, token) {
    const safeToken = sanitizeStorageSegment(token, "file");
    if (category === "avatars") {
      return `/users/${safeToken}`;
    }
    if (category === "handouts" || category === "shared") {
      return `/content-files/${category}/${safeToken}`;
    }
    return `/files/${category}/${safeToken}`;
  }

  async function storeUploadedContentFile(input = {}) {
    const category = normalizeStoredContentCategory(input.category);
    const actorUsername = normalizeIdentifier(input.actorUsername || "");
    const actorRole = String(input.actorRole || "").trim().toLowerCase() || "teacher";
    const file = input.file;
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
      throw new Error("Uploaded file buffer is required.");
    }
    const contentType = String(file.mimetype || "application/octet-stream").trim() || "application/octet-stream";
    const originalFilename = String(file.originalname || "").trim() || "upload.bin";
    const token = toLegacyFileToken(originalFilename, category);
    const legacyUrl = buildLegacyUrlForCategory(category, token);
    const bucketKeyByCategory = {
      avatars: "avatars",
      handouts: "handouts",
      shared: "shared",
      statements: "statements",
      approved_receipts: "approvedReceipts",
      exports: "exports",
    };
    const bucketKey = bucketKeyByCategory[category] || category;
    const objectPrefix = `${category}/${sanitizeStorageSegment(actorUsername || "system", "system")}`;
    const objectPath = objectStorage.buildObjectPath(objectPrefix, `${token}`);
    const uploaded = await objectStorage.uploadBuffer({
      bucketKey,
      objectPath,
      contentType,
      buffer: file.buffer,
      upsert: true,
    });
    await fileMetadataService.upsertFileRecord({
      legacyUrl,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      objectPath: uploaded.objectPath,
      objectRef: uploaded.objectRef,
      category,
      ownerUsername: actorUsername || null,
      ownerRole: actorRole || null,
      accessScope: category === "avatars" ? "authenticated" : "department_scoped",
      contentType,
      byteSize: Number(file.size || uploaded.size || file.buffer.length),
      originalFilename,
    });
    return {
      ...uploaded,
      category,
      legacyUrl,
    };
  }

  async function removeStoredContentFile(legacyUrl) {
    const normalizedLegacyUrl = String(legacyUrl || "").trim();
    if (!normalizedLegacyUrl) {
      return;
    }
    const record = await fileMetadataService.getFileRecordByLegacyUrl(normalizedLegacyUrl);
    if (!record) {
      return;
    }
    await objectStorage.removeObject({
      bucket: record.bucket,
      objectPath: record.object_path,
    });
    await fileMetadataService.softDeleteByLegacyUrl(normalizedLegacyUrl);
  }

  async function logAuditEvent(reqLike, action, contentType, contentId, targetOwner, summary) {
    await run(
      `
        INSERT INTO audit_logs (
          actor_username,
          actor_role,
          action,
          content_type,
          content_id,
          target_owner,
          summary
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        reqLike?.session?.user?.username || "system",
        reqLike?.session?.user?.role || "system",
        String(action || "").trim().toLowerCase(),
        String(contentType || "").trim().toLowerCase(),
        contentId || null,
        targetOwner || null,
        String(summary || "").trim().slice(0, 500) || null,
      ]
    );
  }

  const contentAccessService = createContentAccessService({
    all,
    get,
    normalizeIdentifier,
    normalizeDepartment,
    isValidDepartment,
    departmentScopeMatchesStudent,
  });

  const ensureCanManageContent = (reqLike, table, id) =>
    contentAccessService.ensureCanManageContent({
      table,
      id,
      actorUsername: reqLike?.session?.user?.username || "",
      isAdmin: reqLike?.session?.user?.role === "admin",
    });

  function broadcastContentUpdate() {
    noop();
  }

  const notificationService = createNotificationService({
    all,
    get,
    run,
    parseReactionDetails,
    normalizeIdentifier,
    normalizeDepartment,
    departmentScopeMatchesStudent,
    listStudentDepartmentRows: (...args) => contentAccessService.listStudentDepartmentRows(...args),
    ensureCanManageContent: (...args) => contentAccessService.ensureCanManageContent(...args),
    assertStudentContentAccess: (...args) => contentAccessService.assertStudentContentAccess(...args),
    logAuditEvent,
    broadcastContentUpdate,
    allowedReactions: allowedNotificationReactions,
  });

  const handoutService = createHandoutService({
    all,
    get,
    run,
    parseReactionDetails,
    departmentScopeMatchesStudent,
    isValidHttpUrl,
    isValidLocalContentUrl,
    ensureCanManageContent: (...args) => contentAccessService.ensureCanManageContent(...args),
    assertStudentContentAccess: (...args) => contentAccessService.assertStudentContentAccess(...args),
    logAuditEvent,
    broadcastContentUpdate,
    removeStoredContentFile,
    allowedReactions: allowedNotificationReactions,
  });

  const messageService = createMessageService({
    all,
    get,
    run,
    withSqlTransaction,
    normalizeIdentifier,
    isValidIdentifier: authDomain.isValidIdentifier,
    normalizeDepartment,
    departmentScopeMatchesStudent,
    formatDepartmentLabel,
  });

  const sharedFileService = createSharedFileService({
    all,
    run,
    parseReactionDetails,
    normalizeIdentifier,
    ensureCanManageContent: (...args) => contentAccessService.ensureCanManageContent(...args),
    logAuditEvent,
    broadcastContentUpdate,
    removeStoredContentFile,
    isValidHttpUrl,
    isValidLocalContentUrl,
    departmentScopeMatchesStudent,
  });

  function toReqLike(sessionPayload, request) {
    return {
      session: {
        user: {
          username: sessionPayload?.session?.username || "",
          role: sessionPayload?.session?.role || "",
        },
      },
      ip: String(request?.headers?.get?.("x-forwarded-for") || "").split(",")[0].trim() || "unknown",
      get(header) {
        return request?.headers?.get?.(header) || "";
      },
    };
  }

  async function getSessionUserDepartment(sessionPayload) {
    return contentAccessService.getSessionUserDepartment({
      actorUsername: sessionPayload?.session?.username || "",
      actorRole: sessionPayload?.session?.role || "",
    });
  }

  async function resolveContentTargetDepartment(sessionPayload, providedDepartment) {
    return contentAccessService.resolveContentTargetDepartment({
      actorRole: sessionPayload?.session?.role || "",
      actorDepartment: await getSessionUserDepartment(sessionPayload),
      providedDepartment,
    });
  }

  async function requireSession(request, options = {}) {
    const payload = await getAuthSessionPayload(request);
    if (!payload) {
      return { error: { status: 401, body: { error: "Authentication required." } } };
    }
    const role = String(payload.session.role || "").trim().toLowerCase();
    if (options.teacher && role !== "teacher" && role !== "admin") {
      return { error: { status: 403, body: { error: "Only lecturers or admins can perform this action." } } };
    }
    if (options.admin && role !== "admin") {
      return { error: { status: 403, body: { error: "Admin access required." } } };
    }
    if (options.student && role !== "student") {
      return { error: { status: 403, body: { error: "Only students can perform this action." } } };
    }
    return { payload };
  }

  function parseFormFile(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
      return null;
    }
    return file.arrayBuffer().then((arrayBuffer) => ({
      originalname: String(file.name || "upload.bin"),
      mimetype: String(file.type || "application/octet-stream"),
      size: Number(file.size || 0),
      buffer: Buffer.from(arrayBuffer),
    }));
  }

  return {
    db,
    run,
    get,
    all,
    withSqlTransaction,
    parseResourceId,
    parseReactionDetails,
    isValidHttpUrl,
    isValidLocalContentUrl,
    allowedNotificationReactions,
    normalizeIdentifier,
    normalizeDepartment,
    departmentScopeMatchesStudent,
    contentAccessService,
    notificationService,
    handoutService,
    messageService,
    sharedFileService,
    storeUploadedContentFile,
    removeStoredContentFile,
    toReqLike,
    getSessionUserDepartment,
    resolveContentTargetDepartment,
    requireSession,
    parseFormFile,
  };
}

async function getApiContext() {
  if (!contextPromise) {
    contextPromise = buildContext();
  }
  return contextPromise;
}

module.exports = {
  getApiContext,
};
