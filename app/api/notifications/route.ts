import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { jsonError, toServiceErrorResponse } from "@/lib/server/next/handler-utils";
import { requireCsrfProtection } from "@/lib/server/next/csrf-protection";

export async function GET(request: Request) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request);
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  try {
    const actorRole = String(auth.payload.session.role || "").trim().toLowerCase();
    const actorDepartment = actorRole === "student" ? await ctx.getSessionUserDepartment(auth.payload) : "";
    const rows = await ctx.notificationService.listNotifications({
      actorUsername: auth.payload.session.username,
      actorRole,
      actorDepartment,
    });
    return NextResponse.json(rows);
  } catch (err) {
    return toServiceErrorResponse(err, "Could not load notifications");
  }
}

export async function POST(request: Request) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request, { teacher: true });
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  const body = await request.json().catch(() => ({}));
  const csrfError = await requireCsrfProtection(request, body);
  if (csrfError) {
    return csrfError;
  }
  try {
    const targetDepartment = await ctx.resolveContentTargetDepartment(auth.payload, body?.targetDepartment || "");
    const payload = await ctx.notificationService.createNotification({
      req: ctx.toReqLike(auth.payload, request),
      actorUsername: auth.payload.session.username,
      title: body?.title,
      body: body?.body,
      category: body?.category,
      isUrgent: body?.isUrgent,
      isPinned: body?.isPinned,
      targetDepartment,
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    return toServiceErrorResponse(err, "Could not save notification.");
  }
}
