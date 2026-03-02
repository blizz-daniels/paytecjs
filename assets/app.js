const menuButton = document.getElementById('menuButton');
const nav = document.getElementById('mainNav');
const mobileNavQuery = window.matchMedia ? window.matchMedia("(max-width: 760px)") : null;
let navOverlay = null;

function isMobileNavLayout() {
  if (mobileNavQuery) {
    return mobileNavQuery.matches;
  }
  return window.innerWidth <= 760;
}

function setMobileNavState(isOpen) {
  if (!menuButton || !nav) {
    return;
  }

  const mobileLayout = isMobileNavLayout();
  const shouldOpen = mobileLayout ? Boolean(isOpen) : false;

  nav.classList.toggle("open", shouldOpen);
  nav.setAttribute("aria-hidden", mobileLayout ? String(!shouldOpen) : "false");
  menuButton.setAttribute("aria-expanded", String(shouldOpen));
  document.body.classList.toggle("has-mobile-nav", shouldOpen);

  if (navOverlay) {
    navOverlay.hidden = !shouldOpen;
    navOverlay.classList.toggle("open", shouldOpen);
  }
}

function closeMobileNav() {
  setMobileNavState(false);
}

if (menuButton && nav) {
  menuButton.setAttribute("aria-controls", "mainNav");
  menuButton.setAttribute("aria-expanded", "false");
  nav.setAttribute("aria-hidden", "true");

  navOverlay = document.createElement("button");
  navOverlay.type = "button";
  navOverlay.className = "nav-overlay";
  navOverlay.hidden = true;
  navOverlay.tabIndex = -1;
  navOverlay.setAttribute("aria-label", "Close navigation");
  navOverlay.addEventListener("click", closeMobileNav);
  document.body.appendChild(navOverlay);

  menuButton.addEventListener("click", (event) => {
    event.preventDefault();
    const isOpen = nav.classList.contains("open");
    setMobileNavState(!isOpen);
  });

  nav.addEventListener("click", (event) => {
    if (!isMobileNavLayout()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const navLink = target.closest("a[href]");
    const profileTrigger = target.closest(".profile-trigger");
    if (navLink || profileTrigger) {
      closeMobileNav();
    }
  });

  document.addEventListener("click", (event) => {
    if (!isMobileNavLayout() || !nav.classList.contains("open")) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (menuButton.contains(target) || nav.contains(target)) {
      return;
    }
    closeMobileNav();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("open")) {
      closeMobileNav();
    }
  });

  window.addEventListener("resize", () => {
    if (!isMobileNavLayout()) {
      closeMobileNav();
      return;
    }
    setMobileNavState(nav.classList.contains("open"));
  });

  if (mobileNavQuery && typeof mobileNavQuery.addEventListener === "function") {
    mobileNavQuery.addEventListener("change", () => {
      if (!isMobileNavLayout()) {
        closeMobileNav();
        return;
      }
      setMobileNavState(nav.classList.contains("open"));
    });
  }

  setMobileNavState(false);
}

function normalizePath(pathname) {
  if (!pathname) {
    return "/";
  }
  const clean = pathname.toLowerCase();
  return clean.endsWith("/") && clean.length > 1 ? clean.slice(0, -1) : clean;
}

function getNavItemPath(node) {
  if (!node || node.tagName !== "A") {
    return "";
  }
  const href = node.getAttribute("href") || "";
  if (!href || href.startsWith("#")) {
    return "";
  }
  try {
    const url = new URL(href, window.location.origin);
    return normalizePath(url.pathname);
  } catch (_err) {
    return "";
  }
}

const homeNavPaths = new Set(["/", "/index.html"]);
const sidebarPartialPaths = new Set([
  "/",
  "/index.html",
  "/notifications.html",
  "/handouts.html",
  "/payments",
  "/payments.html",
  "/messages",
  "/messages.html",
  "/lecturer",
  "/teacher",
  "/lecturer.html",
  "/teacher.html",
  "/analytics",
  "/analytics.html",
]);
const partialNavCoreScriptPaths = new Set(["/assets/csrf.js", "/assets/app.js", "/assets/profile.js"]);
const loadedPageScripts = new Map();
let partialContentNavigationToken = 0;

function isSameActivePath(leftPath, rightPath) {
  if (!leftPath || !rightPath) {
    return false;
  }
  const canonicalize = (path) => {
    const normalized = normalizePath(path);
    if (homeNavPaths.has(normalized)) {
      return "/";
    }
    if (normalized === "/payments" || normalized === "/payments.html") {
      return "/payments";
    }
    if (normalized === "/messages" || normalized === "/messages.html") {
      return "/messages";
    }
    if (normalized === "/lecturer" || normalized === "/teacher" || normalized === "/lecturer.html" || normalized === "/teacher.html") {
      return "/lecturer";
    }
    if (normalized === "/analytics" || normalized === "/analytics.html") {
      return "/analytics";
    }
    return normalized;
  };
  return canonicalize(leftPath) === canonicalize(rightPath);
}

function updateActiveNavLinks(pathname = window.location.pathname) {
  if (!nav) {
    return;
  }
  const activePath = normalizePath(pathname);
  const links = nav.querySelectorAll("a[href]");
  links.forEach((link) => {
    const linkPath = getNavItemPath(link);
    if (!linkPath) {
      return;
    }
    const isActive = isSameActivePath(linkPath, activePath);
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
      return;
    }
    link.removeAttribute("aria-current");
  });
}

function inferPageKeyFromPath(pathname) {
  const path = normalizePath(pathname);
  if (homeNavPaths.has(path)) {
    return "home";
  }
  if (path === "/notifications.html") {
    return "notifications";
  }
  if (path === "/handouts.html") {
    return "handouts";
  }
  if (path === "/payments" || path === "/payments.html") {
    return "payments";
  }
  if (path === "/messages" || path === "/messages.html") {
    return "messages";
  }
  if (path === "/lecturer" || path === "/teacher" || path === "/lecturer.html" || path === "/teacher.html") {
    return "lecturer";
  }
  if (path === "/analytics" || path === "/analytics.html") {
    return "analytics";
  }
  return "";
}

function resolvePageKey(pathname, datasetPage = "") {
  const explicit = String(datasetPage || "")
    .trim()
    .toLowerCase();
  if (explicit) {
    return explicit;
  }
  return inferPageKeyFromPath(pathname);
}

function seedLoadedScriptsFromDocument() {
  const scripts = document.querySelectorAll("script[src]");
  scripts.forEach((script) => {
    const rawSrc = String(script.getAttribute("src") || "").trim();
    if (!rawSrc) {
      return;
    }
    let url;
    try {
      url = new URL(rawSrc, window.location.origin).toString();
    } catch (_err) {
      return;
    }
    if (!loadedPageScripts.has(url)) {
      loadedPageScripts.set(url, Promise.resolve());
    }
  });
}

function parsePageScriptUrls(doc) {
  const scripts = doc.querySelectorAll("script[src]");
  const urls = [];
  const seen = new Set();
  scripts.forEach((script) => {
    const rawSrc = String(script.getAttribute("src") || "").trim();
    if (!rawSrc) {
      return;
    }
    let url;
    try {
      url = new URL(rawSrc, window.location.origin);
    } catch (_err) {
      return;
    }
    const normalizedPath = normalizePath(url.pathname);
    if (partialNavCoreScriptPaths.has(normalizedPath)) {
      return;
    }
    const absoluteUrl = url.toString();
    if (seen.has(absoluteUrl)) {
      return;
    }
    seen.add(absoluteUrl);
    urls.push(absoluteUrl);
  });
  return urls;
}

function ensureScriptLoaded(scriptUrl) {
  if (loadedPageScripts.has(scriptUrl)) {
    return loadedPageScripts.get(scriptUrl);
  }
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = false;
    script.dataset.partialNavLoaded = "1";
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      loadedPageScripts.delete(scriptUrl);
      script.remove();
      reject(new Error(`Could not load script ${scriptUrl}`));
    });
    document.body.appendChild(script);
  });
  loadedPageScripts.set(scriptUrl, promise);
  return promise;
}

async function ensurePageScriptsLoaded(doc) {
  const urls = parsePageScriptUrls(doc);
  for (const scriptUrl of urls) {
    await ensureScriptLoaded(scriptUrl);
  }
}

function runPageInitializer(pageKey) {
  if (pageKey === "home" || pageKey === "notifications" || pageKey === "handouts") {
    if (typeof window.initContentPage === "function") {
      window.initContentPage({ preserveFilters: false });
    }
    return;
  }
  if (pageKey === "payments") {
    if (typeof window.initPaymentsPage === "function") {
      window.initPaymentsPage();
    }
    return;
  }
  if (pageKey === "messages") {
    if (typeof window.initMessagesPage === "function") {
      window.initMessagesPage();
    }
    return;
  }
  if (pageKey === "lecturer") {
    if (typeof window.initLecturerPage === "function") {
      window.initLecturerPage();
    }
    return;
  }
  if (pageKey === "analytics") {
    if (typeof window.initAnalyticsPage === "function") {
      window.initAnalyticsPage();
    }
  }
}

function canUseSidebarPartialNavigation(url) {
  if (!(url instanceof URL)) {
    return false;
  }
  if (url.origin !== window.location.origin) {
    return false;
  }
  const currentPath = normalizePath(window.location.pathname);
  const targetPath = normalizePath(url.pathname);
  if (!sidebarPartialPaths.has(currentPath) || !sidebarPartialPaths.has(targetPath)) {
    return false;
  }
  return true;
}

async function loadDocumentForPartialNavigation(url) {
  const response = await fetch(url.toString(), {
    credentials: "same-origin",
    headers: {
      "X-Requested-With": "partial-navigation",
    },
  });
  if (!response.ok) {
    throw new Error(`Could not load ${url.pathname}.`);
  }
  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

function applyPartialContentDocument(doc, url) {
  const currentMain = document.querySelector("main.container");
  const incomingMain = doc.querySelector("main.container");
  if (!currentMain || !incomingMain) {
    throw new Error("Could not locate page container for partial navigation.");
  }
  currentMain.replaceWith(incomingMain.cloneNode(true));

  const currentFooter = document.querySelector("footer.footer");
  const incomingFooter = doc.querySelector("footer.footer");
  if (currentFooter && incomingFooter) {
    currentFooter.replaceWith(incomingFooter.cloneNode(true));
  } else if (currentFooter && !incomingFooter) {
    currentFooter.remove();
  } else if (!currentFooter && incomingFooter && document.body) {
    document.body.appendChild(incomingFooter.cloneNode(true));
  }

  const nextPage = resolvePageKey(url.pathname, doc.body?.dataset?.page || "");
  if (nextPage) {
    document.body.dataset.page = nextPage;
  } else {
    delete document.body.dataset.page;
  }
  if (doc.title) {
    document.title = doc.title;
  }

  updateActiveNavLinks(url.pathname);
  closeMobileNav();
  if (typeof window.enhanceFileInputs === "function") {
    window.enhanceFileInputs(document);
  }
  return nextPage;
}

async function navigateWithPartialContent(url, { pushHistory = true } = {}) {
  const requestToken = partialContentNavigationToken + 1;
  partialContentNavigationToken = requestToken;
  const main = document.querySelector("main.container");
  if (main) {
    main.setAttribute("aria-busy", "true");
  }

  try {
    const doc = await loadDocumentForPartialNavigation(url);
    if (partialContentNavigationToken !== requestToken) {
      return;
    }
    const nextPage = applyPartialContentDocument(doc, url);
    await ensurePageScriptsLoaded(doc);
    if (partialContentNavigationToken !== requestToken) {
      return;
    }
    runPageInitializer(nextPage);
    toggleTeacherRoleLinks();
    if (pushHistory) {
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.pushState({ partialContent: true }, "", nextUrl);
    }
  } catch (_err) {
    if (partialContentNavigationToken !== requestToken) {
      return;
    }
    window.location.assign(url.toString());
  } finally {
    if (partialContentNavigationToken === requestToken) {
      if (main) {
        main.removeAttribute("aria-busy");
      }
      const latestMain = document.querySelector("main.container");
      if (latestMain) {
        latestMain.removeAttribute("aria-busy");
      }
    }
  }
}

function isUnmodifiedPrimaryClick(event) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function bindPartialContentNavigation() {
  seedLoadedScriptsFromDocument();
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !isUnmodifiedPrimaryClick(event)) {
      return;
    }
    const anchor = event.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }
    if (!anchor.closest("#mainNav")) {
      return;
    }
    if (anchor.hasAttribute("download")) {
      return;
    }
    const targetAttr = String(anchor.getAttribute("target") || "").trim().toLowerCase();
    if (targetAttr && targetAttr !== "_self") {
      return;
    }
    const rel = String(anchor.getAttribute("rel") || "").toLowerCase();
    if (rel.includes("external")) {
      return;
    }
    const href = String(anchor.getAttribute("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    let url;
    try {
      url = new URL(href, window.location.origin);
    } catch (_err) {
      return;
    }
    if (!canUseSidebarPartialNavigation(url)) {
      return;
    }

    const current = new URL(window.location.href);
    if (normalizePath(current.pathname) === normalizePath(url.pathname) && current.search === url.search) {
      return;
    }

    event.preventDefault();
    navigateWithPartialContent(url, { pushHistory: true });
  });

  window.addEventListener("popstate", () => {
    const target = new URL(window.location.href);
    if (!canUseSidebarPartialNavigation(target)) {
      return;
    }
    navigateWithPartialContent(target, { pushHistory: false });
  });
}

function arrangeSidebarNav() {
  if (!nav) {
    return;
  }

  if (nav.querySelector(".nav-section")) {
    return;
  }

  const topSection = document.createElement("div");
  topSection.className = "nav-section nav-section--top";
  const middleSection = document.createElement("div");
  middleSection.className = "nav-section nav-section--middle";
  const bottomSection = document.createElement("div");
  bottomSection.className = "nav-section nav-section--bottom";

  const homePaths = homeNavPaths;
  const notificationPaths = new Set(["/notifications.html"]);
  const handoutPaths = new Set(["/handouts.html"]);
  const paymentPaths = new Set(["/payments", "/payments.html"]);
  const messagePaths = new Set(["/messages", "/messages.html"]);
  const analyticsPaths = new Set(["/analytics", "/analytics.html"]);

  const allChildren = Array.from(nav.children);
  let profileButton = null;
  let themeToggle = null;
  let logoutForm = null;

  allChildren.forEach((node) => {
    if (node.id === "profileToggleButton") {
      profileButton = node;
      return;
    }
    if (node.id === "themeToggleWrap") {
      themeToggle = node;
      return;
    }
    if (node.classList && node.classList.contains("logout-form")) {
      logoutForm = node;
      return;
    }

    const path = getNavItemPath(node);
    if (homePaths.has(path) || notificationPaths.has(path)) {
      topSection.appendChild(node);
      return;
    }
    if (handoutPaths.has(path) || paymentPaths.has(path) || messagePaths.has(path) || analyticsPaths.has(path)) {
      middleSection.appendChild(node);
      return;
    }
    bottomSection.appendChild(node);
  });

  nav.replaceChildren(topSection, middleSection, bottomSection);

  if (profileButton) {
    bottomSection.appendChild(profileButton);
  }
  if (themeToggle) {
    bottomSection.appendChild(themeToggle);
  }
  if (logoutForm) {
    bottomSection.appendChild(logoutForm);
  }
}

function buildFileInputButtonLabel(input) {
  const id = String(input?.id || "")
    .trim()
    .toLowerCase();
  const name = String(input?.name || "")
    .trim()
    .toLowerCase();
  const token = `${id} ${name}`;
  if (token.includes("avatar") || token.includes("profile")) {
    return "Upload Photo";
  }
  if (token.includes("csv")) {
    return "Choose CSV File";
  }
  if (token.includes("handout")) {
    return "Choose Handout File";
  }
  if (token.includes("shared")) {
    return "Choose Media File";
  }
  return "Choose File";
}

function formatSelectedFileNames(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) {
    return "No file selected";
  }
  if (files.length === 1) {
    return files[0].name || "1 file selected";
  }
  if (files.length === 2) {
    return `${files[0].name}, ${files[1].name}`;
  }
  return `${files[0].name}, ${files[1].name} +${files.length - 2} more`;
}

function enhanceFileInputs(root = document) {
  const scope = root instanceof Element || root instanceof Document ? root : document;
  const inputs = scope.querySelectorAll('input[type="file"]:not([data-file-theme="ready"])');
  inputs.forEach((input, index) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    let id = String(input.id || "").trim();
    if (!id) {
      id = `fileInput-${Date.now()}-${index}`;
      input.id = id;
    }

    input.dataset.fileTheme = "ready";
    input.classList.add("file-input-theme__native");

    const wrapper = document.createElement("div");
    wrapper.className = "file-input-theme";

    const control = document.createElement("div");
    control.className = "file-input-theme__control";

    const button = document.createElement("label");
    button.className = "btn btn-secondary file-input-theme__button";
    button.setAttribute("for", id);
    button.textContent = buildFileInputButtonLabel(input);

    const filename = document.createElement("span");
    filename.className = "file-input-theme__name";
    filename.textContent = formatSelectedFileNames(input.files);

    control.append(button, filename);
    wrapper.append(control);

    const parent = input.parentElement;
    if (!parent) {
      return;
    }
    parent.insertBefore(wrapper, input.nextSibling);

    input.addEventListener("change", () => {
      filename.textContent = formatSelectedFileNames(input.files);
    });
  });
}

window.enhanceFileInputs = enhanceFileInputs;

async function toggleTeacherRoleLinks() {
  const teacherLinks = document.querySelectorAll('[data-role-link="lecturer"], [data-role-link="analytics"]');
  if (!teacherLinks.length) {
    return;
  }

  try {
    const response = await fetch('/api/me', { credentials: 'same-origin' });
    if (!response.ok) {
      return;
    }

    const user = await response.json();
    const canSeeTeacherLinks = user && (user.role === 'teacher' || user.role === 'admin');
    teacherLinks.forEach((link) => {
      link.hidden = !canSeeTeacherLinks;
    });
  } catch (_err) {
    // Keep links hidden if role lookup fails.
  }
}

toggleTeacherRoleLinks();
enhanceFileInputs(document);
bindPartialContentNavigation();

if (document.body && typeof MutationObserver === "function") {
  const fileInputObserver = new MutationObserver(() => {
    enhanceFileInputs(document);
  });
  fileInputObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

(function initThemeToggle() {
  const storageKey = "campuspay-theme";
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const savedTheme = localStorage.getItem(storageKey);
  const initialTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : prefersDark ? "dark" : "light";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const toggleInput = document.getElementById("themeToggleButton");
    const toggleLabel = document.getElementById("themeToggleLabel");
    if (toggleInput) {
      const isDark = theme === "dark";
      toggleInput.checked = isDark;
      toggleInput.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    }
    if (toggleLabel) {
      toggleLabel.textContent = theme === "dark" ? "Dark" : "Light";
    }
  }

  applyTheme(initialTheme);

  if (!nav) {
    return;
  }

  let themeWrap = document.getElementById("themeToggleWrap");
  if (!themeWrap) {
    themeWrap = document.createElement("label");
    themeWrap.id = "themeToggleWrap";
    themeWrap.className = "theme-switch";
    themeWrap.innerHTML = `
      <input id="themeToggleButton" type="checkbox" role="switch" />
      <span class="theme-switch__track" aria-hidden="true"></span>
      <span class="theme-switch__icon theme-switch__sun" aria-hidden="true">Sun</span>
      <span class="theme-switch__icon theme-switch__moon" aria-hidden="true">Moon</span>
      <span id="themeToggleLabel" class="theme-switch__label">Light</span>
    `;
    const profileButton = nav.querySelector("#profileToggleButton");
    if (profileButton) {
      nav.insertBefore(themeWrap, profileButton);
    } else {
      nav.appendChild(themeWrap);
    }
  }

  applyTheme(document.documentElement.getAttribute("data-theme") || initialTheme);
  arrangeSidebarNav();
  updateActiveNavLinks(window.location.pathname);

  const themeInput = document.getElementById("themeToggleButton");
  if (!themeInput) {
    return;
  }
  themeInput.addEventListener("change", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(storageKey, next);
    applyTheme(next);
    if (window.showToast) {
      window.showToast(next === "dark" ? "Dark mode enabled." : "Light mode enabled.", { type: "success" });
    }
  });
})();

(function initToastSystem() {
  const hostId = "toastHost";

  function ensureHost() {
    let host = document.getElementById(hostId);
    if (host) {
      return host;
    }
    host = document.createElement("div");
    host.id = hostId;
    host.className = "toast-host";
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-atomic", "true");
    document.body.appendChild(host);
    return host;
  }

  function closeToast(node) {
    if (!node || !node.parentElement) {
      return;
    }
    node.classList.add("toast--closing");
    window.setTimeout(() => {
      if (node.parentElement) {
        node.remove();
      }
    }, 220);
  }

  window.showToast = function showToast(message, options = {}) {
    if (!message) {
      return { close() {} };
    }
    const { type = "info", duration = 2600, sticky = false } = options;
    const host = ensureHost();
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span class="toast__text"></span>
      <button type="button" class="toast__close" aria-label="Close notification">&times;</button>
    `;
    toast.querySelector(".toast__text").textContent = String(message);
    const closeButton = toast.querySelector(".toast__close");
    closeButton.addEventListener("click", () => closeToast(toast));
    host.appendChild(toast);

    if (!sticky) {
      window.setTimeout(() => closeToast(toast), duration);
    }

    return {
      close() {
        closeToast(toast);
      },
    };
  };
})();
