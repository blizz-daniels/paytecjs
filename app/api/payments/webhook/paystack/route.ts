import crypto from "crypto";
import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { enqueueBackgroundJob, ensureBackgroundJobSchema } from "@/lib/server/jobs/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSameToken(expected: string, provided: string) {
  const left = Buffer.from(String(expected || ""), "utf8");
  const right = Buffer.from(String(provided || ""), "utf8");
  if (!left.length || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function verifyPaystackSignature(rawBody: string, signature: string) {
  const secret = String(process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (!secret) {
    throw new Error("Paystack webhook secret is not configured.");
  }
  const digest = crypto.createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  if (!signature || !isSameToken(digest, signature)) {
    throw new Error("Invalid Paystack webhook signature.");
  }
}

function buildIdempotencyKey(eventType: string, payload: any, rawBody: string) {
  const data = payload && typeof payload === "object" ? payload.data || payload : {};
  const candidate = String(
    data?.id ||
      data?.reference ||
      data?.transfer_code ||
      data?.event_id ||
      crypto.createHash("sha256").update(rawBody, "utf8").digest("hex").slice(0, 24)
  ).trim();
  return `paystack_webhook:${eventType}:${candidate}`;
}

export async function POST(request: Request) {
  const legacyBridgeUrl = String(process.env.LEGACY_APP_URL || "").trim();
  if (!legacyBridgeUrl) {
    return NextResponse.json(
      {
        error:
          "LEGACY_APP_URL is required to process Paystack webhooks in the current migration phase. Configure it before enabling this endpoint.",
        code: "paystack_webhook_legacy_bridge_missing",
      },
      { status: 503 }
    );
  }
  const rawBody = await request.text();
  const signature = String(request.headers.get("x-paystack-signature") || "").trim().toLowerCase();
  try {
    verifyPaystackSignature(rawBody, signature);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: String(err?.message || "Invalid Paystack webhook signature."),
        code: "paystack_webhook_invalid_signature",
      },
      { status: 401 }
    );
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch (_err) {
    return NextResponse.json(
      {
        error: "Webhook payload must be valid JSON.",
        code: "paystack_webhook_invalid_payload",
      },
      { status: 400 }
    );
  }

  const eventType = String(parsed?.event || "unknown").trim().toLowerCase() || "unknown";
  const ctx = await getApiContext();
  try {
    await ensureBackgroundJobSchema({
      run: ctx.run,
      get: ctx.get,
      all: ctx.all,
    });
    const enqueued = await enqueueBackgroundJob(
      {
        run: ctx.run,
        get: ctx.get,
        all: ctx.all,
      },
      {
        jobType: "paystack_webhook_event",
        idempotencyKey: buildIdempotencyKey(eventType, parsed, rawBody),
        payload: {
          eventType,
          rawBody,
          receivedAt: new Date().toISOString(),
        },
        priority: 200,
        maxAttempts: 10,
      }
    );
    return NextResponse.json({
      ok: true,
      queued: true,
      existed: enqueued.existed,
      jobId: Number(enqueued.job?.id || 0),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: String(err?.message || "Could not enqueue Paystack webhook job."),
        code: "paystack_webhook_enqueue_failed",
      },
      { status: 500 }
    );
  }
}
