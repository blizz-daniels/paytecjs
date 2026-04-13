import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { studentNavigation } from "@/lib/server/navigation";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <AppShell brandCopy="Da4lions Pay-tec Student" navigation={studentNavigation}>{children}</AppShell>;
}
