/**
 * tour.js – First-run onboarding tour.
 * - Shown automatically on first app start (checks localStorage).
 * - Can be triggered manually via startTour() from settings.
 * - Navigates to the relevant page for each step.
 */

const TOUR_KEY = "nr-tour-v2";

const STEPS = [
  {
    icon: "school",
    title: "Willkommen beim Notenrechner!",
    text: "Diese kurze Tour zeigt dir die wichtigsten Funktionen. Du kannst sie jederzeit in den Einstellungen erneut starten.",
    page: null,
  },
  {
    icon: "bar_chart",
    title: "\u00dcbersicht",
    text: "Auf der \u00dcbersicht siehst du alle F\u00e4cher mit Schnitt und Verlaufs-Sparkline. Klicke auf ein Fach um Noten einzutragen.",
    page: "overview",
  },
  {
    icon: "add_circle",
    title: "F\u00e4cher & Noten",
    text: "Erstelle F\u00e4cher mit \u201e+ Fach\u201c. Jede Note kann eine Gewichtung und Labels (z.\u202fB. \u201eSchulaufgabe\u201c) haben. Filtere nach Labels in der \u00dcbersicht.",
    page: "overview",
  },
  {
    icon: "insights",
    title: "Statistiken",
    text: "Hier findest du Notenverteilung, Trendlinien, Verlaufsgraphen und einen TXT-Export. Vergleiche auch zwei Zeitr\u00e4ume miteinander.",
    page: "stats",
  },
  {
    icon: "account_balance_wallet",
    title: "Konto & Belohnungen",
    text: "Das optionale Belohnungssystem vergütet gute Noten mit Punkten, Geld oder eigenen Einheiten. Aktiviere es in den Einstellungen.",
    page: "wallet",
  },
  {
    icon: "swap_horiz",
    title: "Bereich wechseln",
    text: "Mit dem Bereichs-Switcher oben wechselst du zwischen Notenrechner und Taschengeld. Jeder Bereich hat eigene Seiten und Funktionen.",
    page: null,
  },
  {
    icon: "checklist",
    title: "Aufgaben & Taschengeld",
    text: "Im Taschengeld-Modus kannst du Aufgaben erstellen (einmalig, t\u00e4glich, w\u00f6chentlich, monatlich) und mit Guthaben belohnen. Erledigte Aufgaben werden im Konto verbucht.",
    page: "tasks",
  },
  {
    icon: "settings",
    title: "Einstellungen",
    text: "Konfiguriere das Belohnungssystem, verwalte Backups, setze Logs zur\u00fcck und passe die App an. Viel Erfolg!",
    page: "settings",
  },
];

/** Called on app boot – shows tour only if not yet seen. */
export function checkTour() {
  if (!localStorage.getItem(TOUR_KEY)) _showStep(0);
}

/** Force-starts the tour regardless of localStorage state. */
export function startTour() {
  _showStep(0);
}

function _showStep(index) {
  document.getElementById("tour-overlay")?.remove();

  const step    = STEPS[index];
  const isFirst = index === 0;
  const isLast  = index === STEPS.length - 1;

  // Navigate to step's page
  if (step.page) {
    import("/static/js/app.js")
      .then(m => { if (typeof m.navigateTo === "function") m.navigateTo(step.page); })
      .catch(() => {});
  }

  // Progress dots
  const dots = STEPS.map((_, i) =>
    '<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' +
    (i === index ? "var(--md-sys-color-primary)" : "var(--md-sys-color-outline-variant)") +
    ';transition:background .25s"></div>'
  ).join("");

  const prevBtn = !isFirst
    ? '<button id="tourPrev" style="padding:10px 20px;border-radius:50px;border:1px solid var(--md-sys-color-outline);' +
      'background:transparent;cursor:pointer;font-size:14px;font-family:inherit;' +
      'color:var(--md-sys-color-on-surface);transition:background .15s">Zur\u00fcck</button>'
    : "";

  const skipBtn = !isLast
    ? '<button id="tourSkip" style="background:transparent;border:none;cursor:pointer;font-size:13px;' +
      'color:var(--md-sys-color-on-surface-variant);font-family:inherit;padding:8px 4px;transition:opacity .15s">' +
      '\u00dcberspringen</button>'
    : '<span></span>'; // spacer so next button stays right

  const overlay = document.createElement("div");
  overlay.id = "tour-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:3000;" +
    "display:flex;align-items:center;justify-content:center;padding:24px";

  overlay.innerHTML =
    '<div style="background:var(--md-sys-color-surface-container-high);border-radius:28px;' +
    'max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden;' +
    'animation:dlg-in .2s ease-out">' +

      // Progress dots
      '<div style="display:flex;gap:6px;justify-content:center;padding:20px 24px 0">' + dots + '</div>' +

      // Icon + title
      '<div style="padding:20px 24px 0;text-align:center">' +
        '<span class="material-symbols-rounded" style="font-size:52px;color:var(--md-sys-color-primary);' +
        'font-variation-settings:\'FILL\' 1;display:block">' + step.icon + '</span>' +
        '<div style="font-size:20px;font-weight:600;margin-top:12px;color:var(--md-sys-color-on-surface);line-height:1.3">' +
        step.title + '</div>' +
      '</div>' +

      // Body text
      '<div style="padding:12px 28px 8px;font-size:14px;line-height:1.65;' +
      'color:var(--md-sys-color-on-surface-variant);text-align:center">' + step.text + '</div>' +

      // Buttons
      '<div style="padding:16px 24px 24px;display:flex;justify-content:space-between;align-items:center;gap:8px">' +
        skipBtn +
        '<div style="display:flex;gap:8px;align-items:center">' +
          prevBtn +
          '<button id="tourNext" style="padding:10px 28px;border-radius:50px;border:none;' +
          'background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);' +
          'cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;transition:opacity .15s">' +
          (isLast ? "Fertig \u2713" : "Weiter") + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Wire buttons
  overlay.querySelector("#tourSkip")?.addEventListener("click", _endTour);
  overlay.querySelector("#tourPrev")?.addEventListener("click", () => _showStep(index - 1));
  overlay.querySelector("#tourNext").addEventListener("click", () => {
    if (isLast) _endTour();
    else        _showStep(index + 1);
  });

  // Close on backdrop click (only on first/last step to not accidentally close mid-tour)
  overlay.addEventListener("click", e => {
    if (e.target === overlay && (isFirst || isLast)) _endTour();
  });
}

function _endTour() {
  document.getElementById("tour-overlay")?.remove();
  localStorage.setItem(TOUR_KEY, "1");
}
