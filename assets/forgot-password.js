function setStatus(message, isError = false) {
  const node = document.getElementById("resetStatus");
  if (!node) {
    return;
  }
  if (!message) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = String(message);
  node.style.color = isError ? "var(--danger)" : "var(--muted)";
}

async function requestJson(url, { method = "GET", payload, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
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
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("passwordResetForm");
  const sendOtpButton = document.getElementById("sendOtpButton");
  if (!form || !(sendOtpButton instanceof HTMLButtonElement)) {
    return;
  }

  sendOtpButton.addEventListener("click", async () => {
    const username = String(document.getElementById("resetUsername")?.value || "").trim();
    if (!username) {
      setStatus("Enter your username first.", true);
      return;
    }
    sendOtpButton.disabled = true;
    sendOtpButton.textContent = "Sending...";
    setStatus("Sending OTP to your email...", false);
    try {
      const payload = await requestJson("/api/auth/password-recovery/send-otp", {
        method: "POST",
        payload: { username },
      });
      const masked = String(payload.sentToMaskedEmail || "").trim();
      if (masked) {
        setStatus(`OTP sent to ${masked}.`, false);
      } else {
        setStatus("OTP sent to your registered email.", false);
      }
    } catch (err) {
      setStatus(err.message || "Could not send OTP.", true);
    } finally {
      sendOtpButton.disabled = false;
      sendOtpButton.textContent = "Send OTP";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = String(document.getElementById("resetUsername")?.value || "").trim();
    const otpCode = String(document.getElementById("resetOtpCode")?.value || "")
      .replace(/\D/g, "")
      .trim();
    const newPassword = String(document.getElementById("resetNewPassword")?.value || "");
    const confirmPassword = String(document.getElementById("resetConfirmPassword")?.value || "");
    if (!username || !otpCode || !newPassword || !confirmPassword) {
      setStatus("All fields are required.", true);
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
      submitButton.textContent = "Resetting...";
    }
    setStatus("Resetting password...", false);
    try {
      await requestJson("/api/auth/password-recovery/reset", {
        method: "POST",
        payload: {
          username,
          otpCode,
          newPassword,
          confirmPassword,
        },
      });
      form.reset();
      setStatus("Password reset successful. Redirecting to login...", false);
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (err) {
      setStatus(err.message || "Could not reset password.", true);
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
        submitButton.textContent = "Reset password";
      }
    }
  });
});
