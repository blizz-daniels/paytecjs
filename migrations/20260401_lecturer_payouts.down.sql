-- Lecturer payout rollback
-- SQLite cannot reliably drop added columns in-place, so the balance column on payment_items is left behind.

DROP INDEX IF EXISTS idx_lecturer_payout_events_transfer;
DROP INDEX IF EXISTS idx_lecturer_payout_transfers_account;
DROP INDEX IF EXISTS idx_lecturer_payout_transfers_status;
DROP INDEX IF EXISTS idx_lecturer_payout_transfers_lecturer;
DROP INDEX IF EXISTS idx_lecturer_payout_ledger_item;
DROP INDEX IF EXISTS idx_lecturer_payout_ledger_status;
DROP INDEX IF EXISTS idx_lecturer_payout_ledger_lecturer;
DROP INDEX IF EXISTS idx_lecturer_payout_accounts_recipient;
DROP INDEX IF EXISTS idx_lecturer_payout_accounts_lecturer;

DROP TABLE IF EXISTS lecturer_payout_events;
DROP TABLE IF EXISTS lecturer_payout_transfers;
DROP TABLE IF EXISTS lecturer_payout_ledger;
DROP TABLE IF EXISTS lecturer_payout_accounts;
