import { NextResponse } from "next/server";

import {
  applySessionCookies,
  authenticateLogin,
  createAuthSession,
  issueAnonymousCsrf,
  nextRedirectForRole,
  verifyCsrfToken,
} from "@/lib/server/auth/next-auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const csrfInput = String(formData.get("_csrf") || "").trim();

  if (!verifyCsrfToken({ request, parsedBody: { _csrf: csrfInput } })) {
    const response = NextResponse.redirect(new URL("/login?error=session", request.url), 303);
    await issueAnonymousCsrf(response.headers);
    return response;
  }

  const auth = await authenticateLogin({ username, password, request });
  if (!auth.ok || !auth.user) {
    const code = auth.code || "invalid";
    const response = NextResponse.redirect(new URL(`/login?error=${code}`, request.url), 303);
    await issueAnonymousCsrf(response.headers);
    return response;
  }

  const session = await createAuthSession(auth.user, request);
  const redirectTo = nextRedirectForRole(auth.user.role);
  const response = NextResponse.redirect(new URL(redirectTo, request.url), 303);
  applySessionCookies(response.headers, session);
  return response;
}
