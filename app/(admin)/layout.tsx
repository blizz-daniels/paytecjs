import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { adminNavigation } from "@/lib/server/navigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AppShell brandCopy="Da4lions Pay-tec Admin" navigation={adminNavigation}>{children}</AppShell>;
}
