import { NextResponse } from "next/server";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function isServiceError(err: unknown): err is { status: number; error: string } {
  return !!err && typeof err === "object" && "status" in err && "error" in err;
}

export function toServiceErrorResponse(err: unknown, fallbackMessage: string) {
  if (isServiceError(err)) {
    return jsonError(Number((err as any).status || 500), String((err as any).error || fallbackMessage));
  }
  return jsonError(500, fallbackMessage);
}
