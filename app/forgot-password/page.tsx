import type { Metadata } from "next";

import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordClient } from "@/components/forgot-password-client";
import { redirectAuthenticatedToRoleHome } from "@/lib/server/auth/page-guards";

export const metadata: Metadata = {
  title: "Reset Password",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ForgotPasswordPage() {
  await redirectAuthenticatedToRoleHome();
  return (
    <AuthShell
      title="Reset Password"
      subtitle="Enter your username and request an email OTP. Then use that OTP to set a new strong password."
      footer="The OTP is sent to the email saved in your profile."
    >
      <ForgotPasswordClient />
    </AuthShell>
  );
}
