import { NextResponse } from "next/server";

import { clearSessionCookies, destroyAuthSessionBySid, getSessionCookieValue, verifyCsrfToken } from "@/lib/server/auth/next-auth";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => new FormData());
  const csrfInput = String(formData.get("_csrf") || "").trim();
  const csrfHeader = request.headers.get("x-csrf-token");
  const csrfBody = csrfHeader ? undefined : { _csrf: csrfInput };
  if (!verifyCsrfToken({ request, parsedBody: csrfBody })) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const sid = getSessionCookieValue(request);
  await destroyAuthSessionBySid(sid);

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  clearSessionCookies(response.headers);
  return response;
}
