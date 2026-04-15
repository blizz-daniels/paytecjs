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
);

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
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_status_available ON background_jobs(status, available_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_lock_expires ON background_jobs(lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_background_job_attempts_job ON background_job_attempts(job_id);
