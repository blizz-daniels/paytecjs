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
);

CREATE INDEX IF NOT EXISTS idx_stored_files_category ON stored_files(category);
CREATE INDEX IF NOT EXISTS idx_stored_files_owner ON stored_files(owner_username);
CREATE INDEX IF NOT EXISTS idx_stored_files_access ON stored_files(access_scope);
CREATE INDEX IF NOT EXISTS idx_stored_files_linked ON stored_files(linked_table, linked_id);
