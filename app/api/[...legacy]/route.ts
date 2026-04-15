import { proxyLegacyAnyRequest } from "@/lib/server/next/legacy-proxy";

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
