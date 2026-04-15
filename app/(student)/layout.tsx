import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/server/auth/page-guards";
import { studentNavigation } from "@/lib/server/navigation";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  await requireRole(["student"]);
  return <AppShell brandCopy="Da4lions Pay-tec Student" navigation={studentNavigation}>{children}</AppShell>;
}
