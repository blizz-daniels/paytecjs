import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { requireCsrfProtection } from "@/lib/server/next/csrf-protection";
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
    return jsonError(400, "Invalid shared file ID.");
  }

  const body = await request.json().catch(() => ({}));
  const csrfError = await requireCsrfProtection(request, body);
  if (csrfError) {
    return csrfError;
  }
  try {
    const payload = await ctx.sharedFileService.updateSharedFile({
      req: ctx.toReqLike(auth.payload, request),
      id,
      actorUsername: auth.payload.session.username,
      isAdmin: auth.payload.session.role === "admin",
      title: body?.title,
      description: body?.description,
      fileUrl: body?.fileUrl,
      targetDepartment: await ctx.resolveContentTargetDepartment(auth.payload, body?.targetDepartment || ""),
    });
    return NextResponse.json(payload);
  } catch (err) {
    return toServiceErrorResponse(err, "Could not update shared file.");
  }
}

export async function DELETE(request: Request, context: RouteParams) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request, { teacher: true });
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }
  const csrfError = await requireCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const { id: rawId } = await context.params;
  const id = ctx.parseResourceId(rawId);
  if (!id) {
    return jsonError(400, "Invalid shared file ID.");
  }

  try {
    const payload = await ctx.sharedFileService.deleteSharedFile({
      req: ctx.toReqLike(auth.payload, request),
      id,
      actorUsername: auth.payload.session.username,
      isAdmin: auth.payload.session.role === "admin",
    });
    return NextResponse.json(payload);
  } catch (err) {
    return toServiceErrorResponse(err, "Could not delete shared file.");
  }
}
