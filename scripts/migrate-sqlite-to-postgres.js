#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { openSqliteDatabase, openDatabaseClient } = require("../services/sqlite-client");

const projectRoot = path.resolve(__dirname, "..");
const DEFAULT_IMPORT_ORDER = [
  "users",
  "auth_roster",
  "roster_import_state",
  "user_password_overrides",
  "user_profiles",
  "department_checklists",
  "payment_items",
  "notifications",
  "handouts",
  "shared_files",
  "message_threads",
  "payment_obligations",
  "payment_transactions",
  "payment_matches",
  "reconciliation_exceptions",
  "reconciliation_events",
  "audit_events",
  "audit_logs",
  "password_reset_otps",
  "login_events",
  "notification_reads",
  "notification_reactions",
  "handout_reactions",
  "shared_file_reactions",
  "message_participants",
  "messages",
  "lecturer_payout_accounts",
  "lecturer_payout_transfers",
  "lecturer_payout_ledger",
  "lecturer_payout_events",
  "teacher_payment_statements",
  "payment_receipts",
  "payment_receipt_events",
  "approved_receipt_dispatches",
  "paystack_sessions",
  "paystack_reference_requests",
  "student_checklist_progress",
];

function loadDotEnvIfPresent(dotEnvPath) {
  if (!fs.existsSync(dotEnvPath)) {
    return;
  }
  const content = fs.readFileSync(dotEnvPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const options = {
    sqlitePath: String(process.env.SQLITE_DB_PATH || "").trim(),
    databaseUrl: String(process.env.DATABASE_URL || "").trim(),
    dryRun: false,
    replace: false,
    includeSessions: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--include-sessions") {
      options.includeSessions = true;
      continue;
    }
    if (arg === "--replace" || arg === "--truncate") {
      options.replace = true;
      continue;
    }
    if (arg.startsWith("--sqlite=")) {
      options.sqlitePath = path.resolve(arg.slice("--sqlite=".length));
      continue;
    }
    if (arg.startsWith("--database-url=")) {
      options.databaseUrl = arg.slice("--database-url=".length).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  process.stdout.write(
    [
      "SQLite to PostgreSQL migration helper",
      "",
      "Usage:",
      "  node scripts/migrate-sqlite-to-postgres.js --sqlite=./data/paytec.sqlite --database-url=postgres://...",
      "",
      "Options:",
      "  --sqlite=<path>         Source SQLite database file.",
      "  --database-url=<url>    Target PostgreSQL connection string.",
      "  --dry-run               Print the plan without writing data.",
      "  --replace               Clear target tables before importing.",
      "  --include-sessions      Copy a source sessions table if present.",
      "  --help                  Show this help message.",
      "",
      "Environment:",
      "  SQLITE_DB_PATH          Default source SQLite database path.",
      "  DATABASE_URL            Target PostgreSQL connection string.",
    ].join("\n") + "\n"
  );
}

function quoteIdent(identifier) {
  return `"${String(identifier || "").replace(/"/g, '""')}"`;
}

function buildInsertSql(tableName, columns, rowCount) {
  const columnSql = columns.map((column) => quoteIdent(column)).join(", ");
  const rowSql = Array.from({ length: rowCount }, () => `(${columns.map(() => "?").join(", ")})`).join(", ");
  return `INSERT INTO ${quoteIdent(tableName)} (${columnSql}) VALUES ${rowSql}`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function collectColumnNames(columns) {
  return columns
    .slice()
    .sort((a, b) => Number(a.cid || 0) - Number(b.cid || 0))
    .map((column) => String(column.name || "").trim())
    .filter(Boolean);
}

function rowValuesForColumns(row, columns) {
  return columns.map((column) => {
    const value = row[column];
    return value === undefined ? null : value;
  });
}

function sortTablesForImport(tableNames, includeSessions = false) {
  const normalized = tableNames
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .filter((name) => includeSessions || name !== "sessions");
  const remaining = new Set(normalized);
  const ordered = [];
  for (const tableName of DEFAULT_IMPORT_ORDER) {
    if (remaining.has(tableName)) {
      ordered.push(tableName);
      remaining.delete(tableName);
    }
  }
  for (const tableName of normalized.sort()) {
    if (remaining.has(tableName)) {
      ordered.push(tableName);
      remaining.delete(tableName);
    }
  }
  return ordered;
}

async function getSourceTables(db) {
  const rows = await db.all(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `
  );
  return rows.map((row) => String(row.name || "").trim()).filter(Boolean);
}

async function resetTargetSequence(db, tableName) {
  const info = await db.all(`PRAGMA table_info(${tableName})`);
  const idColumn = info.find((column) => String(column.name || "").trim() === "id");
  if (!idColumn) {
    return;
  }
  await db.run(
    `
      SELECT setval(
        pg_get_serial_sequence(?, ?),
        COALESCE((SELECT MAX(id) FROM ${quoteIdent(tableName)}), 1),
        EXISTS (SELECT 1 FROM ${quoteIdent(tableName)})
      )
    `,
    [tableName, "id"]
  );
}

async function importTable(sourceDb, targetDb, tableName, options = {}) {
  const columns = collectColumnNames(await sourceDb.all(`PRAGMA table_info(${tableName})`));
  if (!columns.length) {
    return { table: tableName, sourceCount: 0, targetCount: 0 };
  }

  const rows = await sourceDb.all(`SELECT * FROM ${quoteIdent(tableName)}`);
  const sourceCount = rows.length;

  if (!sourceCount) {
    return { table: tableName, sourceCount: 0, targetCount: 0 };
  }

  const rowChunks = chunkArray(rows, 200);
  for (const rowChunk of rowChunks) {
    const sql = buildInsertSql(tableName, columns, rowChunk.length);
    const params = rowChunk.flatMap((row) => rowValuesForColumns(row, columns));
    await targetDb.run(sql, params);
  }

  if (columns.includes("id")) {
    await resetTargetSequence(targetDb, tableName);
  }

  const targetRow = await targetDb.get(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`);
  return {
    table: tableName,
    sourceCount,
    targetCount: Number(targetRow?.count || 0),
    includedSessions: Boolean(options.includeSessions),
  };
}

async function truncateTargetTables(targetDb, tableNames) {
  if (!tableNames.length) {
    return;
  }
  const truncateSql = `TRUNCATE ${tableNames.map((tableName) => quoteIdent(tableName)).join(", ")} RESTART IDENTITY CASCADE`;
  await targetDb.run(truncateSql);
}

async function main() {
  loadDotEnvIfPresent(path.join(projectRoot, ".env"));
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.sqlitePath) {
    throw new Error("Source SQLite path is required. Set SQLITE_DB_PATH or pass --sqlite=...");
  }
  if (!options.databaseUrl) {
    throw new Error("Target DATABASE_URL is required.");
  }
  if (!fs.existsSync(options.sqlitePath)) {
    throw new Error(`SQLite database not found: ${options.sqlitePath}`);
  }

  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL = options.databaseUrl;
  const { initDatabase } = require("../server");
  const sourceDb = openSqliteDatabase(options.sqlitePath);
  const targetDb = openDatabaseClient({ databaseUrl: options.databaseUrl });
  try {
    await initDatabase();
    const sourceTables = await getSourceTables(sourceDb);
    const orderedTables = sortTablesForImport(sourceTables, options.includeSessions);

    if (!orderedTables.length) {
      console.log("[migrate] No source tables found.");
      return;
    }

    console.log(`[migrate] Source: ${options.sqlitePath}`);
    console.log(`[migrate] Target: ${options.databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
    console.log(`[migrate] Tables: ${orderedTables.join(", ")}`);

    if (options.dryRun) {
      console.log("[migrate] Dry run requested; no data was copied.");
      return;
    }

    if (!options.replace) {
      const nonEmptyTables = [];
      for (const tableName of orderedTables) {
        const row = await targetDb.get(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`);
        if (Number(row?.count || 0) > 0) {
          nonEmptyTables.push(tableName);
        }
      }
      if (nonEmptyTables.length) {
        throw new Error(
          `Target database is not empty. Re-run with --replace to clear existing rows first: ${nonEmptyTables.join(", ")}`
        );
      }
    }

    const results = [];
    await targetDb.transaction(async () => {
      if (options.replace) {
        await truncateTargetTables(targetDb, orderedTables.slice().reverse());
        console.log("[migrate] Target tables were cleared before import.");
      }
      for (const tableName of orderedTables) {
        const result = await importTable(sourceDb, targetDb, tableName, options);
        results.push(result);
        console.log(`[migrate] ${tableName}: ${result.sourceCount} rows imported`);
      }
    });

    let mismatches = 0;
    for (const result of results) {
      if (result.sourceCount !== result.targetCount) {
        mismatches += 1;
        console.warn(
          `[migrate] row-count mismatch for ${result.table}: source=${result.sourceCount} target=${result.targetCount}`
        );
      }
    }

    if (mismatches === 0) {
      console.log("[migrate] Import completed successfully. Row counts matched for all copied tables.");
    } else {
      console.warn(`[migrate] Import completed with ${mismatches} table mismatch(es). Review before cutover.`);
    }
  } finally {
    await Promise.all([sourceDb.close(), targetDb.close()]);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[migrate] ${err.message || err}`);
    process.exit(1);
  });
}

module.exports = {
  sortTablesForImport,
  collectColumnNames,
  buildInsertSql,
  rowValuesForColumns,
};
