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
  const csrfError = await requireCsrfProtection(request);
  if (csrfError) {
    return csrfError;
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
    await ctx.messageService.getMessageThreadAccess(threadId, username);
    const lastReadMessageId = await ctx.messageService.markMessageThreadReadForUser(threadId, username);
    const unread = await ctx.messageService.getMessageUnreadCounts(username);
    return NextResponse.json({
      ok: true,
      thread_id: threadId,
      last_read_message_id: lastReadMessageId,
      unread,
    });
  } catch (err) {
    return toServiceErrorResponse(err, "Could not update read state.");
  }
}
