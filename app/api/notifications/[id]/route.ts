import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { jsonError, toServiceErrorResponse } from "@/lib/server/next/handler-utils";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteParams) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request, { teacher: true });
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  const { id: rawId } = await context.params;
  const id = ctx.parseResourceId(rawId);
  if (!id) {
    return jsonError(400, "Invalid notification ID.");
  }
  const body = await request.json().catch(() => ({}));
  try {
    const targetDepartment = await ctx.resolveContentTargetDepartment(auth.payload, body?.targetDepartment || "");
    const payload = await ctx.notificationService.updateNotification({
      req: ctx.toReqLike(auth.payload, request),
      id,
      actorUsername: auth.payload.session.username,
      isAdmin: auth.payload.session.role === "admin",
      title: body?.title,
      body: body?.body,
      category: body?.category,
      isUrgent: body?.isUrgent,
      isPinned: body?.isPinned,
      targetDepartment,
    });
    return NextResponse.json(payload);
  } catch (err) {
    return toServiceErrorResponse(err, "Could not update notification.");
  }
}

export async function DELETE(request: Request, context: RouteParams) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request, { teacher: true });
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  const { id: rawId } = await context.params;
  const id = ctx.parseResourceId(rawId);
  if (!id) {
    return jsonError(400, "Invalid notification ID.");
  }
  try {
    const payload = await ctx.notificationService.deleteNotification({
      req: ctx.toReqLike(auth.payload, request),
      id,
      actorUsername: auth.payload.session.username,
      isAdmin: auth.payload.session.role === "admin",
    });
    return NextResponse.json(payload);
  } catch (err) {
    return toServiceErrorResponse(err, "Could not delete notification.");
  }
}
