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
  const threadId = ctx.parseResourceId(rawId);
  if (!threadId) {
    return jsonError(400, "Invalid message thread ID.");
  }

  const body = await request.json().catch(() => ({}));
  const csrfError = await requireCsrfProtection(request, body);
  if (csrfError) {
    return csrfError;
  }
  try {
    const payload = await ctx.messageService.createMessage({
      threadId,
      actorUsername: auth.payload.session.username,
      actorRole: auth.payload.session.role,
      message: body?.message || "",
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    return toServiceErrorResponse(err, "Could not send message.");
  }
}
