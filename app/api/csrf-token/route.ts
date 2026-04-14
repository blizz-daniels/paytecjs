import { NextResponse } from "next/server";

import { CSRF_COOKIE_NAME, getAuthSessionPayload, issueAnonymousCsrf, serializeCookie } from "@/lib/server/auth/next-auth";

export async function GET(request: Request) {
  const sessionPayload = await getAuthSessionPayload(request, { touch: false });
  const headers = new Headers();
  headers.set("cache-control", "no-store");

  if (sessionPayload?.session?.csrfToken) {
    headers.append(
      "set-cookie",
      serializeCookie(CSRF_COOKIE_NAME, sessionPayload.session.csrfToken, {
        httpOnly: false,
        sameSite: "Lax",
        path: "/",
      })
    );
    return NextResponse.json(
      {
        csrfToken: sessionPayload.session.csrfToken,
      },
      { headers }
    );
  }

  const token = await issueAnonymousCsrf(headers);
  return NextResponse.json(
    {
      csrfToken: token,
    },
    { headers }
  );
}
