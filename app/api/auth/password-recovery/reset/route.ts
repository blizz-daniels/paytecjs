import { NextResponse } from "next/server";

import { issueAnonymousCsrf, resetPasswordRecovery, verifyCsrfToken } from "@/lib/server/auth/next-auth";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  if (!verifyCsrfToken({ request, parsedBody: payload })) {
    const headers = new Headers();
    await issueAnonymousCsrf(headers);
    return NextResponse.json({ error: "CSRF token is invalid." }, { status: 403, headers });
  }

  try {
    const result = await resetPasswordRecovery({
      request,
      username: String(payload?.username || ""),
      otpCode: String(payload?.otpCode || ""),
      newPassword: String(payload?.newPassword || ""),
      confirmPassword: String(payload?.confirmPassword || ""),
    });
    return NextResponse.json(result);
  } catch (err: any) {
    const headers = new Headers();
    await issueAnonymousCsrf(headers);
    if (err?.headers && typeof err.headers === "object") {
      for (const [key, value] of Object.entries(err.headers)) {
        headers.set(key, String(value));
      }
    }
    if (err?.status && err?.error) {
      return NextResponse.json({ error: String(err.error) }, { status: Number(err.status), headers });
    }
    return NextResponse.json({ error: "Could not reset password." }, { status: 500, headers });
  }
}
