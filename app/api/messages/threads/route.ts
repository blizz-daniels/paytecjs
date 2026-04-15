import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { requireCsrfProtection } from "@/lib/server/next/csrf-protection";
import { jsonError, toServiceErrorResponse } from "@/lib/server/next/handler-utils";

export async function GET(request: Request) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request);
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  try {
    const username = String(auth.payload.session.username || "").trim();
    if (!username) {
      return jsonError(401, "Authentication required.");
    }
    const [threads, unread] = await Promise.all([
      ctx.messageService.listMessageThreadSummariesForUser(username),
      ctx.messageService.getMessageUnreadCounts(username),
    ]);
    return NextResponse.json({ threads, unread });
  } catch (_err) {
    return jsonError(500, "Could not load message threads.");
  }
}

export async function POST(request: Request) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request);
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  const body = await request.json().catch(() => ({}));
  const csrfError = await requireCsrfProtection(request, body);
  if (csrfError) {
    return csrfError;
  }
  try {
    const actorRole = String(auth.payload.session.role || "").trim().toLowerCase();
    const payload = await ctx.messageService.createThread({
      actorRole,
      actorUsername: auth.payload.session.username,
      actorDepartment: await ctx.getSessionUserDepartment(auth.payload),
      subject: body?.subject || "",
      message: body?.message || "",
      recipients: body?.recipients,
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    return toServiceErrorResponse(err, "Could not create message thread.");
  }
}
