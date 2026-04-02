CREATE TABLE IF NOT EXISTS roster_import_state (
  roster_key TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  source_name TEXT,
  import_status TEXT NOT NULL DEFAULT 'completed',
  imported_count INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
