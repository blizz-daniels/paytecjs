# Next.js + Supabase Migration Map

## Current Monolith Domains In `src/app.js`

- Runtime bootstrap
  - environment parsing, local directory creation, upload config, session store selection, Express middleware, timers, and server startup.
- Auth and user identity
  - login, logout, CSRF, role guards, roster-backed credentials, password overrides, OTP password recovery, profile reads/writes.
- Roster and department scope
  - CSV bootstrap/import, department-group expansion, checklist import, department-scoped content access.
- Content and communication
  - notifications, SSE content stream, handouts, shared files, reactions, messages, admin imports.
- Payments and reconciliation
  - payment items, student obligations, transaction ingestion, Paystack initialize/callback/verify/webhook, reference requests, reconciliation queues and actions.
- Approved receipts
  - receipt generation triggers, dispatch tracking, approved PDF lookup and download, legacy fallback handling.
- Lecturer payouts
  - payout account storage, ledger creation, queued transfers, Paystack transfer settlement, admin retry/review APIs.
- Analytics and admin reporting
  - admin dashboard stats/audit logs and lecturer/admin analytics payloads.

## Filesystem Reads And Writes

- Durable local writes used today
  - `data/paytec.sqlite` or `/tmp/paytec/paytec.sqlite`
  - session file store fallback: `data/sessions.sqlite`
  - uploaded avatars: `data/users/*`
  - uploaded receipts/statements: `data/receipts/*`, `data/statements/*`
  - uploaded lecturer content: `data/content-files/handouts/*`, `data/content-files/shared/*`
  - generated approved PDFs: `outputs/receipts/*`
- Local reads used today
  - root HTML entry points: `*.html`
  - frontend assets: `assets/*`
  - bootstrap CSVs: `data/students.csv`, `data/teachers.csv`, `data/department-groups.csv`
  - receipt templates: `templates/*`
  - generated receipt files and uploaded content served back through `/users/*`, `/content-files/*`, `/api/payment-receipts/:id/file`
- Migration implication
  - no production feature can keep depending on repo-local disk or `/tmp`; these files need object storage or database-backed state on Vercel.

## Auth And Session Flow

- Sessions
  - `express-session` is active everywhere.
  - production switches to `connect-pg-simple` when `DATABASE_URL` exists.
  - local fallback uses `connect-sqlite3`.
- Login
  - admins authenticate from `users`.
  - lecturers/students authenticate from `auth_roster`.
  - roster users either use the stored surname-derived password hash or `user_password_overrides`.
- CSRF
  - `/api/csrf-token` seeds a session token.
  - `requireCsrf` protects all non-safe methods after the token route.
- Password recovery
  - student-only OTP reset, backed by `user_profiles.email`, `password_reset_otps`, audit logs, and SMTP/Resend delivery.
- Recommended migration stance
  - keep the current custom auth/session flow first and move storage to Postgres.
  - treat Supabase Auth as Phase 3+, because usernames, roster bootstrap, one-time strong-password rules, and role redirects are business-specific.

## SQLite And Postgres Coupling

- `services/database-client.js` is a compatibility layer, not a clean domain boundary.
  - SQLite is still the default when `DATABASE_URL` is absent.
  - Postgres support rewrites SQLite-flavored SQL, `?` placeholders, `AUTOINCREMENT`, and table introspection.
- `src/app.js` still owns schema creation and migration-style DDL in `initDatabase()`.
- Tests already exercise both sqlite and postgres modes.
- Migration implication
  - phase into Postgres-first modules with explicit SQL and keep SQLite only for optional local development/test harnesses.
  - move schema ownership fully to SQL migrations plus Supabase migration workflow.

## Current HTML Entry Points

- Public/auth pages
  - `/login`
  - `/forgot-password`
  - `/admin`
  - `/admin/import`
- Protected static HTML pages
  - `/`, `/index.html`
  - `/notifications.html`
  - `/handouts.html`
  - `/payments`, `/payments.html`
  - `/messages`, `/messages.html`
  - `/profile`, `/profile.html`
  - `/analytics`
  - `/lecturer`, `/teacher`, `/lecturer.html`, `/teacher.html`

## Current API Surface By Domain

- Auth/profile/session
  - `/api/csrf-token`, `/login`, `/logout`, `/health`, `/api/me`
  - `/api/auth/password-recovery/send-otp`
  - `/api/auth/password-recovery/reset`
  - `/api/profile*`
  - `/api/content-stream`
- Messaging and content
  - `/api/messages/*`
  - `/api/notifications*`
  - `/api/handouts*`
  - `/api/shared-files*`
  - `/api/admin/import/*`
- Payments and reconciliation
  - `/api/payment-items*`
  - `/api/payments/paystack/initialize`
  - `/api/payments/paystack/callback`
  - `/api/payments/paystack/verify`
  - `/api/payments/webhook/paystack`
  - `/api/payments/paystack/reference-requests*`
  - `/api/my/payment-ledger`
  - `/api/my/payment-receipts`
  - `/api/payment-receipts/:id/file`
  - `/api/reconciliation/*`
- Payouts and analytics
  - `/api/lecturer/payout-*`, `/api/teacher/payout-*`
  - `/api/admin/lecturer/payout-transfers*`
  - `/api/analytics/*`
  - `/api/admin/stats`
  - `/api/admin/audit-logs`
- Paystack-only deprecated compatibility routes returning `410`
  - manual receipt submission/review endpoints
  - generic webhook endpoint
  - statement upload endpoints

## Webhooks, Queues, And Background Work

- Webhook
  - `POST /api/payments/webhook/paystack`
- In-memory async jobs
  - background Paystack verification after callback/reference-request workflows
  - approved receipt dispatch queue
  - lecturer payout dispatch queue
- Timers
  - payout worker `setInterval`
  - in-memory rate-limit pruning
  - optional memory logging
  - SSE keepalive timers
- Migration implication
  - Vercel serverless cannot rely on process memory for durable queues or long-lived timers.
  - move job state into Postgres tables and trigger work via Route Handlers + Vercel Cron or explicit enqueue tables/functions.

## Supabase Target Mapping

- Supabase Postgres
  - all runtime tables in `users`, `auth_roster`, `user_profiles`, password reset, audit, notifications, messages, handouts/shared metadata, payment/reconciliation, payout, approved receipt dispatch, checklist, roster import, and session-related storage.
- Supabase Storage
  - avatars
  - handouts and shared files
  - approved receipt PDFs
  - any future uploaded receipt/statement artifacts if those flows return
- Optional Supabase Auth
  - candidate future home for admin/lecturer/student credentials and password recovery.
  - should only happen after preserving username-based login semantics, role claims, and redirect/business rules in app-owned domain tables.

## Recommended Incremental Sequence

1. Extract reusable server/domain modules from `src/app.js`.
2. Move file metadata to Postgres-backed domain services while switching binary assets to Supabase Storage.
3. Introduce Next.js App Router pages that consume the extracted domain modules.
4. Replace Express endpoints domain-by-domain with `app/api/.../route.ts`.
5. Replace in-memory workers with Postgres-backed jobs plus Vercel Cron/webhook-safe execution.
6. Evaluate Supabase Auth only after the custom roster/login model is fully represented.
