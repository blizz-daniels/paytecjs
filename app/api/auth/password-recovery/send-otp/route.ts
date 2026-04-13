import { proxyLegacyJsonRequest } from "@/lib/server/next/legacy-proxy";

export async function POST(request: Request) {
  return proxyLegacyJsonRequest(request, "/api/auth/password-recovery/send-otp");
}
