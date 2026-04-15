import crypto from "crypto";
import fs from "fs";
import path from "path";

import { generateApprovedStudentReceipts } from "@/services/approved-receipt-generator";

type DbLike = {
  run: (sql: string, params?: any[]) => Promise<any>;
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
};

type JobHandlerContext = {
  db: DbLike;
  jobRunnerSecret: string;
};

function getLegacyBaseUrl() {
  return String(process.env.LEGACY_APP_URL || "http://127.0.0.1:3001").trim().replace(/\/$/, "");
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function runPaystackWebhookReplayJob(payload: any) {
  const rawBody = String(payload?.rawBody || "").trim();
  if (!rawBody) {
    throw new Error("Missing paystack webhook raw body.");
  }
  const paystackWebhookSecret = String(process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (!paystackWebhookSecret) {
    throw new Error("PAYSTACK_WEBHOOK_SECRET (or PAYSTACK_SECRET_KEY) is not configured.");
  }
  const signature = crypto.createHmac("sha512", paystackWebhookSecret).update(rawBody, "utf8").digest("hex");
  const response = await fetchWithTimeout(`${getLegacyBaseUrl()}/api/payments/webhook/paystack`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": signature,
    },
    body: rawBody,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Legacy webhook replay failed with status ${response.status}: ${String(text || "").slice(0, 300)}`);
  }
  return { replayed: true };
}

async function runApprovedReceiptDispatchJob(db: DbLike, payload: any) {
  const paymentReceiptId = Number.parseInt(String(payload?.paymentReceiptId || ""), 10);
  if (!Number.isFinite(paymentReceiptId) || paymentReceiptId <= 0) {
    throw new Error("Missing valid paymentReceiptId for receipt dispatch job.");
  }
  const outputDir = path.resolve(process.env.RECEIPT_OUTPUT_DIR || path.join(process.cwd(), "tmp", "receipts"));
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = await generateApprovedStudentReceipts({
    db,
    deliveryMode: "download",
    outputDir,
    paymentReceiptId,
    limit: 1,
    logger: console,
  });
  if (Number(summary?.failed || 0) > 0) {
    throw new Error("Approved receipt dispatch failed.");
  }
  return {
    paymentReceiptId,
    eligible: Number(summary?.eligible || 0),
    sent: Number(summary?.sent || 0),
    failed: Number(summary?.failed || 0),
  };
}

async function runLecturerPayoutQueueJob(secret: string) {
  if (!secret) {
    throw new Error("JOB_RUNNER_SECRET is required for payout queue trigger.");
  }
  const response = await fetchWithTimeout(`${getLegacyBaseUrl()}/api/internal/ops/payout-queue/run`, {
    method: "POST",
    headers: {
      "x-job-runner-secret": secret,
      "content-type": "application/json",
    },
    body: JSON.stringify({ triggerSource: "cron_job" }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Payout queue trigger failed (${response.status}): ${String(text || "").slice(0, 300)}`);
  }
  const payload = await response.json().catch(() => ({}));
  return payload && typeof payload === "object" ? payload : {};
}

async function runPaystackReferenceVerifyJob(payload: any, secret: string) {
  const reference = String(payload?.reference || "").trim();
  if (!reference) {
    throw new Error("Missing Paystack reference for verify job.");
  }
  if (!secret) {
    throw new Error("JOB_RUNNER_SECRET is required for paystack verify jobs.");
  }
  const response = await fetchWithTimeout(`${getLegacyBaseUrl()}/api/payments/paystack/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paytec-webhook-secret": secret,
    },
    body: JSON.stringify({
      reference,
      triggerSource: "background_job",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Paystack verify job failed (${response.status}): ${String((data as any)?.error || "").slice(0, 300)}`);
  }
  return data;
}

export async function runBackgroundJobHandler(
  input: {
    jobType: string;
    payload: any;
  },
  context: JobHandlerContext
) {
  const jobType = String(input.jobType || "").trim().toLowerCase();
  if (jobType === "paystack_webhook_event") {
    return runPaystackWebhookReplayJob(input.payload);
  }
  if (jobType === "approved_receipt_dispatch") {
    return runApprovedReceiptDispatchJob(context.db, input.payload);
  }
  if (jobType === "lecturer_payout_queue") {
    return runLecturerPayoutQueueJob(context.jobRunnerSecret);
  }
  if (jobType === "paystack_reference_verify") {
    return runPaystackReferenceVerifyJob(input.payload, context.jobRunnerSecret);
  }
  throw new Error(`Unsupported background job type: ${jobType}`);
}

export async function enqueueMaintenanceJobs(db: DbLike) {
  const pendingReceipts = await db
    .all(
      `
        SELECT ard.payment_receipt_id
        FROM approved_receipt_dispatches ard
        JOIN payment_receipts pr ON pr.id = ard.payment_receipt_id
        WHERE pr.status = 'approved'
          AND COALESCE(ard.receipt_sent, 0) = 0
          AND COALESCE(ard.attempt_count, 0) < 10
        ORDER BY ard.updated_at ASC, ard.payment_receipt_id ASC
        LIMIT 40
      `
    )
    .catch(() => []);
  const queuedTransfers = await db
    .get(
      `
        SELECT COUNT(*) AS total
        FROM lecturer_payout_transfers
        WHERE status = 'queued'
      `
    )
    .catch(() => ({ total: 0 }));

  return {
    pendingReceipts: Array.isArray(pendingReceipts)
      ? pendingReceipts
          .map((row) => Number(row?.payment_receipt_id || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [],
    queuedTransferCount: Number(queuedTransfers?.total || 0),
  };
}
