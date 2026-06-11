// ── Session guard — redirect to auth if not logged in ─────────────────
// Temporarily disabled for testing
// (function() {
//   const session = JSON.parse(localStorage.getItem("schoolos_session") || "null");
//   if (!session || !session.loggedIn || session.role !== "principal") {
//     window.location.replace("../Parent/Logins/auth.html");
//   }
// })();

// ── localStorage persistence helpers ──────────────────────────────────
function getSession() {
  return JSON.parse(localStorage.getItem("schoolos_session") || "{}");
}
function userKey(suffix) {
  const email = getSession().email || "default";
  return "schoolos_" + email + "_" + suffix;
}
function saveState() {
  localStorage.setItem(userKey("students"),  JSON.stringify(state.students));
  localStorage.setItem(userKey("classes"),   JSON.stringify(state.classStructure));
  localStorage.setItem(userKey("timetable"), JSON.stringify(state.timetable));
}
function loadState() {
  try {
    const s = localStorage.getItem(userKey("students"));
    const c = localStorage.getItem(userKey("classes"));
    const t = localStorage.getItem(userKey("timetable"));
    if (s) state.students       = JSON.parse(s);
    if (c) state.classStructure = JSON.parse(c);
    if (t) state.timetable      = JSON.parse(t);
  } catch(e) { console.warn("Could not load saved data:", e); }
}

// ── Constants ──────────────────────────────────────────────────────────
const SUBJECTS = ["English","Arabic","Islamic","Geography","Physics","Chemistry","Somali","Math","Biology","History"];
const PAGE_TITLES = { dashboard:"Overview", students:"Students", attendance:"Attendance", grades:"Grades", timetable:"Timetable", classes:"Classes & Forms", settings:"Settings" };
const ALL_DAYS = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];
const COLOR_LIST = ["blue","teal","coral","purple","amber"];
const SUBJECT_STYLES = {
  English:{bg:"#E1F5EE",color:"#0F6E56"}, Arabic:{bg:"#FEF3E2",color:"#9B5A00"},
  Islamic:{bg:"#FAECE7",color:"#993C1D"}, Geography:{bg:"#E8F5E9",color:"#2E7D32"},
  Physics:{bg:"#E6F1FB",color:"#185FA5"}, Chemistry:{bg:"#EAF3DE",color:"#3B6D11"},
  Somali:{bg:"#FCE4EC",color:"#880E4F"},  Math:{bg:"#EDE7F6",color:"#4527A0"},
  Biology:{bg:"#E0F7FA",color:"#006064"}, History:{bg:"#FAEEDA",color:"#854F0B"},
};
const AVATAR_COLORS = {
  blue:{bg:"#E6F1FB",text:"#185FA5"}, teal:{bg:"#E1F5EE",text:"#0F6E56"},
  coral:{bg:"#FAECE7",text:"#993C1D"}, purple:{bg:"#EEEDFE",text:"#534AB7"},
  amber:{bg:"#FAEEDA",text:"#854F0B"},
};
const STATUS_MAP = {
  "active":{label:"Active",cls:"badge-active"},
  "at-risk":{label:"At risk",cls:"badge-atrisk"},
  "low-attendance":{label:"Low attendance",cls:"badge-lowatt"},
};

// ── State ──────────────────────────────────────────────────────────────
const state = {
  activeNav:"dashboard", students:[], search:"", selectedClass:null,
  classStructure: {},
  timetable: {
    weekend: [],
    periods: [],
    slots: {},
  },
  schoolProfileImage: localStorage.getItem("schoolos_profile_image") || "",
};
const allClasses = () => Object.values(state.classStructure).flat();

// ── Real-time socket (optional) and attendance helpers ──────────────
let socket = null;
(function initSocket(){
  try{
    if (typeof io !== 'undefined'){
      socket = io();
      socket.on('connect', ()=>console.log('socket connected'));
      socket.on('attendance:updated', payload=>{ handleRemoteAttendanceUpdate(payload); });
    }
  }catch(e){ console.warn('socket init failed', e); }
})();

function handleRemoteAttendanceUpdate(payload){
  try{
    const d = new Date(payload.date).toISOString().slice(0,10);
    const sid = String(payload.studentId);
    const st = state.students.find(s => String(s.id)===sid || String(s._id)===sid);
    if(!st) return;
    st.attendanceDays = st.attendanceDays || {};
    st.attendanceDays[d] = payload.status;
    if(typeof payload.percent === 'number') st.attendance = payload.percent;
    else st.attendance = calcAttendancePercentFromDays(st);
    saveState(); renderPage(); render();
  }catch(e){console.warn('handleRemoteAttendanceUpdate',e);} 
}

function calcAttendancePercentFromDays(st, month, year){
  const days = st.attendanceDays || {};
  const keys = Object.keys(days).filter(k=>{
    if(month===undefined) return true;
    const dt = new Date(k);
    return dt.getMonth()===(month-1) && dt.getFullYear()===year;
  });
  if(keys.length===0) return 0;
  const present = keys.filter(k=>days[k]==='present'||days[k]==='late').length;
  return Math.round((present/keys.length)*100);
}

async function postAttendanceToServer(studentId, dateStr, status){
  try{
    const session = getSession();
    const res = await fetch((window.SCHOOLOS_API_BASE||'') + '/api/attendance', {
      method:'POST', headers:{'Content-Type':'application/json', 'Authorization': (session.token?('Bearer '+session.token):'')},
      body: JSON.stringify({ studentId, date: dateStr, status })
    });
    if(!res.ok) return null;
    return await res.json();
  }catch(e){ console.warn('postAttendanceToServer',e); return null; }
}

function toggleAttendanceLocal(student, dateStr, status){
  student.attendanceDays = student.attendanceDays || {};
  if(status===undefined){ // toggle
    const cur = student.attendanceDays[dateStr];
    student.attendanceDays[dateStr] = cur==='present'?'absent':'present';
  } else {
    student.attendanceDays[dateStr] = status;
  }
  student.attendance = calcAttendancePercentFromDays(student);
  saveState();
}

async function toggleAttendance(student, dateStr){
  // toggle local
  toggleAttendanceLocal(student, dateStr);
  // try to persist to server
  const sid = student._id || student.id;
  const res = await postAttendanceToServer(sid, dateStr, student.attendanceDays[dateStr]);
  if(res && res.percent!==undefined){ student.attendance = res.percent; saveState(); }
}

// ── DOM Helpers ────────────────────────────────────────────────────────
function el(tag, attrs={}, ...children) {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k==="className") e.className=v;
    else if (k==="style" && typeof v==="object") Object.assign(e.style,v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(),v);
    else e.setAttribute(k,v);
  }
  for (const child of children) {
    if (child==null||child===false) continue;
    e.appendChild(typeof child==="string"?document.createTextNode(child):child);
  }
  return e;
}
function updateSidebarProfileImage() {
  const imgEl = document.getElementById("sidebar-profile-image");
  const avatarEl = document.getElementById("sidebar-avatar");
  if (!imgEl || !avatarEl) return;
  if (state.schoolProfileImage) {
    imgEl.src = state.schoolProfileImage;
    imgEl.style.display = "block";
    avatarEl.style.display = "none";
  } else {
    imgEl.style.display = "none";
    imgEl.removeAttribute("src");
    avatarEl.style.display = "";
  }
}
function avatar(initials, color, sizeClass="") {
  const ac=AVATAR_COLORS[color]||AVATAR_COLORS.blue;
  const s=el("span",{className:`avatar ${sizeClass}`});
  s.style.background=ac.bg; s.style.color=ac.text; s.textContent=initials; return s;
}
function badge(status) {
  const s=STATUS_MAP[status]||STATUS_MAP.active;
  return el("span",{className:`badge ${s.cls}`},s.label);
}
function classPill(cls) { return el("span",{className:"class-pill"},cls); }
function subjPill(subject,sizeClass="subj-pill") {
  const sty=SUBJECT_STYLES[subject]||{bg:"#f5f5f5",color:"#555"};
  const s=el("span",{className:sizeClass}); s.style.background=sty.bg; s.style.color=sty.color; s.textContent=subject; return s;
}
function progressBar(pct, trackClass="progress-track") {
  const color=pct>=85?"#63991C":pct>=75?"#EF9F27":"#E24B4A";
  const fill=el("div",{className:"progress-fill"}); fill.style.width=pct+"%"; fill.style.background=color;
  const track=el("div",{className:trackClass}); track.appendChild(fill); return track;
}
function metricCard(label,value,color,bg) {
  const c=el("div",{className:"metric-card"}); c.style.background=bg;
  c.appendChild(el("div",{className:"m-label",style:{color}},label));
  c.appendChild(el("div",{className:"m-value",style:{color}},String(value))); return c;
}
function secTitle(text) { return el("div",{className:"sec-title"},text); }
function linkBtn(text,onClick) { return el("button",{className:"link-btn",onClick},text); }
function emptyState(icon,title,sub) {
  const d=el("div",{className:"empty-state"});
  d.appendChild(el("div",{className:"es-icon"},icon));
  d.appendChild(el("div",{className:"es-title"},title));
  d.appendChild(el("div",{className:"es-sub"},sub)); return d;
}

// ── Modal System ───────────────────────────────────────────────────────
function showModal(titleText,bodyEl,width="") {
  const overlay=el("div",{className:"modal-overlay"});
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
  const box=el("div",{className:"modal-box "+width});
  const header=el("div",{className:"modal-header"});
  header.appendChild(el("h2",{},titleText));
  const closeBtn=el("button",{className:"modal-close"},"×"); closeBtn.onclick=()=>overlay.remove();
  header.appendChild(closeBtn); box.appendChild(header); box.appendChild(bodyEl);
  overlay.appendChild(box); document.body.appendChild(overlay);
  return {overlay,close:()=>overlay.remove()};
}
function field(labelText,inputAttrs={}) {
  const wrap=el("div",{className:"field"});
  wrap.appendChild(el("label",{},labelText));
  let input;
  if (inputAttrs.type==="select") {
    input=el("select");
    (inputAttrs.options||[]).forEach(o=>{const opt=el("option",{value:o.value??o},o.label??o);input.appendChild(opt);});
    if (inputAttrs.value!==undefined) input.value=inputAttrs.value;
  } else {
    const {type="text",placeholder="",value=""}=inputAttrs;
    input=el("input",{type,placeholder,value});
  }
  wrap.appendChild(input); return {wrap,input};
}
function timeField(labelText, initialValue="08:00") {
  const wrap = el("div", {className: "field"});
  wrap.appendChild(el("label", {}, labelText));
  
  const [initHour, initMin] = (initialValue || "08:00").split(":");
  
  const hourSelect = el("select", {className: "time-select-hour"});
  for (let h = 0; h < 24; h++) {
    const val = String(h).padStart(2, "0");
    const opt = el("option", {value: val}, val);
    if (val === initHour) opt.selected = true;
    hourSelect.appendChild(opt);
  }
  
  const colon = el("span", {className: "time-picker-colon"}, ":");
  
  const minSelect = el("select", {className: "time-select-min"});
  for (let m = 0; m < 60; m++) {
    const val = String(m).padStart(2, "0");
    const opt = el("option", {value: val}, val);
    if (val === initMin) opt.selected = true;
    minSelect.appendChild(opt);
  }
  
  const selectRow = el("div", {className: "time-picker-row"}, hourSelect, colon, minSelect);
  wrap.appendChild(selectRow);
  
  return {
    wrap,
    input: {
      get value() {
        return `${hourSelect.value}:${minSelect.value}`;
      },
      set value(val) {
        if (!val || !val.includes(":")) return;
        const [h, m] = val.split(":");
        hourSelect.value = h;
        minSelect.value = m;
      }
    }
  };
}
function confirmModal(message,onConfirm) {
  const body=el("div",{});
  const p=el("p",{style:{fontSize:"14px",color:"#555",marginBottom:"1.25rem"}});
  p.innerHTML=message; body.appendChild(p);
  const footer=el("div",{className:"modal-footer"});
  const {overlay}=showModal("Confirm",body,"modal-box-narrow");
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  footer.appendChild(el("button",{className:"btn-danger",onClick:()=>{onConfirm();overlay.remove();}},"Yes, remove"));
  body.appendChild(footer);
}

// ── Render Engine ──────────────────────────────────────────────────────
function render() {
  document.querySelectorAll(".nav-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.key===state.activeNav));
  document.getElementById("page-title").textContent=PAGE_TITLES[state.activeNav];
  document.getElementById("page-date").textContent=new Date().toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const actions=document.getElementById("topbar-actions"); actions.innerHTML="";
  if (state.activeNav==="students") {
    const sb=el("div",{className:"search-box"}); sb.appendChild(el("span",{},"🔍"));
    const si=el("input",{type:"text",placeholder:"Search students..."}); si.value=state.search;
    si.addEventListener("input",e=>{state.search=e.target.value;renderPage();}); sb.appendChild(si); actions.appendChild(sb);
    const ab=el("button",{className:"btn-primary"},"+  Add student"); ab.onclick=()=>showAddStudentModal(); actions.appendChild(ab);
  }
  renderPage();
}
function renderPage() {
  const content=document.getElementById("page-content"); content.innerHTML="";
  const nav=state.activeNav;
  if      (nav==="dashboard")  content.appendChild(renderDashboard());
  else if (nav==="students")   content.appendChild(renderStudents());
  else if (nav==="attendance") content.appendChild(renderAttendance());
  else if (nav==="grades")     content.appendChild(renderGrades());
  else if (nav==="timetable")  content.appendChild(renderTimetable());
  else if (nav==="classes")    content.appendChild(renderClasses());
  else if (nav==="settings")   content.appendChild(renderSettings());
}

// ── Dashboard ──────────────────────────────────────────────────────────
function renderDashboard() {
  const page=el("div",{className:"page"});
  const classes=allClasses();
  const grid=el("div",{className:"metric-grid-3"});
  grid.appendChild(metricCard("Total students",state.students.length,"#3B6D11","#EAF3DE"));
  grid.appendChild(metricCard("Total classes",classes.length,"#185FA5","#E6F1FB"));
  grid.appendChild(metricCard("At risk",state.students.filter(s=>s.status==="at-risk").length,"#A32D2D","#FCEBEB"));
  page.appendChild(grid);
  const formsCard=el("div",{className:"card card-pad"});
  formsCard.appendChild(secTitle("Forms & classes"));
  const fg=el("div",{className:"form-overview-grid"});
  Object.entries(state.classStructure).forEach(([form,cls])=>{
    const fc=el("div",{className:"form-overview-card"});
    fc.appendChild(el("div",{className:"fo-title"},form));
    const pills=el("div",{className:"fo-pills"});
    if(cls.length===0) pills.appendChild(el("span",{className:"fs-11 color-muted"},"No classes"));
    cls.forEach(c=>{const p=el("span",{className:"badge",style:{background:"#E6F1FB",color:"#185FA5",margin:"0"}},c);pills.appendChild(p);});
    fc.appendChild(pills); fg.appendChild(fc);
  });
  formsCard.appendChild(fg);
  formsCard.appendChild(linkBtn("Manage classes →",()=>{state.activeNav="classes";render();}));
  page.appendChild(formsCard);
  const bot=el("div",{className:"col-2-1"});
  const snap=el("div",{className:"card card-pad"});
  snap.appendChild(secTitle("Students snapshot"));
  if(state.students.length===0){
    const es=el("div",{style:{padding:"2rem",textAlign:"center"}});
    es.appendChild(el("div",{style:{fontSize:"28px",marginBottom:"8px"}},"👥"));
    es.appendChild(el("div",{className:"fs-13 color-muted"},"No students yet."));
    es.appendChild(linkBtn("Go to Students →",()=>{state.activeNav="students";render();}));
    snap.appendChild(es);
  } else {
    state.students.slice(0,5).forEach(st=>{
      const row=el("div",{className:"snapshot-row"});
      const left=el("div",{className:"flex-center gap-10"});
      left.appendChild(avatar(st.initials,st.color));
      const info=el("div",{}); info.appendChild(el("div",{className:"snapshot-name"},st.name)); info.appendChild(classPill(st.class));
      left.appendChild(info); row.appendChild(left); row.appendChild(badge(st.status)); snap.appendChild(row);
    });
    snap.appendChild(linkBtn("View all →",()=>{state.activeNav="students";render();}));
  }
  bot.appendChild(snap);
  const ql=el("div",{className:"quick-links"});
  [{label:"Students",key:"students",icon:"👥",desc:"Manage records"},{label:"Attendance",key:"attendance",icon:"📅",desc:"Track daily log"},
   {label:"Grades",key:"grades",icon:"📈",desc:"Exam scores"},{label:"Timetable",key:"timetable",icon:"🕐",desc:"Class schedule"},
   {label:"Classes",key:"classes",icon:"🏫",desc:"Forms & classes"}].forEach(item=>{
    const btn=el("button",{className:"quick-link-btn",onClick:()=>{state.activeNav=item.key;render();}});
    btn.appendChild(el("span",{className:"ql-icon"},item.icon));
    const info=el("div",{}); info.appendChild(el("div",{className:"ql-label"},item.label)); info.appendChild(el("div",{className:"ql-desc"},item.desc));
    btn.appendChild(info); btn.appendChild(el("span",{className:"ql-arrow"},"→")); ql.appendChild(btn);
  });
  bot.appendChild(ql); page.appendChild(bot); return page;
}

// ── Students ───────────────────────────────────────────────────────────
function renderStudents() {
  const page=el("div",{className:"page"}); const classes=allClasses();
  let filterClass="All";
  const filtered=()=>state.students.filter(s=>{
    const ms=s.name.toLowerCase().includes(state.search.toLowerCase())||s.class.toLowerCase().includes(state.search.toLowerCase());
    return ms&&(filterClass==="All"||s.class===filterClass);
  });
  const card=el("div",{className:"card"});
  const header=el("div",{className:"table-header"}); const titleSpan=el("span",{},"");
  header.appendChild(titleSpan);
  const fw=el("div",{className:"flex-center gap-8"}); fw.appendChild(el("span",{className:"fs-12 color-muted"},"Filter:"));
  const sel=el("select",{className:"filter-select"});
  const ao=document.createElement("option"); ao.value="All"; ao.textContent="All classes"; sel.appendChild(ao);
  classes.forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;sel.appendChild(o);});
  sel.addEventListener("change",e=>{filterClass=e.target.value;refreshTable();});
  fw.appendChild(sel); header.appendChild(fw); card.appendChild(header);
  const tw=el("div",{className:"overflow-x"}); const table=el("table",{});
  const thead=el("thead",{}); const tr=el("tr",{});
  ["Student ID","Name","Class","Attendance","Avg grade","Status","Actions"].forEach(h=>tr.appendChild(el("th",{},h)));
  thead.appendChild(tr); table.appendChild(thead); const tbody=el("tbody",{});
  table.appendChild(tbody); tw.appendChild(table); card.appendChild(tw); page.appendChild(card);
  function refreshTable(){
    const list=filtered(); titleSpan.textContent=`All students (${list.length})`; tbody.innerHTML="";
    if(list.length===0){const td=el("td",{colSpan:"7"});td.appendChild(emptyState("👥","No students yet",'Click "+ Add student" to register your first student.'));tbody.appendChild(el("tr",{},td));return;}
    list.forEach(st=>{
      const row=el("tr",{});
      const ic=el("td",{className:"fw-700",style:{color:"#185FA5"}},st.studentId); row.appendChild(ic);
      const nc=el("td",{}); const nw=el("div",{className:"flex-center gap-10"}); nw.appendChild(avatar(st.initials,st.color)); nw.appendChild(el("span",{className:"fw-700"},st.name)); nc.appendChild(nw); row.appendChild(nc);
      const cc=el("td",{}); cc.appendChild(classPill(st.class)); row.appendChild(cc);
      const ac=el("td",{}); const pw=el("div",{className:"progress-wrap"}); pw.appendChild(progressBar(st.attendance)); pw.appendChild(el("span",{},st.attendance+"%")); ac.appendChild(pw); row.appendChild(ac);
      row.appendChild(el("td",{className:"fw-700"},String(st.avgGrade||"—")));
      const sc=el("td",{}); sc.appendChild(badge(st.status)); row.appendChild(sc);
      const actc=el("td",{}); const actw=el("div",{className:"flex gap-6"});
      const vb=el("button",{className:"btn-sm"},"View"); vb.onclick=()=>showStudentProfile(st);
      const db=el("button",{className:"btn-sm-danger"},"Remove"); db.onclick=()=>{const m=document.createElement("span");m.innerHTML=`Remove <strong>${st.name}</strong> permanently?`;confirmModal(m.outerHTML,()=>{state.students=state.students.filter(s=>s.id!==st.id);saveState();refreshTable();});};
      actw.appendChild(vb); actw.appendChild(db); actc.appendChild(actw); row.appendChild(actc); tbody.appendChild(row);
    });
  }
  refreshTable(); return page;
}

// ── Student Profile Modal ──────────────────────────────────────────────
function showStudentProfile(st) {
  const body=el("div",{});
  const header=el("div",{className:"profile-header"}); header.appendChild(avatar(st.initials,st.color,"avatar-xl"));
  const info=el("div",{style:{flex:"1"}}); info.appendChild(el("div",{style:{fontSize:"20px",fontWeight:"700",marginBottom:"4px"}},st.name));
  const idAndClass=el("div",{className:"flex-center gap-8",style:{marginBottom:"8px"}}); idAndClass.appendChild(el("span",{style:{fontSize:"12px",fontWeight:"700",color:"#185FA5",background:"#E6F1FB",padding:"3px 10px",borderRadius:"20px"}},"ID: "+st.studentId)); idAndClass.appendChild(classPill(st.class)); info.appendChild(idAndClass);
  const pills=el("div",{className:"flex-center gap-8",style:{flexWrap:"wrap"}}); pills.appendChild(badge(st.status)); info.appendChild(pills); header.appendChild(info); body.appendChild(header);
  const stats=el("div",{className:"profile-stats"});
  const ac=st.attendance>=85?"#3B6D11":st.attendance>=70?"#854F0B":"#A32D2D";
  [["Attendance",st.attendance+"%",ac],["Avg. grade",st.avgGrade||"—","#185FA5"],["Subjects",st.exams.length,"#534AB7"],["Passed",st.exams.filter(e=>e.score>=50).length+"/"+st.exams.length,"#3B6D11"]].forEach(([l,v,c])=>{
    const s=el("div",{className:"profile-stat"}); s.appendChild(el("div",{className:"ps-label"},l)); s.appendChild(el("div",{className:"ps-value",style:{color:c}},String(v))); stats.appendChild(s);
  });
  body.appendChild(stats); body.appendChild(secTitle("Exam scores"));
  // Monthly attendance snapshot
  try{
    const now = new Date(); const m = now.getMonth()+1; const y = now.getFullYear();
    const monthPercent = calcAttendancePercentFromDays(st, m, y);
    const days = st.attendanceDays || {};
    const absent = Object.keys(days).filter(k=>{ const dt=new Date(k); return dt.getMonth()===(m-1) && dt.getFullYear()===y && days[k]==='absent'; });
    const attWrap = el('div',{style:{marginTop:'12px',marginBottom:'8px',display:'flex',alignItems:'center',gap:'8px'}});
    attWrap.appendChild(el('div',{className:'fs-13',style:{fontWeight:'700'}},`This month attendance: ${monthPercent}%`));
    attWrap.appendChild(el('div',{className:'fs-12 color-muted',style:{marginTop:'6px'}},`Absent days: ${absent.length?absent.join(', '):'None'}`));
    const manageBtn = el('button',{className:'btn-sm',onClick:()=>showManageAttendanceModal(st.class, m, y)}, 'Manage class month');
    const viewBtn = el('button',{className:'btn-sm',onClick:()=>showStudentAttendanceModal(st, m, y)}, 'View / Edit student month');
    attWrap.appendChild(manageBtn); attWrap.appendChild(viewBtn); body.appendChild(attWrap);
  }catch(e){console.warn('monthly attendance show failed',e);} 
  if(st.exams.length===0){body.appendChild(el("p",{style:{color:"#bbb",fontSize:"13px",marginBottom:"20px"}},"No exam records yet."));}
  else {
    const sw=el("div",{style:{marginBottom:"20px"}});
    st.exams.forEach(e=>{
      const sty=SUBJECT_STYLES[e.subject]||{bg:"#f5f5f5",color:"#555"};
      const grade=e.score>=90?"A":e.score>=80?"B":e.score>=70?"C":e.score>=60?"D":e.score>=50?"E":"F";
      const gc=e.score>=70?"#3B6D11":e.score>=50?"#854F0B":"#A32D2D";
      const row=el("div",{className:"exam-score-row"});
      const pill=el("span",{className:"subj-pill",style:{minWidth:"80px",textAlign:"center"}}); pill.style.background=sty.bg; pill.style.color=sty.color; pill.textContent=e.subject; row.appendChild(pill);
      const track=el("div",{className:"progress-track-bar"}); const fill=el("div",{className:"progress-fill"}); fill.style.width=e.score+"%"; fill.style.background=e.score>=70?"#63991C":e.score>=50?"#EF9F27":"#E24B4A"; track.appendChild(fill); row.appendChild(track);
      row.appendChild(el("span",{className:"exam-score-num"},String(e.score))); row.appendChild(el("span",{className:"exam-grade",style:{color:gc}},grade)); sw.appendChild(row);
    });
    const hi=st.exams.reduce((a,b)=>a.score>b.score?a:b); const lo=st.exams.reduce((a,b)=>a.score<b.score?a:b);
    const sum=el("div",{className:"score-summary"});
    const be=el("div",{className:"best"}); be.innerHTML=`<span>Best: </span><strong style="color:#3B6D11">${hi.subject} (${hi.score})</strong>`;
    const we=el("div",{className:"worst"}); we.innerHTML=`<span>Weakest: </span><strong style="color:#A32D2D">${lo.subject} (${lo.score})</strong>`;
    sum.appendChild(be); sum.appendChild(we); sw.appendChild(sum); body.appendChild(sw);
  }
  const footer=el("div",{className:"modal-footer"}); const editBtn=el("button",{className:"btn-primary"},"✎ Edit Info"); editBtn.onclick=()=>showEditStudentModal(st); footer.appendChild(editBtn); body.appendChild(footer);
  showModal("Full student profile",body,"modal-box-wide");
}

// ── Edit Student Modal ─────────────────────────────────────────────────
function showEditStudentModal(st) {
  const body=el("div",{});
  const {wrap:iw,input:ii}=field("Student ID",{value:st.studentId}); body.appendChild(iw);
  const classes=allClasses();
  const {wrap:cw,input:cs}=field("Class",{type:"select",options:classes,value:st.class}); body.appendChild(cw);
  body.appendChild(secTitle("Update exam scores"));
  const ei={}; const eg=el("div",{className:"exam-inputs-grid"});
  SUBJECTS.forEach(sub=>{
    const sty=SUBJECT_STYLES[sub]||{bg:"#f5f5f5",color:"#555"};
    const row=el("div",{className:"exam-input-row"});
    const pill=el("span",{className:"subj-pill",style:{minWidth:"72px",textAlign:"center"}}); pill.style.background=sty.bg; pill.style.color=sty.color; pill.textContent=sub;
    const existingScore=st.exams.find(e=>e.subject===sub);
    const inp=el("input",{type:"number",placeholder:"0–100",min:"0",max:"100",value:existingScore?String(existingScore.score):""});
    ei[sub]=inp; row.appendChild(pill); row.appendChild(inp); eg.appendChild(row);
  });
  body.appendChild(eg);
  const footer=el("div",{className:"modal-footer"}); const {overlay}=showModal("Edit student info",body,"modal-box-wide");
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  const sb=el("button",{className:"btn-primary"}); sb.textContent="Save changes"; sb.style.borderRadius="8px";
  sb.onclick=()=>{
    const newId=ii.value.trim(); if(!newId)return;
    if(newId!==st.studentId && state.students.some(s=>s.studentId===newId)){alert("This Student ID already exists!");return;}
    const examList=SUBJECTS.map(sub=>({subject:sub,score:parseInt(ei[sub].value)})).filter(e=>!isNaN(e.score));
    const avgGrade=examList.length?Math.round(examList.reduce((a,e)=>a+e.score,0)/examList.length):0;
    st.studentId=newId; st.class=cs.value; st.exams=examList; st.avgGrade=avgGrade;
    saveState(); overlay.remove(); renderPage(); render();
  };
  footer.appendChild(sb); body.appendChild(footer);
}

// ── Add Student Modal ──────────────────────────────────────────────────
function showAddStudentModal(presetClass=null) {
  const classes=presetClass?[presetClass]:allClasses();
  const body=el("div",{});
  const {wrap:nw,input:ni}=field("Full name",{placeholder:"e.g. Ahmed Hassan"}); body.appendChild(nw);
  const {wrap:iw,input:ii}=field("Student ID",{placeholder:"e.g. STU-2024-001"}); body.appendChild(iw);
  const r1=el("div",{className:"field-row"});
  const {wrap:cw,input:cs}=field("Class",{type:"select",options:classes.length?classes:["No classes — create some first"],value:classes[0]||""});
  const {wrap:sw,input:ss}=field("Status",{type:"select",options:["active","at-risk","low-attendance"]});
  ss.options[0].text="Active"; ss.options[1].text="At risk"; ss.options[2].text="Low attendance";
  r1.appendChild(cw); r1.appendChild(sw); body.appendChild(r1);
  const {wrap:aw,input:ai}=field("Attendance %",{type:"number",placeholder:"e.g. 90"}); body.appendChild(aw);
  const el2=el("div",{className:"field"}); el2.appendChild(el("label",{},"Exam scores (optional)"));
  const eg=el("div",{className:"exam-inputs-grid"}); const ei={};
  SUBJECTS.forEach(sub=>{
    const sty=SUBJECT_STYLES[sub]||{bg:"#f5f5f5",color:"#555"};
    const row=el("div",{className:"exam-input-row"});
    const pill=el("span",{className:"subj-pill",style:{minWidth:"72px",textAlign:"center"}}); pill.style.background=sty.bg; pill.style.color=sty.color; pill.textContent=sub;
    const inp=el("input",{type:"number",placeholder:"0–100",min:"0",max:"100"}); ei[sub]=inp; row.appendChild(pill); row.appendChild(inp); eg.appendChild(row);
  });
  el2.appendChild(eg); body.appendChild(el2);
  const footer=el("div",{className:"modal-footer"});
  const {overlay}=showModal("Add new student",body,"modal-box-wide");
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  const ab=el("button",{className:"btn-primary"}); ab.style.borderRadius="8px"; ab.textContent="Add student";
  ab.onclick=()=>{
    const name=ni.value.trim(); if(!name)return;
    const studentId=ii.value.trim(); if(!studentId)return;
    if(state.students.some(s=>s.studentId===studentId)){alert("This Student ID already exists!");return;}
    const initials=name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
    const examList=SUBJECTS.map(sub=>({subject:sub,score:parseInt(ei[sub].value)})).filter(e=>!isNaN(e.score));
    const avgGrade=examList.length?Math.round(examList.reduce((a,e)=>a+e.score,0)/examList.length):0;
    state.students.push({id:Date.now(),studentId,name,initials,class:cs.value,attendance:parseInt(ai.value)||0,avgGrade,status:ss.value,color:COLOR_LIST[Math.floor(Math.random()*COLOR_LIST.length)],exams:examList});
    saveState();
    overlay.remove(); render();
  };
  footer.appendChild(ab); body.appendChild(footer);
}

// ── Attendance ─────────────────────────────────────────────────────────
function renderAttendance() {
  if(state.students.length===0){const p=el("div",{className:"page"});const c=el("div",{className:"card"});c.appendChild(emptyState("📅","No attendance data yet","Add students first to start tracking attendance."));p.appendChild(c);return p;}
  const page=el("div",{className:"page"});
  const avgAtt=Math.round(state.students.reduce((a,s)=>a+s.attendance,0)/state.students.length);
  const grid=el("div",{className:"metric-grid"});
  grid.appendChild(metricCard("Total students",state.students.length,"#185FA5","#E6F1FB"));
  grid.appendChild(metricCard("Avg attendance",avgAtt+"%","#3B6D11","#EAF3DE"));
  grid.appendChild(metricCard("At risk",state.students.filter(s=>s.status==="at-risk").length,"#A32D2D","#FCEBEB"));
  grid.appendChild(metricCard("Low attendance",state.students.filter(s=>s.status==="low-attendance").length,"#854F0B","#FAEEDA"));
  page.appendChild(grid);
  const card=el("div",{className:"card"}); const cp=el("div",{className:"card-pad"}); cp.appendChild(secTitle("Student attendance overview"));
  const table=el("table",{}); const thead=el("thead",{}); const tr=el("tr",{});
  ["Student","Class","Attendance","Status"].forEach(h=>tr.appendChild(el("th",{},h)));
  thead.appendChild(tr); table.appendChild(thead); const tbody=el("tbody",{});
  state.students.forEach(st=>{
    const row=el("tr",{});
    const nc=el("td",{}); const nw=el("div",{className:"flex-center gap-8"}); nw.appendChild(avatar(st.initials,st.color,"avatar-md")); nw.appendChild(el("span",{className:"fw-700"},st.name)); nc.appendChild(nw); row.appendChild(nc);
    const cc=el("td",{}); cc.appendChild(classPill(st.class)); row.appendChild(cc);
    const ac=el("td",{}); const pw=el("div",{className:"progress-wrap"}); pw.appendChild(progressBar(st.attendance,"progress-track-lg")); pw.appendChild(el("span",{className:"fw-700"},st.attendance+"%")); ac.appendChild(pw); row.appendChild(ac);
    const sc=el("td",{}); sc.appendChild(badge(st.status)); row.appendChild(sc); tbody.appendChild(row);
  });
  table.appendChild(tbody); cp.appendChild(table); card.appendChild(cp); page.appendChild(card); return page;
}

// ── Grades ─────────────────────────────────────────────────────────────
function renderGrades() {
  if(state.students.length===0){const p=el("div",{className:"page"});const c=el("div",{className:"card"});c.appendChild(emptyState("📈","No grade data yet","Add students with exam scores to see grade reports here."));p.appendChild(c);return p;}
  const page=el("div",{className:"page"}); const classes=allClasses();
  const card=el("div",{className:"card"}); const pad=el("div",{className:"card-pad"});
  const ch=el("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}); ch.appendChild(secTitle("Grade report"));
  const fs=el("select",{className:"filter-select"}); const ao=document.createElement("option"); ao.value="All"; ao.textContent="All classes"; fs.appendChild(ao);
  classes.forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;fs.appendChild(o);}); ch.appendChild(fs); pad.appendChild(ch);
  const tw=el("div",{className:"overflow-x"}); const table=el("table",{style:{minWidth:"900px"}});
  const thead=el("thead",{}); const tr=el("tr",{});
  ["Student","Class",...SUBJECTS,"Total","Avg","Grade"].forEach(h=>tr.appendChild(el("th",{},h)));
  thead.appendChild(tr); table.appendChild(thead); const tbody=el("tbody",{});
  table.appendChild(tbody); tw.appendChild(table); pad.appendChild(tw); card.appendChild(pad); page.appendChild(card);
  function refreshGrades(){
    const cls=fs.value;
    let list=cls==="All"?[...state.students]:state.students.filter(s=>s.class===cls);
    list.sort((a,b)=>(b.avgGrade||0)-(a.avgGrade||0));
    tbody.innerHTML="";
    if(list.length===0){const td=el("td",{colSpan:String(SUBJECTS.length+5),style:{padding:"2rem",textAlign:"center",color:"#ccc"}});td.textContent="No students in this class.";tbody.appendChild(el("tr",{},td));return;}
    list.forEach(st=>{
      const row=el("tr",{});
      const nc=el("td",{}); const nw=el("div",{className:"flex-center gap-8"}); nw.appendChild(avatar(st.initials,st.color,"avatar-sm")); nw.appendChild(el("span",{className:"fw-700"},st.name)); nc.appendChild(nw); row.appendChild(nc);
      const cc=el("td",{}); cc.appendChild(classPill(st.class)); row.appendChild(cc);
      SUBJECTS.forEach(sub=>{const score=st.exams.find(e=>e.subject===sub)?.score;row.appendChild(el("td",{className:"fw-700",style:{textAlign:"center"}},score!==undefined?String(score):"—"));});
      const total=st.exams.length?st.exams.reduce((sum,e)=>sum+(e.score||0),0):0;
      row.appendChild(el("td",{className:"fw-700"},st.exams.length?String(total):"—"));
      const avg=st.avgGrade||0; row.appendChild(el("td",{className:"fw-700"},avg?String(avg):"—"));
      const g=avg>=90?"A":avg>=80?"B":avg>=70?"C":avg>=60?"D":avg>=50?"E":"F";
      const gc={A:"#3B6D11",B:"#185FA5",C:"#854F0B",D:"#993C1D",E:"#854F0B",F:"#A32D2D"}[g];
      const gb={A:"#EAF3DE",B:"#E6F1FB",C:"#FAEEDA",D:"#FAECE7",E:"#FAEEDA",F:"#FCEBEB"}[g];
      const gcc=el("td",{}); const gp=el("span",{className:"grade-pill"}); gp.style.background=gb; gp.style.color=gc; gp.textContent=avg?g:"—"; gcc.appendChild(gp); row.appendChild(gcc); tbody.appendChild(row);
    });
  }
  fs.addEventListener("change",refreshGrades); refreshGrades(); return page;
}
function schoolDays() { return ALL_DAYS.filter(d=>!state.timetable.weekend.includes(d)); }

function renderTimetable() {
  const classes = allClasses();
  if(classes.length===0){
    const p=el("div",{className:"page"});
    const c=el("div",{className:"card"});
    c.appendChild(emptyState("🕐","No classes yet","Add classes from the Classes section first."));
    p.appendChild(c); return p;
  }
  const page = el("div",{className:"page"});
  let activeCls = classes[0];
  let ttView = "grid"; // "grid" | "settings"

  // ── TOP TABS ──
  const tabs = el("div",{style:{display:"flex",gap:"8px",marginBottom:"16px",alignItems:"center"}});
  const gridTabBtn = el("button",{className:"tt-class-btn active"},"📅 Schedule");
  const settingsTabBtn = el("button",{className:"tt-class-btn"},"⚙️ Settings");
  const tabContent = el("div",{className:"page"});

  gridTabBtn.onclick = () => {
    ttView = "grid";
    gridTabBtn.classList.add("active"); settingsTabBtn.classList.remove("active");
    buildTabContent();
  };
  settingsTabBtn.onclick = () => {
    ttView = "settings";
    settingsTabBtn.classList.add("active"); gridTabBtn.classList.remove("active");
    buildTabContent();
  };
  tabs.appendChild(gridTabBtn); tabs.appendChild(settingsTabBtn);
  page.appendChild(tabs); page.appendChild(tabContent);

  // ── BUILD GRID VIEW ──
  function buildGridView() {
    tabContent.innerHTML = "";
    const days = schoolDays();
    const periods = state.timetable.periods;

    // Class selector row
    const classRow = el("div",{className:"card card-pad"});
    const cr = el("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}});
    cr.appendChild(el("div",{className:"sec-title",style:{marginBottom:"0"}},`Timetable — ${activeCls}`));
    const btnsWrap = el("div",{className:"flex",style:{gap:"6px",flexWrap:"wrap"}});
    const classBtns = {};
    classes.forEach(c => {
      const btn = el("button",{className:"tt-class-btn"+(c===activeCls?" active":"")},c);
      btn.onclick = () => {
        activeCls = c;
        Object.entries(classBtns).forEach(([k,b])=>b.classList.toggle("active",k===c));
        buildGridView();
      };
      classBtns[c] = btn; btnsWrap.appendChild(btn);
    });
    cr.appendChild(btnsWrap); classRow.appendChild(cr); tabContent.appendChild(classRow);

    // Grid card
    const gridCard = el("div",{className:"card"});
    const wrap = el("div",{className:"overflow-x"});
    const table = el("table",{style:{minWidth:"600px"}});
    const thead = el("thead",{}); const hr = el("tr",{});
    hr.appendChild(el("th",{style:{width:"130px",padding:"10px 14px"}},"Period / Time"));
    days.forEach(d => hr.appendChild(el("th",{style:{textAlign:"center",padding:"10px 12px"}},d)));
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = el("tbody",{});

    periods.forEach(period => {
      const row = el("tr",{});
      // Period label cell
      const periodCell = el("td",{style:{padding:"8px 14px",whiteSpace:"nowrap",verticalAlign:"middle"}});
      const pLabel = el("div",{style:{fontWeight:"700",fontSize:"13px",color:"#1a1a2e"}}, period.label);
      const pTime  = el("div",{style:{fontSize:"11px",color:"#aaa",marginTop:"2px"}}, period.start + " – " + period.end);
      periodCell.appendChild(pLabel); periodCell.appendChild(pTime);
      row.appendChild(periodCell);

      days.forEach(day => {
        const td = el("td",{style:{padding:"6px 8px",textAlign:"center",verticalAlign:"middle"}});
        if(period.type === "break") {
          const slot = el("div",{className:"timetable-slot break",style:{background:"#f5f5f5",color:"#999",fontStyle:"italic"}}, "Break");
          td.appendChild(slot);
        } else if(period.type === "lunch") {
          const slot = el("div",{className:"timetable-slot break",style:{background:"#fffbea",color:"#b07d00",fontStyle:"italic"}}, "Lunch");
          td.appendChild(slot);
        } else {
          const key = `${activeCls}|${day}|${period.id}`;
          const assigned = state.timetable.slots[key] || "";
          const sty = SUBJECT_STYLES[assigned] || {bg:"#f8f9fb",color:"#aaa"};
          const slot = el("div",{className:"timetable-slot",style:{background:sty.bg,color:sty.color,cursor:"pointer",minWidth:"90px",position:"relative"}});
          slot.textContent = assigned || "— tap to assign";
          slot.title = "Click to assign subject";
          slot.onclick = () => showAssignSubjectModal(activeCls, day, period, () => buildGridView());
          td.appendChild(slot);
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody); wrap.appendChild(table); gridCard.appendChild(wrap);
    tabContent.appendChild(gridCard);
  }

  // ── BUILD SETTINGS VIEW ──
  function buildSettingsView() {
    tabContent.innerHTML = "";

    // ── Weekend picker ──
    const wCard = el("div",{className:"card card-pad"});
    wCard.appendChild(secTitle("Weekend days"));
    const wDesc = el("p",{style:{fontSize:"13px",color:"#666",marginBottom:"14px"}},
      "Select which days are weekend (school days = non-selected days).");
    wCard.appendChild(wDesc);
    const wGrid = el("div",{style:{display:"flex",gap:"10px",flexWrap:"wrap"}});
    ALL_DAYS.forEach(day => {
      const isWE = state.timetable.weekend.includes(day);
      const btn = el("button",{style:{
        padding:"10px 20px", borderRadius:"10px", border:"2px solid", fontSize:"14px", fontWeight:"700", cursor:"pointer",
        background: isWE ? "#FCEBEB" : "#EAF3DE",
        color:      isWE ? "#A32D2D" : "#3B6D11",
        borderColor:isWE ? "#A32D2D" : "#3B6D11",
        transition:"all 0.15s"
      }}, day + (isWE ? " 🏖️" : " 📚"));
      btn.onclick = () => {
        if(state.timetable.weekend.includes(day)) {
          // only allow removing if at least 1 school day remains
          if(schoolDays().length <= 1) { alert("Must have at least one school day!"); return; }
          state.timetable.weekend = state.timetable.weekend.filter(d=>d!==day); saveState();
        } else {
          state.timetable.weekend.push(day);saveState();
        }
        buildSettingsView();
      };
      wGrid.appendChild(btn);
    });
    wCard.appendChild(wGrid);
    const wInfo = el("div",{style:{marginTop:"14px",padding:"10px 14px",background:"#f0f4ff",borderRadius:"8px",fontSize:"12px",color:"#185FA5"}});
    wInfo.innerHTML = `<strong>School days:</strong> ${schoolDays().join(", ")} &nbsp;|&nbsp; <strong>Weekend:</strong> ${state.timetable.weekend.length ? state.timetable.weekend.join(", ") : "None"}`;
    wCard.appendChild(wInfo);
    tabContent.appendChild(wCard);

    // ── Periods manager ──
    const pCard = el("div",{className:"card card-pad"});
    const ph = el("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}});
    ph.appendChild(secTitle("Periods & times"));
    const addPBtn = el("button",{className:"btn-primary",style:{borderRadius:"8px",fontSize:"12px",padding:"6px 14px"}}, "+ Add period");
    addPBtn.onclick = () => showAddPeriodModal(buildSettingsView);
    ph.appendChild(addPBtn); pCard.appendChild(ph);

    const pDesc = el("p",{style:{fontSize:"13px",color:"#666",marginBottom:"14px"}},
      "Drag to reorder is coming soon. Click Edit to change time or label, or set a period as Break/Lunch.");
    pCard.appendChild(pDesc);

    state.timetable.periods.forEach((period, idx) => {
      const pRow = el("div",{style:{
        display:"flex", alignItems:"center", gap:"12px", padding:"10px 14px",
        background: period.type==="break"?"#f5f5f5":period.type==="lunch"?"#fffbea":"#f8f9fb",
        borderRadius:"10px", marginBottom:"8px", border:"1px solid #eee"
      }});
      // Drag handle
      const handle = el("span",{style:{color:"#ccc",fontSize:"18px",cursor:"grab",userSelect:"none"}}, "⠿");
      pRow.appendChild(handle);

      // Type badge
      const typeBadge = el("span",{style:{
        padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700",
        background: period.type==="break"?"#f0f0f0":period.type==="lunch"?"#fff3c4":"#E6F1FB",
        color:       period.type==="break"?"#888":period.type==="lunch"?"#b07d00":"#185FA5",
        minWidth:"52px", textAlign:"center"
      }}, period.type==="lesson"?"Lesson":period.type==="break"?"Break":"Lunch");
      pRow.appendChild(typeBadge);

      // Info
      const info = el("div",{style:{flex:"1"}});
      info.appendChild(el("div",{style:{fontWeight:"700",fontSize:"13px"}}, period.label));
      info.appendChild(el("div",{style:{fontSize:"11px",color:"#aaa",marginTop:"2px"}}, period.start + " – " + period.end));
      pRow.appendChild(info);

      // Actions
      const acts = el("div",{style:{display:"flex",gap:"6px"}});
      const editBtn = el("button",{className:"btn-sm"}, "Edit");
      editBtn.onclick = () => showEditPeriodModal(period, buildSettingsView);

      const moveUpBtn = el("button",{className:"btn-sm",style:{padding:"4px 8px"}}, "↑");
      moveUpBtn.disabled = idx===0;
      moveUpBtn.onclick = () => {
        const p = state.timetable.periods;
        [p[idx-1],p[idx]] = [p[idx],p[idx-1]];
        saveState();
        buildSettingsView();
      };
      const moveDnBtn = el("button",{className:"btn-sm",style:{padding:"4px 8px"}}, "↓");
      moveDnBtn.disabled = idx===state.timetable.periods.length-1;
      moveDnBtn.onclick = () => {
        const p = state.timetable.periods;
        [p[idx],p[idx+1]] = [p[idx+1],p[idx]];
        saveState();
        buildSettingsView();
      };
      const delBtn = el("button",{className:"btn-sm-danger"}, "Remove");
      delBtn.onclick = () => {
        if(state.timetable.periods.length<=1){alert("Need at least one period.");return;}
        const m = document.createElement("span");
        m.innerHTML = `Remove period <strong>${period.label}</strong>?`;
        confirmModal(m.outerHTML, () => {
          state.timetable.periods = state.timetable.periods.filter(p=>p.id!==period.id);
          saveState();
          buildSettingsView();
        });
      };
      acts.appendChild(moveUpBtn); acts.appendChild(moveDnBtn);
      acts.appendChild(editBtn); acts.appendChild(delBtn);
      pRow.appendChild(acts);
      pCard.appendChild(pRow);
    });
    tabContent.appendChild(pCard);
  }

  function buildTabContent() {
    if(ttView==="grid") buildGridView();
    else buildSettingsView();
  }
  buildTabContent();
  return page;
}

// ── Assign Subject Modal ───────────────────────────────────────────────
function showAssignSubjectModal(className, day, period, onDone) {
  const key = `${className}|${day}|${period.id}`;
  const current = state.timetable.slots[key] || "";
  const body = el("div",{});

  body.appendChild(el("p",{style:{fontSize:"13px",color:"#666",marginBottom:"14px"}},
    `Assign subject for ${className} on ${day} — ${period.label} (${period.start}–${period.end})`));

  // Subject grid
  const grid = el("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"16px"}});
  let selectedSubject = current;

  const subjectBtns = {};
  SUBJECTS.forEach(sub => {
    const sty = SUBJECT_STYLES[sub]||{bg:"#f5f5f5",color:"#555"};
    const btn = el("button",{style:{
      padding:"10px 12px", borderRadius:"10px", border:"2px solid",
      background: sub===current ? sty.color : sty.bg,
      color:      sub===current ? "#fff"    : sty.color,
      borderColor: sty.color, cursor:"pointer", fontWeight:"700",
      fontSize:"13px", transition:"all 0.15s", textAlign:"left"
    }}, sub);
    btn.onclick = () => {
      selectedSubject = sub;
      Object.entries(subjectBtns).forEach(([s,b]) => {
        const st = SUBJECT_STYLES[s]||{bg:"#f5f5f5",color:"#555"};
        b.style.background = s===sub ? st.color : st.bg;
        b.style.color      = s===sub ? "#fff"   : st.color;
      });
    };
    subjectBtns[sub] = btn; grid.appendChild(btn);
  });
  body.appendChild(grid);

  // Clear button
  const clearBtn = el("button",{style:{
    width:"100%",padding:"9px",borderRadius:"10px",border:"1px solid #ddd",
    background:"#fafafa",color:"#555",fontSize:"13px",fontWeight:"600",marginBottom:"8px",cursor:"pointer"
  }}, "🗑️  Clear this slot");
  clearBtn.onclick = () => { selectedSubject = ""; clearBtn.style.background="#FCEBEB"; clearBtn.style.color="#A32D2D"; };
  body.appendChild(clearBtn);

  const footer = el("div",{className:"modal-footer"});
  const {overlay} = showModal(`Assign — ${day}, ${period.label}`, body);
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  const saveBtn = el("button",{className:"btn-primary",style:{borderRadius:"8px"}},"Save");
  saveBtn.onclick = () => {
    if(selectedSubject) state.timetable.slots[key]=selectedSubject;
    else delete state.timetable.slots[key];
    saveState();
    overlay.remove(); onDone();
  };
  footer.appendChild(saveBtn); body.appendChild(footer);
}

function getDaysInMonth(year, month){
  return new Date(year, month, 0).getDate();
}

function showManageAttendanceModal(className, month, year){
  const students = state.students.filter(s=>s.class===className);
  const daysCount = getDaysInMonth(year, month);
  const body = el('div',{});
  body.appendChild(el('div',{className:'fs-14',style:{marginBottom:'8px'}},`Manage attendance — ${className} — ${month}/${year}`));
  const wrap = el('div',{style:{overflowX:'auto'}});
  const table = el('table',{});
  const thead = el('thead',{}); const hr = el('tr',{});
  hr.appendChild(el('th',{},'Student'));
  for(let d=1; d<=daysCount; d++) hr.appendChild(el('th',{},String(d)));
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = el('tbody',{});
  students.forEach(st=>{
    const row = el('tr',{});
    const nameCell = el('td',{}); nameCell.appendChild(el('div',{},st.name)); row.appendChild(nameCell);
    for(let d=1; d<=daysCount; d++){
      const dateStr = new Date(year, month-1, d).toISOString().slice(0,10);
      const status = (st.attendanceDays||{})[dateStr] || 'absent';
      const cell = el('td',{});
      const btn = el('button',{className:'att-cell',style:{padding:'6px 8px',borderRadius:'6px',cursor:'pointer'},onClick:async ()=>{ await toggleAttendance(st, dateStr); buildTableRows(); }}, status==='present'?'✔':'—');
      if(status==='present'){ btn.style.background='#EAF3DE'; btn.style.color='#3B6D11'; }
      else { btn.style.background='#FCEBEB'; btn.style.color='#A32D2D'; }
      cell.appendChild(btn); row.appendChild(cell);
    }
    tbody.appendChild(row);
  });
  table.appendChild(tbody); wrap.appendChild(table); body.appendChild(wrap);

  function buildTableRows(){
    // rebuild to reflect latest state
    tbody.innerHTML='';
    students.forEach(st=>{
      const row = el('tr',{});
      row.appendChild(el('td',{},st.name));
      for(let d=1; d<=daysCount; d++){
        const dateStr = new Date(year, month-1, d).toISOString().slice(0,10);
        const status = (st.attendanceDays||{})[dateStr] || 'absent';
        const cell = el('td',{});
        const btn = el('button',{className:'att-cell',style:{padding:'6px 8px',borderRadius:'6px',cursor:'pointer'},onClick:async ()=>{ await toggleAttendance(st, dateStr); buildTableRows(); }}, status==='present'?'✔':'—');
        if(status==='present'){ btn.style.background='#EAF3DE'; btn.style.color='#3B6D11'; }
        else { btn.style.background='#FCEBEB'; btn.style.color='#A32D2D'; }
        cell.appendChild(btn); row.appendChild(cell);
      }
      tbody.appendChild(row);
    });
  }

  const {overlay} = showModal('Manage attendance', body, 'modal-box-wide');
  const footer = el('div',{className:'modal-footer'});
  footer.appendChild(el('button',{className:'btn-secondary',onClick:()=>overlay.remove()},'Close'));
  body.appendChild(footer);
}

function showStudentAttendanceModal(st, month, year){
  month = month || (new Date().getMonth()+1); year = year || new Date().getFullYear();
  const body = el('div',{});
  const header = el('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}});
  header.appendChild(el('div',{className:'fs-14',style:{fontWeight:'700'}},`${st.name} — Attendance ${month}/${year}`));
  const nav = el('div',{});
  const prev = el('button',{className:'btn-sm',onClick:()=>{ month = month-1; if(month<1){month=12; year-=1;} build(); }},'◀');
  const next = el('button',{className:'btn-sm',onClick:()=>{ month = month+1; if(month>12){month=1; year+=1;} build(); }},'▶');
  nav.appendChild(prev); nav.appendChild(next); header.appendChild(nav); body.appendChild(header);

  const calWrap = el('div',{});
  body.appendChild(calWrap);

  async function build(){
    calWrap.innerHTML='';
    const days = getDaysInMonth(year, month);
    const grid = el('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'6px'}});
    // weekday headers
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>grid.appendChild(el('div',{style:{fontWeight:'700',textAlign:'center'}},d)));
    // find first day index
    const firstIdx = new Date(year, month-1, 1).getDay();
    for(let i=0;i<firstIdx;i++) grid.appendChild(el('div',{},''));
    for(let d=1; d<=days; d++){
      const dateStr = new Date(year, month-1, d).toISOString().slice(0,10);
      const status = (st.attendanceDays||{})[dateStr] || 'absent';
      const btn = el('button',{className:'att-day',style:{padding:'8px',borderRadius:'6px',cursor:'pointer',width:'100%','textAlign':'center'},onClick:async ()=>{ await toggleAttendance(st, dateStr); build(); }}, String(d));
      if(status==='present'){ btn.style.background='#EAF3DE'; btn.style.color='#3B6D11'; }
      else if(status==='late'){ btn.style.background='#FFF3C4'; btn.style.color='#B07D00'; }
      else { btn.style.background='#FCEBEB'; btn.style.color='#A32D2D'; }
      grid.appendChild(btn);
    }
    calWrap.appendChild(grid);
    // summary
    const presentCount = Object.keys(st.attendanceDays||{}).filter(k=>{ const dt=new Date(k); return dt.getMonth()===(month-1) && dt.getFullYear()===year && (st.attendanceDays[k]==='present' || st.attendanceDays[k]==='late'); }).length;
    const summary = el('div',{style:{marginTop:'10px'}}, `Present: ${presentCount} / ${days} — ${Math.round((presentCount/days)*100)||0}%`);
    calWrap.appendChild(summary);
  }

  build();
  const {overlay} = showModal('Student attendance', body, 'modal-box-wide');
  const footer = el('div',{className:'modal-footer'});
  footer.appendChild(el('button',{className:'btn-secondary',onClick:()=>overlay.remove()},'Close'));
  body.appendChild(footer);
}

// ── Add Period Modal ───────────────────────────────────────────────────
function showAddPeriodModal(onDone) {
  const body = el("div",{});
  const {wrap:lw, input:li} = field("Period label", {placeholder:"e.g. Period 6"});
  const {wrap:sw, input:si} = timeField("Start time", "15:00");
  const {wrap:ew, input:ei} = timeField("End time",   "16:00");
  const {wrap:tw, input:ti} = field("Type", {type:"select", options:[
    {value:"lesson",label:"Lesson"},{value:"break",label:"Break"},{value:"lunch",label:"Lunch"}
  ]});
  body.appendChild(lw);
  const timeRow = el("div",{className:"field-row"}); timeRow.appendChild(sw); timeRow.appendChild(ew); body.appendChild(timeRow);
  body.appendChild(tw);
  const footer = el("div",{className:"modal-footer"});
  const {overlay} = showModal("Add new period", body, "modal-box-narrow");
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  const addBtn = el("button",{className:"btn-primary",style:{borderRadius:"8px"}},"Add period");
  addBtn.onclick = () => {
    const label = li.value.trim(); if(!label) return;
    state.timetable.periods.push({
      id: Date.now(), label,
      start: si.value||"15:00", end: ei.value||"16:00",
      type: ti.value||"lesson"
    });
    saveState();
    overlay.remove(); onDone();
  };
  footer.appendChild(addBtn); body.appendChild(footer);
}

// ── Edit Period Modal ──────────────────────────────────────────────────
function showEditPeriodModal(period, onDone) {
  const body = el("div",{});
  const {wrap:lw, input:li} = field("Period label", {placeholder:"e.g. Period 3", value:period.label});
  const {wrap:sw, input:si} = timeField("Start time", period.start);
  const {wrap:ew, input:ei} = timeField("End time",   period.end);
  const {wrap:tw, input:ti} = field("Type", {type:"select", options:[
    {value:"lesson",label:"Lesson"},{value:"break",label:"Break"},{value:"lunch",label:"Lunch"}
  ]});
  ti.value = period.type;
  body.appendChild(lw);
  const timeRow = el("div",{className:"field-row"}); timeRow.appendChild(sw); timeRow.appendChild(ew); body.appendChild(timeRow);
  body.appendChild(tw);
  const footer = el("div",{className:"modal-footer"});
  const {overlay} = showModal("Edit period", body, "modal-box-narrow");
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  const saveBtn = el("button",{className:"btn-primary",style:{borderRadius:"8px"}},"Save changes");
  saveBtn.onclick = () => {
    const label = li.value.trim(); if(!label) return;
    const p = state.timetable.periods.find(p=>p.id===period.id);
    if(p){ p.label=label; p.start=si.value; p.end=ei.value; p.type=ti.value; }
    saveState();
    overlay.remove(); onDone();
  };
  footer.appendChild(saveBtn); body.appendChild(footer);
}

// ── Classes ────────────────────────────────────────────────────────────
function renderClasses() {
  if(state.selectedClass) return renderClassDetail(state.selectedClass);
  const page=el("div",{className:"page"}); const classes=allClasses();
  const sg=el("div",{className:"metric-grid-3"});
  const fc=el("div",{className:"card card-pad"}); fc.appendChild(el("div",{className:"m-label",style:{color:"#888"}},"Total forms")); fc.appendChild(el("div",{className:"m-value"},String(Object.keys(state.classStructure).length))); sg.appendChild(fc);
  const cc=el("div",{className:"card card-pad"}); cc.appendChild(el("div",{className:"m-label",style:{color:"#888"}},"Total classes")); cc.appendChild(el("div",{className:"m-value"},String(classes.length))); sg.appendChild(cc);
  const afc=el("div",{className:"card",style:{display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}});
  const afb=el("button",{className:"btn-primary"},"+ Add new form"); afb.onclick=()=>showAddFormModal(); afc.appendChild(afb); sg.appendChild(afc); page.appendChild(sg);
  const fw=el("div",{className:"page"});
  function refreshForms(){
    fw.innerHTML="";
    if(Object.keys(state.classStructure).length===0){const c=el("div",{className:"card"});c.appendChild(emptyState("🏫","No forms yet",'Click "+ Add new form" to create your first form.'));fw.appendChild(c);return;}
    Object.entries(state.classStructure).forEach(([formKey,cls])=>{
      const card=el("div",{className:"card card-pad"});
      const ch=el("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}});
      const hl=el("div",{}); hl.appendChild(el("div",{style:{fontSize:"16px",fontWeight:"700"}},formKey)); hl.appendChild(el("div",{className:"fs-12 color-muted",style:{marginTop:"2px"}},cls.length+" class"+(cls.length!==1?"es":""))); ch.appendChild(hl);
      const hb=el("div",{className:"flex gap-8"});
      const acb=el("button",{className:"btn-outline-blue"},"+ Add class"); acb.onclick=()=>showAddClassModal(formKey,refreshForms);
      const rfb=el("button",{className:"btn-outline-red"},"Remove form"); rfb.onclick=()=>{const m=document.createElement("span");m.innerHTML=`Remove <strong>${formKey}</strong> and all its classes?`;confirmModal(m.outerHTML,()=>{delete state.classStructure[formKey];saveState();refreshForms();});};
      hb.appendChild(acb); hb.appendChild(rfb); ch.appendChild(hb); card.appendChild(ch);
      if(cls.length===0){card.appendChild(el("div",{className:"no-class-msg"},'No classes yet — click "Add class".'));}
      else {
        const grid=el("div",{className:"class-cards-grid"});
        cls.forEach(c=>{
          const count=state.students.filter(s=>s.class===c).length;
          const clsCard=el("div",{className:"class-card"});
          const ci=el("div",{style:{flex:"1"}}); ci.onclick=()=>{state.selectedClass=c;renderPage();};
          ci.appendChild(el("div",{className:"cc-name"},c)); ci.appendChild(el("div",{className:"cc-sub"},count+" student"+(count!==1?"s":"")+" · click to view"));
          clsCard.appendChild(ci);
          const acts=el("div",{className:"class-card-actions"});
          const eb=el("button",{className:"btn-sm"},"Edit"); eb.onclick=e=>{e.stopPropagation();showEditClassModal(formKey,c,refreshForms);};
          const db=el("button",{className:"btn-sm-danger"},"Remove"); db.onclick=e=>{e.stopPropagation();const m=document.createElement("span");m.innerHTML=`Remove class <strong>${c}</strong>?`;confirmModal(m.outerHTML,()=>{state.classStructure[formKey]=state.classStructure[formKey].filter(x=>x!==c);saveState();refreshForms();});};
          acts.appendChild(eb); acts.appendChild(db); clsCard.appendChild(acts); grid.appendChild(clsCard);
        });
        card.appendChild(grid);
      }
      fw.appendChild(card);
    });
  }
  refreshForms(); page.appendChild(fw); return page;
}

// ── Class Detail ───────────────────────────────────────────────────────
function renderClassDetail(className) {
  const page=el("div",{className:"page"});
  const cs=state.students.filter(s=>s.class===className);
  const avgAtt=cs.length?Math.round(cs.reduce((a,s)=>a+s.attendance,0)/cs.length):0;
  const avgGrd=cs.length?Math.round(cs.reduce((a,s)=>a+(s.avgGrade||0),0)/cs.length):0;
  const atRisk=cs.filter(s=>s.status==="at-risk").length;
  const header=el("div",{className:"class-detail-header"});
  const bb=el("button",{className:"btn-back"},"← Back"); bb.onclick=()=>{state.selectedClass=null;renderPage();}; header.appendChild(bb);
  const tw=el("div",{}); tw.appendChild(el("h2",{},className)); tw.appendChild(el("div",{className:"enrolled"},cs.length+" student"+(cs.length!==1?"s":"")+" enrolled")); header.appendChild(tw);
  const ab=el("button",{className:"btn-primary",style:{marginLeft:"auto"}},"+ Add student"); ab.onclick=()=>showAddStudentModal(className); header.appendChild(ab); page.appendChild(header);
  const grid=el("div",{className:"metric-grid"});
  grid.appendChild(metricCard("Students",cs.length,"#185FA5","#E6F1FB"));
  grid.appendChild(metricCard("Avg attendance",avgAtt+"%","#3B6D11","#EAF3DE"));
  grid.appendChild(metricCard("Avg grade",avgGrd||"—","#534AB7","#EEEDFE"));
  grid.appendChild(metricCard("At risk",atRisk,"#A32D2D","#FCEBEB")); page.appendChild(grid);
  const card=el("div",{className:"card"}); const th2=el("div",{className:"table-header"}); th2.appendChild(el("span",{},"Students in "+className)); card.appendChild(th2);
  const tabWrap=el("div",{className:"overflow-x"}); const table=el("table",{});
  const thead=el("thead",{}); const tr=el("tr",{});
  ["Student ID","Name","Attendance","Avg grade","Subjects","Status","Actions"].forEach(h=>tr.appendChild(el("th",{},h)));
  thead.appendChild(tr); table.appendChild(thead); const tbody=el("tbody",{});
  function refreshDetail(){
    tbody.innerHTML=""; const list=state.students.filter(s=>s.class===className);
    if(list.length===0){const td=el("td",{colSpan:"7"});td.appendChild(emptyState("👤","No students in this class",'Click "+ Add student" to add the first student to '+className+'.'));tbody.appendChild(el("tr",{},td));return;}
    list.forEach((st,idx)=>{
      const row=el("tr",{}); row.appendChild(el("td",{className:"fw-700",style:{color:"#185FA5"}},st.studentId));
      const nc=el("td",{}); const nw=el("div",{className:"flex-center gap-10"}); nw.appendChild(avatar(st.initials,st.color)); nw.appendChild(el("span",{className:"fw-700"},st.name)); nc.appendChild(nw); row.appendChild(nc);
      const ac=el("td",{}); const pw=el("div",{className:"progress-wrap"}); pw.appendChild(progressBar(st.attendance)); pw.appendChild(el("span",{},st.attendance+"%")); ac.appendChild(pw); row.appendChild(ac);
      row.appendChild(el("td",{className:"fw-700"},String(st.avgGrade||"—")));
      const sc2=el("td",{}); const sw=el("div",{className:"flex",style:{flexWrap:"wrap",gap:"4px"}});
      st.exams.slice(0,3).forEach(e=>{const sty=SUBJECT_STYLES[e.subject]||{bg:"#f5f5f5",color:"#555"};const p=el("span",{className:"subj-pill-sm"});p.style.background=sty.bg;p.style.color=sty.color;p.textContent=`${e.subject}: ${e.score}`;sw.appendChild(p);});
      if(st.exams.length>3)sw.appendChild(el("span",{className:"fs-11 color-muted"},"+"+( st.exams.length-3)+" more"));
      if(st.exams.length===0)sw.appendChild(el("span",{style:{fontSize:"11px",color:"#ccc"}},"No scores"));
      sc2.appendChild(sw); row.appendChild(sc2);
      const stc=el("td",{}); stc.appendChild(badge(st.status)); row.appendChild(stc);
      const actc=el("td",{}); const actw=el("div",{className:"flex gap-6"});
      const vb=el("button",{className:"btn-sm"},"Full profile"); vb.onclick=()=>showStudentProfile(st);
      const db=el("button",{className:"btn-sm-danger"},"Remove"); db.onclick=()=>{const m=document.createElement("span");m.innerHTML=`Remove <strong>${st.name}</strong>?`;confirmModal(m.outerHTML,()=>{state.students=state.students.filter(s=>s.id!==st.id);saveState();refreshDetail();});};
      actw.appendChild(vb); actw.appendChild(db); actc.appendChild(actw); row.appendChild(actc); tbody.appendChild(row);
    });
  }
  table.appendChild(tbody); tabWrap.appendChild(table); card.appendChild(tabWrap); page.appendChild(card); refreshDetail();
  if(cs.length>0){
    const avgCard=el("div",{className:"card card-pad"}); avgCard.appendChild(secTitle("Subject averages for "+className));
    const ag=el("div",{className:"subj-avg-grid"});
    SUBJECTS.forEach(sub=>{
      const scores=cs.flatMap(s=>s.exams.filter(e=>e.subject===sub).map(e=>e.score));
      const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
      const sty=SUBJECT_STYLES[sub]||{bg:"#f5f5f5",color:"#555"};
      const c=el("div",{className:"subj-avg-card"}); c.style.background=sty.bg;
      c.appendChild(el("div",{className:"sa-name",style:{color:sty.color}},sub));
      c.appendChild(el("div",{className:"sa-value",style:{color:sty.color}},avg!==null?String(avg):"—"));
      if(avg!==null){const bar=el("div",{className:"subj-avg-bar"});const fill=el("div",{className:"subj-avg-bar-fill",style:{width:avg+"%",background:sty.color}});bar.appendChild(fill);c.appendChild(bar);}
      ag.appendChild(c);
    });
    avgCard.appendChild(ag); page.appendChild(avgCard);
  }
  return page;
}

// ── Class / Form Modals ────────────────────────────────────────────────
function showAddFormModal(){
  const body=el("div",{}); const {wrap,input}=field("Form name (e.g. Form 5)",{placeholder:"Form 5"}); body.appendChild(wrap);
  const footer=el("div",{className:"modal-footer"}); const {overlay}=showModal("Add new form",body,"modal-box-narrow");
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  const ab=el("button",{className:"btn-primary"}); ab.style.borderRadius="8px"; ab.textContent="Add form";
  ab.onclick=()=>{const name=input.value.trim();if(!name||state.classStructure[name])return;state.classStructure[name]=[];saveState();overlay.remove();render();};
  input.addEventListener("keydown",e=>{if(e.key==="Enter")ab.click();}); footer.appendChild(ab); body.appendChild(footer);
}
function showAddClassModal(formKey,onDone){
  const body=el("div",{}); const {wrap,input}=field("Class name",{placeholder:`${formKey}E`}); body.appendChild(wrap);
  const footer=el("div",{className:"modal-footer"}); const {overlay}=showModal(`Add class to ${formKey}`,body,"modal-box-narrow");
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  const ab=el("button",{className:"btn-primary"}); ab.style.borderRadius="8px"; ab.textContent="Add class";
  ab.onclick=()=>{const name=input.value.trim();if(!name)return;state.classStructure[formKey].push(name);saveState();overlay.remove();onDone();};
  input.addEventListener("keydown",e=>{if(e.key==="Enter")ab.click();}); footer.appendChild(ab); body.appendChild(footer);
}
function showEditClassModal(formKey,oldName,onDone){
  const body=el("div",{}); const {wrap,input}=field("New class name",{value:oldName}); body.appendChild(wrap);
  const footer=el("div",{className:"modal-footer"}); const {overlay}=showModal("Rename class",body,"modal-box-narrow");
  footer.appendChild(el("button",{className:"btn-secondary",onClick:()=>overlay.remove()},"Cancel"));
  const sb=el("button",{className:"btn-primary"}); sb.style.borderRadius="8px"; sb.textContent="Save";
  sb.onclick=()=>{const n=input.value.trim();if(!n||n===oldName){overlay.remove();return;}state.classStructure[formKey]=state.classStructure[formKey].map(c=>c===oldName?n:c);saveState();overlay.remove();onDone();};
  input.addEventListener("keydown",e=>{if(e.key==="Enter")sb.click();}); footer.appendChild(sb); body.appendChild(footer);
}

// ── Settings ───────────────────────────────────────────────────────────
function renderSettings(){
  const page=el("div",{className:"page"});
  const session=getSession();
  const card=el("div",{className:"card card-pad"});
  card.appendChild(secTitle("Profile Settings"));
  const profileSec=el("div",{style:{marginBottom:"2rem"}});
  
  // Profile Picture Section
  const picSec=el("div",{style:{marginBottom:"1.5rem",paddingBottom:"1.5rem",borderBottom:"1px solid #eee"}});
  picSec.appendChild(el("div",{className:"fs-13",style:{fontWeight:"700",marginBottom:"12px"}},"School Profile Picture"));
  const picWrap=el("div",{style:{display:"flex",alignItems:"center",gap:"1rem"}});
  const img=el("img",{style:{width:"100px",height:"100px",borderRadius:"8px",objectFit:"cover",background:"#f0f0f0"}});
  if(state.schoolProfileImage)img.src=state.schoolProfileImage;
  else img.src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3ENo image%3C/text%3E%3C/svg%3E";
  picWrap.appendChild(img);
  const uploadWrap=el("div",{});
  const fileInput=el("input",{type:"file",accept:"image/*",style:{display:"none"}});
  fileInput.addEventListener("change",e=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=evt=>{
      const imageData=evt.target.result;
      state.schoolProfileImage=imageData;
      localStorage.setItem("schoolos_profile_image",imageData);
      img.src=imageData;
      updateSidebarProfileImage();
    };
    reader.readAsDataURL(file);
  });
  const uploadBtn=el("button",{className:"btn-primary",style:{marginBottom:"8px"}},"📷 Upload image");
  uploadBtn.onclick=()=>fileInput.click();
  uploadWrap.appendChild(uploadBtn);
  if(state.schoolProfileImage){
    const removeBtn=el("button",{className:"btn-sm-danger"},"Remove image");
    removeBtn.style.marginLeft="8px";
    removeBtn.onclick=()=>{
      state.schoolProfileImage="";
      localStorage.removeItem("schoolos_profile_image");
      img.src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3ENo image%3C/text%3E%3C/svg%3E";
      updateSidebarProfileImage();
    };
    uploadWrap.appendChild(removeBtn);
  }
  picWrap.appendChild(uploadWrap);
  picSec.appendChild(picWrap);
  profileSec.appendChild(picSec);
  
  // Profile Info Section
  const infosec=el("div",{});
  infosec.appendChild(el("div",{className:"fs-13",style:{fontWeight:"700",marginBottom:"12px"}},"Profile Information"));
  const {wrap:nw,input:ni}=field("Principal Name",{value:session.name||""});
  nw.style.marginBottom="12px";
  infosec.appendChild(nw);
  const {wrap:sw,input:si}=field("School Name",{value:session.schoolName||""});
  sw.style.marginBottom="12px";
  infosec.appendChild(sw);
  const {wrap:ew,input:ei}=field("Email",{value:session.email||"",type:"email"});
  ew.style.marginBottom="16px";
  infosec.appendChild(ew);
  const saveBtn=el("button",{className:"btn-primary"});
  saveBtn.style.borderRadius="8px";
  saveBtn.textContent="✓ Save changes";
  saveBtn.onclick=()=>{
    const updated={...session,name:ni.value.trim(),schoolName:si.value.trim(),email:ei.value.trim()};
    localStorage.setItem("schoolos_session",JSON.stringify(updated));
    document.getElementById("sidebar-name").textContent=updated.name||"Principal";
    document.getElementById("sidebar-school").textContent=updated.schoolName||"Manager";

    // Non-intrusive button state feedback instead of blocking alert
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "✓ Saved!";
    saveBtn.style.background = "#3B6D11";
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = "";
      saveBtn.disabled = false;
    }, 2000);
  };
  infosec.appendChild(saveBtn);
  profileSec.appendChild(infosec);
  card.appendChild(profileSec);
  page.appendChild(card);
  return page;
}

// ── Init ───────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadState();

  // Populate sidebar from session
  const session    = getSession();
  const fullName   = (session.name || "Principal").trim();
  const schoolName = (session.schoolName || "").trim();
  const initials   = fullName.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "PR";

  document.getElementById("sidebar-avatar").textContent = initials;
  document.getElementById("sidebar-name").textContent   = fullName || "Principal";
  document.getElementById("sidebar-school").textContent = schoolName || "Manager";

  // Load saved profile image into sidebar
  updateSidebarProfileImage();

  // Make sidebar profile image and avatar clickable to go to settings
  const goToSettings = () => {
    state.activeNav = "settings";
    state.selectedClass = null;
    render();
  };

  const profileImg = document.getElementById("sidebar-profile-image");
  const profileAvatar = document.getElementById("sidebar-avatar");
  if(profileImg) {
    profileImg.onclick = goToSettings;
  }
  if(profileAvatar) {
    profileAvatar.onclick = goToSettings;
  }

  // Logout button
  const logoutBtn = document.createElement("button");
  logoutBtn.textContent = "🚪 Log out";
  logoutBtn.style.cssText = "margin-top:8px;width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid rgba(255,255,255,0.2);background:rgba(163,45,45,0.1);color:rgba(255,255,255,0.6);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s;";
  logoutBtn.onmouseenter = () => {
    logoutBtn.style.background = "rgba(163,45,45,0.25)";
    logoutBtn.style.borderColor = "rgba(163,45,45,0.5)";
    logoutBtn.style.color = "#fff";
  };
  logoutBtn.onmouseleave = () => {
    logoutBtn.style.background = "rgba(163,45,45,0.1)";
    logoutBtn.style.borderColor = "rgba(255,255,255,0.2)";
    logoutBtn.style.color = "rgba(255,255,255,0.6)";
  };
  logoutBtn.onclick = () => {
    localStorage.removeItem("schoolos_session");
    window.location.replace("../Parent/Logins/auth.html");
  };
  document.querySelector(".sidebar-user").appendChild(logoutBtn);

  // Bind nav buttons
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeNav      = btn.dataset.key;
      state.selectedClass  = null;
      render();
    });
  });

  render();
});
