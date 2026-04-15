# Phase 8: Vercel-Safe Webhooks, Receipts, and Background Work

## New Job Flow

### Entry points
- `POST /api/payments/webhook/paystack` (Next.js Node runtime)
  - Verifies Paystack HMAC signature using the raw request body.
  - Stores a durable `paystack_webhook_event` job in `background_jobs`.
  - Uses an idempotency key per event/body identity to prevent duplicate enqueue.
- `GET|POST /api/internal/jobs/run` (Next.js Node runtime, cron-safe)
  - Authenticated with `Authorization: Bearer <JOB_RUNNER_SECRET>` or `x-job-runner-secret`.
  - Schedules maintenance jobs:
    - `approved_receipt_dispatch` for unsent approved receipts.
    - `lecturer_payout_queue` when queued payout transfers exist.
  - Leases and processes due jobs with retries/backoff and attempt records.

### Durable tables
- `background_jobs`
  - Lease state, retry state, idempotency key, payload, result/error snapshots.
- `background_job_attempts`
  - Per-attempt observability (start/end, status, error/result).

### Job types
- `paystack_webhook_event`
  - Replays the exact raw payload to legacy `/api/payments/webhook/paystack` with computed signature.
- `approved_receipt_dispatch`
  - Generates one approved receipt using existing generator with retry safety.
- `lecturer_payout_queue`
  - Triggers explicit payout queue processing endpoint.
- `paystack_reference_verify`
  - Optional targeted verify job by Paystack reference.

### Internal trigger endpoints (legacy app)
- `POST /api/internal/ops/payout-queue/run`
- `POST /api/internal/ops/receipt-dispatch/:id/run`
- Protected by shared secret (`JOB_RUNNER_SECRET` / webhook secret fallback).
- CSRF bypass is limited to trusted `/api/internal/ops/*` requests.

## Webhook Verification Details

- Verification occurs **before enqueue** in Next route:
  - Header: `x-paystack-signature`
  - Algo: `HMAC-SHA512(rawBody, PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET_KEY)`
  - Comparison: timing-safe equality.
- Raw body is stored in the job payload and replayed unchanged for downstream processing.
- Result: signature correctness is preserved and webhook ingestion is decoupled from immediate processing.

## Receipt Generation Strategy

- Processing model:
  - Queue one `approved_receipt_dispatch` per `payment_receipt_id`.
  - Use `generateApprovedStudentReceipts({ paymentReceiptId, limit: 1, deliveryMode: "download" })`.
  - Retries are job-managed with exponential backoff.
- Runtime note:
  - Current renderer can use Puppeteer, screenshot/pdf-lib fallback, and pure PDF-lib fallback.
  - On Vercel Hobby, full Chromium reliability can vary by size/time limits.
- Recommended production posture:
  - Keep fallback renderers enabled.
  - Write approved receipt artifacts to object storage for durability (not ephemeral local FS).
  - If Puppeteer pressure is high, prefer fallback renderer path or move heavy rendering to a dedicated worker runtime.

## Unresolved Serverless Risks

- Legacy coupling:
  - `paystack_webhook_event` and `lecturer_payout_queue` currently call legacy processing endpoints.
  - Full elimination requires porting those domain flows into Next-native services/Route Handlers.
- Long-running payout batches:
  - Large queue runs can approach serverless execution limits; may require chunking and continuation jobs.
- Local filesystem artifacts:
  - Receipt temp output is generated on runtime disk before persistence; ensure storage promotion is always successful.
- Cron cadence vs backlog:
  - If backlog grows beyond one run window, increase cron frequency and per-run lease limits or shard job types.
- Idempotency scope:
  - Current job idempotency is event/job-key based; confirm downstream DB writes keep strong unique constraints for full end-to-end exactly-once behavior.
