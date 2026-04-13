import { proxyLegacyGetRequest } from "@/lib/server/next/legacy-proxy";

export async function GET(request: Request) {
  return proxyLegacyGetRequest(request, "/api/csrf-token");
}
