import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
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

  try {
    const payload = await ctx.notificationService.markNotificationRead({
      id,
      actorUsername: auth.payload.session.username,
      actorRole: auth.payload.session.role,
      actorDepartment: await ctx.getSessionUserDepartment(auth.payload),
    });
    return NextResponse.json(payload);
  } catch (err) {
    return toServiceErrorResponse(err, "Could not mark notification as read.");
  }
}
