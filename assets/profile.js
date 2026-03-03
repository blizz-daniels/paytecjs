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
      <form id="profileEmailForm" class="profile-panel__form">
        <label for="profileEmailAddress">Email address (used for Paystack/password reset)</label>
        <input
          id="profileEmailAddress"
          name="email"
          type="email"
          maxlength="254"
          placeholder="name@example.com"
          autocomplete="email"
          required
        />
        <button type="submit" class="btn">Save email</button>
      </form>
      <div id="profileEmailVerificationBlock" hidden>
        <p id="profileEmailVerificationHint" class="auth-subtitle"></p>
        <form id="profileEmailVerifyForm" class="profile-panel__form">
          <label for="profileEmailCode">Email verification code</label>
          <input
            id="profileEmailCode"
            name="code"
            type="text"
            inputmode="numeric"
            pattern="\\d{6}"
            minlength="6"
            maxlength="6"
            placeholder="6-digit code"
            required
          />
          <button type="submit" class="btn btn-secondary">Verify email</button>
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
  const emailInput = panel.querySelector("#profileEmailAddress");
  const emailForm = panel.querySelector("#profileEmailForm");
  const emailVerifyBlock = panel.querySelector("#profileEmailVerificationBlock");
  const emailVerifyHint = panel.querySelector("#profileEmailVerificationHint");
  const emailVerifyForm = panel.querySelector("#profileEmailVerifyForm");
  const emailCodeInput = panel.querySelector("#profileEmailCode");
  const avatarForm = panel.querySelector("#profileAvatarForm");
  const avatarInput = panel.querySelector("#profileAvatarInput");
  const statusNode = panel.querySelector("[data-profile-status]");
  const homeGreetingName = document.getElementById("homeGreetingName");
  const homeGreeting = document.querySelector(".home-greeting");
  const backdrop = panel.querySelector('[data-action="close"]');

  let profileData = null;

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

  function formatExpiry(expiresAt) {
    if (!expiresAt) {
      return "";
    }
    try {
      const localTime = new Date(expiresAt);
      if (Number.isNaN(localTime.getTime())) {
        return "";
      }
      return localTime.toLocaleString();
    } catch (_err) {
      return "";
    }
  }

  function updateEmailVerificationUi(profile) {
    if (!emailVerifyBlock || !emailVerifyHint) {
      return;
    }
    const pending = profile && profile.pendingEmailVerification ? profile.pendingEmailVerification : null;
    if (!pending || !pending.email) {
      emailVerifyBlock.hidden = true;
      emailVerifyHint.textContent = "";
      if (emailCodeInput) {
        emailCodeInput.value = "";
      }
      return;
    }
    const expiresAtText = formatExpiry(pending.expiresAt);
    emailVerifyHint.textContent = expiresAtText
      ? `A verification code was sent to ${pending.email}. It expires at ${expiresAtText}.`
      : `A verification code was sent to ${pending.email}.`;
    emailVerifyBlock.hidden = false;
  }

  function applyProfile(profile) {
    if (!profile) {
      return;
    }
    profileData = profile;
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
    if (emailInput) {
      emailInput.value = profile.email || profile.pendingEmailVerification?.email || "";
    }
    if (homeGreetingName) {
      homeGreetingName.textContent = displayName;
    }
    if (homeGreeting) {
      homeGreeting.hidden = false;
    }
    updateAvatar(profileImageEl, profileInitialEl, profile.profileImageUrl || null, displayName);
    updateEmailVerificationUi(profile);
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
    setStatus("", false);
  }

  async function loadProfile() {
    try {
      const response = await fetch("/api/me", { credentials: "same-origin" });
      if (!response.ok) {
        throw new Error("Could not load profile.");
      }
      const data = await response.json();
      applyProfile(data);
      return data;
    } catch (_err) {
      setStatus("Unable to load profile right now.", true);
      return null;
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
        const response = await fetch("/api/profile/avatar", {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Upload failed.");
        }
        avatarInput.value = "";
        await loadProfile();
        setStatus("Profile picture updated.", false);
      } catch (err) {
        setStatus(err?.message || "Upload failed.", true);
        if (window.showToast) {
          window.showToast(err?.message || "Upload failed.", { type: "error" });
        }
      } finally {
        setButtonBusy(submitButton, false, "");
        if (loadingToast) {
          loadingToast.close();
        }
      }
    });
  }

  if (emailForm) {
    emailForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = emailInput?.value?.trim() || "";
      if (!value) {
        setStatus("Email address cannot be empty.", true);
        if (window.showToast) {
          window.showToast("Email address cannot be empty.", { type: "error" });
        }
        return;
      }
      const submitButton = emailForm.querySelector('button[type="submit"]');
      const loadingToast = window.showToast
        ? window.showToast("Saving email address...", { type: "loading", sticky: true })
        : null;
      setButtonBusy(submitButton, true, "Saving...");
      setStatus("Saving email address...", false);
      try {
        const response = await fetch("/api/profile/email", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Could not save your email address.");
        }
        await loadProfile();
        if (payload.verified) {
          setStatus("Email already verified.", false);
          if (window.showToast) {
            window.showToast("Email is already verified.", { type: "success" });
          }
        } else if (payload.debugCode) {
          setStatus(`Use this verification code: ${payload.debugCode}`, false);
          if (window.showToast) {
            window.showToast("Verification code generated. Use the code shown in the panel.", { type: "success" });
          }
        } else {
          setStatus("Verification code sent. Enter the 6-digit code below.", false);
          if (window.showToast) {
            window.showToast("Verification code sent to your email.", { type: "success" });
          }
        }
      } catch (err) {
        setStatus(err?.message || "Could not save email address.", true);
        if (window.showToast) {
          window.showToast(err?.message || "Could not save email address.", { type: "error" });
        }
      } finally {
        setButtonBusy(submitButton, false, "");
        if (loadingToast) {
          loadingToast.close();
        }
      }
    });
  }

  if (emailVerifyForm) {
    emailVerifyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = emailCodeInput?.value?.trim() || "";
      if (!code) {
        setStatus("Enter the verification code from your email.", true);
        return;
      }
      const submitButton = emailVerifyForm.querySelector('button[type="submit"]');
      const loadingToast = window.showToast
        ? window.showToast("Verifying email...", { type: "loading", sticky: true })
        : null;
      setButtonBusy(submitButton, true, "Verifying...");
      setStatus("Verifying email...", false);
      try {
        const response = await fetch("/api/profile/email/verify", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Could not verify email.");
        }
        if (emailCodeInput) {
          emailCodeInput.value = "";
        }
        await loadProfile();
        setStatus("Email verified successfully.", false);
        if (window.showToast) {
          window.showToast("Email verified.", { type: "success" });
        }
      } catch (err) {
        setStatus(err?.message || "Could not verify email.", true);
        if (window.showToast) {
          window.showToast(err?.message || "Could not verify email.", { type: "error" });
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
