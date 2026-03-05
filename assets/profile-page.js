function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRoleLabel(role) {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "Member";
  }
  if (normalized === "teacher") {
    return "Lecturer";
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function setError(message) {
  const node = document.getElementById("profilePageError");
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
}

function setChecklistStatus(message, isError = false) {
  const node = document.getElementById("checklistStatus");
  if (!node) {
    return;
  }
  node.textContent = String(message || "");
  node.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setPasswordStatus(message, isError = false) {
  const node = document.getElementById("passwordStatus");
  if (!node) {
    return;
  }
  node.textContent = String(message || "");
  node.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function updateProfileAvatar(imageUrl, fallbackName) {
  const imageEl = document.querySelector("[data-profile-image]");
  const initialEl = document.querySelector("[data-profile-initial]");
  if (!imageEl || !initialEl) {
    return;
  }
  const firstLetter = String(fallbackName || "")
    .trim()
    .charAt(0)
    .toUpperCase();
  if (imageUrl) {
    imageEl.src = imageUrl;
    imageEl.hidden = false;
    initialEl.hidden = true;
    return;
  }
  imageEl.hidden = true;
  initialEl.hidden = false;
  initialEl.textContent = firstLetter || "?";
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

function renderChecklist(items, meRole) {
  const root = document.getElementById("departmentChecklistList");
  if (!root) {
    return;
  }
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    root.innerHTML = '<p class="auth-subtitle">No checklist has been uploaded for your department yet.</p>';
    return;
  }

  root.innerHTML = rows
    .map((item) => {
      const checked = item.completed ? "checked" : "";
      const completedAt = item.completed_at ? new Date(item.completed_at).toLocaleString() : "";
      const completedText = completedAt ? `Completed: ${escapeHtml(completedAt)}` : "Not completed";
      const disabled = meRole === "student" ? "" : "disabled";
      return `
        <article class="profile-checklist-item">
          <label class="profile-checklist-item__label">
            <input type="checkbox" data-checklist-id="${Number(item.id || 0)}" ${checked} ${disabled} />
            <span>${escapeHtml(item.item_text || "")}</span>
          </label>
          <small>${escapeHtml(completedText)}</small>
        </article>
      `;
    })
    .join("");
}

function renderSecurityQuestions(questions, minLength) {
  const root = document.getElementById("securityQuestionsList");
  if (!root) {
    return;
  }
  const rows = Array.isArray(questions) ? questions : [];
  if (!rows.length) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = rows
    .map((question, index) => {
      const key = String(question?.key || "")
        .trim()
        .toLowerCase();
      const prompt = String(question?.prompt || "").trim();
      const inputId = `profileSecurityAnswer_${escapeHtml(key)}`;
      return `
        <label for="${inputId}">${index + 1}. ${escapeHtml(prompt)}</label>
        <input
          id="${inputId}"
          type="password"
          minlength="${Number(minLength || 8)}"
          maxlength="160"
          autocomplete="off"
          data-security-question-key="${escapeHtml(key)}"
          data-security-question-prompt="${escapeHtml(prompt)}"
        />
      `;
    })
    .join("");
}

function configurePasswordForm(me) {
  const passwordForm = document.getElementById("profilePasswordForm");
  if (!passwordForm) {
    return;
  }
  const role = String(me?.role || "")
    .trim()
    .toLowerCase();
  const isStudent = role === "student";
  const canSetOneTimeStrongPassword = !!me?.canSetOneTimeStrongPassword;
  const requiresSecurityAnswers = isStudent && canSetOneTimeStrongPassword;
  const securityAnswerMinLength = Number.parseInt(String(me?.securityAnswerMinLength || "8"), 10) || 8;
  const securityQuestions = requiresSecurityAnswers ? me?.securityQuestions || [] : [];
  const securityFieldset = document.getElementById("securityQuestionsFieldset");
  const submitButton = passwordForm.querySelector('button[type="submit"]');
  const currentPasswordLabel = passwordForm.querySelector('label[for="profileCurrentPassword"]');

  passwordForm.dataset.requireSecurityAnswers = requiresSecurityAnswers ? "1" : "0";
  passwordForm.dataset.securityAnswerMinLength = String(securityAnswerMinLength);

  if (isStudent && !canSetOneTimeStrongPassword) {
    passwordForm.hidden = true;
    setPasswordStatus(
      "You already used your one-time stronger password setup. Use Forgot Password on the login page to reset it.",
      false
    );
    return;
  }

  passwordForm.hidden = false;
  if (requiresSecurityAnswers) {
    if (currentPasswordLabel) {
      currentPasswordLabel.textContent = "Current password (surname)";
    }
    renderSecurityQuestions(securityQuestions, securityAnswerMinLength);
    if (securityFieldset) {
      securityFieldset.hidden = false;
    }
    const answerInputs = passwordForm.querySelectorAll("input[data-security-question-key]");
    answerInputs.forEach((input) => {
      input.required = true;
    });
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.textContent = "Create stronger password";
      submitButton.dataset.defaultLabel = "Create stronger password";
    }
    setPasswordStatus("Create your one-time stronger password and set all five security answers.", false);
    return;
  }

  if (currentPasswordLabel) {
    currentPasswordLabel.textContent = "Current password";
  }
  if (securityFieldset) {
    securityFieldset.hidden = true;
  }
  const answerInputs = passwordForm.querySelectorAll("input[data-security-question-key]");
  answerInputs.forEach((input) => {
    input.required = false;
    input.value = "";
  });
  const securityRoot = document.getElementById("securityQuestionsList");
  if (securityRoot) {
    securityRoot.innerHTML = "";
  }
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.textContent = "Update password";
    submitButton.dataset.defaultLabel = "Update password";
  }
  setPasswordStatus("Update your password.", false);
}

async function loadProfilePage() {
  try {
    setError("");
    setChecklistStatus("Loading checklist...");
    const [me, checklistPayload] = await Promise.all([
      requestJson("/api/me"),
      requestJson("/api/profile/checklist"),
    ]);

    const profileName = document.getElementById("profilePageName");
    const profileUsername = document.getElementById("profilePageUsername");
    const profileRole = document.getElementById("profilePageRole");
    const profileDepartment = document.getElementById("profilePageDepartment");
    const profileEmail = document.getElementById("profilePageEmail");

    if (profileName) {
      profileName.textContent = me.displayName || me.username || "-";
    }
    if (profileUsername) {
      profileUsername.textContent = me.username || "-";
    }
    if (profileRole) {
      profileRole.textContent = normalizeRoleLabel(me.role);
    }
    if (profileDepartment) {
      profileDepartment.textContent = me.departmentLabel || me.department || "-";
    }
    if (profileEmail) {
      profileEmail.textContent = me.email || "-";
    }
    updateProfileAvatar(me.profileImageUrl || "", me.displayName || me.username || "");

    renderChecklist(checklistPayload.items || [], me.role);
    if (me.role === "student") {
      setChecklistStatus("Tick each task only after it is done.");
    } else {
      setChecklistStatus("Checklist viewing mode.");
    }
    configurePasswordForm(me);

    const checklistRoot = document.getElementById("departmentChecklistList");
    if (checklistRoot && me.role === "student" && checklistRoot.dataset.bound !== "1") {
      checklistRoot.dataset.bound = "1";
      checklistRoot.addEventListener("change", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
          return;
        }
        const checklistId = Number.parseInt(target.dataset.checklistId || "", 10);
        if (!Number.isFinite(checklistId) || checklistId <= 0) {
          return;
        }
        const checked = !!target.checked;
        target.disabled = true;
        setChecklistStatus("Updating checklist...");
        try {
          await requestJson(`/api/profile/checklist/${checklistId}/toggle`, {
            method: "POST",
            payload: { completed: checked },
          });
          if (window.showToast) {
            window.showToast("Checklist updated.", { type: "success" });
          }
          await loadProfilePage();
        } catch (err) {
          target.checked = !checked;
          setChecklistStatus(err.message || "Could not update checklist.", true);
          if (window.showToast) {
            window.showToast(err.message || "Could not update checklist.", { type: "error" });
          }
          target.disabled = false;
        }
      });
    }

    const passwordForm = document.getElementById("profilePasswordForm");
    if (passwordForm && passwordForm.dataset.bound !== "1") {
      passwordForm.dataset.bound = "1";
      passwordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (passwordForm.hidden) {
          return;
        }
        const currentPassword = String(document.getElementById("profileCurrentPassword")?.value || "");
        const newPassword = String(document.getElementById("profileNewPassword")?.value || "");
        const confirmPassword = String(document.getElementById("profileConfirmPassword")?.value || "");
        if (!currentPassword || !newPassword || !confirmPassword) {
          setPasswordStatus("All password fields are required.", true);
          return;
        }
        const requiresSecurityAnswers = passwordForm.dataset.requireSecurityAnswers === "1";
        const minAnswerLength = Number.parseInt(String(passwordForm.dataset.securityAnswerMinLength || "8"), 10) || 8;
        const payload = {
          currentPassword,
          newPassword,
          confirmPassword,
        };
        if (requiresSecurityAnswers) {
          const securityAnswers = {};
          const answerInputs = passwordForm.querySelectorAll("input[data-security-question-key]");
          for (const input of answerInputs) {
            const answer = String(input.value || "").trim();
            const questionKey = String(input.dataset.securityQuestionKey || "").trim();
            const prompt = String(input.dataset.securityQuestionPrompt || "Security question").trim();
            if (!questionKey) {
              continue;
            }
            if (answer.length < minAnswerLength) {
              setPasswordStatus(`Answer for "${prompt}" must be at least ${minAnswerLength} characters.`, true);
              return;
            }
            securityAnswers[questionKey] = answer;
          }
          payload.securityAnswers = securityAnswers;
        }
        const submitButton = passwordForm.querySelector('button[type="submit"]');
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
          submitButton.textContent = "Saving...";
        }
        setPasswordStatus(requiresSecurityAnswers ? "Saving stronger password..." : "Updating password...", false);
        try {
          await requestJson("/api/profile/password", {
            method: "POST",
            payload,
          });
          passwordForm.reset();
          setPasswordStatus(
            requiresSecurityAnswers ? "Stronger password and security answers saved." : "Password updated successfully.",
            false
          );
          if (window.showToast) {
            window.showToast(requiresSecurityAnswers ? "Stronger password created." : "Password updated.", { type: "success" });
          }
          await loadProfilePage();
        } catch (err) {
          setPasswordStatus(err.message || "Could not update password.", true);
          if (window.showToast) {
            window.showToast(err.message || "Could not update password.", { type: "error" });
          }
        } finally {
          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = false;
            submitButton.textContent = submitButton.dataset.defaultLabel || "Update password";
          }
        }
      });
    }
  } catch (err) {
    setError(err.message || "Could not load profile page.");
    setChecklistStatus("", false);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  loadProfilePage();
});
