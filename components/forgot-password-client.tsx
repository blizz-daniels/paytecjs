"use client";

import Link from "next/link";
import { useState } from "react";

async function requestJson(url: string, body: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || "Request failed."));
  }
  return payload as { sentToMaskedEmail?: string };
}

export function ForgotPasswordClient() {
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [username, setUsername] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  return (
    <>
      <p
        id="resetStatus"
        className="auth-subtitle"
        hidden={!status}
        style={isError ? { color: "var(--danger)" } : undefined}
      >
        {status}
      </p>

      <form
        id="passwordResetForm"
        className="auth-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!username || !otpCode || !newPassword || !confirmPassword) {
            setIsError(true);
            setStatus("All fields are required.");
            return;
          }

          setIsResetting(true);
          setIsError(false);
          setStatus("Resetting password...");
          try {
            await requestJson("/api/auth/password-recovery/reset", {
              username,
              otpCode,
              newPassword,
              confirmPassword,
            });
            setStatus("Password reset successful. Redirecting to login...");
            window.setTimeout(() => {
              window.location.href = "/login";
            }, 1200);
          } catch (error) {
            setIsError(true);
            setStatus(error instanceof Error ? error.message : "Could not reset password.");
          } finally {
            setIsResetting(false);
          }
        }}
      >
        <label htmlFor="resetUsername">Username</label>
        <input
          id="resetUsername"
          name="username"
          type="text"
          minLength={3}
          maxLength={40}
          pattern="[A-Za-z0-9/_-]+"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        <button
          id="sendOtpButton"
          type="button"
          className="btn btn-secondary"
          disabled={isSending}
          onClick={async () => {
            if (!username) {
              setIsError(true);
              setStatus("Enter your username first.");
              return;
            }
            setIsSending(true);
            setIsError(false);
            setStatus("Sending OTP to your profile email...");
            try {
              const payload = await requestJson("/api/auth/password-recovery/send-otp", { username });
              const masked = String(payload.sentToMaskedEmail || "").trim();
              setStatus(masked ? `OTP sent to ${masked}.` : "OTP sent to your registered email.");
            } catch (error) {
              setIsError(true);
              setStatus(error instanceof Error ? error.message : "Could not send OTP.");
            } finally {
              setIsSending(false);
            }
          }}
        >
          {isSending ? "Sending..." : "Send OTP"}
        </button>

        <label htmlFor="resetOtpCode">Email OTP</label>
        <input
          id="resetOtpCode"
          name="otpCode"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{4,8}"
          minLength={4}
          maxLength={8}
          value={otpCode}
          onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
          required
        />

        <label htmlFor="resetNewPassword">New password</label>
        <input
          id="resetNewPassword"
          name="newPassword"
          type="password"
          minLength={10}
          maxLength={72}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />

        <label htmlFor="resetConfirmPassword">Confirm new password</label>
        <input
          id="resetConfirmPassword"
          name="confirmPassword"
          type="password"
          minLength={10}
          maxLength={72}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />

        <button type="submit" className="btn" disabled={isResetting}>
          {isResetting ? "Resetting..." : "Reset password"}
        </button>
      </form>
      <p className="auth-help">
        <Link href="/login">Back to login</Link>
      </p>
    </>
  );
}
