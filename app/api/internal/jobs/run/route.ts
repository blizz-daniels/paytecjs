import crypto from "crypto";
import { NextResponse } from "next/server";

import { runDueBackgroundJobs, scheduleMaintenanceBackgroundJobs } from "@/lib/server/jobs/processor";
import { getApiContext } from "@/lib/server/next/api-context";

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

function readProvidedSecret(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return String(request.headers.get("x-job-runner-secret") || request.headers.get("x-paytec-webhook-secret") || "").trim();
}

function isAuthorizedRunnerRequest(request: Request) {
  const expected = String(process.env.JOB_RUNNER_SECRET || process.env.CRON_SECRET || process.env.GATEWAY_WEBHOOK_SECRET || "").trim();
  const provided = readProvidedSecret(request);
  if (!expected || !provided) {
    return false;
  }
  return isSameToken(expected, provided);
}

async function run(request: Request) {
  if (!isAuthorizedRunnerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized background job runner request." }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") || "25", 10);
  const leaseSeconds = Number.parseInt(url.searchParams.get("lease_seconds") || "120", 10);
  const jobType = String(url.searchParams.get("job_type") || "").trim() || undefined;
  const workerId = `vercel-cron-${crypto.randomUUID()}`;

  const ctx = await getApiContext();
  const db = {
    run: ctx.run,
    get: ctx.get,
    all: ctx.all,
  };
  const scheduleSummary = await scheduleMaintenanceBackgroundJobs(db);
  const runSummary = await runDueBackgroundJobs(db, {
    workerId,
    limit: Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 25,
    leaseSeconds: Number.isFinite(leaseSeconds) ? Math.max(15, Math.min(900, leaseSeconds)) : 120,
    jobType,
    jobRunnerSecret: String(process.env.JOB_RUNNER_SECRET || process.env.CRON_SECRET || process.env.GATEWAY_WEBHOOK_SECRET || "").trim(),
  });

  return NextResponse.json({
    ok: true,
    scheduled: scheduleSummary,
    processed: runSummary,
  });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
