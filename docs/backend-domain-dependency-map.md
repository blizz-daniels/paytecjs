# Backend Domain Dependency Map

This maps what still remains trapped in [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js) after the Phase 1 extraction pass.

## Extracted and now routed through `lib/server/*`

- `auth`
  - Password recovery/send OTP and reset route orchestration now delegates through `lib/server/auth`.
  - `/api/me`, `/api/profile/email`, `/api/profile/password`, and checklist payload/toggle flows now delegate through `lib/server/auth`.
  - Current route entrypoints: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:7852), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:7908)

- `messages`
  - Express wiring now uses `messageService` instead of raw app-local helpers.
  - Registration point: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:8080)

- `notifications`
  - Express wiring now uses `notificationService`.
  - Registration point: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:8087)

- `handouts`
  - Express wiring now uses `handoutService`.
  - Registration point: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:8096)

- `admin`
  - Admin import wiring now uses `createAdminImportService`.
  - Registration point: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:10329)

- `payments`
  - Payment item list/create/update/delete route orchestration now delegates through `lib/server/payments`.
  - Route entrypoints: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:8202)

- `payouts`
  - Payout summary/account/history/request/admin review-retry route orchestration now delegates through `lib/server/payouts`.
  - Route entrypoints: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:9039)

- `receipts`
  - Student approved-receipt list, student ledger payload, and approved receipt file resolution now delegate through `lib/server/receipts`.
  - Route entrypoints: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:9464), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:9818)

- `storage`
  - Department lookup/scoping/content ownership helpers now delegate through `lib/server/storage`.

## Still Trapped In `src/app.js`

- Auth/session bootstrap
  - Login, CSRF/session middleware, logout, and profile avatar/display-name handling remain in app wiring.
  - Relevant entrypoints: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:7644), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:7922), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:7966), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:8021)

- Payment/reconciliation engine
  - Obligation generation, statement parsing, reconciliation scoring, Paystack verification/webhook ingestion, and reference-request workflows are still app-local.
  - Key anchors: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:4463), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:4536), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:4735), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:4765), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:6609)

- Receipt review workflow
  - Manual receipt review state transitions and statement-based verification helpers still live in `src/app.js`, even though several manual endpoints are currently deprecated/Paystack-only.
  - Key anchors: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:9583), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:9676)

- Payout execution internals
  - Account encryption/decryption, payout batching, provider dispatch, queue processing, and provider webhook reconciliation are still app-local.
  - Key anchors: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:5474), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:5803), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:6071), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:6411)

- Legacy duplicate handlers
  - Old notification and reaction handlers still exist later in `src/app.js` and are now effectively shadowed by the extracted route registrations.
  - Key anchors: [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:9856), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:10006), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:10066), [src/app.js](/c:/Users/da4li/Desktop/paytecjs-migration/src/app.js:10152)

## Recommended Next Extraction Order

- Move Paystack/reconciliation ingestion into `lib/server/payments`.
- Move payout queue + provider dispatch into `lib/server/payouts`.
- Delete the shadowed legacy notification/handout route bodies from `src/app.js`.
- Split login/session/profile upload concerns into a thin auth controller layer plus a smaller auth service boundary.
