# CampusPay Hub

CampusPay Hub is a role-based school portal for student communication, class resources, and payment tracking.

## Paystack-Only Workflow

The payment system runs in strict Paystack mode:

1. Lecturers create payment items.
2. System creates per-student payment obligations with deterministic references.
3. Students pay through Paystack checkout.
4. Paystack webhook/verification ingests transactions.
5. Matching engine auto-approves high-confidence matches.
6. Approved transactions auto-generate downloadable approved receipts.
7. Low-confidence or duplicate transactions are handled in reconciliation exception flows.

## Roles

- `student`: see payment items/obligations, pay with Paystack, view ledger, download approved receipts.
- `lecturer` (stored as `teacher` role value): manage payment items, verify delayed Paystack references, review reconciliation exceptions.
- `admin`: all lecturer capabilities + broader monitoring.

## Department Scoping

- Student and lecturer roster CSVs now require a `department` column.
- Roster rows are stored in `auth_roster`; CSV files are used for bootstrap/admin imports, not as the live runtime source after import.
- Lecturer content (notifications, handouts, shared files, payment items) is automatically scoped to the lecturer department.
- Superdepartment targeting is supported through `data/department-groups.csv` (for example, `science` can cover multiple science departments).
- Student feeds and payment views are filtered by department scope.
- Admin import also supports department checklist CSV uploads (`department,task[,order]`), consumed on the profile checklist page.

## Password Security and Recovery

- Students can create a stronger custom password once from their profile page.
- After that one-time setup, further student password changes are blocked in profile.
- Forgotten stronger passwords are reset from `/forgot-password` using email OTP verification.
- OTP delivery requires a valid student profile email and email delivery configuration (SMTP or API).
- OTP is always sent to the email saved in `user_profiles.email` for that username.
- OTP send/reset endpoints are rate-limited per `IP + username`.
- OTP request/reset outcomes are logged to `audit_logs` without storing OTP plaintext.
- Email delivery provider is configurable with `EMAIL_PROVIDER`:
  - `smtp` (default) using `SMTP_*`
  - `resend` (HTTPS API) using `RESEND_API_KEY` + `PASSWORD_RESET_EMAIL_FROM`

## Dual-Stack Migration

The repository now includes a Next.js App Router skeleton alongside the existing Express app.

- Legacy Express remains the source of truth for the current production pages and APIs.
- Next.js currently owns the new `/login` and `/forgot-password` experience, plus role-group shell pages under `app/`.
- The App Router pages are intentionally partial. They mirror the legacy layout and navigation, but they do not fully replace every page yet.
- The Next.js API routes handle auth/session natively; non-migrated endpoints still pass through the legacy catch-all proxy during cutover.

### Local Run Order

Use two terminals during migration when legacy-backed endpoints are needed:

1. Start the legacy app on a separate port, for example:
   - `PORT=3001 npm run dev:legacy`
2. Start the Next.js app and point it at the legacy backend:
   - `LEGACY_APP_URL=http://127.0.0.1:3001 npm run dev:next`

If you want to build the Next.js shell for production testing:

- `npm run build` (or `npm run build:next`)
- `npm run start` (or `npm run start:next`)

Legacy bridge note:

- During current migration phase, non-migrated APIs still require `LEGACY_APP_URL`.
- In production, missing `LEGACY_APP_URL` now fails fast for legacy-proxied endpoints and legacy-backed background jobs.

### Next.js Scope In This Phase

- Ported now: `/login`, `/forgot-password`
- Added now: role-aware shell layouts for student, teacher, and admin areas
- Still legacy-only: most interactive student, teacher, admin, payments, messaging, analytics, and profile data flows

### Next Auth + Session Migration (Phase 5)

- Next.js Route Handlers now support native auth/session flows:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/session`
  - `GET /api/me`
  - `POST /api/auth/password-recovery/send-otp`
  - `POST /api/auth/password-recovery/reset`
  - `GET /api/csrf-token`
- Sessions are stored in database table `next_auth_sessions`.
- Production requires Postgres for Next sessions (SQLite session storage is blocked in production).
- Role is re-resolved from database on each authenticated request (`users` for admin, `auth_roster` for student/teacher).
- CSRF is enforced for unsafe Next.js route handlers (including the legacy catch-all proxy) using `/api/csrf-token` plus header/hidden-field verification.

## Database Runtime Policy (Phase 3)

Production database behavior is now explicit and locked down:

- `NODE_ENV=production` requires `DATABASE_URL`.
- Production only allows Supabase Postgres hosts (`.supabase.co` or `.supabase.com`).
- SQLite is blocked in production.
- Session persistence in production uses Postgres `sessions` table.

Development/test behavior:

- If `DATABASE_URL` is set, the app uses Postgres.
- If `DATABASE_URL` is not set, the app uses local SQLite (`data/paytec.sqlite` by default).
- You can override the dev SQLite file path with `SQLITE_DEV_PATH`.

Optional flags:

- `ENFORCE_SUPABASE_IN_PRODUCTION=true` (default) keeps strict Supabase host checks enabled.

## Core APIs

### Payment Items + Obligations

- `GET /api/payment-items` (auth required)
  - for students, includes `my_reference`, `obligation_status`, `amount_paid_total`
- `POST /api/payment-items` (lecturer/admin)
- `PUT /api/payment-items/:id` (lecturer owner/admin)
- `DELETE /api/payment-items/:id` (lecturer owner/admin)

### Student Payment + Receipt APIs

- `GET /api/my/payment-ledger`
- `POST /api/payments/paystack/initialize`
- `GET /api/payments/paystack/callback`
- `GET /api/my/payment-receipts` (approved receipts only)
- `GET /api/payment-receipts/:id/file?variant=approved`
- `POST /api/auth/password-recovery/send-otp`
- `POST /api/auth/password-recovery/reset`

### Paystack Ingestion + Verification

- `POST /api/payments/webhook/paystack`
- `POST /api/payments/paystack/verify`
- `POST /api/payments/paystack/reference-requests` (student fallback for delayed webhook confirmation)
- `POST /api/payments/paystack/reference-requests/bulk-verify` (lecturer/admin)

### Lecturer Payouts

- `GET /api/lecturer/payout-summary`
- `GET /api/lecturer/payout-account`
- `POST /api/lecturer/payout-account`
- `PUT /api/lecturer/payout-account`
- `GET /api/lecturer/payout-history`
- `POST /api/lecturer/payout-request`
- `GET /api/admin/lecturer/payout-transfers`
- `POST /api/admin/lecturer/payout-transfers/:id/review`
- `POST /api/admin/lecturer/payout-transfers/:id/retry`

Lecturer payout account responses are masked by default. Only `bank_name`, `account_name`, `account_last4`, and provider status fields are returned to the client.

Lecturer-facing UI is split across:

- `/lecturer` for payout balance, transfer history, and payout requests
- `/profile` for payout bank account setup and update

### Exception Queue + Actions

- `GET /api/lecturer/reconciliation/summary`
- `GET /api/admin/reconciliation/summary`
- `GET /api/reconciliation/summary` (lecturer/admin generic)
- `GET /api/lecturer/reconciliation/exceptions`
- `GET /api/admin/reconciliation/exceptions`
- `GET /api/reconciliation/exceptions` (lecturer/admin generic)
  - filters: `status`, `reason`, `student`, `paymentItemId`, `dateFrom`, `dateTo`, `page`, `pageSize`
  - default response is paginated: `{items, pagination}`
  - use `legacy=1` for array-only compatibility
- `POST /api/reconciliation/:id/approve`
- `POST /api/reconciliation/:id/reject`
- `POST /api/reconciliation/:id/request-student-confirmation`
- `POST /api/reconciliation/:id/merge-duplicates`

### Deprecated APIs (`410 Gone`)

- `POST /api/payment-receipts`
- `GET|POST|DELETE /api/lecturer/payment-statement` (`/api/teacher/payment-statement` alias)
- `GET /api/lecturer/payment-receipts`
- `GET /api/admin/payment-receipts`
- `POST /api/payment-receipts/:id/assign`
- `POST /api/payment-receipts/:id/notes`
- `GET /api/payment-receipts/:id/notes`
- `POST /api/payment-receipts/bulk`
- `POST /api/payment-receipts/:id/verify`
- `POST /api/payment-receipts/:id/under-review`
- `POST /api/payment-receipts/:id/approve`
- `POST /api/payment-receipts/:id/reject`
- `POST /api/reconciliation/bulk`
- `POST /api/payments/webhook`

## Matching + Normalization

All ingested transactions normalize to:

`{ txn_ref, amount, date, payer_name, source, raw_payload }`

Matching uses:

- exact obligation reference (highest confidence)
- student/item hints
- amount similarity
- payer-name similarity
- date proximity

Duplicate checks run before candidate selection.

Threshold behavior:

- `>= AUTO_RECONCILE_CONFIDENCE`: auto-approve
- `REVIEW_RECONCILE_CONFIDENCE .. AUTO_RECONCILE_CONFIDENCE`: exception queue
- `< REVIEW_RECONCILE_CONFIDENCE`: unmatched/low-confidence exception

## Database Additions (Reconciliation)

- `payment_obligations`
- `payment_transactions`
- `payment_matches`
- `reconciliation_exceptions`
- `reconciliation_events`
- `audit_events`

## Database Additions (Lecturer Payouts)

- `payment_items.lecturer_share_bps`
- `lecturer_payout_accounts`
- `lecturer_payout_ledger`
- `lecturer_payout_transfers`
- `lecturer_payout_events`

Payout rows are linked to approved reconciliation rows so the payout ledger can be audited from the original student payment.

Legacy data migration is run in `initDatabase()`:

- existing `payment_receipts` are mapped into `payment_transactions`
- mapped transactions are synchronized into `payment_matches`/`reconciliation_exceptions`
- obligations are backfilled for existing payment items/students

SQL migration scripts:

- `migrations/20260223_reconciliation_first.up.sql`
- `migrations/20260223_reconciliation_first.down.sql`

## Audit/Event Logging

- `payment_receipt_events` for approved-receipt lifecycle/audit
- `reconciliation_events` for transaction reconciliation actions
- `audit_logs` for actor-level accountability

## Approved Student Receipt Generator

Automated workflow included in this repo:

1. Reads approved rows from `payment_receipts` (`status='approved'`).
2. Skips already-processed rows unless `--force`.
3. Fills HTML/CSS template placeholders.
4. Inserts profile picture (`user_profiles.profile_image_url`) into passport slot; falls back to a placeholder image if missing.
5. Creates image-based PDF (300 DPI) in a temporary output path, then stores durable output in object storage when configured (`FILE_STORAGE_PROVIDER=supabase`).
6. Marks the approved receipt as ready for in-app download.
7. Tracks generation state in `approved_receipt_dispatches`:
   - `receipt_generated_at`
   - `receipt_sent_at`
   - `receipt_file_path`
   - `receipt_sent`
8. Students download generated approved PDFs from:
   - `/api/payment-receipts/:id/file?variant=approved` (authorized owner/admin/lecturer)
9. Immediate trigger on approval:
   - reconciliation-approved transactions (including Paystack webhook/verify auto-approvals) auto-generate downloadable receipts
   - optional toggle: `RECEIPT_IMMEDIATE_ON_APPROVE=true|false`
   - response includes `approved_receipt_delivery` with readiness/failure summary

### Manual Command

```bash
npm run generate:approved-receipts
```

### One-Off With Limit

```bash
node scripts/generate-receipts.js --limit=50
```

### Scheduled Mode

```bash
node scripts/generate-receipts.js --schedule --interval-minutes=30
```

### Force Resend

```bash
node scripts/generate-receipts.js --force
```

### Template Files

- `templates/approved-student-receipt.html`
- `templates/approved-student-receipt.css`

### Sample Placeholder Map

```json
{
  "full_name": "Ada Lovelace",
  "application_id": "APP-0001",
  "program": "Computer Science",
  "amount_paid": "NGN 50,000.00",
  "receipt_no": "RCP-000001",
  "approval_date": "Feb 25, 2026",
  "passport_photo": "data:image/png;base64,..."
}
```

### Dependencies

- `nodemailer` (optional) if you use the standalone email sender workflow
- `puppeteer` for HTML-to-image rendering
- `pdf-lib` to package image into PDF
- Optional: set `RECEIPT_BROWSER_EXECUTABLE_PATH` if you want to use a system browser binary

If browser-based rendering is unavailable in production, the generator falls back to a minimal built-in PDF so receipts do not remain pending.

Install/update dependencies:

```bash
npm install
```

Runtime notes:

- Puppeteer downloads a Chromium binary during install; allow this in CI/build environments.
- If your host blocks bundled Chromium, set `RECEIPT_BROWSER_EXECUTABLE_PATH` to a system Chrome/Chromium path.

## Environment Variables

See `.env.example`, including:

- `DATABASE_URL`
- `NEXT_SESSION_COOKIE_NAME`
- `NEXT_CSRF_COOKIE_NAME`
- `NEXT_SESSION_TTL_HOURS`
- `FILE_STORAGE_PROVIDER` (`supabase` in production, `local` for local dev fallback)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET_AVATARS`
- `SUPABASE_STORAGE_BUCKET_STATEMENTS`
- `SUPABASE_STORAGE_BUCKET_HANDOUTS`
- `SUPABASE_STORAGE_BUCKET_SHARED`
- `SUPABASE_STORAGE_BUCKET_APPROVED_RECEIPTS`
- `SUPABASE_STORAGE_BUCKET_EXPORTS`
- `PAYMENT_REFERENCE_PREFIX`
- `PAYMENT_REFERENCE_TENANT_ID`
- `AUTO_RECONCILE_CONFIDENCE`
- `REVIEW_RECONCILE_CONFIDENCE`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_API_BASE_URL`
- `PAYSTACK_WEBHOOK_SECRET`
- `PAYOUT_ENCRYPTION_KEY`
- `PAYOUT_DEFAULT_SHARE_BPS`
- `PAYOUT_MINIMUM_AMOUNT`
- `PAYOUT_WORKER_INTERVAL_MS`
- `RECEIPT_*` values for approved receipt generation/download
- `EMAIL_PROVIDER`, `PASSWORD_RESET_EMAIL_FROM`, and either `SMTP_*` (SMTP mode) or `RESEND_API_KEY` (Resend API mode)
- `PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS`, `PASSWORD_RESET_SEND_RATE_LIMIT_MAX_ATTEMPTS`, `PASSWORD_RESET_RESET_RATE_LIMIT_MAX_ATTEMPTS`, `PASSWORD_RESET_RATE_LIMIT_BLOCK_SECONDS`

## Supabase Storage (Phase 4)

Durable file content now lives in object storage (Supabase Storage in production) with metadata in Postgres table `stored_files`.

Required buckets:

- `avatars`
- `statements`
- `handouts`
- `shared`
- `approved-receipts`
- `exports`

Runtime model:

- Uploads write file bytes to Supabase Storage.
- Database rows keep user-facing legacy URLs (`/users/...`, `/content-files/...`) for compatibility.
- `stored_files` maps each legacy URL to bucket/object path, ownership, and access scope.
- Downloads are served through protected app routes that resolve metadata and stream bytes from object storage.
- Approved receipt generation writes temp files only for render steps, uploads final PDFs to object storage, then serves from storage.

## Lecturer Payout Setup

- Configure `PAYOUT_ENCRYPTION_KEY` before enabling payouts. Bank account numbers are encrypted at rest with this key.
- Keep `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` set so transfer creation and transfer webhooks can both be verified.
- Use PostgreSQL for production data. `DATABASE_URL` must point to your live database before startup in production.
- `DATA_DIR` is now primarily runtime temp/fallback storage. Durable uploads/approved receipts are stored in Supabase Storage when `FILE_STORAGE_PROVIDER=supabase`.
- The current `render.yaml` includes a managed Postgres resource plus a persistent disk for the web service. If you deploy on Render, keep the disk mounted at `/var/data` and ensure `DATABASE_URL` comes from the Postgres resource.
- Store only masked bank details in API responses and UI; do not log raw account numbers or full recipient payloads.
- The payout worker can run automatically via `PAYOUT_WORKER_INTERVAL_MS`, but manual payout requests still require a linked and active Paystack recipient.
- Keep transfer review and retry permissions restricted to admins.

## PostgreSQL Production Setup

For production, replace the SQLite file database with PostgreSQL:

1. Provision a PostgreSQL database.
2. Set `DATABASE_URL` in production.
3. Keep `SESSION_SECRET` and all Paystack/payout secrets set.
4. Run the app once so `initDatabase()` creates the schema in Postgres.
5. Import any existing SQLite data before opening the site to users.
6. `DATA_DIR` can remain ephemeral in production when `FILE_STORAGE_PROVIDER=supabase`; only temporary render/fallback files use local disk.

The app will still run locally with SQLite if `DATABASE_URL` is not set, which keeps development and tests simple.
If Postgres starts with an empty `auth_roster`, the app will bootstrap each missing roster once from `STUDENT_ROSTER_PATH` / `LECTURER_ROSTER_PATH` and then keep the database as the durable source of truth on later restarts.

### Existing SQLite Data Cutover

If you already have live data in `paytec.sqlite`, use a maintenance window and:

1. Back up the SQLite file first.
2. Point a staging copy of the app at a fresh Postgres database.
3. Let `initDatabase()` create the Postgres schema.
4. Copy your tables across with a one-off import job or export/import tool.
5. Verify row counts for:
   - `users`
   - `auth_roster`
   - `roster_import_state`
   - `payment_items`
   - `payment_obligations`
   - `payment_transactions`
   - `payment_receipts`
   - `lecturer_payout_accounts`
   - `lecturer_payout_ledger`
   - `lecturer_payout_transfers`
6. Switch production traffic to the new `DATABASE_URL` only after the imports and reconciliation checks pass.

### Migration Script

You can use the built-in importer to move rows from SQLite to Postgres:

```bash
npm run migrate:sqlite-to-postgres -- --sqlite=./data/paytec.sqlite --database-url=postgres://user:pass@host:5432/paytec
```

Helpful flags:

- `--dry-run` prints the plan without copying rows.
- `--replace` clears the target tables before import.
- `--include-sessions` copies a source `sessions` table if you are using one in a custom SQLite setup.

The importer expects the Postgres schema to exist first, so run the app once with `DATABASE_URL` set or use the normal startup path before importing data.
For CSV-only roster cutovers, you can also start the app once against an empty database with `STUDENT_ROSTER_PATH` / `LECTURER_ROSTER_PATH` set; startup will import each missing roster a single time and record the bootstrap in `roster_import_state`.

## Running Tests

```bash
npm test
```

## Backward Compatibility Notes

- Legacy receipt endpoints are retained in schema for compatibility but deprecated at runtime (`410 Gone`).
- Existing receipt history is preserved and migrated into normalized transaction records.
- Legacy `/teacher` and `/api/teacher/*` routes still work as aliases for `/lecturer` and `/api/lecturer/*`.
