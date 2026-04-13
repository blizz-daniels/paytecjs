function createAuthDomain(options = {}) {
  const fs = options.fs;
  const crypto = options.crypto;
  const bcrypt = options.bcrypt;
  const get = options.get;
  const run = options.run;
  const all = options.all;
  const withSqlTransaction = options.withSqlTransaction;
  const getPasswordOverride = options.getPasswordOverride;
  const getUserProfile = options.getUserProfile;
  const findProfileEmailOwner = options.findProfileEmailOwner;
  const upsertProfileEmail = options.upsertProfileEmail;
  const upsertPasswordOverride = options.upsertPasswordOverride;
  const getLatestPasswordResetOtp = options.getLatestPasswordResetOtp;
  const invalidateActivePasswordResetOtps = options.invalidateActivePasswordResetOtps;
  const createPasswordResetOtp = options.createPasswordResetOtp;
  const markPasswordResetOtpConsumed = options.markPasswordResetOtpConsumed;
  const incrementPasswordResetOtpAttempt = options.incrementPasswordResetOtpAttempt;
  const sendPasswordResetOtpEmail = options.sendPasswordResetOtpEmail;
  const logPasswordResetAuditEvent = options.logPasswordResetAuditEvent;
  const takePasswordResetRateLimitAttempt = options.takePasswordResetRateLimitAttempt;
  const getSessionUserDepartment = options.getSessionUserDepartment;
  const deriveDisplayNameFromIdentifier = options.deriveDisplayNameFromIdentifier;
  const departmentGroupsPath = String(options.departmentGroupsPath || "").trim();
  const customPasswordMinLength = Number.isFinite(Number(options.customPasswordMinLength))
    ? Number(options.customPasswordMinLength)
    : 10;
  const customPasswordMaxLength = Number.isFinite(Number(options.customPasswordMaxLength))
    ? Number(options.customPasswordMaxLength)
    : 72;
  const passwordResetOtpLength = Number.isFinite(Number(options.passwordResetOtpLength))
    ? Number(options.passwordResetOtpLength)
    : 6;
  const passwordResetOtpResendCooldownSeconds = Number.isFinite(Number(options.passwordResetOtpResendCooldownSeconds))
    ? Number(options.passwordResetOtpResendCooldownSeconds)
    : 60;
  const passwordResetOtpTtlMinutes = Number.isFinite(Number(options.passwordResetOtpTtlMinutes))
    ? Number(options.passwordResetOtpTtlMinutes)
    : 10;
  const passwordResetOtpMaxAttempts = Number.isFinite(Number(options.passwordResetOtpMaxAttempts))
    ? Number(options.passwordResetOtpMaxAttempts)
    : 5;
  const isTestEnvironment = !!options.isTestEnvironment;
  let departmentGroupsCache = {
    mtimeMs: -1,
    groups: new Map(),
  };

  function normalizeIdentifier(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeSurnamePassword(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidIdentifier(value) {
    return /^[a-z0-9/_-]{3,40}$/.test(String(value || ""));
  }

  function isValidSurnamePassword(value) {
    return /^[a-z][a-z' -]{1,39}$/.test(String(value || ""));
  }

  function normalizeDisplayName(value) {
    return String(value || "").trim();
  }

  function normalizeDepartment(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function isValidDepartment(value) {
    const normalized = normalizeDepartment(value);
    if (!normalized || normalized.length > 80) {
      return false;
    }
    return /^[a-z0-9][a-z0-9 &'()/-]{1,79}$/.test(normalized);
  }

  function formatDepartmentLabel(value) {
    const normalized = normalizeDepartment(value);
    if (!normalized) {
      return "";
    }
    return normalized
      .split(" ")
      .map((word) => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : ""))
      .join(" ");
  }

  function withGeneralDepartmentAliases(groups) {
    const next = new Map();
    for (const [key, values] of groups.entries()) {
      const normalizedKey = normalizeDepartment(key);
      if (!normalizedKey) {
        continue;
      }
      const normalizedValues = new Set(Array.from(values || []).map((value) => normalizeDepartment(value)).filter(Boolean));
      normalizedValues.add(normalizedKey);
      next.set(normalizedKey, normalizedValues);

      if (!normalizedKey.startsWith("general ")) {
        const alias = normalizeDepartment(`general ${normalizedKey}`);
        if (!next.has(alias)) {
          const aliasValues = new Set(normalizedValues);
          aliasValues.add(alias);
          next.set(alias, aliasValues);
        }
      }
    }
    return next;
  }

  function getDefaultDepartmentGroups() {
    const defaults = new Map();
    defaults.set("science", new Set(["science", "computer science", "chemistry", "physics", "biology", "mathematics"]));
    defaults.set("art", new Set(["art", "creative art", "fine art", "music", "theatre art"]));
    defaults.set("business", new Set(["business", "accounting", "economics", "marketing", "management"]));
    return withGeneralDepartmentAliases(defaults);
  }

  function parseDepartmentGroupsCsv(csvText) {
    const text = String(csvText || "");
    const lines = text
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (!lines.length) {
      return getDefaultDepartmentGroups();
    }

    const headers = parseCsvLine(lines[0]).map((header) => normalizeDepartment(header));
    const groups = new Map();
    headers.forEach((header) => {
      if (!header) {
        return;
      }
      if (!groups.has(header)) {
        groups.set(header, new Set([header]));
      }
    });

    for (let i = 1; i < lines.length; i += 1) {
      const row = parseCsvLine(lines[i]);
      headers.forEach((header, index) => {
        if (!header) {
          return;
        }
        const value = normalizeDepartment(row[index] || "");
        if (!value) {
          return;
        }
        if (!groups.has(header)) {
          groups.set(header, new Set([header]));
        }
        groups.get(header).add(value);
      });
    }

    if (!groups.size) {
      return getDefaultDepartmentGroups();
    }
    return withGeneralDepartmentAliases(groups);
  }

  function getDepartmentGroups() {
    if (!fs || !departmentGroupsPath) {
      return getDefaultDepartmentGroups();
    }
    try {
      const stat = fs.statSync(departmentGroupsPath);
      const mtimeMs = Number(stat.mtimeMs || 0);
      if (departmentGroupsCache.groups.size && departmentGroupsCache.mtimeMs === mtimeMs) {
        return departmentGroupsCache.groups;
      }
      const raw = fs.readFileSync(departmentGroupsPath, "utf8");
      const parsed = parseDepartmentGroupsCsv(raw);
      departmentGroupsCache = {
        mtimeMs,
        groups: parsed,
      };
      return parsed;
    } catch (_err) {
      if (!departmentGroupsCache.groups.size) {
        departmentGroupsCache = {
          mtimeMs: -1,
          groups: getDefaultDepartmentGroups(),
        };
      }
      return departmentGroupsCache.groups;
    }
  }

  function expandDepartmentScope(departmentValue) {
    const normalized = normalizeDepartment(departmentValue);
    if (!normalized || normalized === "all") {
      return null;
    }
    const groups = getDepartmentGroups();
    const scope = new Set([normalized]);
    if (groups.has(normalized)) {
      groups.get(normalized).forEach((value) => scope.add(normalizeDepartment(value)));
    }
    return scope;
  }

  function departmentScopeMatchesStudent(targetDepartment, studentDepartment) {
    const target = normalizeDepartment(targetDepartment);
    if (!target || target === "all") {
      return true;
    }
    const student = normalizeDepartment(studentDepartment);
    if (!student) {
      return false;
    }
    if (target === student) {
      return true;
    }
    const scope = expandDepartmentScope(target);
    return !!(scope && scope.has(student));
  }

  function doesDepartmentScopeOverlap(targetDepartment, actorDepartment) {
    const target = normalizeDepartment(targetDepartment);
    const actor = normalizeDepartment(actorDepartment);
    if (!target || target === "all" || !actor || actor === "all") {
      return true;
    }
    const targetScope = expandDepartmentScope(target) || new Set([target]);
    const actorScope = expandDepartmentScope(actor) || new Set([actor]);
    for (const candidate of targetScope) {
      if (actorScope.has(candidate)) {
        return true;
      }
    }
    return false;
  }

  function normalizeProfileEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidProfileEmail(value) {
    const normalized = normalizeProfileEmail(value);
    if (!normalized || normalized.length > 254) {
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
      return false;
    }
    const domain = String(normalized.split("@")[1] || "");
    if (!domain || domain === "localhost" || domain.endsWith(".local")) {
      return false;
    }
    return true;
  }

  function resolvePaystackCheckoutEmail(username, profileEmail) {
    const candidates = [profileEmail, username];
    for (const candidate of candidates) {
      const normalized = normalizeProfileEmail(candidate);
      if (isValidProfileEmail(normalized)) {
        return normalized;
      }
    }
    return "";
  }

  function validateCustomPasswordStrength(password, username) {
    const raw = String(password || "");
    const normalizedUsername = normalizeIdentifier(username || "");
    if (raw.length < customPasswordMinLength) {
      return `Use at least ${customPasswordMinLength} characters.`;
    }
    if (raw.length > customPasswordMaxLength) {
      return `Use at most ${customPasswordMaxLength} characters.`;
    }
    if (/\s/.test(raw)) {
      return "Do not include spaces in the password.";
    }
    if (!/[a-z]/.test(raw)) {
      return "Include at least one lowercase letter.";
    }
    if (!/[A-Z]/.test(raw)) {
      return "Include at least one uppercase letter.";
    }
    if (!/\d/.test(raw)) {
      return "Include at least one number.";
    }
    if (!/[^A-Za-z0-9]/.test(raw)) {
      return "Include at least one symbol.";
    }
    if (normalizedUsername && normalizedUsername.length >= 3) {
      const loweredPassword = raw.toLowerCase();
      if (loweredPassword.includes(normalizedUsername)) {
        return "Password cannot include your username.";
      }
    }
    return "";
  }

  function normalizeOtpCode(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .trim();
  }

  function generateNumericOtp(length = passwordResetOtpLength) {
    const size = Number.isFinite(length) ? Math.max(4, Math.min(8, length)) : passwordResetOtpLength;
    let value = "";
    while (value.length < size) {
      value += crypto.randomInt(0, 10).toString();
    }
    return value;
  }

  function parseTimestampMs(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) {
      return 0;
    }
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized);
    const candidate = hasTimezone ? normalized : `${normalized}Z`;
    const parsed = Date.parse(candidate);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isPasswordResetOtpExpired(row, nowMs = Date.now()) {
    const expiresAtMs = parseTimestampMs(row?.expires_at);
    if (!expiresAtMs) {
      return true;
    }
    return nowMs >= expiresAtMs;
  }

  function hasPasswordResetOtpResendCooldown(row, nowMs = Date.now()) {
    const createdAtMs = parseTimestampMs(row?.created_at);
    if (!createdAtMs) {
      return false;
    }
    return nowMs - createdAtMs < passwordResetOtpResendCooldownSeconds * 1000;
  }

  function maskEmailAddress(value) {
    const normalized = normalizeProfileEmail(value);
    if (!isValidProfileEmail(normalized)) {
      return "";
    }
    const [localPart, domainPart] = normalized.split("@");
    if (!localPart || !domainPart) {
      return "";
    }
    if (localPart.length <= 2) {
      return `${localPart.charAt(0)}***@${domainPart}`;
    }
    return `${localPart.slice(0, 2)}***@${domainPart}`;
  }

  function parseChecklistCompleted(value) {
    if (typeof value === "boolean") {
      return value;
    }
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  async function sendPasswordRecoveryOtp(input = {}) {
    const identifier = normalizeIdentifier(input.username || "");
    const auditSend = async (outcome, details = "") =>
      logPasswordResetAuditEvent(input.req, "password_reset_otp_send", identifier, outcome, details);
    if (!isValidIdentifier(identifier)) {
      await auditSend("invalid_input", "reason=invalid_username");
      throw { status: 400, error: "Enter a valid username." };
    }

    const sendRateLimit = takePasswordResetRateLimitAttempt(input.req, "send", identifier);
    if (sendRateLimit.limited) {
      throw {
        status: 429,
        error: "Too many OTP requests. Please try again later.",
        headers: { "Retry-After": String(sendRateLimit.retryAfterSeconds) },
        audit: () => auditSend("rate_limited", `retry_after_seconds=${sendRateLimit.retryAfterSeconds}`),
      };
    }

    try {
      const [rosterUser, passwordOverride, profile, latestOtp] = await Promise.all([
        get("SELECT auth_id, role FROM auth_roster WHERE auth_id = ? LIMIT 1", [identifier]),
        getPasswordOverride(identifier),
        getUserProfile(identifier),
        getLatestPasswordResetOtp(identifier),
      ]);

      if (!rosterUser || String(rosterUser.role || "").trim().toLowerCase() !== "student") {
        await auditSend("account_unavailable", "reason=not_student_or_missing_roster");
        throw { status: 400, error: "Password reset is not available for this account." };
      }
      if (!passwordOverride || !passwordOverride.password_hash) {
        await auditSend("account_unavailable", "reason=no_custom_password");
        throw { status: 400, error: "Password reset is not available for this account." };
      }

      const email = profile && isValidProfileEmail(profile.email) ? normalizeProfileEmail(profile.email) : "";
      if (!email) {
        await auditSend("email_missing", "reason=missing_or_invalid_profile_email");
        throw { status: 400, error: "No valid email is linked to this account." };
      }

      if (latestOtp && !latestOtp.consumed_at && !isPasswordResetOtpExpired(latestOtp) && hasPasswordResetOtpResendCooldown(latestOtp)) {
        await auditSend("cooldown_active", `cooldown_seconds=${passwordResetOtpResendCooldownSeconds}`);
        throw {
          status: 429,
          error: `Please wait ${passwordResetOtpResendCooldownSeconds} seconds before requesting another OTP.`,
        };
      }

      const otpCode = generateNumericOtp(passwordResetOtpLength);
      const otpHash = await bcrypt.hash(normalizeOtpCode(otpCode), 12);
      const expiresAt = new Date(Date.now() + passwordResetOtpTtlMinutes * 60 * 1000).toISOString();

      let otpId = 0;
      await withSqlTransaction(async () => {
        await invalidateActivePasswordResetOtps(identifier);
        otpId = await createPasswordResetOtp({
          username: identifier,
          email,
          otpHash,
          expiresAt,
          maxAttempts: passwordResetOtpMaxAttempts,
        });
      });

      try {
        await sendPasswordResetOtpEmail({
          username: identifier,
          toEmail: email,
          otpCode,
          expiresInMinutes: passwordResetOtpTtlMinutes,
        });
      } catch (sendErr) {
        await markPasswordResetOtpConsumed(otpId);
        const sendMessage = String(sendErr?.message || "");
        await auditSend("delivery_failed", sendMessage ? `reason=${sendMessage}` : "reason=unknown");
        throw { status: 503, error: sendMessage || "Could not deliver OTP email." };
      }

      const payload = {
        ok: true,
        expiresInMinutes: passwordResetOtpTtlMinutes,
        sentToMaskedEmail: maskEmailAddress(email),
      };
      if (isTestEnvironment) {
        payload.otpCode = otpCode;
      }
      await auditSend("success", `sent_to=${maskEmailAddress(email)}; expires_in_minutes=${passwordResetOtpTtlMinutes}`);
      return payload;
    } catch (err) {
      if (err && err.status && err.error) {
        if (typeof err.audit === "function") {
          await err.audit();
        }
        throw err;
      }
      await auditSend("server_error", `reason=${String(err?.message || "unknown")}`);
      throw { status: 500, error: "Could not send OTP." };
    }
  }

  async function resetPasswordRecovery(input = {}) {
    const identifier = normalizeIdentifier(input.username || "");
    const otpCode = normalizeOtpCode(input.otpCode || "");
    const newPassword = String(input.newPassword || "");
    const confirmPassword = String(input.confirmPassword || "");
    const auditReset = async (outcome, details = "") =>
      logPasswordResetAuditEvent(input.req, "password_reset_otp_reset", identifier, outcome, details);
    if (!isValidIdentifier(identifier)) {
      await auditReset("invalid_input", "reason=invalid_username");
      throw { status: 400, error: "Enter a valid username." };
    }
    if (!otpCode || otpCode.length !== passwordResetOtpLength) {
      await auditReset("invalid_input", "reason=invalid_otp_format");
      throw { status: 400, error: `Enter the ${passwordResetOtpLength}-digit OTP sent to your email.` };
    }
    if (!newPassword) {
      await auditReset("invalid_input", "reason=missing_new_password");
      throw { status: 400, error: "New password is required." };
    }
    if (newPassword !== confirmPassword) {
      await auditReset("invalid_input", "reason=password_mismatch");
      throw { status: 400, error: "New password and confirmation do not match." };
    }
    const passwordStrengthError = validateCustomPasswordStrength(newPassword, identifier);
    if (passwordStrengthError) {
      await auditReset("invalid_input", "reason=password_strength");
      throw { status: 400, error: passwordStrengthError };
    }

    const resetRateLimit = takePasswordResetRateLimitAttempt(input.req, "reset", identifier);
    if (resetRateLimit.limited) {
      await auditReset("rate_limited", `retry_after_seconds=${resetRateLimit.retryAfterSeconds}`);
      throw {
        status: 429,
        error: "Too many failed attempts. Please try again later.",
        headers: { "Retry-After": String(resetRateLimit.retryAfterSeconds) },
      };
    }

    try {
      const [rosterUser, passwordOverride, latestOtp] = await Promise.all([
        get("SELECT auth_id, role FROM auth_roster WHERE auth_id = ? LIMIT 1", [identifier]),
        getPasswordOverride(identifier),
        getLatestPasswordResetOtp(identifier),
      ]);

      if (!rosterUser || String(rosterUser.role || "").trim().toLowerCase() !== "student") {
        await auditReset("account_unavailable", "reason=not_student_or_missing_roster");
        throw { status: 400, error: "Password reset is not available for this account." };
      }
      if (!passwordOverride || !passwordOverride.password_hash) {
        await auditReset("account_unavailable", "reason=no_custom_password");
        throw { status: 400, error: "Password reset is not available for this account." };
      }
      if (!latestOtp || latestOtp.consumed_at) {
        await auditReset("otp_missing", "reason=no_active_otp");
        throw { status: 400, error: "Request a new OTP before resetting your password." };
      }
      if (isPasswordResetOtpExpired(latestOtp)) {
        await markPasswordResetOtpConsumed(latestOtp.id);
        await auditReset("otp_expired", "reason=expired");
        throw { status: 400, error: "OTP has expired. Request a new one." };
      }
      const attemptsUsed = Number(latestOtp.attempts_used || 0);
      const maxAttempts = Number(latestOtp.max_attempts || passwordResetOtpMaxAttempts);
      if (attemptsUsed >= maxAttempts) {
        await markPasswordResetOtpConsumed(latestOtp.id);
        await auditReset("otp_locked", `attempts_used=${attemptsUsed}; max_attempts=${maxAttempts}`);
        throw { status: 403, error: "OTP verification failed. Request a new OTP." };
      }

      const isOtpMatch = await bcrypt.compare(otpCode, latestOtp.otp_hash);
      if (!isOtpMatch) {
        await incrementPasswordResetOtpAttempt(latestOtp.id);
        const refreshedOtp = await getLatestPasswordResetOtp(identifier);
        const refreshedAttempts = Number(refreshedOtp?.attempts_used || attemptsUsed + 1);
        if (refreshedOtp && refreshedAttempts >= Number(refreshedOtp.max_attempts || maxAttempts)) {
          await markPasswordResetOtpConsumed(refreshedOtp.id);
        }
        await auditReset("otp_mismatch", `attempts_used=${refreshedAttempts}; max_attempts=${maxAttempts}`);
        throw { status: 403, error: "OTP verification failed. Check the code and try again." };
      }

      const isSameAsCurrent = await bcrypt.compare(newPassword, passwordOverride.password_hash);
      if (isSameAsCurrent) {
        await auditReset("invalid_input", "reason=password_reuse");
        throw { status: 400, error: "New password must be different from your current password." };
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await withSqlTransaction(async () => {
        await upsertPasswordOverride(identifier, passwordHash);
        await markPasswordResetOtpConsumed(latestOtp.id);
      });
      await auditReset("success", "password_reset_completed");
      return { ok: true };
    } catch (err) {
      if (err && err.status && err.error) {
        throw err;
      }
      await auditReset("server_error", `reason=${String(err?.message || "unknown")}`);
      throw { status: 500, error: "Could not reset password." };
    }
  }

  async function buildMePayload(input = {}) {
    const [profile, department, passwordOverride] = await Promise.all([
      getUserProfile(input.username),
      getSessionUserDepartment(input.req),
      getPasswordOverride(input.username),
    ]);
    const departmentScope = expandDepartmentScope(department);
    const displayName = profile && profile.display_name ? profile.display_name : deriveDisplayNameFromIdentifier(input.username);
    const email = profile && isValidProfileEmail(profile.email) ? normalizeProfileEmail(profile.email) : null;
    return {
      username: input.username,
      role: input.role,
      displayName,
      profileImageUrl: profile ? profile.profile_image_url : null,
      email,
      emailVerified: !!email,
      customPasswordEnabled: !!(passwordOverride && passwordOverride.password_hash),
      canSetOneTimeStrongPassword: input.role === "student" && !(passwordOverride && passwordOverride.password_hash),
      department,
      departmentLabel: formatDepartmentLabel(department),
      departmentsCovered:
        input.role === "teacher" ? Array.from(departmentScope || []).filter(Boolean).sort((a, b) => a.localeCompare(b)) : [],
    };
  }

  async function updateProfileEmailAddress(input = {}) {
    const email = normalizeProfileEmail(input.email || "");
    if (!email) {
      throw { status: 400, error: "Email address cannot be empty." };
    }
    if (!isValidProfileEmail(email)) {
      throw { status: 400, error: "Enter a valid email address." };
    }
    const existingOwner = await findProfileEmailOwner(email, input.username);
    if (existingOwner && normalizeIdentifier(existingOwner.username) !== normalizeIdentifier(input.username)) {
      throw { status: 409, error: "This email address is already in use by another account." };
    }
    await upsertProfileEmail(input.username, email);
    return { ok: true, email, verified: true, requiresVerification: false };
  }

  async function updateProfilePassword(input = {}) {
    const actorRole = String(input.actorRole || "")
      .trim()
      .toLowerCase();
    if (actorRole !== "student" && actorRole !== "teacher") {
      throw { status: 403, error: "Only students and lecturers can change passwords here." };
    }
    const currentPassword = String(input.currentPassword || "");
    const newPassword = String(input.newPassword || "");
    const confirmPassword = String(input.confirmPassword || "");

    if (!currentPassword) {
      throw { status: 400, error: "Current password is required." };
    }
    if (!newPassword) {
      throw { status: 400, error: "New password is required." };
    }
    if (newPassword !== confirmPassword) {
      throw { status: 400, error: "New password and confirmation do not match." };
    }
    const passwordStrengthError = validateCustomPasswordStrength(newPassword, input.username);
    if (passwordStrengthError) {
      throw { status: 400, error: passwordStrengthError };
    }

    const rosterUser = await get("SELECT auth_id, role, password_hash FROM auth_roster WHERE auth_id = ? LIMIT 1", [input.username]);
    if (!rosterUser) {
      throw { status: 404, error: "User was not found in the login roster." };
    }

    const passwordOverride = await getPasswordOverride(input.username);
    const isStudentOneTimeSetup = actorRole === "student";
    if (isStudentOneTimeSetup && passwordOverride && passwordOverride.password_hash) {
      throw {
        status: 403,
        error: "You can only create a stronger password once. Use Forgot Password on the login page to reset it.",
      };
    }

    let isCurrentPasswordValid = false;
    if (passwordOverride && passwordOverride.password_hash) {
      isCurrentPasswordValid = await bcrypt.compare(currentPassword, passwordOverride.password_hash);
      if (isCurrentPasswordValid) {
        const isSameAsExistingOverride = await bcrypt.compare(newPassword, passwordOverride.password_hash);
        if (isSameAsExistingOverride) {
          throw { status: 400, error: "New password must be different from your current password." };
        }
      }
    } else {
      const normalizedCurrentSurname = normalizeSurnamePassword(currentPassword);
      if (!isValidSurnamePassword(normalizedCurrentSurname)) {
        throw { status: 400, error: "Current password is incorrect." };
      }
      isCurrentPasswordValid = await bcrypt.compare(normalizedCurrentSurname, rosterUser.password_hash);
      if (isCurrentPasswordValid) {
        const normalizedNewSurname = normalizeSurnamePassword(newPassword);
        if (isValidSurnamePassword(normalizedNewSurname) && (await bcrypt.compare(normalizedNewSurname, rosterUser.password_hash))) {
          throw { status: 400, error: "New password must be different from your current password." };
        }
      }
    }

    if (!isCurrentPasswordValid) {
      throw { status: 400, error: "Current password is incorrect." };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await upsertPasswordOverride(input.username, passwordHash);
    return { ok: true };
  }

  async function getChecklistPayload(input = {}) {
    const actorRole = String(input.actorRole || "")
      .trim()
      .toLowerCase();
    const actorDepartment = await getSessionUserDepartment(input.req);
    const rows = await all(
      `
        SELECT
          dc.id,
          dc.department,
          dc.item_text,
          dc.item_order,
          dc.created_at,
          COALESCE(scp.completed, 0) AS completed,
          scp.completed_at
        FROM department_checklists dc
        LEFT JOIN student_checklist_progress scp
          ON scp.checklist_id = dc.id
         AND scp.username = ?
        ORDER BY dc.department ASC, dc.item_order ASC, dc.id ASC
      `,
      [input.username]
    );

    let scopedRows = rows;
    if (actorRole === "student") {
      scopedRows = rows.filter((row) => departmentScopeMatchesStudent(row.department, actorDepartment));
    } else if (actorRole === "teacher") {
      scopedRows = rows.filter((row) => doesDepartmentScopeOverlap(row.department, actorDepartment));
    }

    return {
      department: actorDepartment || "",
      departmentLabel: formatDepartmentLabel(actorDepartment || ""),
      items: scopedRows.map((row) => ({
        id: Number(row.id || 0),
        department: String(row.department || ""),
        departmentLabel: formatDepartmentLabel(row.department || ""),
        item_text: String(row.item_text || ""),
        item_order: Number(row.item_order || 0),
        completed: Number(row.completed || 0) === 1,
        completed_at: row.completed_at || null,
        created_at: row.created_at || "",
      })),
    };
  }

  async function toggleChecklistItem(input = {}) {
    if (String(input.actorRole || "").trim().toLowerCase() !== "student") {
      throw { status: 403, error: "Only students can update checklist progress." };
    }
    const checklistId = Number(input.checklistId || 0);
    if (!checklistId) {
      throw { status: 400, error: "Invalid checklist item ID." };
    }
    const item = await get(
      `
        SELECT id, department
        FROM department_checklists
        WHERE id = ?
        LIMIT 1
      `,
      [checklistId]
    );
    if (!item) {
      throw { status: 404, error: "Checklist item not found." };
    }
    const studentDepartment = await getSessionUserDepartment(input.req);
    if (!departmentScopeMatchesStudent(item.department, studentDepartment)) {
      throw { status: 403, error: "You do not have access to this checklist item." };
    }
    const completed = parseChecklistCompleted(input.completed);
    await run(
      `
        INSERT INTO student_checklist_progress (checklist_id, username, completed, completed_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(checklist_id, username) DO UPDATE SET
          completed = excluded.completed,
          completed_at = excluded.completed_at,
          updated_at = CURRENT_TIMESTAMP
      `,
      [checklistId, input.username, completed ? 1 : 0, completed ? new Date().toISOString() : null]
    );
    return {
      ok: true,
      checklistId,
      completed,
    };
  }

  return {
    normalizeIdentifier,
    normalizeSurnamePassword,
    isValidIdentifier,
    isValidSurnamePassword,
    normalizeDisplayName,
    normalizeDepartment,
    isValidDepartment,
    formatDepartmentLabel,
    parseDepartmentGroupsCsv,
    getDepartmentGroups,
    expandDepartmentScope,
    departmentScopeMatchesStudent,
    doesDepartmentScopeOverlap,
    normalizeProfileEmail,
    isValidProfileEmail,
    resolvePaystackCheckoutEmail,
    validateCustomPasswordStrength,
    normalizeOtpCode,
    generateNumericOtp,
    parseTimestampMs,
    isPasswordResetOtpExpired,
    hasPasswordResetOtpResendCooldown,
    maskEmailAddress,
    parseChecklistCompleted,
    sendPasswordRecoveryOtp,
    resetPasswordRecovery,
    buildMePayload,
    updateProfileEmailAddress,
    updateProfilePassword,
    getChecklistPayload,
    toggleChecklistItem,
  };
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < String(line || "").length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

module.exports = {
  createAuthDomain,
};
