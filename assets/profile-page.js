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

async function requestJson(url, { method = "GET", payload } = {}) {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
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
