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

function setEmailStatus(message, isError = false) {
  const node = document.getElementById("profileEmailStatusMessage");
  if (!node) {
    return;
  }
  node.textContent = String(message || "");
  node.style.color = isError ? "var(--danger)" : "var(--muted)";
}

let cachedEmailDebugCode = "";

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

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
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
    const profileEmailStatus = document.getElementById("profilePageEmailStatus");
    const emailInput = document.getElementById("profilePageEmailInput");
    const emailForm = document.getElementById("profileEmailForm");
    const emailVerifyForm = document.getElementById("profileEmailVerifyForm");
    const emailCodeInput = document.getElementById("profilePageEmailCode");

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
      profileEmail.textContent = me.email || me.pendingEmailVerification?.email || "-";
    }
    if (profileEmailStatus) {
      if (me.email) {
        profileEmailStatus.textContent = "Verified";
      } else if (me.pendingEmailVerification?.email) {
        profileEmailStatus.textContent = "Pending verification";
      } else {
        profileEmailStatus.textContent = "Not set";
      }
    }
    if (emailInput) {
      emailInput.value = me.email || me.pendingEmailVerification?.email || "";
    }
    if (emailVerifyForm) {
      emailVerifyForm.hidden = !me.pendingEmailVerification?.email;
    }
    if (me.pendingEmailVerification?.email) {
      const expiresText = formatDateTime(me.pendingEmailVerification?.expiresAt);
      const baseMessage = expiresText
        ? `Verification pending for ${me.pendingEmailVerification.email}. Expires: ${expiresText}.`
        : `Verification pending for ${me.pendingEmailVerification.email}.`;
      setEmailStatus(
        cachedEmailDebugCode ? `${baseMessage} Verification code: ${cachedEmailDebugCode}` : baseMessage,
        false
      );
    } else if (me.email) {
      setEmailStatus("Email is verified.", false);
      cachedEmailDebugCode = "";
      if (emailCodeInput) {
        emailCodeInput.value = "";
      }
    } else {
      setEmailStatus("Add your email address and verify it.", false);
    }
    updateProfileAvatar(me.profileImageUrl || "", me.displayName || me.username || "");

    renderChecklist(checklistPayload.items || [], me.role);
    if (me.role === "student") {
      setChecklistStatus("Tick each task only after it is done.");
    } else {
      setChecklistStatus("Checklist viewing mode.");
    }

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

    if (emailForm && emailForm.dataset.bound !== "1") {
      emailForm.dataset.bound = "1";
      emailForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const value = String(emailInput?.value || "").trim();
        if (!value) {
          setEmailStatus("Email address cannot be empty.", true);
          return;
        }
        const submitButton = emailForm.querySelector('button[type="submit"]');
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
          submitButton.textContent = "Saving...";
        }
        setEmailStatus("Saving email address...", false);
        try {
          const payload = await requestJson("/api/profile/email", {
            method: "POST",
            payload: { email: value },
            timeoutMs: 20000,
          });
          cachedEmailDebugCode = payload?.debugCode ? String(payload.debugCode) : "";
          if (payload.verified) {
            setEmailStatus("Email already verified.", false);
            if (window.showToast) {
              window.showToast("Email is already verified.", { type: "success" });
            }
          } else if (cachedEmailDebugCode) {
            setEmailStatus(`Verification code: ${cachedEmailDebugCode}`, false);
            if (window.showToast) {
              window.showToast("Verification code generated. Enter it below.", { type: "success" });
            }
          } else {
            setEmailStatus(
              payload.message || "Verification code sent. Enter the 6-digit code below.",
              false
            );
            if (window.showToast) {
              window.showToast("Verification code sent to your email.", { type: "success" });
            }
          }
          await loadProfilePage();
        } catch (err) {
          setEmailStatus(err.message || "Could not save email address.", true);
          if (window.showToast) {
            window.showToast(err.message || "Could not save email address.", { type: "error" });
          }
        } finally {
          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = false;
            submitButton.textContent = "Save email";
          }
        }
      });
    }

    if (emailVerifyForm && emailVerifyForm.dataset.bound !== "1") {
      emailVerifyForm.dataset.bound = "1";
      emailVerifyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const code = String(emailCodeInput?.value || "").trim();
        if (!code) {
          setEmailStatus("Enter the verification code.", true);
          return;
        }
        const submitButton = emailVerifyForm.querySelector('button[type="submit"]');
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
          submitButton.textContent = "Verifying...";
        }
        setEmailStatus("Verifying email...", false);
        try {
          await requestJson("/api/profile/email/verify", {
            method: "POST",
            payload: { code },
            timeoutMs: 15000,
          });
          cachedEmailDebugCode = "";
          if (emailCodeInput) {
            emailCodeInput.value = "";
          }
          setEmailStatus("Email verified successfully.", false);
          if (window.showToast) {
            window.showToast("Email verified.", { type: "success" });
          }
          await loadProfilePage();
        } catch (err) {
          setEmailStatus(err.message || "Could not verify email.", true);
          if (window.showToast) {
            window.showToast(err.message || "Could not verify email.", { type: "error" });
          }
        } finally {
          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = false;
            submitButton.textContent = "Verify email";
          }
        }
      });
    }

    const passwordForm = document.getElementById("profilePasswordForm");
    if (passwordForm && passwordForm.dataset.bound !== "1") {
      passwordForm.dataset.bound = "1";
      passwordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const currentPassword = String(
          document.getElementById("profileCurrentPassword")?.value || ""
        );
        const newPassword = String(document.getElementById("profileNewPassword")?.value || "");
        const confirmPassword = String(document.getElementById("profileConfirmPassword")?.value || "");
        if (!currentPassword || !newPassword || !confirmPassword) {
          setPasswordStatus("All password fields are required.", true);
          return;
        }
        const submitButton = passwordForm.querySelector('button[type="submit"]');
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
          submitButton.textContent = "Updating...";
        }
        setPasswordStatus("Updating password...", false);
        try {
          await requestJson("/api/profile/password", {
            method: "POST",
            payload: {
              currentPassword,
              newPassword,
              confirmPassword,
            },
          });
          passwordForm.reset();
          setPasswordStatus("Password updated successfully.", false);
          if (window.showToast) {
            window.showToast("Password updated.", { type: "success" });
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
            submitButton.textContent = "Update password";
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
