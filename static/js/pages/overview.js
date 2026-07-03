/**
 * overview.js
 * Grid: chip filter → stats → subject cards
 * Detail: back + rename/delete + stats + grade table
 * Grade dialog: validation snackbar + "Belohnung buchen" checkbox
 */
import { apiFetch, showSnackbar, skeletonGrid, setPrimaryAction, clearPrimaryAction } from "../app.js";
import { gradeBadge, emptyState, errorBanner, statChip, openDialog,
         injectComponentStyles, validateAll, validators } from "../components.js";

let reorderMode     = false;
let detailSubject   = null;
let filterLabels    = [];
let filterMode      = "or";
let filterGradeValues = [];
let detailGradeFilter = [];
let _cachedSubjects      = [];
let _cachedRewardConfig  = null; // cached so grid-view FAB can use it

export default async function render(container) {
  injectComponentStyles();
  injectStyles();
  if (detailSubject) await renderDetail(container);
  else               await renderGrid(container);
}

// ---------------------------------------------------------------------------
// GRID VIEW
// ---------------------------------------------------------------------------
async function renderGrid(container) {
  container.innerHTML = skeletonGrid(3);

  let overview, subjects, rewardConfig;
  try {
    [overview, subjects, rewardConfig] = await Promise.all([
      apiFetch("/api/overview"),
      apiFetch("/api/subjects"),
      apiFetch("/api/reward-config"),
    ]);
  } catch(e) { container.innerHTML = errorBanner(e.message); return; }

  _cachedSubjects     = subjects;
  _cachedRewardConfig = rewardConfig;

  const avg  = overview.overall_average;
  const tot  = subjects.reduce((n,s)=>n+s.grades.length, 0);
  const best = [...overview.subjects].sort((a,b)=>a.average-b.average)[0];

  if (subjects.length) setPrimaryAction("add","Note hinzuf\u00fcgen",()=>openAddNoteDialog(container,subjects,rewardConfig));
  else                 clearPrimaryAction();

  _injectOverflowBtn(container, subjects);

  const chipsHtml   = _renderChipsHtml();
  const modeRowHtml = _renderModeRowHtml();

  container.innerHTML =
    '<div class="ov-toolbar">' +
      '<div class="ov-toolbar-left">' +
        '<div class="chip-input" id="chipInput">' + chipsHtml +
          '<input id="labelInput" class="chip-text-input" placeholder="'+(filterLabels.length?"Label hinzuf\u00fcgen\u2026":"Nach Label filtern\u2026")+'"/>' +
        '</div>' +
        '<div id="filterModeRow" class="filter-mode-row" style="'+(filterLabels.length?"":"display:none")+'">' + modeRowHtml + '</div>' +
        '<div id="gradeFilterRow" class="grade-filter-row">' + _renderGradeChipsHtml() + '</div>' +
      '</div>' +
      '<div class="ov-toolbar-right">' +
        '<button class="btn-tonal" id="btnNewSubject"><span class="material-symbols-rounded">add</span>Fach</button>' +
        '<button class="btn-tonal" id="btnReorder"><span class="material-symbols-rounded">'+(reorderMode?"check":"swap_vert")+'</span>'+(reorderMode?"Fertig":"Reihenfolge")+'</button>' +
      '</div>' +
    '</div>' +
    '<div class="card stat-banner-grid" style="margin-bottom:16px">' +
      statChip("Gesamtschnitt",avg!=null?avg.toFixed(2):"\u2014") +
      statChip("Noten gesamt",tot,"--md-sys-color-secondary") +
      statChip("Bestes Fach",best?best.name+" ("+best.average.toFixed(2)+")":"\u2014","--md-sys-color-tertiary") +
    '</div>' +
    '<div id="filterInfo" style="display:none;margin-bottom:10px;font-size:13px;color:var(--md-sys-color-on-surface-variant)"></div>' +
    '<div id="subjectGrid">'+renderGridContent(subjects)+'</div>';

  bindGridEvents(container, subjects, rewardConfig);
  if (filterLabels.length || filterGradeValues.length) _applyFilter(container, subjects);
}

function _renderChipsHtml() {
  return filterLabels.map((l,i)=>'<span class="filter-chip">'+l+'<button class="chip-x" data-i="'+i+'" type="button">\u00d7</button></span>').join("");
}
function _renderModeRowHtml() {
  if (!filterLabels.length) return "";
  const clearBtn='<button class="filter-clear-btn" id="filterClear">\u00d7 Zur\u00fccksetzen</button>';
  if (filterLabels.length===1) return clearBtn;
  return clearBtn+
    '<label><input type="radio" name="filterMode" value="or"  '+(filterMode==="or"?'checked="checked"':'')+'/> Eines (OR)</label>'+
    '<label><input type="radio" name="filterMode" value="and" '+(filterMode==="and"?'checked="checked"':'')+'/> Alle (AND)</label>';
}

function _renderGradeChipsHtml() {
  return [1,2,3,4,5,6].map(function(v) {
    return '<button class="grade-filter-chip' + (filterGradeValues.includes(v) ? " active" : "") + '" data-value="' + v + '">' + v + '</button>';
  }).join("");
}

function renderGridContent(subjects) {
  if (!subjects.length) return '<div style="grid-column:1/-1;display:flex;justify-content:center;padding:48px 0">'+emptyState("library_books","Noch keine F\u00e4cher vorhanden.")+'</div>';
  if (reorderMode)      return reorderList(subjects);
  return subjects.map(subjectCard).join("");
}

function subjectCard(s) {
  const w=s.grades.reduce((a,g)=>a+g.weight,0), avg=w?(s.grades.reduce((a,g)=>a+g.value*g.weight,0)/w).toFixed(2):null;
  return '<div class="ov-card card" data-subject="'+s.name+'">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div><div style="font-size:16px;font-weight:600">'+s.name+'</div>' +
      '<div style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-top:2px">'+(avg?'\u00d8 '+avg:'Keine Noten')+' \u00b7 '+s.grades.length+' Eintr\u00e4ge</div></div>' +
      '<div style="display:flex;align-items:center;gap:8px">'+sparkline(s.grades)+'<span class="material-symbols-rounded" style="color:var(--md-sys-color-on-surface-variant);font-size:20px">chevron_right</span></div>' +
    '</div></div>';
}

function sparkline(grades) {
  if (grades.length<2) return "";
  const W=100,H=32,P=3, step=(W-P*2)/(grades.length-1), y=v=>P+((v-1)/5)*(H-P*2);
  const pts=grades.map((g,i)=>(P+i*step)+","+y(g.value)).join(" ");
  const avg=grades.reduce((a,g)=>a+g.value,0)/grades.length;
  const stroke=avg<=2.5?"#1b7e4a":avg<=4?"#a08c00":"#c43000";
  return '<svg width="'+W+'" height="'+H+'" style="flex-shrink:0;opacity:.8" aria-hidden="true">' +
    '<polyline points="'+pts+'" fill="none" stroke="'+stroke+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="'+(P+(grades.length-1)*step)+'" cy="'+y(grades.at(-1).value)+'" r="3" fill="'+stroke+'"/></svg>';
}

function reorderList(subjects) {
  return '<div style="display:flex;flex-direction:column;gap:8px">' +
    subjects.map((s,i)=>'<div class="card" style="display:flex;align-items:center;padding:14px 16px;gap:8px">' +
      '<span style="flex:1;font-size:15px;font-weight:500">'+s.name+'</span>' +
      '<button class="icon-btn-sm btn-up"   data-index="'+i+'" '+(i===0?"disabled":"")+'>'+
        '<span class="material-symbols-rounded">arrow_upward</span></button>' +
      '<button class="icon-btn-sm btn-down" data-index="'+i+'" '+(i===subjects.length-1?"disabled":"")+'>'+
        '<span class="material-symbols-rounded">arrow_downward</span></button></div>'
    ).join("")+'</div>';
}

// ---------------------------------------------------------------------------
// Mobile overflow menu
// ---------------------------------------------------------------------------
function _injectOverflowBtn(container, subjects) {
  _removeOverflowBtn();
  const actions=document.querySelector(".top-app-bar__actions");
  if (!actions) return;
  const btn=document.createElement("button");
  btn.id="ov-overflow-btn"; btn.className="icon-btn"; btn.setAttribute("aria-label","Mehr Optionen");
  btn.innerHTML='<span class="material-symbols-rounded">more_vert</span>';
  actions.insertBefore(btn, actions.firstChild);
  const menu=document.createElement("div");
  menu.id="ov-overflow-menu"; menu.className="ov-overflow-menu"; menu.style.display="none";
  menu.innerHTML='<button id="ovMenuNew"><span class="material-symbols-rounded">add</span>Fach erstellen</button>' +
    '<button id="ovMenuReorder"><span class="material-symbols-rounded">swap_vert</span>'+(reorderMode?"Fertig":"Reihenfolge \u00e4ndern")+'</button>';
  document.body.appendChild(menu);
  btn.addEventListener("click",e=>{ e.stopPropagation(); const open=menu.style.display==="block"; menu.style.display=open?"none":"block"; if (!open) setTimeout(()=>{ document.addEventListener("click",function _c(){ menu.style.display="none"; document.removeEventListener("click",_c); }); },0); });
  menu.querySelector("#ovMenuNew").addEventListener("click",()=>{
    menu.style.display="none";
    const dlg=openDialog("Fach erstellen",'<md-outlined-text-field id="dlgName" label="Fachname" style="width:100%"></md-outlined-text-field>');
    dlg.addEventListener("close",async()=>{ if (dlg.returnValue!=="confirm") return; const name=dlg.querySelector("#dlgName").value.trim(); if (!name) return;
      try { await apiFetch("/api/subjects",{method:"POST",body:JSON.stringify({name})}); showSnackbar("Fach '"+name+"' erstellt."); reorderMode=false; await renderGrid(container); } catch(e){showSnackbar(e.message,"error");} });
  });
  menu.querySelector("#ovMenuReorder").addEventListener("click",()=>{
    menu.style.display="none"; reorderMode=!reorderMode;
    const grid=container.querySelector("#subjectGrid"); if (grid) grid.innerHTML=renderGridContent(subjects);
    const m=document.querySelector("#ovMenuReorder"); if (m) m.innerHTML='<span class="material-symbols-rounded">swap_vert</span>'+(reorderMode?"Fertig":"Reihenfolge \u00e4ndern");
  });
}
function _removeOverflowBtn() { document.getElementById("ov-overflow-btn")?.remove(); document.getElementById("ov-overflow-menu")?.remove(); }

// ---------------------------------------------------------------------------
// Chip filter
// ---------------------------------------------------------------------------
function _addChip(label,container,subjects){ label=label.trim(); if (!label||filterLabels.includes(label)) return; filterLabels.push(label); _rebuildFilter(container,subjects); }
function _removeChip(index,container,subjects){ filterLabels.splice(index,1); _rebuildFilter(container,subjects); }
function _rebuildGradeFilter(container) {
  const row=container.querySelector("#gradeFilterRow");
  if (!row) return;
  row.querySelectorAll(".grade-filter-chip").forEach(function(btn){ btn.classList.toggle("active", filterGradeValues.includes(parseInt(btn.dataset.value))); });
}

function _rebuildFilter(container,subjects){
  const chipInput=container.querySelector("#chipInput"), input=container.querySelector("#labelInput"), modeRow=container.querySelector("#filterModeRow");
  if (!chipInput||!input) return;
  chipInput.querySelectorAll(".filter-chip").forEach(c=>c.remove());
  filterLabels.forEach((l,i)=>{ const chip=document.createElement("span"); chip.className="filter-chip"; chip.innerHTML=l+'<button class="chip-x" data-i="'+i+'" type="button">\u00d7</button>'; chipInput.insertBefore(chip,input); });
  input.placeholder=filterLabels.length?"Label hinzuf\u00fcgen\u2026":"Nach Label filtern\u2026";
  if (modeRow) {
    if (!filterLabels.length) { modeRow.style.display="none"; modeRow.innerHTML=""; }
    else {
      modeRow.className="filter-mode-row"; modeRow.style.display="flex"; modeRow.innerHTML=_renderModeRowHtml();
      var defaultRadio=modeRow.querySelector('input[type="radio"][value="'+filterMode+'"]'); if (defaultRadio) defaultRadio.checked=true;
      modeRow.querySelector("#filterClear")?.addEventListener("click",function(){ filterLabels=[]; filterGradeValues=[]; _rebuildGradeFilter(container); _rebuildFilter(container,subjects); });
      modeRow.querySelectorAll("input[type=radio]").forEach(function(r){ r.addEventListener("change",function(){ filterMode=r.value; _applyFilter(container,subjects); }); });
    }
  }
  _applyFilter(container,subjects);
}
function _applyFilter(container,subjects){
  const grid=container.querySelector("#subjectGrid"), infoEl=container.querySelector("#filterInfo");
  if (!grid) return;
  const hasLabel=filterLabels.length>0, hasGrade=filterGradeValues.length>0;
  if (!hasLabel&&!hasGrade){ if (infoEl) infoEl.style.display="none"; grid.innerHTML=renderGridContent(subjects); return; }
  const matches=[];
  subjects.forEach(function(s){ s.grades.forEach(function(g){
    const hitLabel=!hasLabel||(filterMode==="and"?filterLabels.every(function(l){ return g.labels.some(function(gl){ return gl.toLowerCase().includes(l.toLowerCase()); }); }):filterLabels.some(function(l){ return g.labels.some(function(gl){ return gl.toLowerCase().includes(l.toLowerCase()); }); }));
    const hitGrade=!hasGrade||filterGradeValues.includes(Math.floor(g.value));
    if (hitLabel&&hitGrade) matches.push({subject:s.name,grade:g});
  }); });
  if (infoEl){
    infoEl.style.display="";
    const parts=[];
    if (hasLabel) parts.push(filterLabels.join(filterMode==="and"?" + ":" | "));
    if (hasGrade) parts.push("Noten: "+filterGradeValues.slice().sort(function(a,b){ return a-b; }).join(", "));
    infoEl.textContent=matches.length+" Eintr\u00e4ge \u2014 "+parts.join(" \u00b7 ");
  }
  if (!matches.length){ grid.innerHTML=emptyState("search_off","Keine Noten mit diesen Kriterien."); return; }
  const rows=matches.map(function(m){ return '<tr><td style="padding:8px 10px;border-bottom:1px solid var(--md-sys-color-outline-variant);font-size:14px">'+m.subject+'</td><td style="padding:8px 10px;border-bottom:1px solid var(--md-sys-color-outline-variant)">'+gradeBadge(m.grade.value)+'</td><td style="padding:8px 10px;border-bottom:1px solid var(--md-sys-color-outline-variant);font-size:13px;color:var(--md-sys-color-on-surface-variant)">'+m.grade.weight+'\u00d7</td><td style="padding:8px 10px;border-bottom:1px solid var(--md-sys-color-outline-variant);font-size:13px;color:var(--md-sys-color-on-surface-variant)">'+m.grade.labels.join(", ")+'</td></tr>'; }).join("");
  grid.innerHTML='<div class="card" style="padding:0;overflow:hidden;grid-column:1/-1"><table style="width:100%;border-collapse:collapse"><thead><tr>'+['Fach','Note','Gew.','Labels'].map(function(h){ return '<th style="text-align:left;padding:8px 10px;font-size:12px;color:var(--md-sys-color-on-surface-variant);border-bottom:1px solid var(--md-sys-color-outline-variant)">'+h+'</th>'; }).join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}

// ---------------------------------------------------------------------------
// Grid events
// ---------------------------------------------------------------------------
function bindGridEvents(container, subjects, rewardConfig) {
  const grid=container.querySelector("#subjectGrid");
  grid.addEventListener("click",e=>{ if (reorderMode) return; const card=e.target.closest(".ov-card"); if (card&&!e.target.closest(".btn-up,.btn-down")){ detailSubject=card.dataset.subject; _removeOverflowBtn(); renderDetail(container); } });
  grid.addEventListener("click",async e=>{ const btn=e.target.closest(".btn-up,.btn-down"); if (!btn) return; const i=parseInt(btn.dataset.index),j=btn.classList.contains("btn-up")?i-1:i+1; if (j<0||j>=subjects.length) return; [subjects[i],subjects[j]]=[subjects[j],subjects[i]]; grid.innerHTML=reorderList(subjects); try { await apiFetch("/api/subjects/reorder",{method:"PUT",body:JSON.stringify({order:subjects.map(s=>s.name)})}); } catch(err){showSnackbar(err.message,"error");} });

  const labelInput=container.querySelector("#labelInput"), chipInput=container.querySelector("#chipInput");
  labelInput?.addEventListener("keydown",e=>{ if (e.key==="Enter"||e.key===","||e.key==="Tab"){ e.preventDefault(); const val=labelInput.value.replace(/,/g,"").trim(); if (val){ _addChip(val,container,subjects); labelInput.value=""; } } if (e.key==="Backspace"&&!labelInput.value&&filterLabels.length) _removeChip(filterLabels.length-1,container,subjects); });
  labelInput?.addEventListener("blur",()=>{ const val=labelInput.value.replace(/,/g,"").trim(); if (val){ _addChip(val,container,subjects); labelInput.value=""; } });
  chipInput?.addEventListener("click",e=>{ const btn=e.target.closest(".chip-x"); if (btn) _removeChip(parseInt(btn.dataset.i),container,subjects); else labelInput?.focus(); });

  const modeRow=container.querySelector("#filterModeRow");
  modeRow?.querySelector("#filterClear")?.addEventListener("click",function(){ filterLabels=[]; filterGradeValues=[]; _rebuildGradeFilter(container); _rebuildFilter(container,subjects); });
  modeRow?.querySelectorAll("input[type=radio]").forEach(function(r){ r.addEventListener("change",function(){ filterMode=r.value; _applyFilter(container,subjects); }); });

  const gradeRow=container.querySelector("#gradeFilterRow");
  gradeRow?.addEventListener("click",function(e){
    var btn=e.target.closest(".grade-filter-chip");
    if (!btn) return;
    var v=parseInt(btn.dataset.value), idx=filterGradeValues.indexOf(v);
    if (idx===-1) filterGradeValues.push(v); else filterGradeValues.splice(idx,1);
    _rebuildGradeFilter(container);
    _applyFilter(container,subjects);
  });

  container.querySelector("#btnReorder")?.addEventListener("click",()=>{
    reorderMode=!reorderMode; grid.innerHTML=renderGridContent(subjects);
    const btn=container.querySelector("#btnReorder");
    if (btn) btn.innerHTML='<span class="material-symbols-rounded">'+(reorderMode?"check":"swap_vert")+'</span>'+(reorderMode?"Fertig":"Reihenfolge");
  });
  container.querySelector("#btnNewSubject")?.addEventListener("click",()=>{
    const dlg=openDialog("Fach erstellen",'<md-outlined-text-field id="dlgName" label="Fachname" style="width:100%"></md-outlined-text-field>');
    dlg.addEventListener("close",async()=>{ if (dlg.returnValue!=="confirm") return; const name=dlg.querySelector("#dlgName").value.trim(); if (!name) return;
      try { await apiFetch("/api/subjects",{method:"POST",body:JSON.stringify({name})}); showSnackbar("Fach '"+name+"' erstellt."); reorderMode=false; await renderGrid(container); } catch(e){showSnackbar(e.message,"error");} });
  });
}

// ---------------------------------------------------------------------------
// Add note from grid (subject selector first)
// ---------------------------------------------------------------------------
async function openAddNoteDialog(container, subjects, rewardConfig) {
  const opts=subjects.map(s=>'<option value="'+s.name+'">'+s.name+'</option>').join("");
  const dlg=openDialog("Fach ausw\u00e4hlen",
    '<div style="display:flex;flex-direction:column;gap:8px"><label style="font-size:13px;color:var(--md-sys-color-on-surface-variant)">Zu welchem Fach?</label>' +
    '<select id="dlgSubject" style="padding:10px 12px;border-radius:var(--shape-corner-small);border:1px solid var(--md-sys-color-outline);background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font-size:14px;font-family:inherit">'+opts+'</select></div>',"Weiter");
  dlg.addEventListener("close",()=>{ if (dlg.returnValue!=="confirm") return; const subject=subjects.find(s=>s.name===dlg.querySelector("#dlgSubject").value); if (subject) openGradeDialog(container,subject,null,subjects,rewardConfig); });
}

// ---------------------------------------------------------------------------
// DETAIL VIEW
// ---------------------------------------------------------------------------
async function renderDetail(container) {
  detailGradeFilter=[];
  container.innerHTML=
    '<div class="back-bar"><button class="icon-btn" id="btnBack"><span class="material-symbols-rounded">arrow_back</span></button><span class="back-bar__title">'+detailSubject+'</span></div>'+
    skeletonGrid(2,["title","medium","short"]);
  container.querySelector("#btnBack").addEventListener("click",()=>{ detailSubject=null; clearPrimaryAction(); renderGrid(container); });

  let subjects, rewardConfig;
  try { [subjects,rewardConfig]=await Promise.all([apiFetch("/api/subjects"),apiFetch("/api/reward-config")]); }
  catch(e){ container.innerHTML+=errorBanner(e.message); return; }

  const subject=subjects.find(s=>s.name===detailSubject);
  if (!subject){ showSnackbar("Fach nicht gefunden.","error"); detailSubject=null; clearPrimaryAction(); return renderGrid(container); }
  _cachedRewardConfig=rewardConfig;
  setPrimaryAction("add","Note hinzuf\u00fcgen",()=>openGradeDialog(container,subject,null,subjects,rewardConfig));
  drawDetail(container,subject,subjects,rewardConfig);
}

function _renderDetailGradeChipsHtml() {
  return [1,2,3,4,5,6].map(function(v) {
    return '<button class="grade-filter-chip' + (detailGradeFilter.includes(v) ? " active" : "") + '" data-value="' + v + '">' + v + '</button>';
  }).join("");
}

function drawDetail(container,subject,subjects,rewardConfig) {
  const g=subject.grades, w=g.reduce((a,x)=>a+x.weight,0), avg=w?g.reduce((a,x)=>a+x.value*x.weight,0)/w:null;
  const items=detailGradeFilter.length?g.map(function(gr,i){ return {gr:gr,i:i}; }).filter(function(item){ return detailGradeFilter.includes(Math.floor(item.gr.value)); }):g.map(function(gr,i){ return {gr:gr,i:i}; });
  const hasFilter=detailGradeFilter.length>0;
  let rows;
  if (items.length) {
    rows=items.map(function(item){
      var gr=item.gr, i=item.i;
      return '<tr><td style="padding:10px;border-bottom:1px solid var(--md-sys-color-outline-variant)">'+gradeBadge(gr.value)+'</td>' +
        '<td style="padding:10px;border-bottom:1px solid var(--md-sys-color-outline-variant);font-size:14px">'+(gr.weight!==1?"<strong>"+gr.weight+"\u00d7</strong>":"1\u00d7")+'</td>' +
        '<td style="padding:10px;border-bottom:1px solid var(--md-sys-color-outline-variant);font-size:13px;color:var(--md-sys-color-on-surface-variant);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(gr.labels.join(", ")||"\u2014")+'</td>' +
        '<td style="padding:10px;border-bottom:1px solid var(--md-sys-color-outline-variant);white-space:nowrap;text-align:right">' +
          '<button class="icon-btn-sm btn-edit" data-index="'+i+'"><span class="material-symbols-rounded">edit</span></button>' +
          '<button class="icon-btn-sm btn-del"  data-index="'+i+'" style="color:var(--md-sys-color-error)"><span class="material-symbols-rounded">delete</span></button></td></tr>';
    }).join("");
  } else {
    rows='<tr><td colspan="4" style="padding:32px;text-align:center;color:var(--md-sys-color-on-surface-variant)">'+(hasFilter?"Keine Noten mit diesem Filter.":"Keine Noten.")+'</td></tr>';
  }

  container.innerHTML=
    '<div class="back-bar"><button class="icon-btn" id="btnBack"><span class="material-symbols-rounded">arrow_back</span></button><span class="back-bar__title">'+subject.name+'</span>' +
    '<div class="back-bar__actions"><button class="icon-btn" id="btnRename"><span class="material-symbols-rounded">edit</span></button>' +
    '<button class="icon-btn" id="btnDelSubject" style="color:var(--md-sys-color-error)"><span class="material-symbols-rounded">delete</span></button></div></div>' +
    (avg!==null?'<div class="card stat-banner-grid" style="margin-bottom:16px">'+statChip("Durchschnitt",avg.toFixed(2))+statChip("Eintr\u00e4ge",g.length,"--md-sys-color-secondary")+statChip("Beste Note",Math.min(...g.map(function(x){ return x.value; })),"--md-sys-color-tertiary")+'</div>':"") +
    '<div id="detailGradeFilterRow" class="grade-filter-row" style="margin-bottom:10px">'+_renderDetailGradeChipsHtml()+'</div>' +
    '<div class="card" style="padding:0;overflow:hidden"><table class="grade-table" style="width:100%;border-collapse:collapse">' +
    '<thead><tr>'+['Note','Gew.','Labels',''].map(function(h){ return '<th style="text-align:left;padding:8px 10px;font-size:12px;color:var(--md-sys-color-on-surface-variant);border-bottom:1px solid var(--md-sys-color-outline-variant)">'+h+'</th>'; }).join("")+'</tr></thead>' +
    '<tbody>'+rows+'</tbody></table></div>';

  container.querySelector("#btnBack").addEventListener("click",()=>{ detailSubject=null; clearPrimaryAction(); renderGrid(container); });
  container.querySelector("#btnRename").addEventListener("click",()=>{
    const dlg=openDialog("Fach umbenennen",'<md-outlined-text-field id="dlgNewName" label="Neuer Name" value="'+subject.name+'" style="width:100%"></md-outlined-text-field>');
    dlg.addEventListener("close",async()=>{ if (dlg.returnValue!=="confirm") return; const name=dlg.querySelector("#dlgNewName").value.trim(); if (!name||name===subject.name) return;
      try { await apiFetch("/api/subjects",{method:"POST",body:JSON.stringify({name})}); for (const gr of subject.grades) await apiFetch("/api/subjects/"+encodeURIComponent(name)+"/grades",{method:"POST",body:JSON.stringify({value:gr.value,weight:gr.weight,labels:gr.labels})}); await apiFetch("/api/subjects/"+encodeURIComponent(subject.name),{method:"DELETE"}); showSnackbar("Umbenannt zu '"+name+"'."); detailSubject=name; await renderDetail(container); }
      catch(e){showSnackbar(e.message,"error");} });
  });
  container.querySelector("#btnDelSubject").addEventListener("click",()=>{
    const dlg=openDialog("Fach l\u00f6schen",'<p style="font-size:14px">Fach <strong>'+subject.name+'</strong> und alle '+g.length+' Noten l\u00f6schen?</p>',"L\u00f6schen",true);
    dlg.addEventListener("close",async()=>{ if (dlg.returnValue!=="confirm") return;
      try { await apiFetch("/api/subjects/"+encodeURIComponent(subject.name),{method:"DELETE"}); showSnackbar("'"+subject.name+"' gel\u00f6scht."); detailSubject=null; clearPrimaryAction(); await renderGrid(container); } catch(e){showSnackbar(e.message,"error");} });
  });
  container.querySelectorAll(".btn-edit").forEach(btn=>btn.addEventListener("click",()=>openGradeDialog(container,subject,parseInt(btn.dataset.index),subjects,rewardConfig)));
  container.querySelectorAll(".btn-del").forEach(btn=>btn.addEventListener("click",()=>{
    const idx=parseInt(btn.dataset.index),gr=subject.grades[idx];
    const dlg=openDialog("Note l\u00f6schen",'<p style="font-size:14px">Note <strong>'+gr.value+'</strong> ('+gr.weight+'\u00d7) l\u00f6schen?</p>',"L\u00f6schen",true);
    dlg.addEventListener("close",async()=>{ if (dlg.returnValue!=="confirm") return;
      try { await apiFetch("/api/subjects/"+encodeURIComponent(subject.name)+"/grades/"+idx+"?adjust_wallet=1",{method:"DELETE"}); showSnackbar("Note gel\u00f6scht."); await refreshDetail(container,subject.name,rewardConfig); }
      catch(e){showSnackbar(e.message,"error");} });
  }));
  container.querySelector("#detailGradeFilterRow")?.addEventListener("click",function(e){
    var btn=e.target.closest(".grade-filter-chip");
    if (!btn) return;
    var v=parseInt(btn.dataset.value), idx=detailGradeFilter.indexOf(v);
    if (idx===-1) detailGradeFilter.push(v); else detailGradeFilter.splice(idx,1);
    drawDetail(container,subject,subjects,rewardConfig);
  });
}

async function refreshDetail(container,name,rewardConfig) {
  const subjects=await apiFetch("/api/subjects"), subject=subjects.find(s=>s.name===name);
  if (!subject){ detailSubject=null; clearPrimaryAction(); return renderGrid(container); }
  drawDetail(container,subject,subjects,rewardConfig);
}

// ---------------------------------------------------------------------------
// Grade add/edit dialog
// With validation snackbar + optional "Belohnung buchen" checkbox
// ---------------------------------------------------------------------------
function openGradeDialog(container, subject, editIndex, subjects, rewardConfig) {
  const gr = editIndex !== null ? subject.grades[editIndex] : null;
  const isEdit = editIndex !== null;

  // Show "Belohnung buchen" checkbox only when adding a new grade and rewards are enabled
  const bookRewardRow = (!isEdit && rewardConfig?.enabled)
    ? '<label style="display:flex;align-items:center;gap:10px;font-size:14px;cursor:pointer;padding-top:4px">' +
        '<md-checkbox id="dlgBookReward" checked></md-checkbox>' +
        'Belohnung buchen' +
      '</label>'
    : "";

  const dlg = openDialog(
    isEdit ? "Note bearbeiten" : "Note hinzuf\u00fcgen",
    '<md-outlined-text-field id="dlgVal" label="Note (1\u20136)" type="number" min="1" max="6" step="0.5" value="'+(gr?.value??"")+'" style="width:100%"></md-outlined-text-field>' +
    '<md-outlined-text-field id="dlgWt"  label="Gewichtung" type="number" min="0.5" step="0.5" value="'+(gr?.weight??1)+'" style="width:100%"></md-outlined-text-field>' +
    '<md-outlined-text-field id="dlgLbl" label="Labels (Komma getrennt)" value="'+(gr?.labels?.join(", ")??"")+'" style="width:100%"></md-outlined-text-field>' +
    bookRewardRow,
    isEdit ? "Speichern" : "Hinzuf\u00fcgen"
  );

  dlg.addEventListener("close", async () => {
    if (dlg.returnValue !== "confirm") return;

    const fVal = dlg.querySelector("#dlgVal");
    const fWt  = dlg.querySelector("#dlgWt");

    // Validate – show snackbar so user sees the error even after dialog closed
    const valMsg = validators.gradeValue(fVal?.value ?? "");
    const wtMsg  = validators.positiveNumber(fWt?.value ?? "");
    if (valMsg) { showSnackbar(valMsg, "error"); return; }
    if (wtMsg)  { showSnackbar(wtMsg,  "error"); return; }

    const value  = parseFloat(fVal.value);
    const weight = parseFloat(fWt.value) || 1;
    const raw    = dlg.querySelector("#dlgLbl").value.trim();
    const labels = raw ? raw.split(",").map(l=>l.trim()).filter(Boolean) : [];

    // "Belohnung buchen" checkbox – md-checkbox uses .checked property
    const bookRewardEl = dlg.querySelector("#dlgBookReward");
    const bookReward   = bookRewardEl ? !!bookRewardEl.checked : true;

    const url    = isEdit
      ? "/api/subjects/"+encodeURIComponent(subject.name)+"/grades/"+editIndex
      : "/api/subjects/"+encodeURIComponent(subject.name)+"/grades";
    const body   = isEdit
      ? { value, weight, labels }
      : { value, weight, labels, book_reward: bookReward };

    try {
      await apiFetch(url, { method: isEdit ? "PUT" : "POST", body: JSON.stringify(body) });
      showSnackbar(isEdit ? "Note aktualisiert." : "Note hinzugef\u00fcgt.");
      await refreshDetail(container, subject.name, rewardConfig);
    } catch(e) { showSnackbar(e.message, "error"); }
  });
}

function injectStyles() {
  if (document.getElementById("ov-css")) return;
  const s=document.createElement("style"); s.id="ov-css";
  s.textContent=".ov-card.card{cursor:pointer;transition:background .15s;padding:16px 20px;}.ov-card.card:hover{background:var(--md-sys-color-surface-container);}";
  document.head.appendChild(s);
}
