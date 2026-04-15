import {
  enqueueBackgroundJob,
  ensureBackgroundJobSchema,
  finishBackgroundJobAttempt,
  leaseDueBackgroundJobs,
  markBackgroundJobFailed,
  markBackgroundJobSucceeded,
  parseJobPayload,
  startBackgroundJobAttempt,
} from "@/lib/server/jobs/queue";
import { enqueueMaintenanceJobs, runBackgroundJobHandler } from "@/lib/server/jobs/handlers";

type DbLike = {
  run: (sql: string, params?: any[]) => Promise<any>;
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
};

function toErrorMessage(err: unknown) {
  if (!err) {
    return "Unknown background job failure.";
  }
  if (err instanceof Error) {
    return err.message || "Background job failed.";
  }
  return String(err);
}

function computeRetryDelayMs(attempt: number) {
  const clamped = Math.max(1, Math.min(8, attempt));
  const baseMs = 15_000;
  return baseMs * 2 ** (clamped - 1);
}

export async function scheduleMaintenanceBackgroundJobs(db: DbLike) {
  await ensureBackgroundJobSchema(db);
  const maintenance = await enqueueMaintenanceJobs(db);
  const enqueued = {
    receipts: 0,
    payoutQueue: false,
  };
  for (const receiptId of maintenance.pendingReceipts) {
    const result = await enqueueBackgroundJob(db, {
      jobType: "approved_receipt_dispatch",
      idempotencyKey: `approved_receipt_dispatch:${receiptId}`,
      payload: { paymentReceiptId: receiptId },
      priority: 150,
      maxAttempts: 8,
    });
    if (!result.existed) {
      enqueued.receipts += 1;
    }
  }

  if (maintenance.queuedTransferCount > 0) {
    const minuteBucket = new Date().toISOString().slice(0, 16);
    const payoutResult = await enqueueBackgroundJob(db, {
      jobType: "lecturer_payout_queue",
      idempotencyKey: `lecturer_payout_queue:${minuteBucket}`,
      payload: { queuedTransferCount: maintenance.queuedTransferCount },
      priority: 120,
      maxAttempts: 10,
    });
    enqueued.payoutQueue = !payoutResult.existed;
  }

  return {
    maintenance,
    enqueued,
  };
}

export async function runDueBackgroundJobs(
  db: DbLike,
  input: {
    workerId: string;
    limit?: number;
    leaseSeconds?: number;
    jobType?: string;
    jobRunnerSecret?: string;
  }
) {
  await ensureBackgroundJobSchema(db);
  const leased = await leaseDueBackgroundJobs(db, {
    workerId: input.workerId,
    limit: input.limit,
    leaseSeconds: input.leaseSeconds,
    jobType: input.jobType,
  });

  const summary = {
    workerId: input.workerId,
    leased: leased.length,
    succeeded: 0,
    retryable: 0,
    failed: 0,
    jobs: [] as Array<{ id: number; type: string; status: string; error?: string }>,
  };

  for (const job of leased) {
    const nextAttempt = Number(job.attempt_count || 0) + 1;
    await startBackgroundJobAttempt(db, {
      jobId: job.id,
      workerId: input.workerId,
      attemptNumber: nextAttempt,
    });
    try {
      const payload = parseJobPayload(job);
      const result = await runBackgroundJobHandler(
        {
          jobType: job.job_type,
          payload,
        },
        {
          db,
          jobRunnerSecret: String(input.jobRunnerSecret || "").trim(),
        }
      );
      await markBackgroundJobSucceeded(db, {
        jobId: job.id,
        result,
      });
      await finishBackgroundJobAttempt(db, {
        jobId: job.id,
        attemptNumber: nextAttempt,
        status: "succeeded",
        result,
      });
      summary.succeeded += 1;
      summary.jobs.push({ id: job.id, type: job.job_type, status: "succeeded" });
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      const retryAt = new Date(Date.now() + computeRetryDelayMs(nextAttempt));
      await markBackgroundJobFailed(db, {
        jobId: job.id,
        attemptCount: nextAttempt,
        maxAttempts: Number(job.max_attempts || 8),
        errorMessage,
        retryAt,
      });
      const failedPermanently = nextAttempt >= Number(job.max_attempts || 8);
      await finishBackgroundJobAttempt(db, {
        jobId: job.id,
        attemptNumber: nextAttempt,
        status: failedPermanently ? "failed" : "retryable",
        errorMessage,
      });
      if (failedPermanently) {
        summary.failed += 1;
        summary.jobs.push({ id: job.id, type: job.job_type, status: "failed", error: errorMessage });
      } else {
        summary.retryable += 1;
        summary.jobs.push({ id: job.id, type: job.job_type, status: "retryable", error: errorMessage });
      }
    }
  }

  return summary;
}
