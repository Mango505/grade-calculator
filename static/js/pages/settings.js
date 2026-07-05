/**
 * settings.js – Stack-based sub-navigation
 */
import { apiFetch, showSnackbar, clearPrimaryAction, setTheme, getThemePreference } from "../app.js";
import { errorBanner, openDialog, injectComponentStyles } from "../components.js";

let stack = ["main"];

export default async function render(container) {
  injectComponentStyles();
  clearPrimaryAction();
  stack = ["main"];
  renderCurrent(container);
}

async function renderCurrent(container) {
  const page = stack.at(-1);
  if      (page === "main")    renderMain(container);
  else if (page === "rewards") await renderRewards(container);
  else if (page === "paths")   await renderPaths(container);
  else if (page === "loading") await renderLoading(container);
  else if (page === "theme")   renderTheme(container);
  else if (page === "reset")   renderReset(container);
}

function back(container) { stack.pop(); renderCurrent(container); }
function backBar(title) {
  return '<div class="back-bar" style="margin-bottom:20px" id="backBar"><button class="icon-btn" id="btnBack"><span class="material-symbols-rounded">arrow_back</span></button><span class="back-bar__title">'+title+'</span></div>';
}
function bindBack(container) { container.querySelector("#btnBack")?.addEventListener("click", ()=>back(container)); }

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------
function renderMain(container) {
  container.innerHTML =
    '<h2 style="font-size:22px;font-weight:500;margin-bottom:20px">Einstellungen</h2>' +
    '<div class="settings-menu">' +
      item("Belohnungssystem","redeem",      "rewards","Punkte, Modus, Belohnungen") +
      item("Datenpfade",      "folder",       "paths",  "Speicherorte der JSON-Dateien") +
      item("Ladehinweise",    "notifications","loading","Verbose-Loading ein-/ausschalten") +
      item("Design",          "palette",      "theme",  "Dark-/Light-Modus w\u00e4hlen") +
      item("Backup & Reset",  "restart_alt",  "reset",  "Backup, Logs leeren, Daten zur\u00fccksetzen") +
      item("App-Tour starten","flag",         "tour",   "Einf\u00fchrung erneut anzeigen") +
    '</div>';
  container.querySelectorAll(".settings-menu-item").forEach(btn =>
    btn.addEventListener("click", async () => {
      if (btn.dataset.target === "tour") {
        try { const {startTour} = await import("/static/js/tour.js"); startTour(); }
        catch(e) { showSnackbar("Tour konnte nicht geladen werden.","error"); }
        return;
      }
      stack.push(btn.dataset.target); renderCurrent(container);
    })
  );
}

function item(label, icon, target, sub="") {
  return '<button class="settings-menu-item" data-target="'+target+'">' +
    '<div><div style="font-size:15px;font-weight:500">'+label+'</div>' +
    (sub?'<div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:2px">'+sub+'</div>':'')+
    '</div><span class="material-symbols-rounded">chevron_right</span></button>';
}

// ---------------------------------------------------------------------------
// Belohnungssystem
// ---------------------------------------------------------------------------
async function renderRewards(container) {
  container.innerHTML = backBar("Belohnungssystem");
  bindBack(container);

  let cfg;
  try { cfg = await apiFetch("/api/reward-config"); }
  catch(e) { container.innerHTML += errorBanner(e.message); return; }

  const modeLabel = {money:"Geld (\u20ac)",unit:"Eigene Einheit",points:"Nur Punkte"};
  const div = document.createElement("div");

  // Info banner – warn against changing settings mid-year
  const infoBanner =
    '<div class="card" style="margin-bottom:12px;border-color:var(--md-sys-color-primary-container);' +
    'background:color-mix(in srgb,var(--md-sys-color-primary) 6%,var(--md-sys-color-surface))">' +
      '<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<span class="material-symbols-rounded" style="color:var(--md-sys-color-primary);flex-shrink:0;margin-top:1px">info</span>' +
        '<div>' +
          '<div style="font-size:14px;font-weight:500;margin-bottom:4px">Einstellungen m\u00f6glichst nicht mid-year \u00e4ndern</div>' +
          '<div style="font-size:13px;color:var(--md-sys-color-on-surface-variant);line-height:1.5">' +
            '\u00c4nderungen an Punkten oder Modus werden nicht r\u00fcckwirkend berechnet. Vergangene Noten behalten ihren alten Wert, was das Guthaben verzerren kann. Einstellungen am besten zu Schuljahresbeginn festlegen.' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  let html = infoBanner +
    '<div class="card" style="margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between">' +
        '<div><div style="font-size:15px;font-weight:500">Belohnungssystem</div>' +
        '<div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:2px">'+(cfg.enabled?"Aktiv":"Deaktiviert")+'</div></div>' +
        '<md-switch id="swEnabled" '+(cfg.enabled?"selected":"")+'></md-switch>' +
      '</div>' +
    '</div>';

  if (cfg.enabled) {
    html +=
      '<div class="card" style="margin-bottom:12px">' +
        '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">Modus</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          ["money","unit","points"].map(m=>'<button class="tab-pill '+(cfg.reward_mode===m?"tab-pill--active":"")+'" data-mode="'+m+'">'+modeLabel[m]+'</button>').join("") +
        '</div>' +
      '</div>';

    if (cfg.reward_mode==="money") {
      html +=
        '<div class="card" style="margin-bottom:12px">' +
          '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">Geld pro Punkt</div>' +
          '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
            '<md-outlined-text-field id="fldMoney" label="\u20ac / Punkt" type="number" min="0.01" step="0.01" value="'+cfg.money_per_point.toFixed(2)+'" style="flex:1;min-width:120px"></md-outlined-text-field>' +
            '<button class="btn-tonal" id="btnSaveMoney">Speichern</button>' +
          '</div>' +
        '</div>';
    }
    if (cfg.reward_mode==="unit") {
      html +=
        '<div class="card" style="margin-bottom:12px">' +
          '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">Eigene Einheit</div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
            '<md-outlined-text-field id="fldUnitName" label="Name" value="'+cfg.unit_name+'" style="flex:1;min-width:130px"></md-outlined-text-field>' +
            '<md-outlined-text-field id="fldUnitPerPt" label="pro Punkt" type="number" min="0.01" step="0.01" value="'+cfg.unit_per_point+'" style="flex:1;min-width:110px"></md-outlined-text-field>' +
            '<button class="btn-tonal" id="btnSaveUnit">Speichern</button>' +
          '</div>' +
        '</div>';
    }

    html +=
      '<div class="card">' +
        '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">Punkte pro Note</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
          Object.entries(cfg.points_map).map(([g,p]) =>
            '<tr><td style="padding:6px 4px;font-weight:500;width:60px">Note '+g+'</td>' +
            '<td><input type="number" class="pts-input" data-grade="'+g+'" value="'+p+'" min="0" step="1" style="width:72px;padding:6px 8px;border-radius:var(--shape-corner-extra-small);border:1px solid var(--md-sys-color-outline);font-size:14px;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface)"/></td>' +
            '<td style="font-size:12px;color:var(--md-sys-color-on-surface-variant);padding-left:8px">' +
              (cfg.reward_mode==="money"?"= "+(p*cfg.money_per_point).toFixed(2)+" \u20ac":cfg.reward_mode==="unit"?"= "+(p*cfg.unit_per_point)+" "+cfg.unit_name:"= "+p+" Pt.") +
            '</td></tr>'
          ).join("") +
        '</table>' +
        '<div style="margin-top:12px"><button class="btn-tonal" id="btnSavePts">Punkte speichern</button></div>' +
      '</div>';
  }

  div.innerHTML = html;
  container.appendChild(div);

  div.querySelector("#swEnabled")?.addEventListener("change", async e => {
    cfg.enabled=e.target.selected;
    try { await save(cfg); showSnackbar(cfg.enabled?"Aktiviert.":"Deaktiviert."); await renderRewards(container); }
    catch(err) { showSnackbar(err.message,"error"); }
  });
  div.querySelectorAll("[data-mode]").forEach(btn=>btn.addEventListener("click", async()=>{
    cfg.reward_mode=btn.dataset.mode;
    try { await save(cfg); showSnackbar("Modus ge\u00e4ndert."); await renderRewards(container); }
    catch(err) { showSnackbar(err.message,"error"); }
  }));
  div.querySelector("#btnSaveMoney")?.addEventListener("click", async()=>{
    const v=parseFloat(div.querySelector("#fldMoney").value);
    if (isNaN(v)||v<=0) { showSnackbar("Ung\u00fcltiger Wert.","error"); return; }
    cfg.money_per_point=v;
    try { await save(cfg); showSnackbar("Gespeichert."); await renderRewards(container); }
    catch(e) { showSnackbar(e.message,"error"); }
  });
  div.querySelector("#btnSaveUnit")?.addEventListener("click", async()=>{
    const n=div.querySelector("#fldUnitName").value.trim(), p=parseFloat(div.querySelector("#fldUnitPerPt").value);
    if (!n||isNaN(p)||p<=0) { showSnackbar("Ung\u00fcltige Eingabe.","error"); return; }
    cfg.unit_name=n; cfg.unit_per_point=p;
    try { await save(cfg); showSnackbar("Gespeichert."); await renderRewards(container); }
    catch(e) { showSnackbar(e.message,"error"); }
  });
  div.querySelector("#btnSavePts")?.addEventListener("click", async()=>{
    div.querySelectorAll(".pts-input").forEach(inp=>{ const g=parseInt(inp.dataset.grade),p=parseInt(inp.value); if (!isNaN(p)&&p>=0) cfg.points_map[g]=p; });
    try { await save(cfg); showSnackbar("Gespeichert."); await renderRewards(container); }
    catch(e) { showSnackbar(e.message,"error"); }
  });
}

// ---------------------------------------------------------------------------
// Datenpfade
// ---------------------------------------------------------------------------
async function renderPaths(container) {
  container.innerHTML = backBar("Datenpfade"); bindBack(container);
  let appCfg;
  try { appCfg = await apiFetch("/api/app-config"); }
  catch(e) { container.innerHTML += errorBanner(e.message); return; }
  const p=(label,val)=>'<div style="margin-bottom:14px"><div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-bottom:2px">'+label+'</div><code style="font-size:13px;word-break:break-all;display:block">'+val+'</code></div>';
  const div=document.createElement("div"); div.className="card";
  div.innerHTML=p("Noten",appCfg.data_path)+p("Wallet",appCfg.wallet_path)+p("Aufgaben",appCfg.tasks_path)+p("Belohnungskonfig",appCfg.reward_config_path)+p("App-Konfiguration",appCfg.app_config_path)+p("Backups",appCfg.backup_path)+
    '<p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-top:8px">Pfade \u00fcber <code>DATA_DIR</code> in <code>.env</code> konfigurierbar.</p>';
  container.appendChild(div);
}

// ---------------------------------------------------------------------------
// Ladehinweise
// ---------------------------------------------------------------------------
async function renderLoading(container) {
  container.innerHTML = backBar("Ladehinweise"); bindBack(container);
  let appCfg;
  try { appCfg = await apiFetch("/api/app-config"); }
  catch(e) { container.innerHTML += errorBanner(e.message); return; }
  const div=document.createElement("div"); div.className="card";
  div.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between">' +
    '<div><div style="font-size:15px;font-weight:500">Verbose Loading</div>' +
    '<div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:2px">'+(appCfg.verbose_loading?"Aktiv \u2013 Ladehinweise werden angezeigt":"Deaktiviert \u2013 nur Warnungen")+'</div></div>' +
    '<md-switch id="swVerbose" '+(appCfg.verbose_loading?"selected":"")+'></md-switch></div>';
  container.appendChild(div);
  div.querySelector("#swVerbose").addEventListener("change", async e=>{
    try { await apiFetch("/api/app-config",{method:"PATCH",body:JSON.stringify({verbose_loading:e.target.selected})}); showSnackbar(e.target.selected?"Ladehinweise aktiviert.":"Ladehinweise deaktiviert."); await renderLoading(container); }
    catch(err) { showSnackbar(err.message,"error"); }
  });
}

// ---------------------------------------------------------------------------
// Design / Theme
// ---------------------------------------------------------------------------
function renderTheme(container) {
  container.innerHTML = backBar("Design");
  bindBack(container);

  const current = getThemePreference();
  const options = [
    { value: "system", label: "System", icon: "desktop_windows", desc: "Folgt dem Betriebssystem" },
    { value: "light",  label: "Hell",   icon: "light_mode",      desc: "Helles Design immer" },
    { value: "dark",   label: "Dunkel", icon: "dark_mode",       desc: "Dunkles Design immer" },
  ];

  const cards = options.map(function (o) {
    const active = o.value === current;
    return '<div class="card theme-option' + (active ? " theme-option--active" : "") + '" data-theme="' + o.value + '" style="margin-bottom:8px;cursor:pointer;transition:background .15s;' + (active ? 'border-color:var(--md-sys-color-primary)' : '') + '">' +
      '<div style="display:flex;align-items:center;gap:14px">' +
        '<span class="material-symbols-rounded" style="font-size:24px;color:' + (active ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)') + '">' + o.icon + '</span>' +
        '<div style="flex:1">' +
          '<div style="font-size:15px;font-weight:500">' + o.label + '</div>' +
          '<div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:2px">' + o.desc + '</div>' +
        '</div>' +
        (active
          ? '<span class="material-symbols-rounded" style="color:var(--md-sys-color-primary)">check_circle</span>'
          : '<span class="material-symbols-rounded" style="color:var(--md-sys-color-on-surface-variant)">radio_button_unchecked</span>') +
      '</div>' +
    '</div>';
  }).join("");

  const div = document.createElement("div");
  div.innerHTML = cards;
  container.appendChild(div);

  div.querySelectorAll(".theme-option").forEach(function (card) {
    card.addEventListener("click", function () {
      const val = card.dataset.theme;
      setTheme(val);
      renderTheme(container);
    });
  });
}

// ---------------------------------------------------------------------------
// Backup & Reset
// ---------------------------------------------------------------------------
function renderReset(container) {
  container.innerHTML = backBar("Backup & Reset"); bindBack(container);
  const div=document.createElement("div");
  div.innerHTML=
    '<div class="card" style="margin-bottom:12px">' +
      '<div style="font-size:15px;font-weight:500;margin-bottom:8px">Backup</div>' +
      '<p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">L\u00e4dt alle Datendateien als ZIP herunter.</p>' +
      '<button class="btn-tonal" id="btnBackup"><span class="material-symbols-rounded">download</span>Backup herunterladen</button>' +
    '</div>' +
    '<div class="card" style="border:1px solid var(--md-sys-color-error-container)">' +
      '<div style="font-size:15px;font-weight:500;color:var(--md-sys-color-error);margin-bottom:12px">Gefahrenzone</div>' +
      '<button class="btn-danger" id="rGradeLog"><span class="material-symbols-rounded">delete_sweep</span>Noten\u00e4nderungen-Log leeren</button>' +
      '<button class="btn-danger" id="rRedemptions"><span class="material-symbols-rounded">delete_sweep</span>Einl\u00f6sungen-Log leeren</button>' +
      '<button class="btn-danger" id="rBalance"><span class="material-symbols-rounded">account_balance_wallet</span>Guthaben auf 0 zur\u00fccksetzen</button>' +
      '<button class="btn-danger" id="rRewardCfg"><span class="material-symbols-rounded">restart_alt</span>Belohnungskonfiguration zur\u00fccksetzen</button>' +
      '<button class="btn-danger" id="rAppCfg"><span class="material-symbols-rounded">settings_backup_restore</span>App-Konfiguration zur\u00fccksetzen</button>' +
      '<button class="btn-danger" id="rTaskLog"><span class="material-symbols-rounded">delete_sweep</span>Aufgaben-Log leeren</button>' +
      '<button class="btn-danger" id="rTasks"><span class="material-symbols-rounded">restart_alt</span>Aufgaben-Vorlagen zur\u00fccksetzen</button>' +
    '</div>';
  container.appendChild(div);

  div.querySelector("#btnBackup").addEventListener("click",()=>{ const user=localStorage.getItem("nt-user"); const a=Object.assign(document.createElement("a"),{href:"/api/backup?user="+encodeURIComponent(user)}); document.body.appendChild(a);a.click();a.remove(); showSnackbar("Backup wird heruntergeladen\u2026"); });
  [["rGradeLog","grade_log","Noten\u00e4nderungen-Log leeren?"],
   ["rRedemptions","redemptions","Einl\u00f6sungen-Log leeren?\nDas Guthaben wird nicht ver\u00e4ndert."],
   ["rBalance","balance","Guthaben auf 0 zur\u00fccksetzen?\nLogs bleiben erhalten."],
   ["rRewardCfg","reward_config","Belohnungskonfiguration auf Standardwerte zur\u00fccksetzen?"],
   ["rAppCfg","app_config","App-Konfiguration auf Standardwerte zur\u00fccksetzen?"],
   ["rTaskLog","task_log","Aufgaben-Log leeren?\nDas Guthaben wird nicht ver\u00e4ndert."],
   ["rTasks","tasks","Aufgaben-Vorlagen zur\u00fccksetzen?\nAlle Vorlagen und Logs werden gel\u00f6scht."],
  ].forEach(([id,action,msg])=>{
    div.querySelector("#"+id).addEventListener("click",()=>{
      const dlg=openDialog("Best\u00e4tigung",'<p style="font-size:14px;margin-bottom:12px;line-height:1.5">'+msg.replace(/\n/g,"<br>")+'</p><div style="font-size:14px;padding:12px;background:color-mix(in srgb,var(--md-sys-color-error) 8%,var(--md-sys-color-surface));border:1px solid var(--md-sys-color-error-container);border-radius:8px;display:flex;align-items:flex-start;gap:10px"><span class="material-symbols-rounded" style="color:var(--md-sys-color-error);flex-shrink:0;margin-top:1px">warning</span><div><strong>DIES KANN NICHT R\u00dcCKG\u00c4NGIG GEMACHT WERDEN!</strong><br><span style="color:var(--md-sys-color-on-surface-variant)">Es empfiehlt sich, vorher ein <button class="btn-text" id="dlBackup" style="font-size:14px;padding:0;min-width:0;color:var(--md-sys-color-primary);text-decoration:underline;cursor:pointer;background:none;border:none;font-family:inherit">Backup herunterzuladen</button>.</span></div></div>',"Zur\u00fccksetzen",true);
      document.getElementById("app-dialog")?.querySelector("#dlBackup")?.addEventListener("click",()=>{
        const u=localStorage.getItem("nt-user"); const a=document.createElement("a"); a.href="/api/backup?user="+encodeURIComponent(u); document.body.appendChild(a); a.click(); a.remove();
      });
      dlg.addEventListener("close",async()=>{ if (dlg.returnValue!=="confirm") return; try { await apiFetch("/api/reset",{method:"POST",body:JSON.stringify({action})}); showSnackbar("Zur\u00fcckgesetzt."); } catch(e){showSnackbar(e.message,"error");} });
    });
  });
}

async function save(cfg) { await apiFetch("/api/reward-config",{method:"POST",body:JSON.stringify(cfg)}); }
