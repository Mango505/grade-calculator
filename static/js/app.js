/**
 * app.js – Shell: router, mode switcher, user switcher, dark mode, FAB, snackbar, skeletons
 */
import { openDialog } from "./components.js";

const MODES = {
  grades: {
    label: "Notenrechner",
    icon: "school",
    defaultPage: "overview",
    pages: [
      { key: "overview", label: "Übersicht", icon: "bar_chart" },
      { key: "wallet",   label: "Konto & Verlauf", icon: "account_balance_wallet" },
      { key: "stats",    label: "Statistiken", icon: "insights" },
      { key: "settings", label: "Einstellungen", icon: "settings" },
    ],
  },
  chores: {
    label: "Taschengeld",
    icon: "payments",
    defaultPage: "tasks",
    pages: [
      { key: "tasks",    label: "Aufgaben", icon: "checklist" },
      { key: "wallet",   label: "Konto & Verlauf", icon: "account_balance_wallet" },
      { key: "settings", label: "Einstellungen", icon: "settings" },
    ],
  },
};

const MODE_KEY = "nt-mode";
const USER_KEY = "nt-user";
let currentMode = localStorage.getItem(MODE_KEY) || "grades";
let currentUser = localStorage.getItem(USER_KEY);

const PAGES = {
  overview: { title: "Übersicht",      loader: () => import("/static/js/pages/overview.js") },
  wallet:   { title: "Konto & Verlauf", loader: () => import("/static/js/pages/wallet.js")   },
  stats:    { title: "Statistiken",    loader: () => import("/static/js/pages/stats.js")    },
  settings: { title: "Einstellungen",  loader: () => import("/static/js/pages/settings.js") },
  tasks:    { title: "Aufgaben",       loader: () => import("/static/js/pages/tasks.js")    },
};
const DEFAULT_PAGE = "overview";

const navDrawer      = document.getElementById("navDrawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const pageContainer  = document.getElementById("pageContainer");
const pageTitle      = document.getElementById("pageTitle");
const navFab         = document.getElementById("navFab");
const mobFab         = document.getElementById("mobFab");

// ---------------------------------------------------------------------------
// Mode switcher
// ---------------------------------------------------------------------------
export function getCurrentMode() {
  return currentMode;
}

export function getCurrentUser() {
  return currentUser;
}

function switchUser(name) {
  if (name === currentUser) return;
  currentUser = name;
  localStorage.setItem(USER_KEY, name);
  updateUserSwitcherUI();
  closeUserDropdown();
  renderPage(currentPageKey());
}

function updateUserSwitcherUI() {
  const nameEl = document.getElementById("userSwitcherName");
  if (nameEl) nameEl.textContent = currentUser;
}

async function renderUserSwitcher() {
  let users;
  try {
    users = await apiFetch("/api/users");
  } catch { return; }

  if (!Array.isArray(users) || users.length === 0) return;

  if (!users.includes(currentUser)) {
    switchUser(users[0]);
  }

  const menu = document.getElementById("userSwitcherMenu");
  if (!menu) return;

  menu.innerHTML = users.map(function (name) {
    return '<button class="user-switcher-item" data-user="' + name + '" role="menuitem">' +
      '<span class="material-symbols-rounded">person</span>' +
      '<span>' + name + '</span>' +
      (name === currentUser
        ? '<span class="material-symbols-rounded" style="margin-left:auto;font-size:18px">check</span>'
        : "") +
    '</button>';
  }).join("") +
    '<div class="user-switcher-divider"></div>' +
    '<button class="user-switcher-item" id="userAddBtn" role="menuitem">' +
      '<span class="material-symbols-rounded">add</span>' +
      '<span>Benutzer hinzuf\u00fcgen\u2026</span>' +
    '</button>';

  menu.querySelectorAll("[data-user]").forEach(function (btn) {
    btn.addEventListener("click", function () { switchUser(btn.dataset.user); });
  });

  menu.querySelector("#userAddBtn")?.addEventListener("click", function () {
    closeUserDropdown();
    showCreateUserDialog(false).then(function () { renderUserSwitcher(); });
  });
}

function toggleUserDropdown() {
  const overlay = document.getElementById("userSwitcherOverlay");
  if (!overlay) return;
  const hidden = overlay.hasAttribute("hidden");
  if (hidden) {
    renderUserSwitcher();
    overlay.removeAttribute("hidden");
  } else {
    overlay.setAttribute("hidden", "");
  }
}

function closeUserDropdown() {
  const el = document.getElementById("userSwitcherOverlay");
  if (el) el.setAttribute("hidden", "");
}

function switchMode(mode) {
  if (!(mode in MODES) || mode === currentMode) return;
  currentMode = mode;
  localStorage.setItem(MODE_KEY, mode);
  renderNavItems();
  updateModeSwitcherUI();
  closeModeDropdown();
  navigateTo(MODES[mode].defaultPage);
}

function renderNavItems() {
  const mode = MODES[currentMode];

  const drawerList = document.getElementById("navDrawerList");
  drawerList.innerHTML = mode.pages.map(p =>
    '<li><a href="#' + p.key + '" class="nav-item" data-page="' + p.key + '">' +
      '<span class="material-symbols-rounded">' + p.icon + '</span> ' + p.label +
    '</a></li>'
  ).join("");

  const bottomNav = document.getElementById("bottomNav");
  bottomNav.innerHTML = mode.pages.map(p =>
    '<a href="#' + p.key + '" class="bottom-nav__item" data-page="' + p.key + '">' +
      '<span class="material-symbols-rounded">' + p.icon + '</span>' +
      '<span>' + p.label + '</span>' +
    '</a>'
  ).join("");
}

function updateModeSwitcherUI() {
  const mode = MODES[currentMode];
  const iconEl = document.getElementById("drawerModeIcon");
  const titleEl = document.getElementById("drawerModeTitle");
  const topIconEl = document.getElementById("topModeIcon");
  if (iconEl) iconEl.textContent = mode.icon;
  if (titleEl) titleEl.textContent = mode.label;
  if (topIconEl) topIconEl.textContent = mode.icon;
}

function toggleModeDropdown() {
  const overlay = document.getElementById("modeSwitcherOverlay");
  const hidden = overlay.hasAttribute("hidden");
  if (hidden) {
    overlay.removeAttribute("hidden");
  } else {
    overlay.setAttribute("hidden", "");
  }
}

function closeModeDropdown() {
  const overlay = document.getElementById("modeSwitcherOverlay");
  if (overlay) overlay.setAttribute("hidden", "");
}

document.getElementById("drawerSwitcherBtn")?.addEventListener("click", toggleModeDropdown);
document.getElementById("modeSwitcherTop")?.addEventListener("click", toggleModeDropdown);

document.getElementById("modeSwitcherOverlay")?.addEventListener("click", closeModeDropdown);

document.getElementById("modeSwitcherMenu")?.addEventListener("click", e => e.stopPropagation());

document.querySelectorAll("[data-mode]").forEach(btn => {
  btn.addEventListener("click", () => switchMode(btn.dataset.mode));
});

// User switcher
document.getElementById("userSwitcherBtn")?.addEventListener("click", toggleUserDropdown);
document.getElementById("userSwitcherMobile")?.addEventListener("click", toggleUserDropdown);
document.getElementById("userSwitcherOverlay")?.addEventListener("click", closeUserDropdown);
document.getElementById("userSwitcherMenu")?.addEventListener("click", e => e.stopPropagation());

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function currentPageKey() {
  const hash = location.hash.replace("#", "").trim();
  return hash in PAGES ? hash : MODES[currentMode].defaultPage;
}

export function navigateTo(key) {
  if (!(key in PAGES)) key = MODES[currentMode].defaultPage;
  history.pushState(null, "", "#" + key);
  renderPage(key);
}

async function renderPage(key) {
  const page = PAGES[key];
  if (!page) return;

  clearPrimaryAction();
  updateActiveNav(key);
  if (pageTitle) pageTitle.textContent = page.title;

  document.getElementById("ov-overflow-btn")?.remove();
  document.getElementById("ov-overflow-menu")?.remove();

  pageContainer.innerHTML =
    '<div class="page-placeholder">' +
      '<span class="material-symbols-rounded page-placeholder__icon">hourglass_top</span>' +
      '<p>Lade\u2026</p>' +
    '</div>';

  try {
    const mod = await page.loader();
    if (typeof mod.default === "function") {
      pageContainer.innerHTML = "";
      await mod.default(pageContainer);
    }
  } catch (err) {
    console.error("Page '" + key + "' failed:", err);
    pageContainer.innerHTML =
      '<div class="page-placeholder">' +
        '<span class="material-symbols-rounded page-placeholder__icon" style="color:var(--md-sys-color-error)">error</span>' +
        '<p style="font-size:13px;color:var(--md-sys-color-on-surface-variant)">' + err.message + '</p>' +
      '</div>';
  }
}

function updateActiveNav(key) {
  document.querySelectorAll("[data-page]").forEach(item => {
    const active = item.dataset.page === key;
    item.classList.toggle("nav-item--active",         active && !!item.closest(".nav-drawer"));
    item.classList.toggle("bottom-nav__item--active", active && !!item.closest(".bottom-nav"));
  });
}

// ---------------------------------------------------------------------------
// Drawer (mobile only)
// ---------------------------------------------------------------------------
function closeDrawer() {
  navDrawer.classList.remove("open");
  drawerBackdrop.classList.remove("visible");
}

drawerBackdrop?.addEventListener("click", closeDrawer);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

// Nav click delegation
document.addEventListener("click", e => {
  const navItem = e.target.closest("[data-page]");
  if (!navItem) return;
  e.preventDefault();
  closeDrawer();
  navigateTo(navItem.dataset.page);
});

window.addEventListener("popstate", () => renderPage(currentPageKey()));

// ---------------------------------------------------------------------------
// Primary Action FAB
// ---------------------------------------------------------------------------
let _fabCallback = null;

export function setPrimaryAction(icon, label, callback) {
  _fabCallback = callback;
  const iconEl  = document.getElementById("navFabIcon");
  const labelEl = document.getElementById("navFabLabel");
  const mobIcon = document.getElementById("mobFabIcon");
  if (iconEl)  iconEl.textContent  = icon;
  if (labelEl) labelEl.textContent = label;
  if (mobIcon) mobIcon.textContent = icon;
  if (navFab) navFab.removeAttribute("hidden");
  mobFab?.removeAttribute("hidden");
}

export function clearPrimaryAction() {
  _fabCallback = null;
  if (navFab) navFab.setAttribute("hidden", "");
  mobFab?.setAttribute("hidden", "");
}

navFab?.addEventListener("click", () => _fabCallback?.());
mobFab?.addEventListener("click", () => _fabCallback?.());

// ---------------------------------------------------------------------------
// API fetch helper
// ---------------------------------------------------------------------------
export async function apiFetch(url, options = {}) {
  const user = localStorage.getItem(USER_KEY);
  if (!user && !url.startsWith("/api/users")) throw new Error("Kein Benutzer ausgew\u00e4hlt");
  const sep = url.includes("?") ? "&" : "?";
  const urlWithUser = user ? url + sep + "user=" + encodeURIComponent(user) : url;
  const res  = await fetch(urlWithUser, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  if (res.status === 204) return undefined;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.description ?? body?.error ?? "HTTP " + res.status);
  return body;
}

// ---------------------------------------------------------------------------
// Startup status check
// ---------------------------------------------------------------------------
async function checkStartupStatus() {
  let status, appCfg;
  try {
    [status, appCfg] = await Promise.all([
      apiFetch("/api/startup-status"),
      apiFetch("/api/app-config"),
    ]);
  } catch { return; }

  const ok      = status.files.filter(f => f.status === "ok");
  const missing = status.files.filter(f => f.status === "missing");
  const corrupt = status.files.filter(f => f.status === "corrupt");

  if (appCfg.verbose_loading && ok.length)
    setTimeout(() => showSnackbar(ok.map(f => f.name).join(", ") + " geladen."), 600);

  if (missing.length || corrupt.length)
    _showLoadErrorDialog(missing, corrupt);
}

function _showLoadErrorDialog(missing, corrupt) {
  document.getElementById("load-error-dialog")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "load-error-dialog";

  function fileRow(f) {
    return '<div style="margin-bottom:8px">' +
      '<div style="font-size:13px;margin-bottom:4px">' + f.name + '</div>' +
      '<code style="display:block;padding:8px 10px;border-radius:6px;font-size:12px;' +
      'background:var(--md-sys-color-surface-container-high);word-break:break-all">' +
      f.path + '</code></div>';
  }

  const missingSection = missing.length
    ? '<p style="font-size:14px;font-weight:600;margin-bottom:8px">Datei nicht gefunden:</p>' + missing.map(fileRow).join("")
    : "";
  const corruptSection = corrupt.length
    ? '<p style="font-size:14px;font-weight:600;margin-top:8px;margin-bottom:8px">Datei besch\u00e4digt:</p>' + corrupt.map(fileRow).join("")
    : "";

  wrap.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;' +
    'display:flex;align-items:center;justify-content:center;padding:24px">' +
      '<div style="background:var(--md-sys-color-surface-container-high);border-radius:28px;' +
      'max-width:520px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:hidden">' +
        '<div style="padding:24px 24px 0;font-size:22px;font-weight:500;color:var(--md-sys-color-error)">' +
          '\u26A0 Ladefehler</div>' +
        '<div style="padding:16px 24px;max-height:60vh;overflow-y:auto">' +
          missingSection + corruptSection +
          '<p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-top:12px">' +
          'Beim Fortfahren werden Standardwerte geladen.</p>' +
        '</div>' +
        '<div style="padding:12px 24px 20px;display:flex;justify-content:flex-end">' +
          '<button id="loadErrOk" style="padding:10px 24px;border-radius:50px;border:none;' +
          'background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);' +
          'font-size:14px;font-weight:500;font-family:inherit;cursor:pointer">Fortfahren</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(wrap);
  wrap.querySelector("#loadErrOk").addEventListener("click", () => wrap.remove());
}

// ---------------------------------------------------------------------------
// Snackbar
// ---------------------------------------------------------------------------
let _snackbarTimer = null;

export function showSnackbar(message, type = "info") {
  let bar = document.getElementById("snackbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "snackbar";
    Object.assign(bar.style, {
      position: "fixed", bottom: "calc(var(--bottom-nav-height, 0px) + 16px)",
      left: "50%", transform: "translateX(-50%)",
      padding: "12px 20px", borderRadius: "var(--shape-corner-small)",
      fontSize: "14px", maxWidth: "90vw", textAlign: "center",
      boxShadow: "var(--elevation-2)", zIndex: "9999",
      opacity: "0", transition: "opacity .2s ease", pointerEvents: "none",
    });
    document.body.appendChild(bar);
  }
  bar.style.background = type === "error" ? "var(--md-sys-color-error)"    : "var(--md-sys-color-on-surface)";
  bar.style.color      = type === "error" ? "var(--md-sys-color-on-error)" : "var(--md-sys-color-surface)";
  bar.textContent = message;
  bar.style.opacity = "1";
  clearTimeout(_snackbarTimer);
  _snackbarTimer = setTimeout(() => { bar.style.opacity = "0"; }, 3500);
}

// ---------------------------------------------------------------------------
// Dark mode
// ---------------------------------------------------------------------------
const THEME_KEY = "nr-theme";
function getThemePref() { return localStorage.getItem(THEME_KEY) ?? "system"; }

function applyTheme(pref) {
  const root = document.documentElement;
  if      (pref === "dark")  root.setAttribute("data-theme", "dark");
  else if (pref === "light") root.setAttribute("data-theme", "light");
  else                       root.removeAttribute("data-theme");
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark  = pref === "dark" || (pref === "system" && sysDark);
  const icon    = isDark ? "light_mode" : "dark_mode";
  ["themeIcon", "themeIconMobile"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = icon; });
  const labelEl = document.getElementById("themeLabel");
  if (labelEl) labelEl.textContent = isDark ? "Light Mode" : "Dark Mode";
}

export function setTheme(pref) {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
}

export function getThemePreference() {
  return getThemePref();
}

function toggleTheme() {
  const pref    = getThemePref();
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark  = pref === "dark" || (pref === "system" && sysDark);
  const next    = isDark ? "light" : "dark";
  setTheme(next);
}

document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
applyTheme(getThemePref());
window.matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => { if (getThemePref() === "system") applyTheme("system"); });

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------
export function skeletonCard(lineClasses = ["title", "medium", "short"]) {
  return '<div class="skeleton-card">' +
    lineClasses.map(c => '<div class="skeleton skeleton-line skeleton-line--' + c + '"></div>').join("") +
    '</div>';
}

export function skeletonGrid(n = 3, lineClasses) {
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">' +
    Array.from({ length: n }, () => skeletonCard(lineClasses)).join("") + '</div>';
}

// ---------------------------------------------------------------------------
// First-start user creation helpers
// ---------------------------------------------------------------------------

function dialogPromise(headline, bodyHTML, confirmLabel, onOpen) {
  return new Promise(function (resolve) {
    const dlg = openDialog(headline, bodyHTML, confirmLabel);
    if (onOpen) onOpen(dlg);
    dlg.addEventListener("close", function () {
      resolve({ confirmed: dlg.returnValue === "confirm", dlg: dlg });
    });
  });
}

var _IMPORT_ITEMS = [
  { key: "grades",        cbId: "impGrades",  pathId: "impGradesPath",  label: "Noten" },
  { key: "wallet",        cbId: "impWallet",  pathId: "impWalletPath",  label: "Guthaben & Logs" },
  { key: "reward_config", cbId: "impRewards", pathId: "impRewardsPath", label: "Belohnungskonfiguration" },
  { key: "tasks",         cbId: "impTasks",   pathId: "impTasksPath",   label: "Aufgaben" },
];

function renderImportOptions(dlg, sources) {
  _IMPORT_ITEMS.forEach(function (item) {
    var src = sources[item.key];
    var cb = dlg.querySelector("#" + item.cbId);
    var pathField = dlg.querySelector("#" + item.pathId);
    if (!cb || !pathField) return;
    var show = cb.checked;
    pathField.style.display = show ? "block" : "none";
    cb.addEventListener("change", function () {
      pathField.style.display = cb.checked ? "block" : "none";
    });
  });
}

function importFileOptionsHTML(sources) {
  var html = '<div style="margin-top:14px">' +
    '<div style="font-size:13px;font-weight:500;margin-bottom:8px;color:var(--md-sys-color-on-surface-variant)">Vorhandene Daten importieren:</div>';
  _IMPORT_ITEMS.forEach(function (item) {
    var src = sources[item.key];
    var existsText = (src && src.exists) ? ' <span style="color:var(--md-sys-color-tertiary);font-size:12px">(vorhanden)</span>' : " <span style=\"color:var(--md-sys-color-on-surface-variant);font-size:12px\">(nicht gefunden)</span>";
    var pathVal = (src && src.path) ? src.path.replace(/&/g, "&amp;").replace(/"/g, "&quot;") : "";
    html += '<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;font-size:14px;cursor:pointer">' +
      '<md-checkbox id="' + item.cbId + '" touch-target="wrapper" style="flex-shrink:0"></md-checkbox>' +
      '<span style="padding-top:3px">' + item.label + existsText + '</span>' +
    '</label>';
    html += '<md-outlined-text-field id="' + item.pathId + '" label="Pfad" style="width:100%;display:none;margin-bottom:4px" value="' + pathVal + '"></md-outlined-text-field>';
  });
  html += '</div>';
  return html;
}

function gatherImportData(dlg) {
  var files = [];
  var customPaths = {};
  _IMPORT_ITEMS.forEach(function (item) {
    var cb = dlg.querySelector("#" + item.cbId);
    if (cb && cb.checked) {
      files.push(item.key);
      var pathField = dlg.querySelector("#" + item.pathId);
      if (pathField && pathField.value && pathField.value.trim()) {
        customPaths[item.key] = pathField.value.trim();
      }
    }
  });
  return { import_files: files, custom_paths: customPaths };
}

function _setCurrentUser(name) {
  currentUser = name;
  localStorage.setItem(USER_KEY, name);
  updateUserSwitcherUI();
}

async function showCreateUserDialog(isFirst) {
  var sources = {};
  try {
    var resp = await fetch("/api/import-sources");
    sources = await resp.json();
  } catch (e) {
    sources = {};
  }
  const body = '<md-outlined-text-field id="newUserName" label="Name" style="width:100%"></md-outlined-text-field>' +
    '<div style="margin-top:8px">' + importFileOptionsHTML(sources) + '</div>';
  var result = await dialogPromise(
    isFirst ? "Willkommen! Benutzer erstellen" : "Benutzer hinzuf\u00fcgen",
    body,
    "Erstellen",
    function (dlg) {
      renderImportOptions(dlg, sources);
    }
  );
  if (!result.confirmed) {
    if (isFirst) {
      showSnackbar("Bitte einen Benutzer anlegen.", "error");
      return showCreateUserDialog(true);
    }
    return;
  }
  var inp = result.dlg.querySelector("#newUserName");
  var name = inp?.value?.trim();
  if (!name) {
    showSnackbar("Name eingeben.", "error");
    return showCreateUserDialog(isFirst);
  }
  var payload = { name: name };
  var importData = gatherImportData(result.dlg);
  if (importData.import_files.length) {
    payload.import_files = importData.import_files;
    payload.custom_paths = importData.custom_paths;
  }
  try {
    var data = await apiFetch("/api/users", { method: "POST", body: JSON.stringify(payload) });
    _setCurrentUser(name);
    if (data.imported && data.imported.length) {
      showSnackbar("Benutzer '" + name + "' erstellt (" + data.imported.length + " Dateien importiert).");
    } else {
      showSnackbar("Benutzer '" + name + "' erstellt.");
    }
  } catch (e) {
    showSnackbar(e.message, "error");
    if (isFirst) return showCreateUserDialog(true);
  }
}

async function showUserPickerDialog(users) {
  var listHtml = users.map(function (name) {
    return '<button class="user-switcher-item" data-user="' + name + '" style="font-size:15px;padding:14px 16px" role="menuitem">' +
      '<span class="material-symbols-rounded">person</span><span>' + name + '</span>' +
    '</button>';
  }).join("");

  var body = '<p style="font-size:14px;margin-bottom:12px">W\u00e4hle einen Benutzer:</p>' +
    '<div style="display:flex;flex-direction:column;gap:4px">' + listHtml + '</div>' +
    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--md-sys-color-outline-variant)">' +
      '<button class="user-switcher-item" id="pickerAddBtn" style="font-size:14px;padding:12px 16px" role="menuitem">' +
        '<span class="material-symbols-rounded">add</span><span>Neuen Benutzer anlegen\u2026</span>' +
      '</button>' +
    '</div>';

  const dlg = openDialog("Benutzer ausw\u00e4hlen", body);
  return new Promise(function (resolve) {
    var handled = false;

    function done() {
      if (handled) return;
      handled = true;
      dlg.close();
      resolve();
    }

    dlg.querySelectorAll("[data-user]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        _setCurrentUser(btn.dataset.user);
        done();
      });
    });

    dlg.querySelector("#pickerAddBtn")?.addEventListener("click", async function () {
      if (handled) return;
      handled = true;
      dlg.close();
      await showCreateUserDialog(false);
      if (localStorage.getItem(USER_KEY)) { resolve(); return; }
      resolve(showUserPickerDialog(users));
    });

    dlg.addEventListener("close", function () {
      dlg.remove();
      if (!handled) {
        handled = true;
        if (localStorage.getItem(USER_KEY)) { resolve(); return; }
        resolve(showUserPickerDialog(users));
      }
    });
  });
}

async function ensureUser() {
  var saved = localStorage.getItem(USER_KEY);
  if (saved) {
    currentUser = saved;
    return;
  }

  var users;
  try {
    var resp = await fetch("/api/users");
    users = await resp.json();
  } catch {
    users = [];
  }

  if (!Array.isArray(users) || users.length === 0) {
    await showCreateUserDialog(true);
  } else if (users.length === 1) {
    _setCurrentUser(users[0]);
  } else {
    await showUserPickerDialog(users);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  try {
    await ensureUser();
    renderNavItems();
    updateModeSwitcherUI();
    updateUserSwitcherUI();
    renderPage(currentPageKey());
    checkStartupStatus();
    setTimeout(function () {
      import("/static/js/tour.js").then(function (m) { return m.checkTour(); }).catch(function () {});
    }, 900);
  } catch (e) {
    console.error("Boot failed:", e);
    pageContainer.innerHTML =
      '<div class="page-placeholder">' +
        '<span class="material-symbols-rounded page-placeholder__icon" style="color:var(--md-sys-color-error)">error</span>' +
        '<p>App konnte nicht gestartet werden: ' + e.message + '</p>' +
      '</div>';
  }
})();
