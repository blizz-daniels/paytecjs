const params = new URLSearchParams(window.location.search);
const error = params.get("error");
const authError = document.getElementById("authError");

if (!authError || !error) {
  // Nothing to render for this page state.
} else {
  const loginMessages = {
    invalid: "Invalid username or password.",
    session: "Could not start your session. Try again.",
    rate_limited: "Too many failed login attempts. Please wait 15 minutes and try again.",
  };

  const fallback = "Login failed. Please try again.";

  authError.textContent = loginMessages[error] || fallback;
  authError.hidden = false;
}

function setForgotPasswordStatus(message, isError = false) {
  const node = document.getElementById("forgotPasswordStatus");
  if (!node) {
    return;
  }
  node.textContent = String(message || "");
  node.style.color = isError ? "var(--danger)" : "var(--muted)";
}

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_err) {
    data = null;
  }
  if (!response.ok) {
    throw new Error((data && data.error) || "Request failed.");
  }
  return data || {};
}

window.addEventListener("DOMContentLoaded", () => {
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  const resetPasswordForm = document.getElementById("resetPasswordForm");
  const forgotUsernameInput = document.getElementById("forgotPasswordUsername");
  const resetCodeInput = document.getElementById("resetPasswordCode");
  const resetNewInput = document.getElementById("resetPasswordNew");
  const resetConfirmInput = document.getElementById("resetPasswordConfirm");

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = String(forgotUsernameInput?.value || "").trim();
      if (!username) {
        setForgotPasswordStatus("Enter your username first.", true);
        return;
      }

      const submitButton = forgotPasswordForm.querySelector('button[type="submit"]');
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
      }
      setForgotPasswordStatus("Sending reset code...", false);
      try {
        const payload = await requestJson("/api/auth/forgot-password", { username });
        setForgotPasswordStatus(payload.message || "If your account is eligible, a reset code was sent.", false);
        if (resetPasswordForm) {
          resetPasswordForm.hidden = false;
        }
        if (payload.debugCode) {
          setForgotPasswordStatus(
            `Reset code sent. (Test mode code: ${payload.debugCode}) Enter it below to continue.`,
            false
          );
        }
      } catch (err) {
        setForgotPasswordStatus(err.message || "Could not send reset code.", true);
      } finally {
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
          submitButton.textContent = "Send reset code";
        }
      }
    });
  }

  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = String(forgotUsernameInput?.value || "").trim();
      const code = String(resetCodeInput?.value || "").trim();
      const newPassword = String(resetNewInput?.value || "");
      const confirmPassword = String(resetConfirmInput?.value || "");
      if (!username) {
        setForgotPasswordStatus("Enter your username before resetting password.", true);
        return;
      }
      if (!code) {
        setForgotPasswordStatus("Enter the reset code from your email.", true);
        return;
      }
      if (!newPassword || !confirmPassword) {
        setForgotPasswordStatus("Enter and confirm your new password.", true);
        return;
      }

      const submitButton = resetPasswordForm.querySelector('button[type="submit"]');
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
        submitButton.textContent = "Resetting...";
      }
      setForgotPasswordStatus("Resetting password...", false);
      try {
        await requestJson("/api/auth/reset-password", {
          username,
          code,
          newPassword,
          confirmPassword,
        });
        resetPasswordForm.reset();
        setForgotPasswordStatus("Password reset successful. You can now log in with your new password.", false);
      } catch (err) {
        setForgotPasswordStatus(err.message || "Could not reset password.", true);
      } finally {
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
          submitButton.textContent = "Reset password";
        }
      }
    });
  }
});
