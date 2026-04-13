"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const loginMessages: Record<string, string> = {
  invalid: "Invalid username or password.",
  session: "Could not start your session. Try again.",
  rate_limited: "Too many failed login attempts. Please wait 15 minutes and try again.",
};

export function LoginPageClient() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";
  const notice = error ? loginMessages[error] || "Login failed. Please try again." : "";

  return (
    <form method="post" action="/api/auth/login" className="auth-form">
      {notice ? (
        <p id="authError" className="auth-error">
          {notice}
        </p>
      ) : (
        <p id="authError" className="auth-error" hidden>
          Login failed. Please try again.
        </p>
      )}

      <label htmlFor="username">Username</label>
      <input
        id="username"
        name="username"
        type="text"
        minLength={3}
        maxLength={40}
        pattern="[A-Za-z0-9/_-]+"
        required
      />

      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" minLength={2} maxLength={72} required />
      <input type="hidden" name="_csrf" value="" />

      <button type="submit" className="btn">
        Log in
      </button>

      <p className="auth-help">
        <Link href="/forgot-password">Forgot Password?</Link>
      </p>
      <p className="auth-help">Accounts are provisioned by admin roster upload.</p>
    </form>
  );
}
