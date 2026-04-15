import { NextResponse } from "next/server";

import { issueAnonymousCsrf, verifyCsrfToken } from "@/lib/server/auth/next-auth";

const DEFAULT_CSRF_ERROR = "CSRF validation failed. Refresh the page and try again.";

export async function requireCsrfProtection(request: Request, parsedBody?: Record<string, unknown> | null) {
  if (verifyCsrfToken({ request, parsedBody: parsedBody || undefined })) {
    return null;
  }
  const headers = new Headers();
  await issueAnonymousCsrf(headers);
  return NextResponse.json({ error: DEFAULT_CSRF_ERROR }, { status: 403, headers });
}

export function parseCsrfBodyFromRaw(rawBody: string, contentType: string) {
  const normalizedType = String(contentType || "").trim().toLowerCase();
  const bodyText = String(rawBody || "");
  if (!bodyText) {
    return null;
  }

  if (normalizedType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  if (normalizedType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(bodyText);
    const csrfValue = String(params.get("_csrf") || "").trim();
    return csrfValue ? { _csrf: csrfValue } : null;
  }

  return null;
}
