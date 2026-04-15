import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/server/auth/page-guards";
import { teacherNavigation } from "@/lib/server/navigation";

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  await requireRole(["teacher", "admin"]);
  return <AppShell brandCopy="Da4lions Pay-tec Lecturer" navigation={teacherNavigation}>{children}</AppShell>;
}
