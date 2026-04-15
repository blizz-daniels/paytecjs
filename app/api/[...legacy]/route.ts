import { proxyLegacyAnyRequest } from "@/lib/server/next/legacy-proxy";
import { parseCsrfBodyFromRaw, requireCsrfProtection } from "@/lib/server/next/csrf-protection";

type RouteContext = {
  params: Promise<{
    legacy?: string[];
  }>;
};

async function proxy(request: Request, context: RouteContext) {
  const params = await context.params;
  const segments = Array.isArray(params?.legacy) ? params.legacy : [];
  if (!segments.length) {
    return new Response("Not found", { status: 404 });
  }
  const method = String(request.method || "GET").trim().toUpperCase();
  const isSafeMethod = method === "GET" || method === "HEAD" || method === "OPTIONS";
  if (!isSafeMethod) {
    const rawBody = await request.text();
    const parsedBody = parseCsrfBodyFromRaw(rawBody, String(request.headers.get("content-type") || ""));
    const csrfError = await requireCsrfProtection(request, parsedBody);
    if (csrfError) {
      return csrfError;
    }
    const url = new URL(request.url);
    const pathname = `/api/${segments.join("/")}${url.search}`;
    const forwardedRequest = new Request(request.url, {
      method,
      headers: request.headers,
      body: rawBody,
    } as RequestInit);
    return proxyLegacyAnyRequest(forwardedRequest, pathname);
  }
  const url = new URL(request.url);
  const pathname = `/api/${segments.join("/")}${url.search}`;
  return proxyLegacyAnyRequest(request, pathname);
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
  return proxy(request, context);
}
