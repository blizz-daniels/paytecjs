# Phase 9: Vercel Hobby + Supabase Production Cutover

This runbook prepares cutover of this repo to Vercel Hobby with Supabase Postgres and Supabase Storage.

## Current Readiness Summary

- Ready:
  - Next.js App Router shell pages for all requested UI families exist.
  - Native Next Route Handlers exist for auth/session, messages, notifications, handouts, shared files, Paystack webhook, and background job runner.
  - Durable DB-backed job queue exists (`background_jobs`) with idempotency support.
  - Unsafe Next.js mutations (including legacy catch-all proxy requests) are CSRF-validated via `/api/csrf-token` + `X-CSRF-Token`/`_csrf`.
  - Production DB and storage runtime policy already enforces Supabase.
- Not fully cut over yet:
  - Many business APIs still route through `app/api/[...legacy]/route.ts` to `LEGACY_APP_URL`.
  - Job handlers for payout queue and Paystack verify still call legacy internal endpoints.
  - Some flows still depend on legacy Express implementation in `src/app.js`.

## Deployment Checklist (Vercel Hobby)

1. Confirm project uses Next.js build/start:
   - Build command: `npm run build:next` (or default `next build`)
   - Output: Next.js
2. Set all required environment variables (see list below) in Vercel `Production` environment.
3. Set `NODE_ENV=production`.
4. Set `DATABASE_URL` to Supabase Postgres direct connection string.
5. Set `FILE_STORAGE_PROVIDER=supabase`.
6. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
7. Set `CRON_SECRET` and `JOB_RUNNER_SECRET`.
8. Set Paystack secrets and callback URL for Vercel domain.
9. Run migrations against Supabase Postgres, including:
   - `migrations/20260415_background_jobs.up.sql`
10. Deploy and run smoke tests (see checklist below).

## Required Environment Variables (Production)

Core runtime:
- `NODE_ENV=production`
- `SESSION_SECRET`
- `DATABASE_URL`
- `ENFORCE_SUPABASE_IN_PRODUCTION=true`

File storage:
- `FILE_STORAGE_PROVIDER=supabase`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET_AVATARS`
- `SUPABASE_STORAGE_BUCKET_STATEMENTS`
- `SUPABASE_STORAGE_BUCKET_HANDOUTS`
- `SUPABASE_STORAGE_BUCKET_SHARED`
- `SUPABASE_STORAGE_BUCKET_APPROVED_RECEIPTS`
- `SUPABASE_STORAGE_BUCKET_EXPORTS`

Payments and webhooks:
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- `PAYSTACK_API_BASE_URL`
- `PAYSTACK_CALLBACK_URL` (must use deployed Vercel URL)
- `PAYMENT_REFERENCE_PREFIX`
- `PAYMENT_REFERENCE_TENANT_ID`

Background jobs:
- `JOB_RUNNER_SECRET`
- `CRON_SECRET`
- `ENABLE_INTERVAL_WORKERS=false`

Payout and receipts:
- `PAYOUT_ENCRYPTION_KEY`
- `PAYOUT_DEFAULT_SHARE_BPS`
- `PAYOUT_MINIMUM_AMOUNT`
- `RECEIPT_TEMPLATE_HTML`
- `RECEIPT_TEMPLATE_CSS`

Email/password recovery:
- `EMAIL_PROVIDER`
- `PASSWORD_RESET_EMAIL_FROM`
- SMTP mode: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Resend mode: `RESEND_API_KEY`

## Supabase Setup Checklist

Database project:
1. Create Supabase project in desired region.
2. Enable connection pooling/direct connection for app workload.
3. Set `DATABASE_URL` to the pooled or direct URL compatible with `pg`.
4. Run SQL migrations in order.
5. Validate key tables exist (`users`, `auth_roster`, `payment_*`, `lecturer_payout_*`, `stored_files`, `next_auth_sessions`, `background_jobs`).

Storage buckets:
1. Create buckets:
   - `avatars`
   - `statements`
   - `handouts`
   - `shared`
   - `approved-receipts`
   - `exports`
2. Keep buckets private by default.
3. Verify service-role uploads/downloads from app APIs.

Policies/access assumptions:
1. App server uses service-role key for storage operations.
2. End users do not access Supabase storage directly.
3. Access control is enforced in app routes (session + role checks), not by public bucket access.

## Data Migration Steps

1. Freeze writes on old deployment.
2. Back up SQLite database and local durable folders:
   - `data/`
   - `outputs/receipts/`
   - any local `users/` and `content-files/` artifacts
3. Provision Supabase Postgres and run migrations.
4. Run importer:
   - `npm run migrate:sqlite-to-postgres -- --sqlite=./data/paytec.sqlite --database-url=<SUPABASE_DATABASE_URL>`
5. Validate row counts and key business aggregates.
6. Migrate legacy local files into Supabase buckets and create/verify `stored_files` mappings.
7. Set production env vars in Vercel.
8. Deploy.
9. Point Paystack callback/webhook to deployed Vercel URLs.
10. Execute smoke tests.

## Paystack URL Verification (Vercel Domain)

Callback URL:
- Must be set in env as:
  - `PAYSTACK_CALLBACK_URL=https://<your-project>.vercel.app/api/payments/paystack/callback`

Webhook URL:
- Configure in Paystack dashboard:
  - `https://<your-project>.vercel.app/api/payments/webhook/paystack`
- Webhook signature validation requires exact raw request body and `x-paystack-signature`.

## Smoke-Test Checklist

Auth login/session:
1. Login with student account.
2. Confirm session persistence after reload.
3. Logout and confirm protected pages redirect.

Payment initialization:
1. As student, start payment for a due item.
2. Confirm Paystack init payload includes callback URL on Vercel domain.

Webhook confirmation:
1. Send signed test webhook from Paystack.
2. Confirm `background_jobs` enqueue + successful processing.
3. Confirm payment status updates in UI.

Receipt download:
1. Approve a transaction.
2. Confirm receipt generation job succeeds.
3. Download from `/api/payment-receipts/:id/file?variant=approved`.

Lecturer flows:
1. Lecturer login.
2. Create payment item.
3. Verify reconciliation summary loads.
4. Submit payout request and verify status transition.

Admin import flows:
1. Upload student CSV preview/import.
2. Upload lecturer CSV preview/import.
3. Upload checklist CSV preview/import.
4. Confirm resulting DB row updates.

## Likely Vercel Hobby Limit Risks

1. Cron limit:
   - Hobby supports very limited cron jobs; keep a minimal schedule.
   - Current repo uses one cron (`/api/internal/jobs/run`) once daily to stay Hobby-compatible.
2. Function duration:
   - Receipt generation with Puppeteer can be slow and may hit duration limits.
3. Function size:
   - Puppeteer/Chromium packaging can approach function size limits.
4. Upload size:
   - Large multipart uploads (20 MB handouts, 50 MB shared files) may exceed serverless request size constraints.
5. Compute quotas:
   - High-volume webhook bursts + background retries can consume Hobby included usage quickly.

## Workflows Still Assuming Long-Running Server

1. Legacy Express timers remain in `src/app.js` (`setInterval` workers/maintenance).
2. `lib/server/jobs/handlers.ts` still calls legacy internal endpoints via `LEGACY_APP_URL` for:
   - payout queue trigger
   - Paystack reference verify
   - webhook replay target
3. Legacy SSE/content stream behavior is still implemented in Express.

## Final Legacy Files/Routes: Removal Status

Can remove only after all API parity is complete:
- `app/api/[...legacy]/route.ts`
- `lib/server/next/legacy-proxy.ts`
- `src/app.js`, `server.js`, and remaining `src/routes/*` legacy API handlers
- static HTML entry files:
  - `index.html`
  - `notifications.html`
  - `handouts.html`
  - `payments.html`
  - `messages.html`
  - `profile.html`
  - `analytics.html`
  - `lecturer.html`
  - `admin.html`
  - `admin-import.html`
  - `login.html`
  - `forgot-password.html`

Must keep for now:
- `assets/*.js` scripts still powering most migrated Next pages.
- legacy API stack used by unresolved endpoints through catch-all proxy.
