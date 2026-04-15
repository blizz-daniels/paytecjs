import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/server/auth/page-guards";
import { adminNavigation } from "@/lib/server/navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(["admin"]);
  return <AppShell brandCopy="Da4lions Pay-tec Admin" navigation={adminNavigation}>{children}</AppShell>;
}
