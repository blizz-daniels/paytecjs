const path = require("path");

function normalizeNodeEnv(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) {
    return "development";
  }
  return value;
}

function isSupabaseDatabaseUrl(rawDatabaseUrl) {
  const databaseUrl = String(rawDatabaseUrl || "").trim();
  if (!databaseUrl) {
    return false;
  }
  try {
    const parsed = new URL(databaseUrl);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();
    if (!hostname) {
      return false;
    }
    return hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com");
  } catch (_err) {
    return false;
  }
}

function parseBooleanEnv(rawValue, defaultValue = false) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return !!defaultValue;
  }
  const normalized = String(rawValue).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return !!defaultValue;
}

function resolveDatabaseRuntime(options = {}) {
  const nodeEnv = normalizeNodeEnv(options.nodeEnv || process.env.NODE_ENV);
  const isProduction = nodeEnv === "production";
  const databaseUrl = String(options.databaseUrl || process.env.DATABASE_URL || "").trim();
  const enforceSupabaseInProduction = parseBooleanEnv(
    options.enforceSupabaseInProduction ?? process.env.ENFORCE_SUPABASE_IN_PRODUCTION,
    true
  );
  const defaultSqlitePath = options.defaultSqlitePath
    ? path.resolve(String(options.defaultSqlitePath))
    : path.resolve(String(options.dataDir || process.cwd()), "paytec.sqlite");
  const sqlitePath = path.resolve(String(options.sqlitePath || process.env.SQLITE_DEV_PATH || defaultSqlitePath));

  if (isProduction) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required in production. Supabase Postgres is the only supported production database.");
    }
    if (enforceSupabaseInProduction && !isSupabaseDatabaseUrl(databaseUrl)) {
      throw new Error("DATABASE_URL must point to a Supabase Postgres host (.supabase.co/.supabase.com) in production.");
    }
    return {
      nodeEnv,
      isProduction,
      driver: "postgres",
      databaseUrl,
      sqlitePath: null,
      isSupabase: isSupabaseDatabaseUrl(databaseUrl),
      enforceSupabaseInProduction,
    };
  }

  if (databaseUrl) {
    return {
      nodeEnv,
      isProduction,
      driver: "postgres",
      databaseUrl,
      sqlitePath: null,
      isSupabase: isSupabaseDatabaseUrl(databaseUrl),
      enforceSupabaseInProduction,
    };
  }

  return {
    nodeEnv,
    isProduction,
    driver: "sqlite",
    databaseUrl: "",
    sqlitePath,
    isSupabase: false,
    enforceSupabaseInProduction,
  };
}

module.exports = {
  resolveDatabaseRuntime,
  isSupabaseDatabaseUrl,
  parseBooleanEnv,
};
