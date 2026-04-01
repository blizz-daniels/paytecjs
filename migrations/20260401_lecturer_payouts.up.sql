-- Lecturer payout rollout
-- Adds bank account storage, payout ledger, payout transfers, and payout events.
PRAGMA foreign_keys = ON;

ALTER TABLE payment_items ADD COLUMN lecturer_share_bps INTEGER NOT NULL DEFAULT 10000;

CREATE TABLE IF NOT EXISTS lecturer_payout_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecturer_username TEXT NOT NULL UNIQUE,
  bank_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_last4 TEXT NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  recipient_code TEXT NOT NULL UNIQUE,
  recipient_type TEXT NOT NULL DEFAULT 'nuban',
  recipient_status TEXT NOT NULL DEFAULT 'active',
  auto_payout_enabled INTEGER NOT NULL DEFAULT 1,
  review_required INTEGER NOT NULL DEFAULT 0,
  last_provider_response_json TEXT NOT NULL DEFAULT '{}',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lecturer_payout_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecturer_username TEXT NOT NULL,
  payment_transaction_id INTEGER NOT NULL UNIQUE,
  payment_item_id INTEGER NOT NULL,
  obligation_id INTEGER,
  gross_amount REAL NOT NULL,
  share_bps INTEGER NOT NULL DEFAULT 10000,
  payout_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'available',
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payout_transfer_id INTEGER,
  review_reason TEXT,
  source_status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (payment_item_id) REFERENCES payment_items(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (obligation_id) REFERENCES payment_obligations(id) ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (payout_transfer_id) REFERENCES lecturer_payout_transfers(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS lecturer_payout_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecturer_username TEXT NOT NULL,
  payout_account_id INTEGER NOT NULL,
  transfer_reference TEXT NOT NULL UNIQUE,
  transfer_code TEXT,
  total_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'queued',
  trigger_source TEXT NOT NULL DEFAULT 'auto',
  review_state TEXT NOT NULL DEFAULT 'not_required',
  provider_response_json TEXT NOT NULL DEFAULT '{}',
  failure_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  ledger_count INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  dispatched_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payout_account_id) REFERENCES lecturer_payout_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lecturer_payout_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER,
  ledger_id INTEGER,
  actor_username TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transfer_id) REFERENCES lecturer_payout_transfers(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (ledger_id) REFERENCES lecturer_payout_ledger(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lecturer_payout_accounts_lecturer ON lecturer_payout_accounts(lecturer_username);
CREATE INDEX IF NOT EXISTS idx_lecturer_payout_accounts_recipient ON lecturer_payout_accounts(recipient_code);
CREATE INDEX IF NOT EXISTS idx_lecturer_payout_ledger_lecturer ON lecturer_payout_ledger(lecturer_username);
CREATE INDEX IF NOT EXISTS idx_lecturer_payout_ledger_status ON lecturer_payout_ledger(status);
CREATE INDEX IF NOT EXISTS idx_lecturer_payout_ledger_item ON lecturer_payout_ledger(payment_item_id);
CREATE INDEX IF NOT EXISTS idx_lecturer_payout_transfers_lecturer ON lecturer_payout_transfers(lecturer_username);
CREATE INDEX IF NOT EXISTS idx_lecturer_payout_transfers_status ON lecturer_payout_transfers(status);
CREATE INDEX IF NOT EXISTS idx_lecturer_payout_transfers_account ON lecturer_payout_transfers(payout_account_id);
CREATE INDEX IF NOT EXISTS idx_lecturer_payout_events_transfer ON lecturer_payout_events(transfer_id);
