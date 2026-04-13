import { proxyLegacyFormRequest } from "@/lib/server/next/legacy-proxy";

export async function POST(request: Request) {
  return proxyLegacyFormRequest(request, "/logout");
}
