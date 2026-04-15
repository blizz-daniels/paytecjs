const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { openDatabaseClient } = require("../../../services/database-client");
const { resolveDatabaseRuntime } = require("../../../services/runtime-database");
const { createAuthDomain } = require("./index");

const SESSION_COOKIE_NAME = String(process.env.NEXT_SESSION_COOKIE_NAME || "paytec.sid").trim() || "paytec.sid";
const CSRF_COOKIE_NAME = String(process.env.NEXT_CSRF_COOKIE_NAME || "paytec.csrf").trim() || "paytec.csrf";
const SESSION_TTL_HOURS = (() => {
  const parsed = Number.parseInt(String(process.env.NEXT_SESSION_TTL_HOURS || "24"), 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 168 ? parsed : 24;
})();
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";

const PROJECT_ROOT = path.resolve(__dirname, "../../../");
const defaultDataDir = isProduction ? "/tmp/paytec" : path.join(PROJECT_ROOT, "data");
const dataDir = path.resolve(process.env.DATA_DIR || defaultDataDir);
const dbPath = path.join(dataDir, "paytec.sqlite");
const databaseRuntime = resolveDatabaseRuntime({
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  sqlitePath: dbPath,
  dataDir,
});

if (isProduction && databaseRuntime.driver !== "postgres") {
  throw new Error("Next auth sessions require Postgres in production.");
}

const db = openDatabaseClient({
  driver: databaseRuntime.driver,
  sqlitePath: databaseRuntime.sqlitePath || undefined,
  databaseUrl: databaseRuntime.databaseUrl || undefined,
  isProduction: databaseRuntime.isProduction,
});

let schemaReadyPromise = null;
let domainPromise = null;
let smtpTransport = null;
let smtpTransportInitialized = false;

const loginAttempts = new Map();
const otpRateLimits = new Map();

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;
const LOGIN_RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;
const PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS = (() => {
  const value = Number.parseInt(String(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS || "3600"), 10);
  return Number.isFinite(value) && value >= 60 && value <= 86400 ? value : 3600;
})();
const PASSWORD_RESET_SEND_RATE_LIMIT_MAX_ATTEMPTS = (() => {
  const value = Number.parseInt(String(process.env.PASSWORD_RESET_SEND_RATE_LIMIT_MAX_ATTEMPTS || "5"), 10);
  return Number.isFinite(value) && value >= 1 && value <= 100 ? value : 5;
})();
const PASSWORD_RESET_RESET_RATE_LIMIT_MAX_ATTEMPTS = (() => {
  const value = Number.parseInt(String(process.env.PASSWORD_RESET_RESET_RATE_LIMIT_MAX_ATTEMPTS || "10"), 10);
  return Number.isFinite(value) && value >= 1 && value <= 200 ? value : 10;
})();
const PASSWORD_RESET_RATE_LIMIT_BLOCK_SECONDS = (() => {
  const value = Number.parseInt(String(process.env.PASSWORD_RESET_RATE_LIMIT_BLOCK_SECONDS || "1800"), 10);
  return Number.isFinite(value) && value >= 60 && value <= 86400 ? value : 1800;
})();
const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS * 1000;
const PASSWORD_RESET_RATE_LIMIT_BLOCK_MS = PASSWORD_RESET_RATE_LIMIT_BLOCK_SECONDS * 1000;

function nowIso() {
  return new Date().toISOString();
}

function parseCookieHeader(cookieHeader) {
  const values = new Map();
  String(cookieHeader || "")
    .split(";")
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .forEach((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) {
        return;
      }
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key) {
        values.set(key, decodeURIComponent(value));
      }
    });
  return values;
}

function serializeCookie(name, value, options = {}) {
  const attrs = [`${name}=${encodeURIComponent(String(value || ""))}`];
  attrs.push(`Path=${options.path || "/"}`);
  if (options.httpOnly) {
    attrs.push("HttpOnly");
  }
  if (options.secure || isProduction) {
    attrs.push("Secure");
  }
  attrs.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.maxAge !== undefined && options.maxAge !== null) {
    attrs.push(`Max-Age=${Math.max(0, Number(options.maxAge || 0))}`);
  }
  if (options.expires) {
    attrs.push(`Expires=${new Date(options.expires).toUTCString()}`);
  }
  return attrs.join("; ");
}

function appendSetCookie(headers, cookieValue) {
  if (!cookieValue) {
    return;
  }
  if (typeof headers.append === "function") {
    headers.append("set-cookie", cookieValue);
    return;
  }
  const existing = headers.get("set-cookie");
  if (!existing) {
    headers.set("set-cookie", cookieValue);
    return;
  }
  headers.set("set-cookie", `${existing}, ${cookieValue}`);
}

function getHeader(request, key) {
  return String(request?.headers?.get?.(key) || "").trim();
}

function getClientIp(request) {
  const forwarded = getHeader(request, "x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return getHeader(request, "x-real-ip") || "unknown";
}

function ensureSafeIdentifier(value) {
  return /^[a-z0-9/_-]{3,40}$/.test(String(value || "").trim().toLowerCase());
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSurnamePassword(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidSurnamePassword(value) {
  return /^[a-z][a-z' -]{1,39}$/.test(String(value || ""));
}

function deriveDisplayNameFromIdentifier(identifier) {
  const parts = String(identifier || "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return String(identifier || "");
  }
  return parts
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function withPromiseTimeout(promise, timeoutMs, timeoutMessage) {
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1000, timeoutMs) : 10000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage || "Request timed out."));
    }, safeTimeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
function getSmtpTransport() {
  if (smtpTransportInitialized) {
    return smtpTransport;
  }
  smtpTransportInitialized = true;

  const SMTP_URL = String(process.env.SMTP_URL || "").trim();
  const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
  const SMTP_PORT = Number.parseInt(String(process.env.SMTP_PORT || "587"), 10);
  const SMTP_SECURE = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";
  const SMTP_USER = String(process.env.SMTP_USER || "").trim();
  const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
  const PASSWORD_RESET_SMTP_TIMEOUT_MS = (() => {
    const value = Number.parseInt(String(process.env.PASSWORD_RESET_SMTP_TIMEOUT_MS || "10000"), 10);
    return Number.isFinite(value) && value >= 3000 && value <= 60000 ? value : 10000;
  })();

  if (SMTP_URL) {
    smtpTransport = nodemailer.createTransport({
      url: SMTP_URL,
      connectionTimeout: PASSWORD_RESET_SMTP_TIMEOUT_MS,
      greetingTimeout: PASSWORD_RESET_SMTP_TIMEOUT_MS,
      socketTimeout: PASSWORD_RESET_SMTP_TIMEOUT_MS + 5000,
    });
    return smtpTransport;
  }
  if (!SMTP_HOST) {
    smtpTransport = null;
    return smtpTransport;
  }
  smtpTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number.isFinite(SMTP_PORT) && SMTP_PORT > 0 ? SMTP_PORT : 587,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: PASSWORD_RESET_SMTP_TIMEOUT_MS,
    greetingTimeout: PASSWORD_RESET_SMTP_TIMEOUT_MS,
    socketTimeout: PASSWORD_RESET_SMTP_TIMEOUT_MS + 5000,
  });
  return smtpTransport;
}

async function sendPasswordResetOtpEmail({ username, toEmail, otpCode, expiresInMinutes, isTestEnvironment, isValidProfileEmail }) {
  if (!toEmail || !isValidProfileEmail(toEmail)) {
    throw new Error("Cannot deliver OTP because the account email is invalid.");
  }
  const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();
  const SMTP_FROM = String(process.env.SMTP_FROM || "").trim();
  const PASSWORD_RESET_EMAIL_FROM = String(process.env.PASSWORD_RESET_EMAIL_FROM || SMTP_FROM || "").trim();
  const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
  const RESEND_API_BASE_URL = String(process.env.RESEND_API_BASE_URL || "https://api.resend.com").trim().replace(/\/$/, "");
  const PASSWORD_RESET_EMAIL_API_TIMEOUT_MS = (() => {
    const value = Number.parseInt(String(process.env.PASSWORD_RESET_EMAIL_API_TIMEOUT_MS || "12000"), 10);
    return Number.isFinite(value) && value >= 3000 && value <= 60000 ? value : 12000;
  })();
  const PASSWORD_RESET_SMTP_TIMEOUT_MS = (() => {
    const value = Number.parseInt(String(process.env.PASSWORD_RESET_SMTP_TIMEOUT_MS || "10000"), 10);
    return Number.isFinite(value) && value >= 3000 && value <= 60000 ? value : 10000;
  })();
  const mailFrom = PASSWORD_RESET_EMAIL_FROM || SMTP_FROM;
  if (!mailFrom) {
    throw new Error("Email delivery is not configured. Set PASSWORD_RESET_EMAIL_FROM or SMTP_FROM.");
  }
  const subject = "Your Password Reset OTP";
  const text = [
    `Hello ${username},`,
    "",
    `Your one-time password (OTP) is: ${otpCode}`,
    `It expires in ${expiresInMinutes} minute(s).`,
    "",
    "If you did not request this reset, ignore this message.",
  ].join("\n");

  if (EMAIL_PROVIDER === "resend") {
    if (!RESEND_API_KEY) {
      if (isTestEnvironment) {
        return;
      }
      throw new Error("Email API is not configured. Set RESEND_API_KEY.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PASSWORD_RESET_EMAIL_API_TIMEOUT_MS);
    try {
      const response = await fetch(`${RESEND_API_BASE_URL}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [toEmail],
          subject,
          text,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let payload = null;
        try {
          payload = await response.json();
        } catch (_err) {
          payload = null;
        }
        const apiMessage = String(payload?.message || payload?.error || "").trim();
        throw new Error(apiMessage ? `Email API error: ${apiMessage}` : `Email API error: HTTP ${response.status}`);
      }
      return;
    } finally {
      clearTimeout(timer);
    }
  }

  if (EMAIL_PROVIDER !== "smtp") {
    throw new Error("Unsupported EMAIL_PROVIDER. Use 'smtp' or 'resend'.");
  }
  const transport = getSmtpTransport();
  if (!transport) {
    if (isTestEnvironment) {
      return;
    }
    throw new Error("Email delivery is not configured. Set SMTP_URL or SMTP_HOST.");
  }
  await withPromiseTimeout(
    transport.sendMail({
      from: mailFrom,
      to: toEmail,
      subject,
      text,
    }),
    PASSWORD_RESET_SMTP_TIMEOUT_MS + 2000,
    "OTP email delivery timed out. Check SMTP settings and try again."
  );
}

function maybePruneRateLimitEntries() {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    const expiresAt = Math.max(record.windowStartedAt + LOGIN_RATE_LIMIT_WINDOW_MS + LOGIN_RATE_LIMIT_BLOCK_MS, record.blockedUntil);
    if (expiresAt <= now) {
      loginAttempts.delete(key);
    }
  }
  for (const [key, record] of otpRateLimits.entries()) {
    const expiresAt = Math.max(record.windowStartedAt + PASSWORD_RESET_RATE_LIMIT_WINDOW_MS + PASSWORD_RESET_RATE_LIMIT_BLOCK_MS, record.blockedUntil);
    if (expiresAt <= now) {
      otpRateLimits.delete(key);
    }
  }
}

function getLoginRateLimitKey(request, identifier) {
  return `${getClientIp(request)}::${String(identifier || "*")}`;
}

function getLoginAttemptRecord(key, now = Date.now()) {
  maybePruneRateLimitEntries();
  const existing = loginAttempts.get(key);
  if (!existing) {
    return { attempts: 0, windowStartedAt: now, blockedUntil: 0 };
  }
  if (existing.windowStartedAt + LOGIN_RATE_LIMIT_WINDOW_MS <= now) {
    existing.attempts = 0;
    existing.windowStartedAt = now;
  }
  return existing;
}

function isLoginRateLimited(request, identifier) {
  const now = Date.now();
  const key = getLoginRateLimitKey(request, identifier);
  const record = getLoginAttemptRecord(key, now);
  loginAttempts.set(key, record);
  return record.blockedUntil > now;
}

function recordFailedLogin(request, identifier) {
  const now = Date.now();
  const key = getLoginRateLimitKey(request, identifier);
  const record = getLoginAttemptRecord(key, now);
  record.attempts += 1;
  if (record.attempts >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    record.blockedUntil = now + LOGIN_RATE_LIMIT_BLOCK_MS;
    record.attempts = 0;
    record.windowStartedAt = now;
  }
  loginAttempts.set(key, record);
}

function clearFailedLogins(request, identifier) {
  loginAttempts.delete(getLoginRateLimitKey(request, identifier));
  loginAttempts.delete(getLoginRateLimitKey(request, "*"));
}
function getPasswordResetRateLimitKey(request, action, identifier) {
  const actionKey = String(action || "").trim().toLowerCase() || "unknown";
  return `${actionKey}::${getClientIp(request)}::${normalizeIdentifier(identifier || "*") || "*"}`;
}

function getPasswordResetRateLimitRecord(key, now = Date.now()) {
  maybePruneRateLimitEntries();
  const existing = otpRateLimits.get(key);
  if (!existing) {
    return { attempts: 0, windowStartedAt: now, blockedUntil: 0 };
  }
  if (existing.windowStartedAt + PASSWORD_RESET_RATE_LIMIT_WINDOW_MS <= now) {
    existing.attempts = 0;
    existing.windowStartedAt = now;
  }
  return existing;
}

function getPasswordResetRateLimitMaxAttempts(action) {
  return String(action || "").trim().toLowerCase() === "send"
    ? PASSWORD_RESET_SEND_RATE_LIMIT_MAX_ATTEMPTS
    : PASSWORD_RESET_RESET_RATE_LIMIT_MAX_ATTEMPTS;
}

function takePasswordResetRateLimitAttempt(request, action, identifier) {
  const now = Date.now();
  const key = getPasswordResetRateLimitKey(request, action, identifier);
  const record = getPasswordResetRateLimitRecord(key, now);

  if (record.blockedUntil > now) {
    otpRateLimits.set(key, record);
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((record.blockedUntil - now) / 1000)),
    };
  }

  record.attempts += 1;
  const maxAttempts = getPasswordResetRateLimitMaxAttempts(action);
  if (record.attempts > maxAttempts) {
    record.blockedUntil = now + PASSWORD_RESET_RATE_LIMIT_BLOCK_MS;
    record.attempts = 0;
    record.windowStartedAt = now;
    otpRateLimits.set(key, record);
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil(PASSWORD_RESET_RATE_LIMIT_BLOCK_MS / 1000)),
    };
  }
  otpRateLimits.set(key, record);
  return { limited: false, retryAfterSeconds: 0 };
}

async function run(sql, params = []) {
  return db.run(sql, params);
}

async function get(sql, params = []) {
  return db.get(sql, params);
}

async function all(sql, params = []) {
  return db.all(sql, params);
}

async function withSqlTransaction(work) {
  return db.transaction(work);
}

async function ensureAuthSchema() {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }
  schemaReadyPromise = (async () => {
    await run(`
      CREATE TABLE IF NOT EXISTS next_auth_sessions (
        sid TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        role_at_login TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_next_auth_sessions_username ON next_auth_sessions(username)");
    await run("CREATE INDEX IF NOT EXISTS idx_next_auth_sessions_expires_at ON next_auth_sessions(expires_at)");
  })();
  return schemaReadyPromise;
}

async function getPasswordOverride(username) {
  return get(
    `
      SELECT username, password_hash, updated_at
      FROM user_password_overrides
      WHERE username = ?
      LIMIT 1
    `,
    [normalizeIdentifier(username || "")]
  );
}

async function getUserProfile(username) {
  return get(
    `
      SELECT display_name, nickname, profile_image_url, email
      FROM user_profiles
      WHERE username = ?
      LIMIT 1
    `,
    [normalizeIdentifier(username || "")]
  );
}

async function findProfileEmailOwner(email, excludeUsername = "") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }
  return get(
    `
      SELECT username
      FROM user_profiles
      WHERE email = ?
        AND username != ?
      LIMIT 1
    `,
    [normalizedEmail, normalizeIdentifier(excludeUsername || "")]
  );
}

async function upsertProfileEmail(username, email) {
  const identifier = normalizeIdentifier(username || "");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const existing = await getUserProfile(identifier);
  const fallbackDisplayName =
    existing && existing.display_name ? String(existing.display_name) : deriveDisplayNameFromIdentifier(identifier);
  await run(
    `
      INSERT INTO user_profiles (username, display_name, email, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(username) DO UPDATE SET
        email = excluded.email,
        updated_at = CURRENT_TIMESTAMP,
        display_name = COALESCE(user_profiles.display_name, excluded.display_name)
    `,
    [identifier, fallbackDisplayName, normalizedEmail]
  );
}

async function upsertPasswordOverride(username, passwordHash) {
  await run(
    `
      INSERT INTO user_password_overrides (username, password_hash, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(username) DO UPDATE SET
        password_hash = excluded.password_hash,
        updated_at = CURRENT_TIMESTAMP
    `,
    [normalizeIdentifier(username || ""), String(passwordHash || "")]
  );
}
async function getLatestPasswordResetOtp(username) {
  return get(
    `
      SELECT
        id,
        username,
        email,
        otp_hash,
        expires_at,
        attempts_used,
        max_attempts,
        consumed_at,
        created_at
      FROM password_reset_otps
      WHERE username = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [normalizeIdentifier(username || "")]
  );
}

async function invalidateActivePasswordResetOtps(username) {
  await run(
    `
      UPDATE password_reset_otps
      SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP)
      WHERE username = ?
        AND consumed_at IS NULL
    `,
    [normalizeIdentifier(username || "")]
  );
}

async function createPasswordResetOtp({ username, email, otpHash, expiresAt, maxAttempts }) {
  const result = await run(
    `
      INSERT INTO password_reset_otps (
        username,
        email,
        otp_hash,
        expires_at,
        attempts_used,
        max_attempts,
        consumed_at,
        created_at
      )
      VALUES (?, ?, ?, ?, 0, ?, NULL, CURRENT_TIMESTAMP)
    `,
    [
      normalizeIdentifier(username || ""),
      String(email || "").trim().toLowerCase(),
      String(otpHash || ""),
      String(expiresAt || ""),
      Number(maxAttempts || 5),
    ]
  );
  return Number(result?.lastID || 0);
}

async function markPasswordResetOtpConsumed(otpId) {
  await run(
    `
      UPDATE password_reset_otps
      SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `,
    [otpId]
  );
}

async function incrementPasswordResetOtpAttempt(otpId) {
  await run(
    `
      UPDATE password_reset_otps
      SET attempts_used = attempts_used + 1
      WHERE id = ?
    `,
    [otpId]
  );
}

async function logPasswordResetAuditEvent(reqLike, action, username, outcome, details = "") {
  const normalizedAction = String(action || "").trim().toLowerCase();
  const targetOwner = normalizeIdentifier(username || "") || null;
  const ip = String(reqLike?.ip || "unknown").trim() || "unknown";
  const detailText = String(details || "").replace(/\s+/g, " ").trim();
  const summaryParts = [`outcome=${String(outcome || "").trim().toLowerCase() || "unknown"}`, `ip=${ip}`];
  if (detailText) {
    summaryParts.push(detailText);
  }
  const summary = summaryParts.join("; ").slice(0, 500);
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
    ["system", "system", normalizedAction || "password_reset_otp", "auth", null, targetOwner, summary]
  );
}

async function getSessionUserDepartment(input = {}) {
  const actorUsername = normalizeIdentifier(input?.session?.user?.username || "");
  const actorRole = String(input?.session?.user?.role || "").trim().toLowerCase();
  if (!actorUsername || actorRole === "admin") {
    return "";
  }
  const rolesToTry = [];
  if (actorRole === "student" || actorRole === "teacher") {
    rolesToTry.push(actorRole);
  }
  if (!rolesToTry.length) {
    rolesToTry.push("student", "teacher");
  }
  for (const candidateRole of rolesToTry) {
    const row = await get(
      `
        SELECT department
        FROM auth_roster
        WHERE auth_id = ?
          AND role = ?
        LIMIT 1
      `,
      [actorUsername, candidateRole]
    );
    if (row && row.department) {
      return String(row.department || "").trim().toLowerCase();
    }
  }
  return "";
}

async function getAuthDomain() {
  if (domainPromise) {
    return domainPromise;
  }
  domainPromise = (async () => {
    await ensureAuthSchema();
    const DEPARTMENT_GROUPS_PATH = path.resolve(
      process.env.DEPARTMENT_GROUPS_PATH || path.join(PROJECT_ROOT, "data", "department-groups.csv")
    );
    const domain = createAuthDomain({
      fs,
      crypto,
      bcrypt,
      get,
      run,
      all,
      withSqlTransaction,
      getPasswordOverride,
      getUserProfile,
      findProfileEmailOwner,
      upsertProfileEmail,
      upsertPasswordOverride,
      getLatestPasswordResetOtp,
      invalidateActivePasswordResetOtps,
      createPasswordResetOtp,
      markPasswordResetOtpConsumed,
      incrementPasswordResetOtpAttempt,
      sendPasswordResetOtpEmail: (input) =>
        sendPasswordResetOtpEmail({
          ...input,
          isTestEnvironment: String(process.env.NODE_ENV || "").trim().toLowerCase() === "test",
          isValidProfileEmail: domain.isValidProfileEmail,
        }),
      logPasswordResetAuditEvent,
      takePasswordResetRateLimitAttempt: (reqLike, action, identifier) =>
        takePasswordResetRateLimitAttempt(reqLike, action, identifier),
      getSessionUserDepartment,
      deriveDisplayNameFromIdentifier,
      departmentGroupsPath: DEPARTMENT_GROUPS_PATH,
      customPasswordMinLength: Number.parseInt(String(process.env.CUSTOM_PASSWORD_MIN_LENGTH || "10"), 10),
      customPasswordMaxLength: 72,
      passwordResetOtpLength: Number.parseInt(String(process.env.PASSWORD_RESET_OTP_LENGTH || "6"), 10),
      passwordResetOtpResendCooldownSeconds: Number.parseInt(
        String(process.env.PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS || "60"),
        10
      ),
      passwordResetOtpTtlMinutes: Number.parseInt(String(process.env.PASSWORD_RESET_OTP_TTL_MINUTES || "10"), 10),
      passwordResetOtpMaxAttempts: Number.parseInt(String(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS || "5"), 10),
      isTestEnvironment: String(process.env.NODE_ENV || "").trim().toLowerCase() === "test",
    });
    return domain;
  })();
  return domainPromise;
}
async function lookupResolvedRole(username) {
  const identifier = normalizeIdentifier(username || "");
  if (!identifier) {
    return "";
  }
  const adminRow = await get("SELECT username, role FROM users WHERE username = ? LIMIT 1", [identifier]);
  if (adminRow && String(adminRow.role || "").trim().toLowerCase() === "admin") {
    return "admin";
  }
  const rosterRow = await get("SELECT role FROM auth_roster WHERE auth_id = ? LIMIT 1", [identifier]);
  const role = String(rosterRow?.role || "").trim().toLowerCase();
  if (role === "teacher" || role === "student") {
    return role;
  }
  return "";
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function createAuthSession(user, request) {
  await ensureAuthSchema();
  const sid = createSessionToken();
  const csrfToken = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await run(
    `
      INSERT INTO next_auth_sessions (
        sid,
        username,
        role_at_login,
        csrf_token,
        ip_address,
        user_agent,
        expires_at,
        created_at,
        last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      sid,
      normalizeIdentifier(user.username),
      String(user.role || "").trim().toLowerCase(),
      csrfToken,
      getClientIp(request),
      getHeader(request, "user-agent") || null,
      expiresAt,
    ]
  );
  return { sid, csrfToken, expiresAt };
}

async function destroyAuthSessionBySid(sid) {
  if (!sid) {
    return;
  }
  await run("DELETE FROM next_auth_sessions WHERE sid = ?", [String(sid || "")]);
}

function getRequestCookies(request) {
  return parseCookieHeader(getHeader(request, "cookie"));
}

function getSessionCookieValue(request) {
  return getRequestCookies(request).get(SESSION_COOKIE_NAME) || "";
}

function getCsrfCookieValue(request) {
  return getRequestCookies(request).get(CSRF_COOKIE_NAME) || "";
}

function getRequestCsrfTokenFromBodyOrHeader(request, parsedBody = null) {
  const headerToken = getHeader(request, "x-csrf-token");
  if (headerToken) {
    return headerToken;
  }
  if (parsedBody && typeof parsedBody === "object") {
    const value = parsedBody._csrf;
    return value ? String(value).trim() : "";
  }
  return "";
}

function isSameToken(expected, provided) {
  const expectedBuffer = Buffer.from(String(expected || ""), "utf8");
  const providedBuffer = Buffer.from(String(provided || ""), "utf8");
  if (!expectedBuffer.length || expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function loadAuthSession(request, options = {}) {
  await ensureAuthSchema();
  const sid = getSessionCookieValue(request);
  if (!sid) {
    return null;
  }
  const row = await get(
    `
      SELECT sid, username, role_at_login, csrf_token, expires_at, created_at, last_seen_at
      FROM next_auth_sessions
      WHERE sid = ?
      LIMIT 1
    `,
    [sid]
  );
  if (!row) {
    return null;
  }
  const expiresAtMs = Date.parse(String(row.expires_at || ""));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await destroyAuthSessionBySid(sid);
    return null;
  }
  const role = await lookupResolvedRole(row.username);
  if (!role) {
    await destroyAuthSessionBySid(sid);
    return null;
  }
  if (options.touch !== false) {
    await run("UPDATE next_auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE sid = ?", [sid]);
  }
  return {
    sid: String(row.sid || ""),
    username: normalizeIdentifier(row.username || ""),
    role,
    csrfToken: String(row.csrf_token || ""),
    expiresAt: String(row.expires_at || ""),
  };
}

function applySessionCookies(headers, session) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  appendSetCookie(
    headers,
    serializeCookie(SESSION_COOKIE_NAME, session.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge,
      expires: new Date(Date.now() + SESSION_TTL_MS),
    })
  );
  appendSetCookie(
    headers,
    serializeCookie(CSRF_COOKIE_NAME, session.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge,
      expires: new Date(Date.now() + SESSION_TTL_MS),
    })
  );
}

function clearSessionCookies(headers) {
  appendSetCookie(
    headers,
    serializeCookie(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    })
  );
  appendSetCookie(
    headers,
    serializeCookie(CSRF_COOKIE_NAME, "", {
      httpOnly: false,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    })
  );
}

/**
 * @param {{
 *   request: Request | { headers?: { get?: (key: string) => string } },
 *   session?: { csrfToken?: string } | null,
 *   parsedBody?: Record<string, any> | null
 * }} input
 */
function verifyCsrfToken({ request, session = null, parsedBody = null } = {}) {
  const providedToken = getRequestCsrfTokenFromBodyOrHeader(request, parsedBody);
  const csrfCookie = getCsrfCookieValue(request);
  if (!providedToken || !csrfCookie) {
    return false;
  }
  if (!isSameToken(csrfCookie, providedToken)) {
    return false;
  }
  if (session && session.csrfToken) {
    return isSameToken(session.csrfToken, providedToken);
  }
  return true;
}

async function issueAnonymousCsrf(headers) {
  const token = createSessionToken();
  appendSetCookie(
    headers,
    serializeCookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      expires: new Date(Date.now() + SESSION_TTL_MS),
    })
  );
  return token;
}

function nextRedirectForRole(role) {
  if (role === "admin") {
    return "/admin";
  }
  if (role === "teacher") {
    return "/lecturer";
  }
  return "/";
}

async function authenticateLogin({ username, password, request }) {
  const identifier = normalizeIdentifier(username || "");
  const rawPassword = String(password || "");
  const surnamePassword = normalizeSurnamePassword(rawPassword);
  if (!ensureSafeIdentifier(identifier) || !rawPassword.trim()) {
    return { ok: false, code: "invalid" };
  }
  if (isLoginRateLimited(request, identifier || "*")) {
    return { ok: false, code: "rate_limited" };
  }

  try {
    const adminUser = await get("SELECT username, password_hash, role FROM users WHERE username = ? LIMIT 1", [identifier]);
    let authUser = null;
    let source = "login";
    if (adminUser && String(adminUser.role || "").trim().toLowerCase() === "admin") {
      const validAdminPassword = await bcrypt.compare(rawPassword.trim(), String(adminUser.password_hash || ""));
      if (validAdminPassword) {
        authUser = {
          username: normalizeIdentifier(adminUser.username),
          role: "admin",
        };
        source = "login-admin";
      }
    }

    if (!authUser) {
      const rosterUser = await get("SELECT auth_id, role, password_hash FROM auth_roster WHERE auth_id = ? LIMIT 1", [identifier]);
      if (!rosterUser) {
        recordFailedLogin(request, identifier || "*");
        return { ok: false, code: "invalid" };
      }
      const passwordOverride = await getPasswordOverride(identifier);
      if (passwordOverride && passwordOverride.password_hash) {
        const validCustomPassword = await bcrypt.compare(rawPassword, String(passwordOverride.password_hash || ""));
        if (!validCustomPassword) {
          recordFailedLogin(request, identifier || "*");
          return { ok: false, code: "invalid" };
        }
        source = String(rosterUser.role || "").trim().toLowerCase() === "teacher" ? "login-lecturer-custom" : "login-student-custom";
      } else {
        if (!isValidSurnamePassword(surnamePassword)) {
          recordFailedLogin(request, identifier || "*");
          return { ok: false, code: "invalid" };
        }
        const validRosterPassword = await bcrypt.compare(surnamePassword, String(rosterUser.password_hash || ""));
        if (!validRosterPassword) {
          recordFailedLogin(request, identifier || "*");
          return { ok: false, code: "invalid" };
        }
        source = String(rosterUser.role || "").trim().toLowerCase() === "teacher" ? "login-lecturer" : "login-student";
      }
      authUser = {
        username: normalizeIdentifier(rosterUser.auth_id),
        role: String(rosterUser.role || "").trim().toLowerCase(),
      };
    }

    clearFailedLogins(request, identifier || "*");
    await run("INSERT INTO login_events (username, source, ip, user_agent) VALUES (?, ?, ?, ?)", [
      authUser.username,
      source,
      getClientIp(request) || null,
      getHeader(request, "user-agent") || null,
    ]);
    return { ok: true, user: authUser };
  } catch (_err) {
    recordFailedLogin(request, identifier || "*");
    return { ok: false, code: "session" };
  }
}

async function getAuthSessionPayload(request, options = {}) {
  const session = await loadAuthSession(request, { touch: options.touch !== false });
  if (!session) {
    return null;
  }
  const domain = await getAuthDomain();
  const mePayload = await domain.buildMePayload({
    req: {
      session: {
        user: {
          username: session.username,
          role: session.role,
        },
      },
    },
    username: session.username,
    role: session.role,
  });
  return {
    session,
    me: mePayload,
  };
}

async function sendPasswordRecoveryOtp({ request, username }) {
  const domain = await getAuthDomain();
  return domain.sendPasswordRecoveryOtp({
    req: {
      ip: getClientIp(request),
    },
    username,
  });
}

async function resetPasswordRecovery({ request, username, otpCode, newPassword, confirmPassword }) {
  const domain = await getAuthDomain();
  return domain.resetPasswordRecovery({
    req: {
      ip: getClientIp(request),
    },
    username,
    otpCode,
    newPassword,
    confirmPassword,
  });
}

module.exports = {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  SESSION_TTL_MS,
  ensureAuthSchema,
  parseCookieHeader,
  serializeCookie,
  appendSetCookie,
  getHeader,
  getClientIp,
  getRequestCookies,
  getSessionCookieValue,
  getCsrfCookieValue,
  getRequestCsrfTokenFromBodyOrHeader,
  verifyCsrfToken,
  issueAnonymousCsrf,
  authenticateLogin,
  createAuthSession,
  destroyAuthSessionBySid,
  loadAuthSession,
  applySessionCookies,
  clearSessionCookies,
  nextRedirectForRole,
  getAuthSessionPayload,
  sendPasswordRecoveryOtp,
  resetPasswordRecovery,
};
