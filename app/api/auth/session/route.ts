import { NextResponse } from "next/server";

import { getAuthSessionPayload } from "@/lib/server/auth/next-auth";

export async function GET(request: Request) {
  const payload = await getAuthSessionPayload(request);
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      username: payload.session.username,
      role: payload.session.role,
      expiresAt: payload.session.expiresAt,
    },
    me: payload.me,
  });
}
