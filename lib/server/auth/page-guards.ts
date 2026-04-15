import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loadAuthSession } from "@/lib/server/auth/next-auth";

async function toCookieHeader() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

async function readSession() {
  const cookieHeader = await toCookieHeader();
  const requestLike = {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "cookie" ? cookieHeader : "";
      },
    },
  };
  return loadAuthSession(requestLike as any);
}

function roleHome(role: string) {
  if (role === "admin") {
    return "/admin";
  }
  if (role === "teacher") {
    return "/lecturer";
  }
  return "/";
}

export async function requireRole(allowedRoles: string[]) {
  const session = await readSession();
  if (!session) {
    redirect("/login");
  }
  if (!allowedRoles.includes(session.role)) {
    redirect(roleHome(session.role));
  }
  return session;
}

export async function redirectAuthenticatedToRoleHome() {
  const session = await readSession();
  if (session) {
    redirect(roleHome(session.role));
  }
}
