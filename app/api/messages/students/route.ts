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
    const actorRole = String(auth.payload.session.role || "").trim().toLowerCase();
    if (!ctx.messageService.canCreateMessageThreads(actorRole)) {
      return jsonError(403, "Only lecturers or admins can list student recipients.");
    }
    const students = await ctx.messageService.listMessageStudentDirectory({
      actorRole,
      actorDepartment: await ctx.getSessionUserDepartment(auth.payload),
    });
    return NextResponse.json({ students });
  } catch (_err) {
    return jsonError(500, "Could not load students.");
  }
}
