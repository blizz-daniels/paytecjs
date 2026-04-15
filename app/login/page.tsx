import type { Metadata } from "next";

import { AuthShell } from "@/components/auth-shell";
import { LoginPageClient } from "@/components/login-page-client";
import { redirectAuthenticatedToRoleHome } from "@/lib/server/auth/page-guards";

export const metadata: Metadata = {
  title: "Portal Login",
  description: "Da4lions Pay-tec login for students, lecturers, and admins.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  redirectAuthenticatedToRoleHome();
  return (
    <AuthShell
      title="Portal Login"
      subtitle="Students use matric number, lecturers use lecturer code. Use surname in lowercase unless you already set a custom password."
      footer="Accounts are provisioned by admin roster upload."
    >
      <LoginPageClient />
    </AuthShell>
  );
}
