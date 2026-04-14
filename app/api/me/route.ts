import { NextResponse } from "next/server";

import { getAuthSessionPayload } from "@/lib/server/auth/next-auth";

export async function GET(request: Request) {
  const payload = await getAuthSessionPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json(payload.me);
}
