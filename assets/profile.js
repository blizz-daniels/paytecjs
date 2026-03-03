window.addEventListener("DOMContentLoaded", () => {
  const nav = document.getElementById("mainNav") || document.querySelector(".nav-links");
  if (!nav) {
    return;
  }

  const profileButtonId = "profileToggleButton";
  let profileButton = document.getElementById(profileButtonId);
  if (!profileButton) {
    profileButton = document.createElement("button");
    profileButton.type = "button";
    profileButton.id = profileButtonId;
    profileButton.className = "profile-trigger";
    profileButton.innerHTML =
      '<img class="nav-link__icon" src="/assets/icons8-profile-24.png" alt="" aria-hidden="true" />Profile';
    const logoutButton = nav.querySelector(".logout-btn");
    if (logoutButton) {
      nav.insertBefore(profileButton, logoutButton);
    } else {
      nav.appendChild(profileButton);
    }
  }

  const panel = document.createElement("div");
  panel.id = "profilePanel";
  panel.className = "profile-panel";
  panel.innerHTML = `
    <div class="profile-panel__backdrop" data-action="close"></div>
    <div class="profile-panel__content" role="dialog" aria-modal="true" aria-label="Profile details">
      <div class="profile-panel__header">
        <div class="profile-panel__avatar" data-profile-avatar>
          <img data-profile-image alt="Profile picture" hidden />
          <span data-profile-initial></span>
        </div>
        <div class="profile-panel__identity">
          <p class="profile-panel__name" data-profile-name>Loading...</p>
          <p class="profile-panel__role" data-profile-role></p>
        </div>
        <button type="button" class="profile-panel__close" data-action="close" aria-label="Close profile panel">&times;</button>
      </div>
      <p class="profile-panel__status" data-profile-status aria-live="polite"></p>
      <div class="profile-panel__quick-links">
        <a href="/profile" class="btn btn-secondary profile-panel__profile-link">View My Profile</a>
        <form method="post" action="/logout" class="logout-form">
          <input type="hidden" name="_csrf" value="" />
          <button type="submit" class="logout-btn">Log out</button>
        </form>
      </div>
      <form id="profileAvatarForm" class="profile-panel__form">
        <label for="profileAvatarInput">Profile picture (PNG, JPG, WEBP)</label>
        <input id="profileAvatarInput" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
        <button type="submit" class="btn btn-secondary">Upload picture</button>
      </form>
    </div>
  `;
  document.body.appendChild(panel);

  const profileNameEl = panel.querySelector("[data-profile-name]");
  const profileRoleEl = panel.querySelector("[data-profile-role]");
  const profileImageEl = panel.querySelector("[data-profile-image]");
  const profileInitialEl = panel.querySelector("[data-profile-initial]");
  const avatarForm = panel.querySelector("#profileAvatarForm");
  const avatarInput = panel.querySelector("#profileAvatarInput");
  const statusNode = panel.querySelector("[data-profile-status]");
  const homeGreetingName = document.getElementById("homeGreetingName");
  const homeGreeting = document.querySelector(".home-greeting");
  const backdrop = panel.querySelector('[data-action="close"]');

  function setButtonBusy(button, isBusy, busyLabel) {
    if (!button) {
      return;
    }
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent || "";
    }
    button.disabled = !!isBusy;
    button.textContent = isBusy ? busyLabel : button.dataset.defaultLabel;
  }

  function setStatus(message, isError = false) {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = message;
    statusNode.style.color = isError ? "#a52828" : "var(--muted)";
  }

  function updateAvatar(imageEl, initialEl, imageUrl, fallback) {
    if (!imageEl || !initialEl) {
      return;
    }
    const firstLetter = String(fallback || "")
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

  async function requestJson(url, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        credentials: "same-origin",
        headers: options.payload ? { "Content-Type": "application/json" } : undefined,
        body: options.payload ? JSON.stringify(options.payload) : undefined,
        signal: controller.signal,
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (_err) {
        payload = null;
      }
      if (!response.ok) {
        throw new Error((payload && payload.error) || "Request failed.");
      }
      return payload || {};
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function applyProfile(profile) {
    if (!profile) {
      return;
    }
    const displayName = profile.displayName || profile.username || "Guest";
    if (profileNameEl) {
      profileNameEl.textContent = displayName;
    }
    if (profileRoleEl) {
      const normalizedRole = String(profile.role || "")
        .trim()
        .toLowerCase();
      const roleText =
        normalizedRole === "teacher"
          ? "Lecturer"
          : normalizedRole
          ? `${normalizedRole.charAt(0).toUpperCase()}${normalizedRole.slice(1)}`
          : "Member";
      profileRoleEl.textContent = roleText;
    }
    if (homeGreetingName) {
      homeGreetingName.textContent = displayName;
    }
    if (homeGreeting) {
      homeGreeting.hidden = false;
    }
    updateAvatar(profileImageEl, profileInitialEl, profile.profileImageUrl || null, displayName);

    if (profile.pendingEmailVerification?.email) {
      setStatus("Email verification is pending. Complete it on the profile page.", false);
    } else {
      setStatus("", false);
    }
  }

  function openPanel() {
    panel.classList.add("profile-panel--open");
    panel.style.display = "block";
    document.body.classList.add("has-profile-panel");
  }

  function closePanel() {
    panel.classList.remove("profile-panel--open");
    panel.style.display = "none";
    document.body.classList.remove("has-profile-panel");
  }

  async function loadProfile() {
    try {
      const data = await requestJson("/api/me", { method: "GET", timeoutMs: 12000 });
      applyProfile(data);
    } catch (_err) {
      setStatus("Unable to load profile right now.", true);
    }
  }

  profileButton.addEventListener("click", () => {
    loadProfile();
    openPanel();
  });

  backdrop?.addEventListener("click", closePanel);
  panel.querySelector(".profile-panel__close")?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("profile-panel--open")) {
      closePanel();
    }
  });

  if (avatarForm) {
    avatarForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = avatarInput?.files?.[0];
      if (!file) {
        setStatus("Select an image to upload.", true);
        if (window.showToast) {
          window.showToast("Select an image to upload.", { type: "error" });
        }
        return;
      }
      const submitButton = avatarForm.querySelector('button[type="submit"]');
      const loadingToast = window.showToast
        ? window.showToast("Uploading profile picture...", { type: "loading", sticky: true })
        : null;
      setButtonBusy(submitButton, true, "Uploading...");
      setStatus("Uploading picture...", false);
      const formData = new FormData();
      formData.append("avatar", file);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        let response = null;
        try {
          response = await fetch("/api/profile/avatar", {
            method: "POST",
            credentials: "same-origin",
            body: formData,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Upload failed.");
        }
        avatarInput.value = "";
        await loadProfile();
        setStatus("Profile picture updated.", false);
      } catch (err) {
        const message = err?.name === "AbortError" ? "Upload timed out. Please try again." : err?.message || "Upload failed.";
        setStatus(message, true);
        if (window.showToast) {
          window.showToast(message, { type: "error" });
        }
      } finally {
        setButtonBusy(submitButton, false, "");
        if (loadingToast) {
          loadingToast.close();
        }
      }
    });
  }

  loadProfile();
});
