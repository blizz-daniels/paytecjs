type DbLike = {
  run: (sql: string, params?: any[]) => Promise<any>;
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
};

export type JobRecord = {
  id: number;
  job_type: string;
  idempotency_key: string | null;
  payload_json: string;
  status: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  locked_at: string | null;
  lock_token: string | null;
  lock_expires_at: string | null;
  last_error: string | null;
  last_result_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function toJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch (_err) {
    return "{}";
  }
}

function parseJob(row: any): JobRecord {
  return {
    id: Number(row?.id || 0),
    job_type: String(row?.job_type || ""),
    idempotency_key: row?.idempotency_key ? String(row.idempotency_key) : null,
    payload_json: String(row?.payload_json || "{}"),
    status: String(row?.status || "pending"),
    priority: Number(row?.priority || 100),
    attempt_count: Number(row?.attempt_count || 0),
    max_attempts: Number(row?.max_attempts || 8),
    available_at: String(row?.available_at || ""),
    locked_at: row?.locked_at ? String(row.locked_at) : null,
    lock_token: row?.lock_token ? String(row.lock_token) : null,
    lock_expires_at: row?.lock_expires_at ? String(row.lock_expires_at) : null,
    last_error: row?.last_error ? String(row.last_error) : null,
    last_result_json: row?.last_result_json ? String(row.last_result_json) : null,
    created_at: String(row?.created_at || ""),
    updated_at: String(row?.updated_at || ""),
    completed_at: row?.completed_at ? String(row.completed_at) : null,
  };
}

export async function ensureBackgroundJobSchema(db: DbLike) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 100,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 8,
      available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_at TEXT,
      lock_token TEXT,
      lock_expires_at TEXT,
      last_error TEXT,
      last_result_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS background_job_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      attempt_number INTEGER NOT NULL,
      worker_id TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'processing',
      error_message TEXT,
      result_json TEXT,
      FOREIGN KEY (job_id) REFERENCES background_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE
    )
  `);
  await db.run("CREATE INDEX IF NOT EXISTS idx_background_jobs_status_available ON background_jobs(status, available_at)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_background_jobs_lock_expires ON background_jobs(lock_expires_at)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(job_type)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_background_job_attempts_job ON background_job_attempts(job_id)");
}

export async function enqueueBackgroundJob(
  db: DbLike,
  input: {
    jobType: string;
    payload?: unknown;
    idempotencyKey?: string;
    priority?: number;
    maxAttempts?: number;
    runAt?: Date | string | null;
  }
) {
  const jobType = String(input.jobType || "").trim();
  if (!jobType) {
    throw new Error("jobType is required.");
  }
  const idempotencyKey = String(input.idempotencyKey || "").trim() || null;
  if (idempotencyKey) {
    const existing = await db.get("SELECT * FROM background_jobs WHERE idempotency_key = ? LIMIT 1", [idempotencyKey]);
    if (existing) {
      return { job: parseJob(existing), existed: true };
    }
  }
  const availableAt = toIso(input.runAt || new Date());
  const priority = Number.isFinite(Number(input.priority)) ? Number(input.priority) : 100;
  const maxAttempts = Number.isFinite(Number(input.maxAttempts)) ? Math.max(1, Number(input.maxAttempts)) : 8;
  const payloadJson = toJson(input.payload);

  try {
    const result = await db.run(
      `
        INSERT INTO background_jobs (
          job_type,
          idempotency_key,
          payload_json,
          status,
          priority,
          attempt_count,
          max_attempts,
          available_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [jobType, idempotencyKey, payloadJson, priority, maxAttempts, availableAt]
    );
    const insertedId = Number(result?.lastID || 0);
    const row = insertedId
      ? await db.get("SELECT * FROM background_jobs WHERE id = ? LIMIT 1", [insertedId])
      : await db.get("SELECT * FROM background_jobs WHERE idempotency_key = ? LIMIT 1", [idempotencyKey]);
    return { job: parseJob(row), existed: false };
  } catch (err: any) {
    if (idempotencyKey) {
      const existing = await db.get("SELECT * FROM background_jobs WHERE idempotency_key = ? LIMIT 1", [idempotencyKey]);
      if (existing) {
        return { job: parseJob(existing), existed: true };
      }
    }
    throw err;
  }
}

export async function leaseDueBackgroundJobs(
  db: DbLike,
  input: {
    workerId: string;
    limit?: number;
    leaseSeconds?: number;
    jobType?: string;
  }
) {
  const workerId = String(input.workerId || "").trim() || "worker";
  const nowIso = new Date().toISOString();
  const leaseSeconds = Number.isFinite(Number(input.leaseSeconds)) ? Math.max(15, Number(input.leaseSeconds)) : 120;
  const lockExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const limit = Number.isFinite(Number(input.limit)) ? Math.max(1, Number(input.limit)) : 20;
  const jobType = String(input.jobType || "").trim();
  const candidates = jobType
    ? await db.all(
        `
          SELECT id
          FROM background_jobs
          WHERE job_type = ?
            AND status IN ('pending', 'retryable')
            AND available_at <= ?
            AND (lock_expires_at IS NULL OR lock_expires_at <= ?)
          ORDER BY priority DESC, available_at ASC, id ASC
          LIMIT ?
        `,
        [jobType, nowIso, nowIso, limit]
      )
    : await db.all(
        `
          SELECT id
          FROM background_jobs
          WHERE status IN ('pending', 'retryable')
            AND available_at <= ?
            AND (lock_expires_at IS NULL OR lock_expires_at <= ?)
          ORDER BY priority DESC, available_at ASC, id ASC
          LIMIT ?
        `,
        [nowIso, nowIso, limit]
      );
  const leased: JobRecord[] = [];
  for (const row of candidates) {
    const id = Number(row?.id || 0);
    if (!id) {
      continue;
    }
    const updated = await db.run(
      `
        UPDATE background_jobs
        SET status = 'processing',
            locked_at = ?,
            lock_token = ?,
            lock_expires_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status IN ('pending', 'retryable')
          AND available_at <= ?
          AND (lock_expires_at IS NULL OR lock_expires_at <= ?)
      `,
      [nowIso, workerId, lockExpiresAt, id, nowIso, nowIso]
    );
    if (Number(updated?.changes || 0) < 1) {
      continue;
    }
    const jobRow = await db.get("SELECT * FROM background_jobs WHERE id = ? LIMIT 1", [id]);
    if (jobRow) {
      leased.push(parseJob(jobRow));
    }
  }
  return leased;
}

export async function startBackgroundJobAttempt(db: DbLike, input: { jobId: number; workerId: string; attemptNumber: number }) {
  await db.run(
    `
      INSERT INTO background_job_attempts (job_id, attempt_number, worker_id, started_at, status)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'processing')
    `,
    [input.jobId, input.attemptNumber, String(input.workerId || "worker")]
  );
}

export async function finishBackgroundJobAttempt(
  db: DbLike,
  input: {
    jobId: number;
    attemptNumber: number;
    status: "succeeded" | "retryable" | "failed";
    errorMessage?: string;
    result?: unknown;
  }
) {
  await db.run(
    `
      UPDATE background_job_attempts
      SET finished_at = CURRENT_TIMESTAMP,
          status = ?,
          error_message = ?,
          result_json = ?
      WHERE job_id = ?
        AND attempt_number = ?
    `,
    [
      input.status,
      input.errorMessage ? String(input.errorMessage).slice(0, 2000) : null,
      input.result === undefined ? null : toJson(input.result),
      input.jobId,
      input.attemptNumber,
    ]
  );
}

export async function markBackgroundJobSucceeded(db: DbLike, input: { jobId: number; result?: unknown }) {
  await db.run(
    `
      UPDATE background_jobs
      SET status = 'succeeded',
          completed_at = CURRENT_TIMESTAMP,
          lock_token = NULL,
          locked_at = NULL,
          lock_expires_at = NULL,
          last_error = NULL,
          last_result_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [input.result === undefined ? null : toJson(input.result), input.jobId]
  );
}

export async function markBackgroundJobFailed(
  db: DbLike,
  input: {
    jobId: number;
    attemptCount: number;
    maxAttempts: number;
    errorMessage: string;
    retryAt?: Date | string | null;
  }
) {
  const exhausted = input.attemptCount >= input.maxAttempts;
  await db.run(
    `
      UPDATE background_jobs
      SET status = ?,
          attempt_count = ?,
          available_at = ?,
          lock_token = NULL,
          locked_at = NULL,
          lock_expires_at = NULL,
          last_error = ?,
          completed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      exhausted ? "failed" : "retryable",
      input.attemptCount,
      exhausted ? toIso(new Date()) : toIso(input.retryAt || new Date(Date.now() + 30_000)),
      String(input.errorMessage || "").slice(0, 2000),
      exhausted ? 1 : 0,
      input.jobId,
    ]
  );
}

export function parseJobPayload(job: JobRecord) {
  try {
    const parsed = JSON.parse(String(job.payload_json || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_err) {
    return {};
  }
}
