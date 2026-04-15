import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { requireCsrfProtection } from "@/lib/server/next/csrf-protection";
import { jsonError, toServiceErrorResponse } from "@/lib/server/next/handler-utils";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteParams) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request);
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  const { id: rawId } = await context.params;
  const id = ctx.parseResourceId(rawId);
  if (!id) {
    return jsonError(400, "Invalid notification ID.");
  }
  const body = await request.json().catch(() => ({}));
  const csrfError = await requireCsrfProtection(request, body);
  if (csrfError) {
    return csrfError;
  }
  try {
    const actorRole = String(auth.payload.session.role || "").trim().toLowerCase();
    const actorDepartment = actorRole === "student" ? await ctx.getSessionUserDepartment(auth.payload) : "";
    const payload = await ctx.notificationService.saveReaction({
      id,
      actorUsername: auth.payload.session.username,
      actorRole,
      actorDepartment,
      reaction: body?.reaction,
    });
    return NextResponse.json(payload);
  } catch (err) {
    return toServiceErrorResponse(err, "Could not save reaction.");
  }
}
