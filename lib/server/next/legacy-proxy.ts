const DEFAULT_LEGACY_APP_URL = "http://127.0.0.1:3001";

function getLegacyBaseUrl() {
  return String(process.env.LEGACY_APP_URL || DEFAULT_LEGACY_APP_URL).replace(/\/$/, "");
}

function getLegacyUrl(pathname: string) {
  return new URL(pathname, `${getLegacyBaseUrl()}/`);
}

function readCookieHeader(headers: Headers) {
  return String(headers.get("cookie") || "").trim();
}

function mergeCookieHeaders(baseCookieHeader: string, setCookieHeader: string | null) {
  const currentCookies = new Map<string, string>();

  for (const part of baseCookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const name = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (name) {
      currentCookies.set(name, value);
    }
  }

  if (setCookieHeader) {
    const firstSegment = setCookieHeader.split(";")[0] || "";
    const equalsIndex = firstSegment.indexOf("=");
    if (equalsIndex > 0) {
      const name = firstSegment.slice(0, equalsIndex).trim();
      const value = firstSegment.slice(equalsIndex + 1).trim();
      if (name) {
        currentCookies.set(name, value);
      }
    }
  }

  return Array.from(currentCookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function fetchLegacyCsrfToken(cookieHeader: string) {
  const response = await fetch(getLegacyUrl("/api/csrf-token"), {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not prepare a CSRF token for the legacy app.");
  }

  const payload = (await response.json()) as { csrfToken?: string };
  const csrfToken = String(payload?.csrfToken || "").trim();
  if (!csrfToken) {
    throw new Error("The legacy CSRF token response was empty.");
  }

  return {
    csrfToken,
    setCookie: response.headers.get("set-cookie"),
  };
}

async function proxyLegacyRequest(options: {
  pathname: string;
  request: Request;
  body?: BodyInit | null;
  contentType?: string;
  useCsrf?: boolean;
}) {
  const incomingCookieHeader = readCookieHeader(options.request.headers);
  let cookieHeader = incomingCookieHeader;
  let csrfToken = "";

  if (options.useCsrf) {
    const csrf = await fetchLegacyCsrfToken(cookieHeader);
    csrfToken = csrf.csrfToken;
    cookieHeader = mergeCookieHeaders(cookieHeader, csrf.setCookie);
  }

  const headers = new Headers();
  const forwardedHeaders = ["accept", "accept-language", "origin", "referer", "user-agent", "x-requested-with"];
  for (const headerName of forwardedHeaders) {
    const headerValue = options.request.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }
  if (options.contentType) {
    headers.set("content-type", options.contentType);
  }
  if (csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }

  return fetch(getLegacyUrl(options.pathname), {
    method: options.request.method,
    headers,
    body: options.body ?? null,
    redirect: "manual",
    cache: "no-store",
  });
}

async function mirrorLegacyResponse(request: Request, response: Response) {
  const location = response.headers.get("location");
  const setCookie = response.headers.get("set-cookie");

  if (response.status >= 300 && response.status < 400 && location) {
    const headers = new Headers();
    headers.set("location", new URL(location, request.url).toString());
    if (setCookie) {
      headers.append("set-cookie", setCookie);
    }
    return new Response(null, {
      status: response.status,
      headers,
    });
  }

  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      headers.set(key, value);
    }
  });
  if (setCookie) {
    headers.append("set-cookie", setCookie);
  }

  if (response.status === 204) {
    return new Response(null, { status: 204, headers });
  }

  return new Response(await response.text(), {
    status: response.status,
    headers,
  });
}

export async function proxyLegacyFormRequest(request: Request, pathname: string) {
  const formData = await request.formData();
  const body = new URLSearchParams();
  formData.forEach((value, key) => {
    body.set(key, String(value));
  });
  const legacyResponse = await proxyLegacyRequest({
    pathname,
    request,
    body: body.toString(),
    contentType: "application/x-www-form-urlencoded;charset=UTF-8",
    useCsrf: true,
  });
  return mirrorLegacyResponse(request, legacyResponse);
}

export async function proxyLegacyJsonRequest(request: Request, pathname: string) {
  const jsonBody = await request.json();
  const legacyResponse = await proxyLegacyRequest({
    pathname,
    request,
    body: JSON.stringify(jsonBody),
    contentType: "application/json",
    useCsrf: true,
  });

  return mirrorLegacyResponse(request, legacyResponse);
}

export async function proxyLegacyGetRequest(request: Request, pathname: string) {
  const legacyResponse = await proxyLegacyRequest({
    pathname,
    request,
    useCsrf: false,
  });
  return mirrorLegacyResponse(request, legacyResponse);
}

export async function proxyLegacyAnyRequest(request: Request, pathname: string) {
  const method = String(request.method || "GET").toUpperCase();
  const isSafeMethod = method === "GET" || method === "HEAD" || method === "OPTIONS";
  const contentType = String(request.headers.get("content-type") || "").trim();
  let body: BodyInit | null = null;
  if (!isSafeMethod) {
    body = await request.text();
  }
  const legacyResponse = await proxyLegacyRequest({
    pathname,
    request,
    body,
    contentType: contentType || undefined,
    useCsrf: !isSafeMethod,
  });
  return mirrorLegacyResponse(request, legacyResponse);
}
