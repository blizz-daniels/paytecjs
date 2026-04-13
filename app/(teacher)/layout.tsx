import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { teacherNavigation } from "@/lib/server/navigation";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <AppShell brandCopy="Da4lions Pay-tec Lecturer" navigation={teacherNavigation}>{children}</AppShell>;
}
