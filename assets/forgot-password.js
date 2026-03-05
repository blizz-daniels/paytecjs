function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function renderSecurityQuestions(questions, minAnswerLength) {
  const root = document.getElementById("resetSecurityQuestionsList");
  if (!root) {
    return;
  }
  const rows = Array.isArray(questions) ? questions : [];
  if (!rows.length) {
    root.innerHTML = '<p class="auth-subtitle">Security questions could not be loaded.</p>';
    return;
  }
  const safeMinLength = Number.parseInt(String(minAnswerLength || "8"), 10) || 8;
  root.dataset.minAnswerLength = String(safeMinLength);
  root.innerHTML = rows
    .map((question, index) => {
      const key = String(question?.key || "")
        .trim()
        .toLowerCase();
      const prompt = String(question?.prompt || "").trim();
      const inputId = `resetSecurityAnswer_${escapeHtml(key)}`;
      return `
        <label for="${inputId}">${index + 1}. ${escapeHtml(prompt)}</label>
        <input
          id="${inputId}"
          type="password"
          minlength="${safeMinLength}"
          maxlength="160"
          autocomplete="off"
          required
          data-security-question-key="${escapeHtml(key)}"
          data-security-question-prompt="${escapeHtml(prompt)}"
        />
      `;
    })
    .join("");
}

async function loadSecurityQuestions() {
  const payload = await requestJson("/api/auth/password-recovery/questions");
  renderSecurityQuestions(payload.questions || [], payload.securityAnswerMinLength || 8);
}

window.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("passwordResetForm");
  if (!form) {
    return;
  }

  try {
    await loadSecurityQuestions();
  } catch (err) {
    setStatus(err.message || "Could not load security questions.", true);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = String(document.getElementById("resetUsername")?.value || "").trim();
    const newPassword = String(document.getElementById("resetNewPassword")?.value || "");
    const confirmPassword = String(document.getElementById("resetConfirmPassword")?.value || "");
    if (!username || !newPassword || !confirmPassword) {
      setStatus("All fields are required.", true);
      return;
    }
    const questionsRoot = document.getElementById("resetSecurityQuestionsList");
    const minAnswerLength = Number.parseInt(String(questionsRoot?.dataset.minAnswerLength || "8"), 10) || 8;
    const securityAnswers = {};
    const answerInputs = form.querySelectorAll("input[data-security-question-key]");
    if (!answerInputs.length) {
      setStatus("Security questions are not available. Refresh the page and try again.", true);
      return;
    }
    for (const input of answerInputs) {
      const answer = String(input.value || "").trim();
      const key = String(input.dataset.securityQuestionKey || "").trim();
      const prompt = String(input.dataset.securityQuestionPrompt || "Security question").trim();
      if (!key) {
        continue;
      }
      if (answer.length < minAnswerLength) {
        setStatus(`Answer for "${prompt}" must be at least ${minAnswerLength} characters.`, true);
        return;
      }
      securityAnswers[key] = answer;
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
          newPassword,
          confirmPassword,
          securityAnswers,
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
