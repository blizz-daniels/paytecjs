import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { jsonError } from "@/lib/server/next/handler-utils";

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
    const unread = await ctx.messageService.getMessageUnreadCounts(username);
    return NextResponse.json(unread);
  } catch (_err) {
    return jsonError(500, "Could not load unread count.");
  }
}
