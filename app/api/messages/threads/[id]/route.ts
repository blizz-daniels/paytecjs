import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { jsonError, toServiceErrorResponse } from "@/lib/server/next/handler-utils";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteParams) {
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

  try {
    const username = String(auth.payload.session.username || "").trim();
    if (!username) {
      return jsonError(401, "Authentication required.");
    }
    const payload = await ctx.messageService.getMessageThreadPayloadForUser(threadId, username);
    return NextResponse.json(payload);
  } catch (err) {
    return toServiceErrorResponse(err, "Could not load message thread.");
  }
}
