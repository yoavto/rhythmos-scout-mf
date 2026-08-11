// ── RHYTHMOS HOURS — app.js — Build 8 ────────────────────────

// ── PLOTS ─────────────────────────────────────────────────────
// Default/seed plots — used as fallback if Firestore is empty or offline
const DEFAULT_PLOTS = [
  { id:'home', name:'Home', crop:'tableGrapes', variety:'', travelMinutes:5,
    polygon:[[32.192507,34.923707],[32.192709,34.923881],[32.192585,34.924057],[32.192375,34.923881]] },
  { id:'cemetery', name:'Cemetery', crop:'tableGrapes', variety:'', travelMinutes:8,
    polygon:[[32.193534,34.922508],[32.192885,34.922089],[32.192921,34.921885],[32.191914,34.921387],[32.191800,34.921515],[32.192004,34.921725],[32.191791,34.922679],[32.192445,34.923146],[32.192545,34.923640],[32.192753,34.923822]] },
  { id:'strawberries', name:'Strawberries', crop:'tableGrapes', variety:'', travelMinutes:6,
    polygon:[[32.192840,34.923886],[32.193920,34.924299],[32.193748,34.924792],[32.192536,34.924315]] },
  { id:'plot41', name:'Plot 41', crop:'tableGrapes', variety:'Crimson Seedless', travelMinutes:15,
    polygon:[[31.537629,34.851481],[31.537682,34.851537],[31.537567,34.851789],[31.537602,34.851811],[31.537417,34.852401],[31.537348,34.852385],[31.537222,34.852913],[31.537465,34.852924],[31.537654,34.852181],[31.537849,34.851674],[31.538086,34.851275],[31.538006,34.850953],[31.537910,34.850966],[31.537650,34.851384]] },
  { id:'plot12', name:'Plot 12', crop:'tableGrapes', variety:'Thompson Seedless', travelMinutes:12,
    polygon:[[31.581611,34.842046],[31.582186,34.842682],[31.581563,34.843717],[31.581014,34.843068]] },
  { id:'plot51', name:'Plot 51', crop:'tableGrapes', variety:'Black Muscat', travelMinutes:18,
    polygon:[[31.583073,34.818620],[31.583002,34.818669],[31.582799,34.818427],[31.582516,34.818138],[31.582354,34.818256],[31.582605,34.818508],[31.582852,34.818862],[31.582584,34.819168],[31.581734,34.818218],[31.582214,34.817644]] },
];

// Runtime plots array — populated from Firestore or fallback
let PLOTS = [...DEFAULT_PLOTS];

// ── PLOT LOADING ──────────────────────────────────────────────
async function loadPlots() {
  try {
    const snap = await db.collection('plots').get();
    if (!snap.empty) {
      PLOTS = snap.docs.map(d => {
        const data = d.data();
        // Normalize polygon: handle both [lat,lng] arrays and {lat,lng} objects
        const polygon = (data.polygon||[]).map(p => Array.isArray(p)?{lat:p[0],lng:p[1]}:p);
        return {id:d.id, name:data.name||'', crop:data.crop||'tableGrapes', cropId:data.cropId||null,
          variety:data.variety||'', travelMinutes:data.travelMinutes||0, dunams:data.dunams||0, polygon};
      });
    } else {
      // Firestore empty — use defaults (first run before manager has added plots)
      PLOTS = [...DEFAULT_PLOTS];
    }
    localStorage.setItem('rh_plots', JSON.stringify(PLOTS));
    console.log(`Plots loaded: ${PLOTS.length} from ${snap.empty?'defaults':'Firestore'}`);
  } catch(e) {
    // Offline — try localStorage cache
    const cached = localStorage.getItem('rh_plots');
    if (cached) { PLOTS = JSON.parse(cached); console.log('Plots from cache:', PLOTS.length); }
    else { PLOTS = [...DEFAULT_PLOTS]; console.log('Plots from defaults'); }
  }
}

// Expose for manager.js access
window.getDefaultPlots = () => DEFAULT_PLOTS;

// ── ACTIVITIES ────────────────────────────────────────────────
const BUILTIN_ACTIVITIES = [
  // Manual (11)
  {id:'pruning',           nameI18n:{he:'גיזום',               en:'Pruning',              th:'การตัดแต่ง',           ar:'تقليم'},              type:'field',subtype:'manual'},
  {id:'tying',             nameI18n:{he:'קשירה',               en:'Tying',                th:'การมัด',                ar:'ربط'},                type:'field',subtype:'manual'},
  {id:'flower-thinning',   nameI18n:{he:'דילול פריחה',         en:'Flower thinning',      th:'การเด็ดดอก',            ar:'تخفيف الأزهار'},      type:'field',subtype:'manual'},
  {id:'fruitlet-thinning', nameI18n:{he:'דילול חנטים',         en:'Fruitlet thinning',    th:'การเด็ดผลอ่อน',         ar:'تخفيف العقد'},        type:'field',subtype:'manual'},
  {id:'fruit-thinning',    nameI18n:{he:'דילול פירות',         en:'Fruit thinning',       th:'การเด็ดผล',             ar:'تخفيف الثمار'},       type:'field',subtype:'manual'},
  {id:'gun-spraying',      nameI18n:{he:'ריסוס רובים',         en:'Gun spraying',         th:'การพ่นยาด้วยมือ',        ar:'رش يدوي'},            type:'field',subtype:'manual'},
  {id:'girdling',          nameI18n:{he:'חיגור',               en:'Girdling',             th:'การกรีดเปลือก',          ar:'التحزيم'},            type:'field',subtype:'manual'},
  {id:'suckering',         nameI18n:{he:'ניקוי חזירים',        en:'Desuckering',          th:'การกำจัดหน่อ',           ar:'إزالة الفسائل'},      type:'field',subtype:'manual'},
  {id:'grafting',          nameI18n:{he:'הרכבה',               en:'Grafting',             th:'การเสียบยอด',            ar:'تطعيم'},              type:'field',subtype:'manual'},
  {id:'whitewashing',      nameI18n:{he:'הלבנה',               en:'Whitewashing',         th:'การทาสีขาว',             ar:'تبييض'},              type:'field',subtype:'manual'},
  {id:'harvesting',        nameI18n:{he:'קטיף',                en:'Harvesting',           th:'การเก็บเกี่ยว',          ar:'قطاف'},               type:'field',subtype:'manual'},
  // Mechanical (4)
  {id:'foliar-spray',      nameI18n:{he:'ריסוס עלווה',         en:'Foliar spraying',      th:'การพ่นใบ',               ar:'رش الأوراق'},         type:'field',subtype:'mechanical'},
  {id:'herbicide-spray',   nameI18n:{he:'ריסוס עשבייה',        en:'Herbicide spraying',   th:'การพ่นยากำจัดวัชพืช',   ar:'رش مبيدات الأعشاب'}, type:'field',subtype:'mechanical'},
  {id:'mech-pruning',      nameI18n:{he:'גיזום מכני',          en:'Mechanical pruning',   th:'การตัดแต่งเครื่องจักร',  ar:'تقليم آلي'},          type:'field',subtype:'mechanical'},
  {id:'soil-cultivation',  nameI18n:{he:'תיחוח / עיבוד קרקע',  en:'Soil cultivation',     th:'การไถดิน',               ar:'حراثة'},              type:'field',subtype:'mechanical'},
];

// General activities — always shown regardless of crop
const GENERAL_ACTIVITIES = [
  {id:'sick-leave',            nameI18n:{he:'מחלה',        en:'Sick leave',           th:'ลาป่วย',        ar:'إجازة مرضية'},      type:'other'},
  {id:'vacation',              nameI18n:{he:'חופשה',       en:'Vacation',             th:'วันหยุดพักร้อน',ar:'إجازة'},             type:'other'},
  {id:'packaging',             nameI18n:{he:'אריזה',       en:'Packaging',            th:'การบรรจุ',      ar:'تغليف'},             type:'other'},
  {id:'equipment-maintenance', nameI18n:{he:'תחזוקת ציוד', en:'Equipment maintenance',th:'การบำรุงรักษา', ar:'صيانة المعدات'},     type:'other'},
  {id:'training',              nameI18n:{he:'הדרכה',       en:'Training',             th:'การฝึกอบรม',    ar:'تدريب'},             type:'other'},
  {id:'other',                 nameI18n:{he:'אחר',         en:'Other',                th:'อื่นๆ',         ar:'أخرى'},              type:'other',requiresText:true},
];

// Combined for backward compat
const ACTIVITIES = [...BUILTIN_ACTIVITIES, ...GENERAL_ACTIVITIES];

// Runtime crop data (loaded from Firestore)
let allCrops = [];
let cropCustomActivities = {};  // active-only records, used for display
let cropAllActivities = {};     // all records regardless of active state, used only to detect "has this crop been migrated yet"

async function loadCropData() {
  try {
    const snap = await db.collection('crops').where('active','==',true).get();
    allCrops = snap.docs.map(d => ({id:d.id,...d.data()}));
    localStorage.setItem('rh_crops', JSON.stringify(allCrops));

    // Fetch ALL activity records (not just active ones) so we can tell the
    // difference between "this crop was never migrated" (fall back to the
    // hardcoded defaults) and "migrated, but currently switched off"
    // (show nothing) — using only "is it active" would conflate the two.
    const actSnap = await db.collection('activities').get();
    cropCustomActivities = {};
    cropAllActivities = {};
    actSnap.docs.forEach(d => {
      const a = {id:d.id,...d.data()};
      const cid = a.cropId || 'all';
      if (!cropAllActivities[cid]) cropAllActivities[cid] = [];
      cropAllActivities[cid].push(a);
      if (a.active) {
        if (!cropCustomActivities[cid]) cropCustomActivities[cid] = [];
        cropCustomActivities[cid].push(a);
      }
    });
    localStorage.setItem('rh_custom_acts', JSON.stringify(cropCustomActivities));
    localStorage.setItem('rh_all_acts', JSON.stringify(cropAllActivities));
  } catch(e) {
    const cached = localStorage.getItem('rh_crops');
    if (cached) allCrops = JSON.parse(cached);
    const cachedActs = localStorage.getItem('rh_custom_acts');
    if (cachedActs) cropCustomActivities = JSON.parse(cachedActs);
    const cachedAll = localStorage.getItem('rh_all_acts');
    if (cachedAll) cropAllActivities = JSON.parse(cachedAll);
    console.warn('Crop data from cache');
  }
}

function getActivitiesForCrop(cropId) {
  const fieldMigrated = (cropAllActivities[cropId]||[]).some(a => a.type === 'field');
  const fieldActs = fieldMigrated
    ? (cropCustomActivities[cropId]||[]).filter(a => a.type === 'field')
    : BUILTIN_ACTIVITIES;

  const generalMigrated = Object.values(cropAllActivities).flat().some(a => a.type === 'other' && !a.cropId);
  const customGeneral = Object.values(cropCustomActivities).flat().filter(a => a.type === 'other' && !a.cropId);
  const generalActs = generalMigrated ? customGeneral : GENERAL_ACTIVITIES;

  return {
    manual:    fieldActs.filter(a => a.subtype==='manual'),
    mechanical:fieldActs.filter(a => a.subtype==='mechanical'),
    general:   generalActs,
  };
}

function findActivity(actId) {
  return Object.values(cropCustomActivities).flat().find(a=>a.id===actId)
    || ACTIVITIES.find(a=>a.id===actId)
    || Object.values(cropAllActivities).flat().find(a=>a.id===actId)
    || null;
}

// Expose for manager.js (loaded in same page, must be after declarations)
window.BUILTIN_ACTIVITIES = BUILTIN_ACTIVITIES;
window.GENERAL_ACTIVITIES = GENERAL_ACTIVITIES;

// ── DEFAULT FARM SETTINGS ────────────────────────────────────
const DEFAULT_SETTINGS = {
  workdayHours: 8,
  overtime1MaxHours: 2,
  overtime1Rate: 1.25,
  overtime2Rate: 1.50,
  nightShiftStart: '22:00',
  nightShiftEnd: '06:00',
  weekendDays: [6],
  workdayResetHour: '06:00',
  allowWorkerEditReports: false,
  staleEntryHours: 13,
};

let cachedFarmSettings = null;

async function getFarmSettings() {
  if (cachedFarmSettings) return cachedFarmSettings;
  try {
    const doc = await db.collection('farmSettings').doc('default').get();
    cachedFarmSettings = doc.exists ? { ...DEFAULT_SETTINGS, ...doc.data() } : DEFAULT_SETTINGS;
  } catch(e) { cachedFarmSettings = DEFAULT_SETTINGS; }
  return cachedFarmSettings;
}

// ── POINT-IN-POLYGON ──────────────────────────────────────────
function pointInPolygon(lat,lng,polygon){
  let inside=false,n=polygon.length;
  for(let i=0,j=n-1;i<n;j=i++){
    // Handle both [lat,lng] arrays and {lat,lng} objects
    const pi=polygon[i], pj=polygon[j];
    const xi=Array.isArray(pi)?pi[0]:pi.lat, yi=Array.isArray(pi)?pi[1]:pi.lng;
    const xj=Array.isArray(pj)?pj[0]:pj.lat, yj=Array.isArray(pj)?pj[1]:pj.lng;
    if(((yi>lng)!==(yj>lng))&&(lat<(xj-xi)*(lng-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
function detectPlot(lat,lng){return PLOTS.find(p=>pointInPolygon(lat,lng,p.polygon))||null;}

// ── ENTRY WIZARD STATE ────────────────────────────────────────
let entryWizard={step:0,plot:null,activity:null,freeText:'',gpsLat:0,gpsLng:0};

// ── TRANSLATION (MyMemory API) ────────────────────────────────
async function translateText(text, sourceLang) {
  const targets = ['he','en'].filter(l => l !== sourceLang);
  const result = { [sourceLang]: text };
  for (const lang of targets) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${lang}`;
      const res = await fetch(url);
      const data = await res.json();
      result[lang] = data.responseData?.translatedText || text;
    } catch(e) { result[lang] = text; }
  }
  return result;
}

// ── START ENTRY ───────────────────────────────────────────────
// Checks a specific worker's current active entry (if any) against the
// farm's configured stale-entry threshold, before allowing a new entry to
// start for them. Three outcomes:
//  - no active entry: proceeds normally
//  - active entry older than the threshold: presumed abandoned, so it's
//    auto-closed (end time backdated to start+threshold, not whenever this
//    check happens to run — an app left unopened for days shouldn't
//    inflate hours) and flagged for review, then proceeds
//  - active entry younger than the threshold: might genuinely still be
//    real work in progress, so this blocks, naming the worker so whoever
//    triggered this (most often a team leader starting for the group)
//    knows exactly who to go check with
async function _checkStaleEntryBeforeStart(workerId, workerName){
  const snap = await db.collection('timeEntries')
    .where('workerId','==',workerId)
    .where('status','==','active')
    .get();
  if (snap.empty) return { blocked:false };

  const doc = snap.docs[0]; // one active entry per worker is already enforced elsewhere
  const entry = doc.data();
  if (!entry.startTime) return { blocked:false };

  const settings = await getFarmSettings();
  const staleHours = settings.staleEntryHours ?? 13;
  const staleMs = staleHours*60*60*1000;
  const ageMs = Date.now() - entry.startTime.toMillis();

  if (ageMs < staleMs) {
    return { blocked:true, workerName: workerName || entry.workerName || '—' };
  }

  const backdatedEnd = firebase.firestore.Timestamp.fromMillis(entry.startTime.toMillis() + staleMs);
  await db.collection('timeEntries').doc(doc.id).update({
    endTime: backdatedEnd,
    status: 'flagged',
    flagNote: `auto-closed: exceeded ${staleHours}-hour threshold when a new entry was started`,
    flagNoteLang: 'en',
  });
  if (entry.date) {
    resettleDay(workerId, entry.date).catch(e => console.warn('resettleDay after stale auto-close:', e));
  }
  if (workerId === currentUser.uid && activeEntryId === doc.id) {
    activeEntryId = null;
    activeEntryWorkOrderId = null;
    clearTimer();
    localStorage.removeItem('rh_active');
  }
  return { blocked:false, autoClosedEntry:true };
}
window._checkStaleEntryBeforeStart = _checkStaleEntryBeforeStart;

async function startEntry(){
  const check = await _checkStaleEntryBeforeStart(currentUser.uid);
  if (check.blocked) { showToast(t('entry.alreadyActive')||'יש רישום פעיל'); return; }
  entryWizard={step:0,plot:null,activity:null,freeText:'',gpsLat:0,gpsLng:0};
  const titleEl = document.getElementById('modal-entry-title');
  if(titleEl) titleEl.textContent = t('entry.newEntry')||'רישום חדש';
  showModal('modal-entry');
  gpsDetectPlot();
}

// Starts a record directly from a task the worker tapped on — instantly,
// with no confirmation screen at all. The plot/activity/free-text are
// taken exactly as defined on the task; there's nothing left to review
// that the worker didn't already see on the task card itself. Available
// to any assigned worker (leader or crew), not just the leader.
async function startEntryForTask(workOrderId){
  try{
    const doc = await db.collection('workOrders').doc(workOrderId).get();
    if(!doc.exists){ showToast(t('worker.entryNotFound')); return; }
    const wo = doc.data();

    // Every plot the task specifies gets attached to the entry — not just
    // the first one. Plots defined as free text (no matching real plot)
    // can't be resolved to a proper record with dunams, so those are
    // skipped rather than guessed at.
    const resolvedPlots = (wo.plots||[])
      .map(p => p.plotId ? PLOTS.find(pl => pl.id === p.plotId) : null)
      .filter(Boolean);
    const plot = resolvedPlots[0] || null;
    const additionalPlots = resolvedPlots.slice(1);
    const act = (wo.task?.activityId ? findActivity(wo.task.activityId) : null) || findActivity('other');

    entryWizard = {step:0, plot: plot||null, activity:act, freeText: wo.task?.freeText||'', gpsLat:0, gpsLng:0, workOrderId};
    // Best-effort GPS for the record's startGPS field — non-blocking, since
    // we're starting instantly and won't wait for a location fix.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { entryWizard.gpsLat = pos.coords.latitude; entryWizard.gpsLng = pos.coords.longitude; },
        () => {}, {timeout:3000}
      );
    }

    const entryOpts = {
      plot, act, freeText: wo.task?.freeText||'', workOrderId,
      additionalPlotIds: additionalPlots.map(p=>p.id),
      additionalPlotNames: additionalPlots.map(p=>p.name),
      additionalPlotDunams: additionalPlots.map(p=>p.dunams||0),
      taskNote: wo.freeText || null,
    };

    // Regular (non-broadcast) tasks: only the leader ever starts/ends at
    // all — the moment they do, every currently-assigned crew member gets
    // an identical mirrored entry automatically, using one shared moment
    // as the start time for all of them (not each separately resolved,
    // which could otherwise differ by a few milliseconds). Crew members
    // never press start/end themselves; if a personal correction is ever
    // needed, they edit their own mirrored entry via "הרשומות שלי" the
    // normal way, which already routes the edit to manager review.
    const crewIds = (wo.selectedWorkerIds||[]).filter(id => id !== currentUser.uid);
    if (!wo.isBroadcast && crewIds.length) {
      // Check every relevant worker BEFORE creating anything, so a group
      // start either fully succeeds or doesn't touch anything at all — no
      // partially-mirrored state if someone turns out to be blocking it.
      const myCheck = await _checkStaleEntryBeforeStart(currentUser.uid);
      if (myCheck.blocked) { showToast(t('entry.alreadyActive')||'יש רישום פעיל'); return; }

      const crewUsers = [];
      for (const workerId of crewIds) {
        const userDoc = await db.collection('users').doc(workerId).get();
        const u = userDoc.exists ? userDoc.data() : {};
        crewUsers.push({ workerId, name: u.name||'—', phone: u.phone||'—' });
      }
      for (const cu of crewUsers) {
        const check = await _checkStaleEntryBeforeStart(cu.workerId, cu.name);
        if (check.blocked) {
          showToast(t('worker.blockedByActiveEntry').replace('{name}', check.workerName));
          return;
        }
      }

      const sharedStartTime = firebase.firestore.Timestamp.now();
      await _createTimeEntry({ ...entryOpts, sharedStartTime });
      for (const cu of crewUsers) {
        try {
          await _createTimeEntry({ ...entryOpts, forWorkerId: cu.workerId, forWorkerName: cu.name, forWorkerPhone: cu.phone, sharedStartTime });
        } catch(e) { console.warn('mirrored entry failed for worker', cu.workerId, e); }
      }
    } else {
      const myCheck = await _checkStaleEntryBeforeStart(currentUser.uid);
      if (myCheck.blocked) { showToast(t('entry.alreadyActive')||'יש רישום פעיל'); return; }
      await _createTimeEntry(entryOpts);
    }

    showToast(t('entry.started')||'הרישום התחיל ✓');
    updateEndWorkdayBtn();
    // Refresh the task list so its status (now "בביצוע") shows immediately.
    if (typeof showMyWorkOrders === 'function') showMyWorkOrders();
  }catch(e){
    console.error('startEntryForTask:', e);
    showToast((t('mgr.wo.error')||'שגיאה') + ': ' + e.message);
  }
}
window.startEntryForTask = startEntryForTask;

function gpsDetectPlot(){
  setModalContent(`<div class="modal-step"><div class="step-icon">📍</div><div class="step-title">${t('entry.detecting')||'מאתר מיקום...'}</div><div class="spinner-dark" style="margin-top:16px"></div></div>`);
  if(!navigator.geolocation){showPlotPicker(0,0);return;}
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const{latitude:lat,longitude:lng}=pos.coords;
      entryWizard.gpsLat=lat; entryWizard.gpsLng=lng;
      const found=detectPlot(lat,lng);
      found?showPlotConfirm(found):showPlotPicker(lat,lng);
    },
    ()=>showPlotPicker(0,0),
    {timeout:8000,enableHighAccuracy:true}
  );
}

function showPlotConfirm(plot){
  entryWizard.plot=plot;
  setModalContent(`
    <div class="modal-step">
      <div class="step-icon">✅</div>
      <div class="step-label">${t('entry.plotDetected')||'חלקה זוהתה'}</div>
      <div class="detected-plot">
        <div class="detected-plot-name">${plot.name}</div>
        ${plot.variety?`<div class="detected-plot-sub">${plot.variety}</div>`:''}
        <div class="detected-plot-sub" style="margin-top:4px;opacity:0.7">⏱ ${plot.travelMinutes} ${t('unit.min')||"דק'"} ${t('plot.travel')||'נסיעה'}</div>
      </div>
      <button class="btn-primary full-w" onclick="goToActivityPicker()">${t('entry.confirmContinue')||'אישור ← בחר פעילות'}</button>
      <button class="btn-ghost full-w" onclick="showPlotPicker(${entryWizard.gpsLat},${entryWizard.gpsLng})">${t('entry.changePlot')||'בחר חלקה אחרת'}</button>
    </div>`);
}

function showPlotPicker(lat,lng){
  // 2-step: crop → plots (skip crop step if only one crop has plots)
  const cropIds=[...new Set(PLOTS.filter(p=>p.cropId&&p.active!==false).map(p=>p.cropId))];
  if(cropIds.length<=1){
    _showPlotList(PLOTS, false);
    return;
  }
  const cropsWithPlots=allCrops.filter(c=>cropIds.includes(c.id))
    .sort((a,b)=>(a.nameI18n?.he||'').localeCompare(b.nameI18n?.he||'', 'he', {numeric:true, sensitivity:'base'}));
  const rows=cropsWithPlots.map(c=>`
    <div class="plot-row" onclick="showPlotListForCrop('${c.id}')">
      <div class="plot-row-info">
        <div class="plot-row-name">${c.nameI18n?.[currentLang]||c.nameI18n?.he||c.id}</div>
        <div class="plot-row-sub">${PLOTS.filter(p=>p.cropId===c.id&&p.active!==false).length} חלקות</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9,18 15,12 9,6"/></svg>
    </div>`).join('');
  setModalContent(`
    <div class="modal-step">
      <div class="step-label">${t('entry.selectCrop')||'בחר גידול'}</div>
      <div class="picker-list">${rows}</div>
      <div class="picker-divider">${t('entry.or')||'או'}</div>
      <button class="btn-secondary full-w" onclick="selectOtherActivity()">${t('entry.otherActivity')||'פעילות ללא חלקה'}</button>
    </div>`);
}

function showPlotListForCrop(cropId){
  _showPlotList(PLOTS.filter(p=>p.cropId===cropId&&p.active!==false), true);
}

function _showPlotList(plots, showBack){
  const sorted = [...plots].sort((a,b) => (a.name||'').localeCompare(b.name||'', 'he', {numeric:true, sensitivity:'base'}));
  const rows=sorted.map(p=>`
    <div class="plot-row" onclick="selectPlot('${p.id}')">
      <div class="plot-row-info">
        <div class="plot-row-name">${p.name}<span class="plot-row-sub"> · ${p.variety?p.variety+' · ':''}⏱ ${p.travelMinutes} ${t('unit.min')||"דק'"}</span></div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9,18 15,12 9,6"/></svg>
    </div>`).join('');
  setModalContent(`
    <div class="modal-step">
      ${showBack?`<button class="btn-ghost" style="width:auto;padding:6px 14px;margin-bottom:8px" onclick="showPlotPicker(${entryWizard.gpsLat||0},${entryWizard.gpsLng||0})">← ${t('entry.back')||'חזור'}</button>`:''}
      <div class="step-label">${t('entry.selectPlot')||'בחר חלקה'}</div>
      <div class="picker-list">${rows}</div>
      <div class="picker-divider">${t('entry.or')||'או'}</div>
      <button class="btn-secondary full-w" onclick="selectOtherActivity()">${t('entry.otherActivity')||'פעילות ללא חלקה'}</button>
    </div>`);
}
window.showPlotListForCrop=showPlotListForCrop;

function selectPlot(plotId){
  entryWizard.plot=PLOTS.find(p=>p.id===plotId);
  goToActivityPicker();
}
function selectOtherActivity(){entryWizard.plot=null;goToActivityPicker();}

async function goToActivityPicker(){
  // Always fetch fresh crop/activity data right before showing the picker —
  // don't rely on the periodic background refresh, since a manager's
  // change (new activity, toggle, edit) must be visible immediately here.
  setModalContent(`<div style="text-align:center;padding:40px"><div class="spinner-dark"></div></div>`);
  await loadCropData();

  const cropId = entryWizard.plot?.cropId || null;
  let manual=[], mechanical=[];
  if(entryWizard.plot && cropId){
    const acts = getActivitiesForCrop(cropId);
    manual = acts.manual; mechanical = acts.mechanical;
  } else if(entryWizard.plot){
    // Old data without cropId — show all built-in
    manual    = BUILTIN_ACTIVITIES.filter(a=>a.subtype==='manual');
    mechanical= BUILTIN_ACTIVITIES.filter(a=>a.subtype==='mechanical');
  }
  // General activities are not crop-specific, but still need to reflect
  // live Firestore data (migration, manager edits, on/off, deletions) —
  // never the raw hardcoded list once migration has run.
  const generalMigrated = Object.values(cropCustomActivities).flat().some(a => a.type === 'other' && !a.cropId)
    || Object.values(cropAllActivities).flat().some(a => a.type === 'other' && !a.cropId);
  const general = generalMigrated
    ? Object.values(cropCustomActivities).flat().filter(a => a.type === 'other' && !a.cropId)
    : GENERAL_ACTIVITIES;

  const sortByOrder = arr => [...arr].sort((a,b) => {
    const oa = typeof a.order === 'number' ? a.order : Infinity;
    const ob = typeof b.order === 'number' ? b.order : Infinity;
    return oa - ob;
  });
  manual = sortByOrder(manual);
  mechanical = sortByOrder(mechanical);
  const generalSorted = sortByOrder(general);

  const rows=acts=>acts.map(a=>`
    <button class="act-row" onclick="selectActivity('${a.id}')">
      ${a.nameI18n[currentLang]||a.nameI18n.he}
    </button>`).join('');

  let html=`<div class="modal-step" style="padding:0">
    <input class="act-search" id="act-search-input" type="search" placeholder="${t('entry.selectActivity')||'חפש פעילות...'}" oninput="filterActRows(this.value)" dir="${(currentLang==='he'||currentLang==='ar')?'rtl':'ltr'}">
    <div class="act-scroll" id="act-list-container">`;
  if(entryWizard.plot){
    if(manual.length) html+=`<details class="act-section"><summary class="act-section-title">${t('entry.manual')||'ידני'}</summary>${rows(manual)}</details>`;
    if(mechanical.length) html+=`<details class="act-section"><summary class="act-section-title">${t('entry.mechanical')||'ממוכן'}</summary>${rows(mechanical)}</details>`;
  }
  html+=`<details class="act-section"><summary class="act-section-title">${t('entry.general')||'כללי'}</summary>${rows(generalSorted)}</details>`;
  html+=`</div>
    <div class="act-other-wrap">
      <button class="act-other-btn" onclick="selectActivity('other')">✏️&nbsp; ${t('entry.other')||'אחר'} — ${t('entry.freeTextPlaceholder')||'פעילות חד-פעמית...'}</button>
    </div>
  </div>`;
  setModalContent(html);
  setTimeout(()=>document.getElementById('act-search-input')?.focus(),200);
}

function filterActRows(query){
  const q=(query||'').toLowerCase().trim();
  document.querySelectorAll('.act-row').forEach(btn=>{
    btn.style.display=(!q||btn.textContent.trim().toLowerCase().includes(q))?'':'none';
  });
  document.querySelectorAll('.act-section').forEach(sec=>{
    const visible=sec.querySelectorAll('.act-row:not([style*="none"])').length;
    sec.style.display=visible?'':'none';
    // Auto-open sections that have a match while searching; collapse back
    // to the default closed state once the search is cleared.
    sec.open = q ? visible>0 : false;
  });
}
window.filterActRows = filterActRows;

function selectActivity(actId){
  const act = findActivity(actId);
  if(!act) return;
  entryWizard.activity = act;
  act.requiresText ? showFreeTextStep() : showConfirmStart();
}

function showFreeTextStep(){
  setModalContent(`
    <div class="modal-step">
      <div class="step-label">${t('entry.describeActivity')||'תאר את הפעילות'}</div>
      <textarea id="free-text-input" class="entry-textarea" placeholder="${t('entry.freeTextPlaceholder')||'הזן תיאור...'}" rows="4">${entryWizard.freeText||''}</textarea>
      <button class="btn-primary full-w" onclick="confirmFreeText()">${t('entry.continue')||'המשך'}</button>
    </div>`);
  setTimeout(()=>document.getElementById('free-text-input')?.focus(),100);
}
function confirmFreeText(){
  entryWizard.freeText=document.getElementById('free-text-input')?.value.trim()||'';
  showConfirmStart();
}

async function showConfirmStart(){
  const plot=entryWizard.plot,act=entryWizard.activity;
  const timeStr=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});

  // Multi-plot: only for mechanical, only if plot has cropId, only if other same-crop plots exist
  const sameCropPlots = (act.subtype==='mechanical' && plot?.cropId)
    ? PLOTS.filter(p=>p.cropId===plot.cropId && p.id!==plot.id && p.active!==false)
        .sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'he', {numeric:true, sensitivity:'base'}))
    : [];
  const multiPlotHtml = sameCropPlots.length > 0 ? `
    <div class="multi-plot-section">
      <div class="multi-plot-label">הוסף חלקות נוספות (ממוכן)</div>
      ${sameCropPlots.map(p=>`
        <label class="multi-plot-item">
          <input type="checkbox" class="multi-plot-cb" value="${p.id}" data-name="${encodeURIComponent(p.name)}" data-dunams="${p.dunams||0}">
          <span>${p.name}${p.dunams?` · ${p.dunams} ${t('worker.dunamAbbr')}`:''}</span>
        </label>`).join('')}
    </div>` : '';

  // Linking to a work order is always the worker's free choice — never
  // required, even when a matching active work order exists.
  let workOrderHtml = '';
  try{
    const [leaderSnap, crewSnap] = await Promise.all([
      db.collection('workOrders').where('leaderId','==',currentUser.uid).get({source:'server'}),
      db.collection('workOrders').where('selectedWorkerIds','array-contains',currentUser.uid).get({source:'server'}),
    ]);
    const byId = {};
    leaderSnap.docs.forEach(d => byId[d.id] = {id:d.id, ...d.data()});
    crewSnap.docs.forEach(d => { if(!byId[d.id]) byId[d.id] = {id:d.id, ...d.data()}; });
    const activeOrders = Object.values(byId).filter(o => o.status==='pending' || o.status==='in_progress');
    if(activeOrders.length){
      workOrderHtml = `
        <div style="margin-top:10px">
          <div class="mgr-edit-label">קשר למשימה (אופציונלי)</div>
          <select id="ee-work-order" class="mgr-edit-input">
            <option value="">ללא</option>
            ${activeOrders.map(o=>`<option value="${o.id}"${o.id===entryWizard.workOrderId?' selected':''}>#${o.sequenceNumber??''} · ${o.task?.activityName||o.task?.freeText||''}</option>`).join('')}
          </select>
        </div>`;
    }
  }catch(e){ console.warn('work order fetch for entry link failed:', e); }

  setModalContent(`
    <div class="modal-step">
      <div class="confirm-rows">
        <div class="confirm-row"><span class="confirm-label">${t('entry.plot')||'חלקה'}</span><span class="confirm-val">${plot?plot.name:'—'}</span></div>
        ${plot&&plot.variety?`<div class="confirm-row"><span class="confirm-label">${t('entry.variety')||'זן'}</span><span class="confirm-val">${plot.variety}</span></div>`:''}
        <div class="confirm-row"><span class="confirm-label">${t('entry.activity')||'פעילות'}</span><span class="confirm-val">${act.nameI18n[currentLang]||act.nameI18n.he}${entryWizard.freeText?': '+entryWizard.freeText:''}</span></div>
        <div class="confirm-row"><span class="confirm-label">${t('entry.startTime')||'שעת התחלה'}</span><span class="confirm-val">${timeStr}</span></div>
        ${plot?`<div class="confirm-row"><span class="confirm-label">${t('entry.travel')||'נסיעה'}</span><span class="confirm-val">${plot.travelMinutes} ${t('unit.min')||"דק'"}</span></div>`:''}
      </div>
      ${multiPlotHtml}
      ${workOrderHtml}
      <button class="btn-start full-w" onclick="confirmStart()" id="btn-confirm-start">▶ ${t('entry.start')||'התחל'}</button>
      <button class="btn-ghost full-w" onclick="goToActivityPicker()">${t('entry.back')||'חזור'}</button>
    </div>`);
}

// Shared entry-creation logic used both by the normal confirm-screen flow
// and by starting directly from a task (no confirm screen at all). Handles
// writing the record, starting the timer, and the automatic
// pending→in_progress task transition.
async function _createTimeEntry({plot, act, freeText, workOrderId, additionalPlotIds=[], additionalPlotNames=[], additionalPlotDunams=[], forWorkerId=null, forWorkerName=null, forWorkerPhone=null, sharedStartTime=null, taskNote=null}){
  const plotIds = plot ? [plot.id, ...additionalPlotIds] : [null];
  const plotNames = plot ? [plot.name, ...additionalPlotNames] : [null];
  const plotDunams = plot ? [plot.dunams||0, ...additionalPlotDunams] : null;
  const isMulti = plotIds.length > 1;
  const isForSelf = !forWorkerId || forWorkerId === currentUser.uid;
  const now = sharedStartTime || firebase.firestore.FieldValue.serverTimestamp();
  const ref = await db.collection('timeEntries').add({
    workerId: forWorkerId || currentUser.uid,
    workerName: forWorkerName || document.getElementById('menu-name').textContent||'—',
    workerPhone: forWorkerPhone || document.getElementById('menu-phone').textContent||'—',
    date:todayStr(),
    plotId:plot?plot.id:null, plotName:plot?plot.name:null,
    plotIds:isMulti?plotIds:null, plotNames:isMulti?plotNames:null, plotDunams:isMulti?plotDunams:null,
    crop:plot?plot.crop:null, variety:plot?plot.variety||'':null,
    activityId:act.id, activityType:act.type, activitySubtype:act.subtype||null,
    activityFreeText:freeText||null,
    workOrderId: workOrderId || null,
    // Copied once from the task's own free-text note at the moment the
    // entry is created — deliberately kept separate from the worker's own
    // "notes" field (set later, at end-of-entry) so neither ever
    // overwrites the other.
    taskNote: taskNote || null,
    startTime:now,
    startGPS:(isForSelf && entryWizard.gpsLat)?new firebase.firestore.GeoPoint(entryWizard.gpsLat,entryWizard.gpsLng):null,
    endTime:null, status:'active', travelMinutes:0, workdaySettled:false, timestamp:now,
  });
  if (isForSelf) {
    activeEntryId=ref.id;
    activeEntryWorkOrderId = workOrderId || null;
    const actName=act.nameI18n[currentLang]||act.nameI18n.he;
    const plotLabel=isMulti?t('worker.plotsCount').replace('{count}',plotIds.length):(plot?plot.name:'—');
    localStorage.setItem('rh_active',JSON.stringify({id:ref.id,startMs:Date.now(),actName,plotName:plotLabel,workOrderId:workOrderId||null}));
    startTimer(Date.now(),actName,plotLabel);
  }
  // Starting a record linked to a task is what moves that task from
  // "awaiting execution" to "in progress" — no separate button for this;
  // any assigned worker's first linked record triggers it automatically.
  if (workOrderId) {
    db.collection('workOrders').doc(workOrderId).get().then(doc => {
      if (doc.exists && doc.data().status === 'pending') {
        return db.collection('workOrders').doc(workOrderId).update({ status: 'in_progress' });
      }
    }).catch(err => console.warn('auto in_progress transition failed:', err));
  }
  return ref;
}

async function confirmStart(){
  if(!currentUser)return;
  const btn=document.getElementById('btn-confirm-start');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="spinner-sm"></div>';}
  const additionalCbs=[...document.querySelectorAll('.multi-plot-cb:checked')];
  const plot=entryWizard.plot,act=entryWizard.activity;
  const workOrderId = document.getElementById('ee-work-order')?.value || entryWizard.workOrderId || null;
  try{
    await _createTimeEntry({
      plot, act, freeText: entryWizard.freeText, workOrderId,
      additionalPlotIds: additionalCbs.map(cb=>cb.value),
      additionalPlotNames: additionalCbs.map(cb=>decodeURIComponent(cb.dataset.name)),
      additionalPlotDunams: additionalCbs.map(cb=>parseFloat(cb.dataset.dunams)||0),
    });
    closeModal('modal-entry');
    showToast(t('entry.started')||'הרישום התחיל ✓');
    updateEndWorkdayBtn();
  }catch(e){
    console.error('confirmStart:',e);
    showToast(t('error.generic')||'שגיאה — נסה שוב');
    if(btn){btn.disabled=false;btn.innerHTML='▶ '+(t('entry.start')||'התחל');}
  }
}

// ── EDIT ENTRY (worker, when allowed by farm settings — or manager, always) ──
// Reuses the exact same plot/activity picker screens as starting a new
// entry, so editing looks and behaves identically for manager and worker,
// and identically to creating an entry in the first place. Only the final
// step and the save action differ.
function _timeStrFromTimestamp(ts){
  if(!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.toMillis());
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// After an edit is saved or cancelled, this returns to wherever the edit
// was actually opened from — a worker's own entries list, or a manager's
// entry-detail view — rather than leaving nothing open, which otherwise
// dumps the user back on the root home screen with no way to tell they
// ever left the entries list at all.
function _returnFromEntryEdit(){
  closeModal('modal-entry');
  if (window.currentUserRole === 'manager') {
    showModal('modal-mgr-entry-detail');
    if (typeof mgrShowEntryDetail === 'function' && entryWizard?.editEntryId) mgrShowEntryDetail(entryWizard.editEntryId);
  } else {
    showModal('modal-my-entries');
    if (typeof refreshMyEntries === 'function') refreshMyEntries();
  }
}
window._returnFromEntryEdit = _returnFromEntryEdit;

async function startEditEntry(entryId){
  // Close every currently-open modal first, whatever it is — the edit
  // wizard can be triggered from different screens with different modals
  // stacked underneath, and setModalContent() only targets the first
  // ".modal.open" it finds, so anything left open can visually cover it.
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-entry');
  setModalContent(`<div class="modal-step" style="text-align:center;padding:40px"><div class="spinner-dark"></div></div>`);
  try{
    // Make sure plot/crop/activity data is fresh and loaded — this matters
    // especially when a manager (not a worker) triggers an edit, since the
    // manager screen doesn't normally load this data on its own.
    await Promise.all([loadPlots(), loadCropData()]);

    const doc = await db.collection('timeEntries').doc(entryId).get();
    if(!doc.exists){ showToast(t('worker.entryNotFound')); closeModal('modal-entry'); return; }
    const e = doc.data();
    if(e.status === 'active'){ showToast('לא ניתן לערוך רשומה פעילה — יש לסיים אותה קודם'); closeModal('modal-entry'); return; }

    const act  = findActivity(e.activityId);
    if(!act){ showToast(t('worker.activityNotFound')); closeModal('modal-entry'); return; }

    const titleEl = document.getElementById('modal-entry-title');
    if(titleEl) titleEl.textContent = t('worker.editRecordTitle').replace('{worker}', e.workerName || t('worker.unknownWorker'));

    entryWizard = {
      step:0, gpsLat:0, gpsLng:0,
      activity: act,
      freeText: e.activityFreeText || '',
      editEntryId: entryId,
      editOriginal: { id:entryId, ...e },
      editDate: e.date || todayStr(),
      editStart: _timeStrFromTimestamp(e.startTime),
      editEnd: _timeStrFromTimestamp(e.endTime),
      editNotes: e.notes || '',
      editReason: '',
      // Unified plot tracking regardless of whether the entry originally had
      // one plot or several — always an array, so the same save logic works
      // for both the single-select and checklist rendering modes below.
      editPlotIds: e.plotIds && e.plotIds.length ? [...e.plotIds] : (e.plotId ? [e.plotId] : []),
      _plotListOpen: false,
      _actListOpen: false,
    };
    showEditForm();
  }catch(err){
    console.error('startEditEntry:', err);
    showToast(t('error.generic')||'שגיאה');
    closeModal('modal-entry');
  }
}
window.startEditEntry = startEditEntry;

// Saves whatever is currently typed into the form fields back onto
// entryWizard before any re-render (e.g. opening the plot/activity picker,
// or picking a new plot/activity) — otherwise a re-render would wipe out
// anything the user already typed.
function _captureEditFormFields(){
  const d=document.getElementById('ee-date');   if(d) entryWizard.editDate=d.value;
  const s=document.getElementById('ee-start');  if(s) entryWizard.editStart=s.value;
  const en=document.getElementById('ee-end');   if(en) entryWizard.editEnd=en.value;
  const n=document.getElementById('ee-notes');  if(n) entryWizard.editNotes=n.value;
  const r=document.getElementById('ee-reason'); if(r) entryWizard.editReason=r.value;
  const ft=document.getElementById('ee-freetext'); if(ft) entryWizard.freeText=ft.value;
}

function toggleEditPlotList(){
  _captureEditFormFields();
  entryWizard._plotListOpen = !entryWizard._plotListOpen;
  entryWizard._actListOpen = false;
  showEditForm();
}
window.toggleEditPlotList = toggleEditPlotList;

function toggleEditActList(){
  _captureEditFormFields();
  entryWizard._actListOpen = !entryWizard._actListOpen;
  entryWizard._plotListOpen = false;
  showEditForm();
}
window.toggleEditActList = toggleEditActList;

function selectEditPlot(plotId){
  _captureEditFormFields();
  entryWizard.editPlotIds = plotId ? [plotId] : [];
  entryWizard._plotListOpen = false;
  showEditForm();
}
window.selectEditPlot = selectEditPlot;

// Mechanical-activity checklist mode — toggles one plot in/out of the
// unified selection without closing or re-rendering the whole form, same
// as the original creation-wizard's multi-plot checklist behavior.
function toggleEditPlotCb(plotId, checked){
  _captureEditFormFields();
  if (checked) {
    if (!entryWizard.editPlotIds.includes(plotId)) entryWizard.editPlotIds.push(plotId);
  } else {
    entryWizard.editPlotIds = entryWizard.editPlotIds.filter(id => id !== plotId);
  }
}
window.toggleEditPlotCb = toggleEditPlotCb;

function selectEditActivity(actId){
  _captureEditFormFields();
  const act = findActivity(actId);
  if(!act) return;
  entryWizard.activity = act;
  entryWizard._actListOpen = false;
  if(!act.requiresText) entryWizard.freeText = '';
  // Note: plot selection is intentionally left untouched here. An entry
  // that's already multi-plot stays multi-plot regardless of which
  // activity gets selected — trimming it down based on the activity's own
  // subtype would silently drop real, existing plot data.
  showEditForm();
}
window.selectEditActivity = selectEditActivity;

function filterEditInlineRows(containerId, query){
  const q=(query||'').toLowerCase().trim();
  document.querySelectorAll(`#${containerId} .edit-inline-row`).forEach(row=>{
    row.style.display=(!q||row.textContent.toLowerCase().includes(q))?'':'none';
  });
  document.querySelectorAll(`#${containerId} .edit-inline-group-title`).forEach(t=>{
    let sib=t.nextElementSibling, anyVisible=false;
    while(sib && sib.classList.contains('edit-inline-row')){
      if(sib.style.display!=='none') anyVisible=true;
      sib=sib.nextElementSibling;
    }
    t.style.display=anyVisible?'':'none';
  });
}
window.filterEditInlineRows = filterEditInlineRows;

// Resolves a plot for display/save even if it's since been deactivated
// (and so no longer appears in the live, active-only PLOTS array) —
// falls back to the name/area already denormalized on the given original
// entry data at the moment it was created, rather than silently dropping
// it. Shared between the edit form's rendering and its save logic, so
// neither one can drift out of sync with the other.
function _resolvePlotForEdit(plotId, original){
  const live = PLOTS.find(p=>p.id===plotId);
  if (live) return live;
  const origIds = original?.plotIds && original.plotIds.length ? original.plotIds : (original?.plotId ? [original.plotId] : []);
  const idx = origIds.indexOf(plotId);
  if (idx === -1) return null;
  const name = original.plotNames && original.plotNames.length ? original.plotNames[idx] : original.plotName;
  const dunams = original.plotDunams && original.plotDunams.length ? original.plotDunams[idx] : 0;
  return { id: plotId, name: name || plotId, dunams: dunams||0, cropId: null, _inactive: true };
}

function showEditForm(){
  const plotIds = entryWizard.editPlotIds || [];
  const original = entryWizard.editOriginal || {};
  const resolvePlot = (plotId) => _resolvePlotForEdit(plotId, original);

  const firstPlot = plotIds[0] ? resolvePlot(plotIds[0]) : null;
  const act = entryWizard.activity;
  const isMechanical = act?.subtype === 'mechanical';
  // An entry that already has more than one plot must stay editable as a
  // checklist regardless of the activity's own subtype — multi-plot isn't
  // exclusively a "mechanical activity" thing; a task can be defined
  // across several plots for any activity, and previously this silently
  // hid every plot but the first the moment such an entry was edited.
  const showChecklist = isMechanical || plotIds.length > 1;

  const sortedPlots = [...PLOTS].sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'he', {numeric:true, sensitivity:'base'}));
  const cropId = firstPlot?.cropId || null;
  const acts = cropId ? getActivitiesForCrop(cropId) : (()=>{
    const generalMigrated = Object.values(cropAllActivities).flat().some(a => a.type === 'other' && !a.cropId);
    const customGeneral = Object.values(cropCustomActivities).flat().filter(a => a.type === 'other' && !a.cropId);
    return { manual:[], mechanical:[], general: generalMigrated?customGeneral:GENERAL_ACTIVITIES };
  })();
  const sortByOrder = arr => [...arr].sort((a,b)=>{
    const oa=typeof a.order==='number'?a.order:Infinity, ob=typeof b.order==='number'?b.order:Infinity;
    return oa-ob;
  });
  const manual=sortByOrder(acts.manual), mechanical=sortByOrder(acts.mechanical), general=sortByOrder(acts.general);

  // The checklist starts with every active same-crop plot (as before), but
  // now also includes any currently-selected plot that isn't in that list
  // at all — most commonly because it's been deactivated since this entry
  // was created — so it still shows up, pre-checked, instead of vanishing.
  const activeSameCropPlots = cropId
    ? PLOTS.filter(p=>p.cropId===cropId && p.active!==false)
        .sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'he', {numeric:true, sensitivity:'base'}))
    : [];
  const missingSelectedPlots = plotIds
    .filter(id => !activeSameCropPlots.some(p=>p.id===id))
    .map(resolvePlot)
    .filter(Boolean);
  const checklistPlots = showChecklist ? [...activeSameCropPlots, ...missingSelectedPlots] : [];

  const actRow = a => `<div class="edit-inline-row" onclick="selectEditActivity('${a.id}')">${a.nameI18n?.he||a.id}</div>`;

  setModalContent(`
    <div class="modal-step">
      <div class="mgr-edit-form">

        <div>
          <div class="mgr-edit-label">פעילות</div>
          <div class="edit-select-row" onclick="toggleEditActList()">
            <span>${act?(act.nameI18n[currentLang]||act.nameI18n.he):'בחר פעילות'}</span>
            <span class="edit-select-chevron">${entryWizard._actListOpen?'▴':'▾'}</span>
          </div>
          ${entryWizard._actListOpen?`
            <input class="mgr-edit-input" placeholder="${t('worker.searchActivity')}" oninput="filterEditInlineRows('edit-act-list', this.value)" style="margin-top:6px">
            <div class="edit-inline-list" id="edit-act-list">
              ${manual.length?`<div class="edit-inline-group-title">${t('entry.manual')}</div>${manual.map(actRow).join('')}`:''}
              ${mechanical.length?`<div class="edit-inline-group-title">${t('entry.mechanical')}</div>${mechanical.map(actRow).join('')}`:''}
              ${general.length?`<div class="edit-inline-group-title">${t('entry.general')}</div>${general.map(actRow).join('')}`:''}
            </div>`:''}
        </div>

        <div>
          <div class="mgr-edit-label">${showChecklist?'חלקות':'חלקה'}</div>
          ${showChecklist ? `
          <div class="multi-plot-section">
            ${checklistPlots.map(p=>`
              <label class="multi-plot-item">
                <input type="checkbox" class="edit-plot-cb" value="${p.id}" onchange="toggleEditPlotCb('${p.id}', this.checked)" ${plotIds.includes(p.id)?'checked':''}>
                <span>${p.name}${p._inactive?` (${t('worker.inactivePlot')||'לא פעילה'})`:''}${p.dunams?` · ${p.dunams} ${t('worker.dunamAbbr')}`:''}</span>
              </label>`).join('')}
          </div>
          ` : `
          <div class="edit-select-row" onclick="toggleEditPlotList()">
            <span>${firstPlot?firstPlot.name+(firstPlot._inactive?` (${t('worker.inactivePlot')||'לא פעילה'})`:''):'ללא חלקה'}</span>
            <span class="edit-select-chevron">${entryWizard._plotListOpen?'▴':'▾'}</span>
          </div>
          ${entryWizard._plotListOpen?`
            <input class="mgr-edit-input" placeholder="${t('worker.searchPlot')}" oninput="filterEditInlineRows('edit-plot-list', this.value)" style="margin-top:6px">
            <div class="edit-inline-list" id="edit-plot-list">
              <div class="edit-inline-row" onclick="selectEditPlot(null)">ללא חלקה</div>
              ${firstPlot?._inactive?`<div class="edit-inline-row" onclick="selectEditPlot('${firstPlot.id}')">${firstPlot.name} (${t('worker.inactivePlot')||'לא פעילה'})</div>`:''}
              ${sortedPlots.map(p=>`<div class="edit-inline-row" onclick="selectEditPlot('${p.id}')">${p.name}${p.variety?' · '+p.variety:''}</div>`).join('')}
            </div>`:''}
          `}
        </div>

        ${act?.requiresText?`
        <div>
          <div class="mgr-edit-label">תיאור הפעילות</div>
          <textarea id="ee-freetext" class="mgr-edit-input entry-textarea" rows="2" placeholder="${t('entry.freeTextPlaceholder')||'הזן תיאור...'}">${entryWizard.freeText||''}</textarea>
        </div>`:''}

        <div style="width:100%">
          <div class="mgr-edit-label">תאריך</div>
          ${ddDateField('ee-date', entryWizard.editDate, '')}
        </div>
        <div style="width:100%">
          <div class="mgr-edit-label">שעת התחלה</div>
          ${ddTimeField('ee-start', entryWizard.editStart, '')}
        </div>
        <div style="width:100%">
          <div class="mgr-edit-label">שעת סיום</div>
          ${ddTimeField('ee-end', entryWizard.editEnd, '')}
        </div>
        ${entryWizard.editOriginal?.taskNote?`
        <div>
          <div class="mgr-edit-label">${t('entry.taskNote')||'הערת מנהל למשימה'}</div>
          <div class="detail-note" style="background:var(--input-bg);border-radius:var(--radius-sm);padding:10px 12px">${entryWizard.editOriginal.taskNote}</div>
        </div>`:''}
        <div>
          <div class="mgr-edit-label">הערות</div>
          <textarea id="ee-notes" class="mgr-edit-input entry-textarea" rows="2">${entryWizard.editNotes||''}</textarea>
        </div>
        <div>
          <div class="mgr-edit-label" style="color:var(--crimson)">סיבת עריכה (חובה)</div>
          <input id="ee-reason" class="mgr-edit-input" type="text" placeholder="${t('worker.editReasonPlaceholder')}" value="${entryWizard.editReason||''}">
        </div>
      </div>
      <button class="btn-primary full-w" id="btn-save-edit" onclick="confirmEditSave()">שמור שינויים</button>
      <button class="btn-ghost full-w" onclick="_returnFromEntryEdit()">ביטול</button>
    </div>`);
}
window.showEditForm = showEditForm;

async function confirmEditSave(){
  const reason = document.getElementById('ee-reason')?.value.trim();
  if(!reason){ showToast('יש להזין סיבת עריכה'); return; }
  const dateVal  = document.getElementById('ee-date')?.value;
  const startVal = document.getElementById('ee-start')?.value;
  const endVal   = document.getElementById('ee-end')?.value;
  const notes    = document.getElementById('ee-notes')?.value.trim() || null;
  const freeTextEl = document.getElementById('ee-freetext');
  if(freeTextEl) entryWizard.freeText = freeTextEl.value.trim();
  if(!dateVal || !startVal){ showToast('חובה למלא תאריך ושעת התחלה'); return; }
  if(endVal){
    const [sh,sm] = startVal.split(':').map(Number);
    const [eh,em] = endVal.split(':').map(Number);
    if((eh*60+em) <= (sh*60+sm)){ showToast('שעת סיום חייבת להיות אחרי שעת התחלה'); return; }
  }

  const btn = document.getElementById('btn-save-edit');
  if(btn){ btn.disabled=true; btn.innerHTML='<div class="spinner-sm"></div>'; }

  try{
    const entryId  = entryWizard.editEntryId;
    const original = entryWizard.editOriginal;
    const resolvedPlots = (entryWizard.editPlotIds||[]).map(id => _resolvePlotForEdit(id, entryWizard.editOriginal)).filter(Boolean);
    const plot = resolvedPlots[0] || null; // first plot still populates the single-plot fields below
    const act = entryWizard.activity;

    const plotIds   = resolvedPlots.length ? resolvedPlots.map(p=>p.id) : [null];
    const plotNames = resolvedPlots.length ? resolvedPlots.map(p=>p.name) : [null];
    const plotDunams= resolvedPlots.length ? resolvedPlots.map(p=>p.dunams||0) : null;
    const isMulti = plotIds.length > 1;

    const startTs = mgrTimeToTimestamp(dateVal, startVal);
    const endTs   = endVal ? mgrTimeToTimestamp(dateVal, endVal) : null;

    const previous = {
      plotId: original.plotId||null, plotName: original.plotName||null,
      plotIds: original.plotIds||null, plotNames: original.plotNames||null,
      activityId: original.activityId||null, activityFreeText: original.activityFreeText||null,
      date: original.date||null,
      startTime: original.startTime||null, endTime: original.endTime||null,
      notes: original.notes||null,
    };

    const updates = {
      plotId: plot?plot.id:null, plotName: plot?plot.name:null,
      plotIds: isMulti?plotIds:null, plotNames: isMulti?plotNames:null, plotDunams: isMulti?plotDunams:null,
      crop: plot?plot.crop:null, variety: plot?(plot.variety||''):null,
      activityId: act.id, activityType: act.type, activitySubtype: act.subtype||null,
      activityFreeText: entryWizard.freeText||null,
      date: dateVal,
      startTime: startTs,
      endTime: endTs,
      notes,
    };

    const isManagerEdit = window.currentUserRole === 'manager';
    const editMarker = {
      editedBy: currentUser.uid,
      editedByName: document.getElementById('menu-name')?.textContent || '—',
      editedAt: firebase.firestore.FieldValue.serverTimestamp(),
      reason,
      previous,
    };
    if(isManagerEdit){
      updates.managerEdit = editMarker;
      updates.status = endTs ? 'complete' : (original.status||'complete');
    } else {
      updates.workerEdit = editMarker;
      updates.status = 'flagged';       // surfaces in the manager's existing review queue
      updates.flagReviewed = false;
    }

    await db.collection('timeEntries').doc(entryId).update(updates);

    // If either the old or new date has already been settled, that day's
    // travel/OT numbers may now be stale — recompute the whole day fresh.
    const datesToCheck = [...new Set([original.date, dateVal].filter(Boolean))];
    for(const d of datesToCheck){
      const settledSnap = await db.collection('timeEntries')
        .where('workerId','==',original.workerId)
        .where('date','==',d)
        .where('workdaySettled','==',true)
        .limit(1).get();
      if(!settledSnap.empty){
        await resettleDay(original.workerId, d);
      }
    }

    _returnFromEntryEdit();
    showToast('הרשומה עודכנה ✓');
    if(typeof mgrShowEntries === 'function' && isManagerEdit) refreshDashboard();
  }catch(e){
    console.error('confirmEditSave:', e);
    showToast(t('error.generic')||('שגיאה — '+e.message));
    if(btn){ btn.disabled=false; btn.innerHTML='שמור שינויים'; }
  }
}
window.confirmEditSave = confirmEditSave;

// ── END ENTRY ─────────────────────────────────────────────────
function endEntry(){
  if(!activeEntryId){showToast(t('entry.noActive')||'אין רישום פעיל');return;}
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-end');
  setModalContent(`
    <div class="modal-step">
      <div class="step-label">${t('entry.addNote')||'הוסף הערה (אופציונלי)'}</div>
      <textarea id="end-note" class="entry-textarea" placeholder="${t('entry.notePlaceholder')||'הערה...'}" rows="3"></textarea>
      <button class="btn-primary full-w" onclick="confirmEnd()">${t('entry.endConfirm')||'סיים רישום'}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-end')">${t('entry.cancel')||'ביטול'}</button>
    </div>`);
}

// Broadcast tasks (multiple workers, no leader) have no one positioned to
// press a "finish task" button. Instead, once the last active entry linked
// to one ends, it automatically moves to pending_review — same as a
// regular task's leader finishing it — so the manager still gets an
// explicit approve step and the task doesn't just vanish off their list
// on its own. Standard-time and settlement already happened independently,
// per entry, regardless of this — this transition is purely a status/
// record change for the manager's benefit.
async function checkBroadcastTaskAutoClose(workOrderId) {
  const woDoc = await db.collection('workOrders').doc(workOrderId).get();
  if (!woDoc.exists) return;
  const wo = woDoc.data();
  if (!wo.isBroadcast || wo.status !== 'in_progress') return;
  const linkedSnap = await db.collection('timeEntries').where('workOrderId','==',workOrderId).get();
  const stillActive = linkedSnap.docs.some(d => d.data().status === 'active');
  if (!stillActive) {
    await db.collection('workOrders').doc(workOrderId).update({
      status: 'pending_review',
      finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
}
window.checkBroadcastTaskAutoClose = checkBroadcastTaskAutoClose;

async function confirmEnd(){
  if(!activeEntryId)return;
  const note=document.getElementById('end-note')?.value.trim()||null;
  try{
    await db.collection('timeEntries').doc(activeEntryId).update({
      endTime:firebase.firestore.FieldValue.serverTimestamp(),
      status:'complete', notes:note,
    });
    activeEntryId=null;
    const endedWorkOrderId = activeEntryWorkOrderId;
    activeEntryWorkOrderId=null;
    clearTimer();
    closeModal('modal-end');
    showToast(t('entry.ended')||'הרישום הסתיים ✓');
    updateEndWorkdayBtn();
    refreshMyEntries();
    // If this was linked to a task and the task-list screen is open, refresh
    // it so the "finish my work" button disappears immediately.
    if (endedWorkOrderId && document.getElementById('modal-my-work-orders')?.classList.contains('open')) {
      showMyWorkOrders();
    }
    // Automatically settle this (and any other pending) day in the
    // background — replaces the old manual "סיום יום עבודה" button.
    settleAllPendingForWorker(currentUser.uid).catch(e => console.warn('auto-settle after end:', e));
    // Broadcast tasks have no leader to close them — once nobody has an
    // active entry left on it, it quietly closes itself. Purely for
    // record-keeping; standard-time already folded independently above.
    if (endedWorkOrderId) {
      checkBroadcastTaskAutoClose(endedWorkOrderId).catch(e => console.warn('broadcast auto-close check:', e));
    }
  }catch(e){
    console.error('confirmEnd:',e);
    showToast(t('error.generic')||'שגיאה');
  }
}

// ── END WORKDAY ───────────────────────────────────────────────
// Finds every date with unsettled-but-ended entries for a worker, and
// settles each one via resettleDay — covers today and any past date that
// was never closed, replacing the old manual "סיום יום עבודה" trigger.
async function settleAllPendingForWorker(workerId) {
  const snap = await db.collection('timeEntries')
    .where('workerId','==',workerId)
    .where('workdaySettled','==',false)
    .get();
  const dates = new Set();
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.endTime && data.date) dates.add(data.date);
  });
  for (const date of dates) {
    try { await resettleDay(workerId, date); } catch(e) { console.warn('settleAllPendingForWorker:', workerId, date, e); }
  }
  return dates.size;
}
window.settleAllPendingForWorker = settleAllPendingForWorker;

// Manager-triggered sweep across every worker — used both for the
// dashboard/manual "force settle" action and for the report-screen notice.
async function settleAllPendingForAllWorkers() {
  const snap = await db.collection('timeEntries').where('workdaySettled','==',false).get();
  const byWorker = {};
  snap.docs.forEach(d => {
    const data = d.data();
    if (!data.endTime || !data.date || !data.workerId) return;
    if (!byWorker[data.workerId]) byWorker[data.workerId] = new Set();
    byWorker[data.workerId].add(data.date);
  });
  let settledCount = 0;
  for (const [workerId, dates] of Object.entries(byWorker)) {
    for (const date of dates) {
      try { await resettleDay(workerId, date); settledCount++; } catch(e) { console.warn('settleAllPendingForAllWorkers:', workerId, date, e); }
    }
  }
  return settledCount;
}
window.settleAllPendingForAllWorkers = settleAllPendingForAllWorkers;

// Quick check (no writes) — used to decide whether to show a manager
// report-screen notice, without doing the settlement work up front.
async function countPendingSettlement() {
  const snap = await db.collection('timeEntries').where('workdaySettled','==',false).get();
  const dates = new Set();
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.endTime && data.date) dates.add(data.workerId+'|'+data.date);
  });
  return dates.size;
}
window.countPendingSettlement = countPendingSettlement;

// Manager-triggered, farm-wide version of the stale-entry check — used by
// "סיכום יום העבודה" before it can calculate cleanly. Unlike the per-worker
// pre-start check, this never blocks anything (there's nothing being
// "started" here) — it just auto-closes whatever's crossed the threshold,
// farm-wide, and leaves anything younger alone (that's what surfaces in
// the report as still genuinely open).
async function sweepStaleEntriesFarmWide() {
  const snap = await db.collection('timeEntries').where('status','==','active').get();
  const settings = await getFarmSettings();
  const staleHours = settings.staleEntryHours ?? 13;
  const staleMs = staleHours*60*60*1000;
  let closedCount = 0;
  for (const doc of snap.docs) {
    const entry = doc.data();
    if (!entry.startTime) continue;
    const ageMs = Date.now() - entry.startTime.toMillis();
    if (ageMs < staleMs) continue;
    const backdatedEnd = firebase.firestore.Timestamp.fromMillis(entry.startTime.toMillis() + staleMs);
    try {
      await db.collection('timeEntries').doc(doc.id).update({
        endTime: backdatedEnd, status: 'flagged',
        flagNote: `auto-closed: exceeded ${staleHours}-hour threshold during day summary`,
        flagNoteLang: 'en',
      });
      if (entry.workerId && entry.date) await resettleDay(entry.workerId, entry.date);
      closedCount++;
    } catch(e) { console.warn('sweepStaleEntriesFarmWide:', doc.id, e); }
  }
  return closedCount;
}
window.sweepStaleEntriesFarmWide = sweepStaleEntriesFarmWide;

// Sweeps every task still sitting at in_progress to pending_review —
// part of "סיכום יום העבודה," so tasks don't stay open indefinitely just
// because a leader never explicitly pressed finish (or, for broadcast
// tasks, because the last-finisher's auto-close check happened to fail).
async function sweepInProgressTasks() {
  const snap = await db.collection('workOrders').where('status','==','in_progress').get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(d => {
    batch.update(d.ref, { status:'pending_review', finishedAt: firebase.firestore.FieldValue.serverTimestamp() });
  });
  await batch.commit();
  return snap.size;
}
window.sweepInProgressTasks = sweepInProgressTasks;

// Companion self-heal, farm-wide: a task can be left stuck at "pending"
// if the automatic pending->in_progress transition (fired at the moment
// any assigned worker's first entry is created) silently failed — that
// transition is fire-and-forget with no retry. Any pending task that
// genuinely has an entry linked to it is proof work already started,
// so it's corrected here rather than left stuck indefinitely.
async function sweepStuckPendingTasks() {
  const pendingSnap = await db.collection('workOrders').where('status','==','pending').get();
  if (pendingSnap.empty) return 0;
  const pendingIds = pendingSnap.docs.map(d => d.id);
  const chunks = [];
  for (let i=0;i<pendingIds.length;i+=30) chunks.push(pendingIds.slice(i,i+30));
  const entrySnaps = await Promise.all(chunks.map(chunk =>
    db.collection('timeEntries').where('workOrderId','in',chunk).get()
  ));
  const idsWithEntries = new Set();
  entrySnaps.forEach(snap => snap.docs.forEach(d => idsWithEntries.add(d.data().workOrderId)));
  if (!idsWithEntries.size) return 0;
  const batch = db.batch();
  idsWithEntries.forEach(id => batch.update(db.collection('workOrders').doc(id), { status:'in_progress' }));
  await batch.commit();
  return idsWithEntries.size;
}
window.sweepStuckPendingTasks = sweepStuckPendingTasks;


async function endWorkday(){
  showModal('modal-workday');
  setModalContent(`<div class="modal-step"><div class="spinner-dark"></div><div style="margin-top:12px;color:var(--text-muted)">${t('workday.calculating')||'מחשב שעות...'}</div></div>`);
  try{
    const snap=await db.collection('timeEntries')
      .where('workerId','==',currentUser.uid)
      .where('date','==',todayStr())
      .where('workdaySettled','==',false)
      .get();
    if(snap.empty){
      setModalContent(`<div class="modal-step"><div class="step-label">${t('workday.noEntries')||'אין רשומות להיום'}</div><button class="btn-ghost full-w" onclick="closeModal('modal-workday')">${t('entry.close')||'סגור'}</button></div>`);
      return;
    }
    const entries=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(e=>e.endTime)
      .sort((a,b)=>a.startTime?.toMillis()-b.startTime?.toMillis());
    const fieldEntries=entries.filter(e=>e.activityType==='field'&&e.plotId);
    const travelMap={};
    fieldEntries.forEach((e,i)=>{
      const plot=PLOTS.find(p=>p.id===e.plotId);
      const oneway=plot?plot.travelMinutes:0;
      let travel=0;
      if(i===0)travel+=oneway;
      if(i===fieldEntries.length-1)travel+=oneway;
      if(i>0){
        const prev=fieldEntries[i-1];
        if(prev.endTime&&e.startTime){
          const halfGap=Math.round((e.startTime.toMillis()-prev.endTime.toMillis())/2/60000);
          travel+=halfGap;
          travelMap[prev.id]=(travelMap[prev.id]||0)+halfGap;
        }
      }
      travelMap[e.id]=(travelMap[e.id]||0)+travel;
    });
    // Fetch farm settings for OT calculation
    const settings = await getFarmSettings();
    const workdayMins = (settings.workdayHours||8) * 60;
    const ot1MaxMins  = (settings.overtime1MaxHours||2) * 60;

    // Sort entries by start time for correct OT accumulation
    const sorted = [...entries].sort((a,b)=>a.startTime?.toMillis()-b.startTime?.toMillis());
    let dayTotalMins = 0;
    const otMap = {};

    sorted.forEach(e=>{
      if(!e.startTime||!e.endTime)return;
      const mins=(e.endTime.toMillis()-e.startTime.toMillis())/60000;
      const isSick    = e.activityId==='sick-leave';
      const isVacation= e.activityId==='vacation';
      const dow = new Date(e.date+'T12:00:00').getDay();
      const isWeekend = (settings.weekendDays||[6]).includes(dow);

      if(isSick)    { otMap[e.id]={sickHours:mins/60,    regularHours:0,overtime1Hours:0,overtime2Hours:0,weekendHours:0}; return; }
      if(isVacation){ otMap[e.id]={vacationHours:mins/60, regularHours:0,overtime1Hours:0,overtime2Hours:0,weekendHours:0}; return; }

      if(isWeekend) { otMap[e.id]={weekendHours:mins/60,  regularHours:0,overtime1Hours:0,overtime2Hours:0}; return; }

      // Regular OT calculation
      const entryStart = dayTotalMins;
      const entryEnd   = dayTotalMins + mins;
      const regular = Math.max(0, Math.min(entryEnd, workdayMins) - Math.min(entryStart, workdayMins));
      const ot1     = Math.max(0, Math.min(entryEnd, workdayMins+ot1MaxMins) - Math.max(entryStart, workdayMins));
      const ot2     = Math.max(0, entryEnd - Math.max(entryStart, workdayMins+ot1MaxMins));
      otMap[e.id] = { regularHours:regular/60, overtime1Hours:ot1/60, overtime2Hours:ot2/60, weekendHours:0 };
      dayTotalMins = entryEnd;
    });

    const batch=db.batch();
    let totalMins=0;
    entries.forEach(e=>{
      const ot=otMap[e.id]||{};
      const mins = e.endTime&&e.startTime ? (e.endTime.toMillis()-e.startTime.toMillis())/60000 : 0;
      let plotAllocations = [];
      if (e.plotIds && e.plotIds.length > 1) {
        const dunams = e.plotDunams || e.plotIds.map(()=>0);
        const totalDunams = dunams.reduce((a,b)=>a+b,0);
        plotAllocations = e.plotIds.map((pid,i) => {
          const ratio = totalDunams > 0 ? (dunams[i]||0)/totalDunams : 1/e.plotIds.length;
          return { plotId: pid, plotName: e.plotNames?.[i]||'', minutes: mins*ratio, dunams: dunams[i]||0 };
        });
      } else if (e.plotId) {
        const plot = PLOTS.find(p=>p.id===e.plotId);
        plotAllocations = [{ plotId: e.plotId, plotName: e.plotName||'', minutes: mins, dunams: plot?.dunams||0 }];
      }
      batch.update(db.collection('timeEntries').doc(e.id),{
        travelMinutes:   travelMap[e.id]||0,
        workdaySettled:  true,
        regularHours:    ot.regularHours||0,
        overtime1Hours:  ot.overtime1Hours||0,
        overtime2Hours:  ot.overtime2Hours||0,
        weekendHours:    ot.weekendHours||0,
        sickHours:       ot.sickHours||0,
        vacationHours:   ot.vacationHours||0,
        plotAllocations,
      });
      totalMins += mins;
    });
    await batch.commit();
    const h=Math.floor(totalMins/60),m=Math.round(totalMins%60);
    const totalTravelMins=Object.values(travelMap).reduce((a,b)=>a+b,0);
    setModalContent(`
      <div class="modal-step">
        <div class="step-icon" style="font-size:48px">✅</div>
        <div class="step-title">${t('workday.done')||'יום עבודה הסתיים'}</div>
        <div class="summary-box">
          <div class="summary-row"><span>${t('workday.entries')||'רשומות'}</span><span>${entries.length}</span></div>
          <div class="summary-row"><span>${t('workday.totalHours')||'סה"כ שעות'}</span><span>${h}:${String(m).padStart(2,'0')}</span></div>
          ${totalTravelMins>0?`<div class="summary-row"><span>${t('entry.travel')||'נסיעה'}</span><span>${totalTravelMins} ${t('unit.min')||"דק'"}</span></div>`:''}
        </div>
        <button class="btn-primary full-w" onclick="closeModal('modal-workday');document.getElementById('end-workday-wrap').hidden=true">${t('entry.close')||'סגור'}</button>
      </div>`);
    refreshMyEntries();
  }catch(e){console.error('endWorkday:',e);showToast(t('error.generic')||'שגיאה');closeModal('modal-workday');}
}

// ── RE-SETTLEMENT (triggered by editing an already-settled entry) ─────
// Unlike endWorkday() — which only settles entries not yet settled, and is
// meant to be called incrementally through the day — this recomputes the
// ENTIRE day fresh from every entry on that date, regardless of their
// current settled state. That's necessary because travel time and
// overtime buckets are computed from the whole day's sequence of entries
// together, not from any single entry in isolation — editing one entry's
// plot, time, or activity can change numbers on its neighbors too.
async function resettleDay(workerId, dateStr) {
  const snap = await db.collection('timeEntries')
    .where('workerId','==',workerId)
    .where('date','==',dateStr)
    .get();
  const entries = snap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.endTime);
  if (!entries.length) return;

  const sorted = [...entries].sort((a,b)=>a.startTime?.toMillis()-b.startTime?.toMillis());

  const fieldEntries = sorted.filter(e=>e.activityType==='field'&&e.plotId);
  const travelMap = {};
  fieldEntries.forEach((e,i)=>{
    const plot = PLOTS.find(p=>p.id===e.plotId);
    const oneway = plot?plot.travelMinutes:0;
    let travel=0;
    if(i===0) travel+=oneway;
    if(i===fieldEntries.length-1) travel+=oneway;
    if(i>0){
      const prev=fieldEntries[i-1];
      if(prev.endTime&&e.startTime){
        const halfGap=Math.round((e.startTime.toMillis()-prev.endTime.toMillis())/2/60000);
        travel+=halfGap;
        travelMap[prev.id]=(travelMap[prev.id]||0)+halfGap;
      }
    }
    travelMap[e.id]=(travelMap[e.id]||0)+travel;
  });

  const settings = await getFarmSettings();
  const workdayMins = (settings.workdayHours||8)*60;
  const ot1MaxMins  = (settings.overtime1MaxHours||2)*60;

  let dayTotalMins = 0;
  const otMap = {};
  sorted.forEach(e=>{
    if(!e.startTime||!e.endTime) return;
    const mins=(e.endTime.toMillis()-e.startTime.toMillis())/60000;
    const isSick     = e.activityId==='sick-leave';
    const isVacation = e.activityId==='vacation';
    const dow = new Date(e.date+'T12:00:00').getDay();
    const isWeekend = (settings.weekendDays||[6]).includes(dow);

    if(isSick)    { otMap[e.id]={sickHours:mins/60,    regularHours:0,overtime1Hours:0,overtime2Hours:0,weekendHours:0}; return; }
    if(isVacation){ otMap[e.id]={vacationHours:mins/60, regularHours:0,overtime1Hours:0,overtime2Hours:0,weekendHours:0}; return; }
    if(isWeekend) { otMap[e.id]={weekendHours:mins/60,  regularHours:0,overtime1Hours:0,overtime2Hours:0}; return; }

    const entryStart = dayTotalMins;
    const entryEnd   = dayTotalMins + mins;
    const regular = Math.max(0, Math.min(entryEnd, workdayMins) - Math.min(entryStart, workdayMins));
    const ot1     = Math.max(0, Math.min(entryEnd, workdayMins+ot1MaxMins) - Math.max(entryStart, workdayMins));
    const ot2     = Math.max(0, entryEnd - Math.max(entryStart, workdayMins+ot1MaxMins));
    otMap[e.id] = { regularHours:regular/60, overtime1Hours:ot1/60, overtime2Hours:ot2/60, weekendHours:0 };
    dayTotalMins = entryEnd;
  });

  // Folds one entry's current plotAllocations into each affected plot's
  // standardTimes, reversing whatever this same entry contributed last
  // time it settled (tracked via e.stdTimeContrib) so edits never double-
  // count. Skips free-text activities entirely — there's no meaningful
  // "average time" for an undefined task. Returns the new contribution to
  // save back onto the entry, or null if this entry doesn't participate
  // (free-text activity, or no allocations at all).
  async function foldStandardTime(entry, newAllocations) {
    const act = findActivity(entry.activityId);
    if (!act || act.requiresText) return null;

    const oldContrib = entry.stdTimeContrib || [];
    const newContrib = newAllocations
      .filter(a => a.plotId && a.dunams)
      .map(a => ({ plotId: a.plotId, activityId: entry.activityId, minutes: a.minutes, dunams: a.dunams }));

    const deltas = {}; // "plotId" -> {activityId, minutesDelta, dunamsDelta}
    oldContrib.forEach(c => {
      if (!deltas[c.plotId]) deltas[c.plotId] = { activityId: c.activityId, minutesDelta: 0, dunamsDelta: 0 };
      deltas[c.plotId].minutesDelta -= c.minutes;
      deltas[c.plotId].dunamsDelta -= c.dunams;
    });
    newContrib.forEach(c => {
      if (!deltas[c.plotId]) deltas[c.plotId] = { activityId: c.activityId, minutesDelta: 0, dunamsDelta: 0 };
      deltas[c.plotId].minutesDelta += c.minutes;
      deltas[c.plotId].dunamsDelta += c.dunams;
    });

    for (const [plotId, d] of Object.entries(deltas)) {
      if (!d.minutesDelta && !d.dunamsDelta) continue;
      try {
        await db.runTransaction(async (tx) => {
          const plotRef = db.collection('plots').doc(plotId);
          const plotDoc = await tx.get(plotRef);
          if (!plotDoc.exists) return;
          const existing = plotDoc.data().standardTimes?.[d.activityId] || { totalMinutes: 0, totalDunams: 0 };
          const totalMinutes = Math.max(0, (existing.totalMinutes||0) + d.minutesDelta);
          const totalDunams = Math.max(0, (existing.totalDunams||0) + d.dunamsDelta);
          tx.update(plotRef, {
            [`standardTimes.${d.activityId}`]: {
              totalMinutes, totalDunams,
              minutesPerDunam: totalDunams > 0 ? totalMinutes/totalDunams : 0,
            },
          });
        });
      } catch(e) { console.warn('foldStandardTime failed for plot', plotId, e); }
    }
    return newContrib;
  }

  const batch = db.batch();
  for (const e of sorted) {
    const ot = otMap[e.id]||{};
    const mins = (e.endTime.toMillis()-e.startTime.toMillis())/60000;
    let plotAllocations = [];
    if (e.plotIds && e.plotIds.length > 1) {
      // Multi-plot: split proportionally by dunam, same math already used in the Excel export
      const dunams = e.plotDunams || e.plotIds.map(()=>0);
      const totalDunams = dunams.reduce((a,b)=>a+b,0);
      plotAllocations = e.plotIds.map((pid,i) => {
        const ratio = totalDunams > 0 ? (dunams[i]||0)/totalDunams : 1/e.plotIds.length;
        return { plotId: pid, plotName: e.plotNames?.[i]||'', minutes: mins*ratio, dunams: dunams[i]||0 };
      });
    } else if (e.plotId) {
      const plot = PLOTS.find(p=>p.id===e.plotId);
      plotAllocations = [{ plotId: e.plotId, plotName: e.plotName||'', minutes: mins, dunams: plot?.dunams||0 }];
    }

    // Standard-time now folds at every settlement — task-linked or not,
    // first time or re-settled after an edit — rather than once at task
    // approval. This also means a worker who starts a task-linked entry
    // after the task's approval still gets correctly counted.
    const stdTimeContrib = await foldStandardTime(e, plotAllocations);

    batch.update(db.collection('timeEntries').doc(e.id), {
      travelMinutes:  travelMap[e.id]||0,
      workdaySettled: true,
      regularHours:   ot.regularHours||0,
      overtime1Hours: ot.overtime1Hours||0,
      overtime2Hours: ot.overtime2Hours||0,
      weekendHours:   ot.weekendHours||0,
      sickHours:      ot.sickHours||0,
      vacationHours:  ot.vacationHours||0,
      plotAllocations,
      ...(stdTimeContrib !== null ? { stdTimeContrib } : {}),
    });
  }
  await batch.commit();
}
window.resettleDay = resettleDay;


let _myEntriesPeriod = 'today';
let _myEntriesFrom = null;
let _myEntriesTo = null;

function showMyEntries(){
  showModal('modal-my-entries');
  _myEntriesPeriod = 'today';
  refreshMyEntries();
}

function _myEntriesRange(period){
  const today = new Date(); today.setHours(0,0,0,0);
  const toStr = todayStr();
  if (period === 'today') return { from: toStr, to: toStr };
  if (period === 'week') {
    const d = new Date(today); d.setDate(d.getDate()-6);
    return { from: d.toISOString().slice(0,10), to: toStr };
  }
  if (period === 'month') {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: d.toISOString().slice(0,10), to: toStr };
  }
  return null; // custom — caller supplies dates
}

function myEntriesSelectPeriod(period){
  _myEntriesPeriod = period;
  if (period !== 'custom') { _myEntriesFrom = null; _myEntriesTo = null; }
  refreshMyEntries();
}
window.myEntriesSelectPeriod = myEntriesSelectPeriod;

function myEntriesApplyCustomRange(){
  _myEntriesFrom = document.getElementById('me-from')?.value;
  _myEntriesTo = document.getElementById('me-to')?.value;
  refreshMyEntries();
}
window.myEntriesApplyCustomRange = myEntriesApplyCustomRange;

function refreshMyEntries(){
  const fixedHeader = document.getElementById('entries-fixed-header');
  const container = document.getElementById('entries-list');
  if(!container||!currentUser||!fixedHeader)return;

  const periods = [
    {key:'today', label:t('entries.periodToday')},
    {key:'week',  label:t('entries.periodWeek')},
    {key:'month', label:t('entries.periodMonth')},
    {key:'custom',label:t('entries.periodCustom')},
  ];
  const periodBar = `<div class="entries-period-bar">
    ${periods.map(p => `<button class="entries-period-btn ${_myEntriesPeriod===p.key?'active':''}" onclick="myEntriesSelectPeriod('${p.key}')">${p.label}</button>`).join('')}
  </div>`;

  let range;
  if (_myEntriesPeriod === 'custom') {
    if (!_myEntriesFrom || !_myEntriesTo) {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-6);
      fixedHeader.innerHTML = periodBar + `
        <div class="entries-range-row">
          <div style="flex:1"><div class="export-label">${t('mgr.export.dateFrom')}</div>${ddDateField('me-from', weekAgo.toISOString().slice(0,10), '')}</div>
          <div style="flex:1"><div class="export-label">${t('mgr.export.dateTo')}</div>${ddDateField('me-to', todayStr(), '')}</div>
          <button class="btn-primary" style="width:auto;padding:10px 16px;white-space:nowrap" onclick="myEntriesApplyCustomRange()">${t('mgr.entries.showRange')}</button>
        </div>`;
      container.innerHTML = '';
      return;
    }
    range = { from: _myEntriesFrom, to: _myEntriesTo };
  } else {
    range = _myEntriesRange(_myEntriesPeriod);
  }

  fixedHeader.innerHTML = periodBar + (_myEntriesPeriod==='custom' ? `
        <div class="entries-range-row">
          <div style="flex:1"><div class="export-label">${t('mgr.export.dateFrom')}</div>${ddDateField('me-from', range.from, '')}</div>
          <div style="flex:1"><div class="export-label">${t('mgr.export.dateTo')}</div>${ddDateField('me-to', range.to, '')}</div>
          <button class="btn-primary" style="width:auto;padding:10px 16px;white-space:nowrap" onclick="myEntriesApplyCustomRange()">${t('mgr.entries.showRange')}</button>
        </div>` : '') + `<div id="entries-total-banner"></div>`;

  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;

  const fromTs = firebase.firestore.Timestamp.fromDate(new Date(range.from+'T00:00:00'));
  const toTs = firebase.firestore.Timestamp.fromDate(new Date(range.to+'T23:59:59'));
  db.collection('timeEntries')
    .where('workerId','==',currentUser.uid)
    .where('timestamp','>=',fromTs)
    .where('timestamp','<=',toTs)
    .orderBy('timestamp','desc')
    .get()
    .then(snap=>{
      const entries = snap.docs.map(d=>({id:d.id,...d.data()}));

      let totalMs = 0;
      entries.forEach(e=>{ if(e.startTime&&e.endTime) totalMs += e.endTime.toMillis()-e.startTime.toMillis(); });
      const totalBanner = document.getElementById('entries-total-banner');
      if (totalBanner) totalBanner.innerHTML = `<div class="entries-total-banner">${t('entries.totalForPeriod')}: ${durationStr(totalMs)}</div>`;

      if(!entries.length){container.innerHTML=`<div class="empty-state" style="padding:24px 0">${t('entries.empty')||'אין רשומות בטווח זה'}</div>`;return;}

      const colgroup = `<colgroup><col style="width:22%"><col style="width:18%"><col style="width:20%"><col style="width:14%"><col style="width:14%"><col style="width:18%"></colgroup>`;
      const rows = entries.map(e=>{
        const start=e.startTime?new Date(e.startTime.toMillis()):null;
        const end=e.endTime?new Date(e.endTime.toMillis()):null;
        const act=findActivity(e.activityId);
        const actName=act?(act.nameI18n[currentLang]||act.nameI18n.he):e.activityId||'—';
        const plotLabel = e.plotNames?.length ? e.plotNames.join(', ') : (e.plotName||'—');
        const dateStr=e.date?fmtStoredDate(e.date):'—';
        const startStr=start?start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
        const endStr=end?end.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}):(e.status==='active'?`⏱`:'—');
        const durStr=start&&end?durationStr(end-start):'—';
        return `<tr onclick="showEntryDetail('${e.id}')">
          <td>${actName}</td><td>${plotLabel}</td><td>${dateStr}</td><td>${startStr}</td><td>${endStr}</td><td>${durStr}</td>
        </tr>`;
      }).join('');

      container.innerHTML = `<div class="wo-table-wrap"><table class="wo-table" dir="rtl">${colgroup}
        <thead><tr><th>${t('entries.colActivity')}</th><th>${t('entries.colPlot')}</th><th>${t('entries.colDate')}</th><th>${t('entries.colStart')}</th><th>${t('entries.colEnd')}</th><th>${t('entries.colTotal')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    })
    .catch(err=>{console.error(err);container.innerHTML=`<div class="empty-state">${t('error.generic')||'שגיאה'} — ${err.message}</div>`;});
}

// ── ENTRY DETAIL ──────────────────────────────────────────────
async function showEntryDetail(entryId){
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-entry-detail');
  const container=document.getElementById('entry-detail-content');
  container.innerHTML=`<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;

  try{
    const [doc, settings] = await Promise.all([
      db.collection('timeEntries').doc(entryId).get(),
      getFarmSettings()
    ]);
    if(!doc.exists){container.innerHTML=`<div class="empty-state">${t('mgr.wo.notFound')}</div>`;return;}
    const e=doc.data();
    const act=findActivity(e.activityId);
    const actName=act?(act.nameI18n[currentLang]||act.nameI18n.he):e.activityId||'—';
    const start=e.startTime?new Date(e.startTime.toMillis()):null;
    const end=e.endTime?new Date(e.endTime.toMillis()):null;
    const dateStr=start?fmtDateDDMMYYYY(start):'—';
    const startStr=start?start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
    const endStr=end?end.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
    const durStr=start&&end?durationStr(end-start):'—';

    const isFlagged = e.status === 'flagged';
    const canFlag = e.status !== 'active';
    const canEdit = e.status !== 'active' && settings.allowWorkerEditReports === true;

    container.innerHTML=`
      ${isFlagged&&e.flagNote?`<div class="flag-existing">⚠️ ${t('entry.flagNote')||'דיווח שנשלח'}: ${e.flagNote||'—'}
        <button onclick="showFlagEntry('${entryId}',true)" style="margin-inline-start:8px;background:none;border:none;color:var(--crimson);font-size:12px;cursor:pointer;font-weight:700;">✏️ ערוך</button>
      </div>`:''}
      ${e.workerEdit?`<div style="padding:10px 20px"><div class="mgr-edited-badge">${t('worker.editedByYou').replace('{reason}',e.workerEdit.reason||'')}</div></div>`:''}
      <div class="detail-section"><div class="detail-label">${t('entry.activity')||'פעילות'}</div><div class="detail-value">${actName}${e.activityFreeText?': '+e.activityFreeText:''}</div></div>
      <div class="detail-section"><div class="detail-label">${t('entry.plot')||'חלקה'}</div><div class="detail-value">${e.plotNames?.length>1?e.plotNames.join(', '):(e.plotName||t('entry.noPlot')||'ללא חלקה')}${e.variety?' · '+e.variety:''}</div></div>
      <div class="detail-section"><div class="detail-label">${t('entry.date')||'תאריך'}</div><div class="detail-value">${dateStr}</div></div>
      <div class="detail-section"><div class="detail-label">${t('entry.startTime')||'שעת התחלה'} / ${t('entry.endEntry')||'סיום'}</div><div class="detail-value">${startStr} — ${endStr}</div></div>
      <div class="detail-section"><div class="detail-label">${t('entry.duration')||'משך'}</div><div class="detail-value">${durStr}</div></div>
      ${e.workdaySettled&&e.travelMinutes?`<div class="detail-section"><div class="detail-label">${t('entry.travel')||'נסיעה'}</div><div class="detail-value">${e.travelMinutes} ${t('unit.min')||"דק'"}</div></div>`:e.activityType==='field'&&!e.workdaySettled?`<div class="detail-section"><div class="detail-label">${t('entry.travel')||'נסיעה'}</div><div class="detail-value">—</div></div>`:''}
      ${e.taskNote?`<div class="detail-section"><div class="detail-label">${t('entry.taskNote')||'הערת מנהל למשימה'}</div><div class="detail-note">${e.taskNote}</div></div>`:''}
      ${e.notes?`<div class="detail-section"><div class="detail-label">${t('entry.notes')||'הערות'}</div><div class="detail-note">${e.notes}</div></div>`:''}
      <div style="padding:16px 20px 32px;display:flex;flex-direction:column;gap:8px">
        ${canEdit?`<button class="btn-primary full-w" onclick="startEditEntry('${entryId}')">${t('worker.editRecordBtn')}</button>`:''}
        ${canFlag?`<button class="btn-primary full-w" style="background:var(--crimson-light)" onclick="showFlagEntry('${entryId}',${isFlagged})">
          ⚠️ ${isFlagged?(t('entry.editFlag')||'ערוך דיווח'):(t('entry.reportIssue')||'דיווח על בעיה')}
        </button>`:''}
        <button class="btn-ghost full-w" style="color:#c62828;border-color:#c62828" onclick="deleteMyEntry('${entryId}')">${t('worker.deleteEntry')}</button>
      </div>
    `;
  }catch(e){console.error(e);container.innerHTML=`<div class="empty-state">${t('error.generic')||'שגיאה'}</div>`;}
}

async function deleteMyEntry(entryId){
  if (!await customConfirm(t('worker.deleteConfirm'))) return;
  try{
    const doc = await db.collection('timeEntries').doc(entryId).get();
    const e = doc.exists ? doc.data() : null;
    await db.collection('timeEntries').doc(entryId).delete();
    showToast(t('worker.deleted'));
    closeModal('modal-entry-detail');
    if (e && e.workerId && e.date && typeof resettleDay === 'function') {
      try { await resettleDay(e.workerId, e.date); } catch(err){ console.warn('resettleDay after delete:', err); }
    }
    if (typeof refreshMyEntries === 'function') refreshMyEntries();
  }catch(err){
    showToast((t('mgr.wo.error')||'שגיאה') + ': ' + err.message);
  }
}
window.deleteMyEntry = deleteMyEntry;

// ── FLAG ENTRY ────────────────────────────────────────────────
function showFlagEntry(entryId, isEdit){
  const container=document.getElementById('entry-detail-content');
  // If editing, fetch existing note first
  if(isEdit){
    db.collection('timeEntries').doc(entryId).get().then(doc=>{
      const existingNote = doc.exists ? (doc.data().flagNote||'') : '';
      renderFlagForm(entryId, existingNote);
    });
  } else {
    renderFlagForm(entryId, '');
  }
}

function renderFlagForm(entryId, existingNote){
  const container=document.getElementById('entry-detail-content');
  container.innerHTML=`
    <div class="modal-step">
      <div class="step-icon">⚠️</div>
      <div class="step-title">${t('entry.flagTitle')||'דיווח על בעיה'}</div>
      <div class="step-label">${t('entry.flagLabel')||'תאר את הבעיה'}</div>
      <textarea id="flag-note-input" class="entry-textarea" placeholder="${t('entry.flagPlaceholder')||'מה קרה?'}" rows="4">${existingNote}</textarea>
      <button class="btn-primary full-w" id="btn-flag-send" onclick="submitFlag('${entryId}')">${t('entry.flagSend')||'שלח דיווח'}</button>
      <button class="btn-ghost full-w" onclick="showEntryDetail('${entryId}')">${t('entry.back')||'חזור'}</button>
    </div>`;
  setTimeout(()=>{
    const ta=document.getElementById('flag-note-input');
    if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);}
  },100);
}

async function submitFlag(entryId){
  const note=document.getElementById('flag-note-input')?.value.trim()||'';
  if(!note){showToast(t('entry.flagLabel')||'תאר את הבעיה');return;}
  const btn=document.getElementById('btn-flag-send');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="spinner-sm"></div>';}
  try{
    // Translate the flag note
    const translated=await translateText(note,currentLang);
    await db.collection('timeEntries').doc(entryId).update({
      status:'flagged',
      flagNote:note,
      flagNoteLang:currentLang,
      flagNoteTranslated:translated,
    });
    closeModal('modal-entry-detail');
    showToast(t('entry.flagSent')||'הדיווח נשלח ✓');
    refreshMyEntries();
  }catch(e){
    console.error('submitFlag:',e);
    showToast(t('error.generic')||'שגיאה');
    if(btn){btn.disabled=false;btn.innerHTML=t('entry.flagSend')||'שלח דיווח';}
  }
}

// ── WORK ORDERS (worker side) ──────────────────────────────────
// Status lifecycle: draft (not sent) → pending (sent, leader hasn't
// started) → in_progress (leader started) → pending_review (leader
// finished, waiting for manager approval) → closed (manager approved).
// Any status value that isn't one of the 5 known states (e.g. leftover
// legacy 'active' from before this lifecycle existed) is treated as
// draft consistently everywhere — label, badge color, and counts.
function normalizeWoStatus(s){
  return ['pending','in_progress','pending_review','closed'].includes(s) ? s : 'draft';
}
window.normalizeWoStatus = normalizeWoStatus;

function woStatusLabel(s){
  s = normalizeWoStatus(s);
  return s==='pending' ? t('mgr.wo.filterPending')
    : s==='in_progress' ? t('mgr.wo.filterInProgress')
    : s==='pending_review' ? t('mgr.wo.filterPendingReview')
    : s==='closed' ? t('mgr.wo.filterClosed')
    : t('mgr.wo.filterDraft');
}
window.woStatusLabel = woStatusLabel;

// A worker sees a work order once they're either the leader, or a crew
// member the leader has actually picked (never just from the manager's
// quota number alone). Only the leader can close the task or manage crew.

// If a leader force-finishes a task, other workers' active entries get
// ended directly in Firestore — but a worker's own client has no way to
// know that happened in real time, since there's no push mechanism
// anywhere in this app. This re-checks the specific entry the client
// currently believes is active, correcting local state (and the home
// screen's timer banner) if it's actually already been ended by someone
// else. Cheap — a single document read, only when something is tracked
// as active locally in the first place.
async function _verifyActiveEntryStillActive(){
  if (!activeEntryId) return;
  try {
    const doc = await db.collection('timeEntries').doc(activeEntryId).get();
    if (!doc.exists || doc.data().status !== 'active') {
      activeEntryId = null;
      activeEntryWorkOrderId = null;
      clearTimer();
      localStorage.removeItem('rh_active');
    }
  } catch(e) { console.warn('_verifyActiveEntryStillActive:', e); }
}
window._verifyActiveEntryStillActive = _verifyActiveEntryStillActive;

async function showMyWorkOrders(){
  showModal('modal-my-work-orders');
  await _verifyActiveEntryStillActive();
  const container = document.getElementById('my-work-orders-content');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try{
    const [leaderSnap, crewSnap] = await Promise.all([
      db.collection('workOrders').where('leaderId','==',currentUser.uid).get({source:'server'}),
      db.collection('workOrders').where('selectedWorkerIds','array-contains',currentUser.uid).get({source:'server'}),
    ]);
    const byId = {};
    leaderSnap.docs.forEach(d => byId[d.id] = {id:d.id, ...d.data(), _isLeader:true});
    crewSnap.docs.forEach(d => { if(!byId[d.id]) byId[d.id] = {id:d.id, ...d.data(), _isLeader:false}; });
    const orders = Object.values(byId).filter(o => ['pending','in_progress','pending_review','closed'].includes(o.status));
    orders.sort((a,b) => {
      const aOpen = a.status !== 'closed', bOpen = b.status !== 'closed';
      if (aOpen !== bOpen) return aOpen ? -1 : 1; // open tasks always before closed ones
      if (aOpen) {
        // Open tasks: soonest execution date first, then sequence order
        const dateCmp=(a.executionDate||'').localeCompare(b.executionDate||'');
        if(dateCmp!==0) return dateCmp;
        return (a.sequenceNumber||0)-(b.sequenceNumber||0);
      }
      // Closed tasks: most recently executed first
      return (b.executionDate||'').localeCompare(a.executionDate||'');
    });

    if(!orders.length){
      container.innerHTML = `<div class="empty-state" style="padding:24px 0">${t('worker.noTasksAssigned')}</div>`;
      return;
    }

    // Whether "start" shows for a given task must depend on whether THIS
    // worker personally has an entry linked to it — not on the task's
    // overall status. Otherwise, once any one crew member starts (moving
    // the task to "in_progress"), every other assigned worker — including
    // the leader — loses the ability to start their own work on it.
    const openIds = orders.filter(o => o.status!=='closed').map(o => o.id);
    const myLinkedTaskIds = new Set();
    if (openIds.length) {
      const chunks = [];
      for (let i=0;i<openIds.length;i+=30) chunks.push(openIds.slice(i,i+30));
      const entrySnaps = await Promise.all(chunks.map(chunk =>
        db.collection('timeEntries').where('workOrderId','in',chunk).get()
      ));
      entrySnaps.forEach(snap => snap.docs.forEach(d => {
        const data = d.data();
        if (data.workerId === currentUser.uid && data.workOrderId) myLinkedTaskIds.add(data.workOrderId);
      }));
    }

    // Self-healing: the pending -> in_progress transition normally fires
    // automatically the moment any assigned worker's first entry is
    // created, but that update is fire-and-forget with no retry — if it
    // silently failed at that moment, the task would otherwise stay stuck
    // at "pending" forever despite work clearly already being underway.
    // Since this worker already has an entry linked to it, that's proof
    // enough to correct it here rather than leave it stuck.
    for (const o of orders) {
      if (o.status === 'pending' && myLinkedTaskIds.has(o.id)) {
        o.status = 'in_progress'; // correct locally first, for immediate correct rendering below
        db.collection('workOrders').doc(o.id).update({ status: 'in_progress' })
          .catch(e => console.warn('self-heal pending->in_progress failed:', o.id, e));
      }
    }

    container.innerHTML = orders.map(o => {
      const taskLabel = o.task?.activityName || o.task?.freeText || '—';
      const plotLabel = (o.plots||[]).map(p=>p.plotName||p.freeText).filter(Boolean).join(', ') || '—';
      const crewCount = (o.selectedWorkerIds||[]).length;
      const roleLabel = o.isBroadcast ? t('worker.groupTask') : (o._isLeader ? `${t('worker.teamLeader')}${o.additionalWorkersQuota?t('worker.teamLabel').replace('{count}',crewCount).replace('{quota}',o.additionalWorkersQuota):''}` : t('worker.teamMember'));
      const showCrewBtn = o._isLeader && (o.status==='pending'||o.status==='in_progress') && (o.additionalWorkersQuota||0) > 0;
      const canStart = !myLinkedTaskIds.has(o.id) && (o.status==='pending' || o.status==='in_progress') && (o.isBroadcast || o._isLeader);
      const canFinishMyWork = activeEntryWorkOrderId === o.id && !o._isLeader;
      const canFinish = o._isLeader && o.status==='in_progress';
      const buttons = [];
      if (canStart) buttons.push(`<button class="btn-primary" style="flex:1" onclick="startEntryForTask('${o.id}')">${t('worker.startTaskEntry')}</button>`);
      if (canFinishMyWork) buttons.push(`<button class="btn-ghost" style="flex:1" onclick="endEntry()">${t('worker.finishMyWork')}</button>`);
      if (canFinish) buttons.push(`<button class="btn-primary" style="flex:1" onclick="finishWorkOrderTask('${o.id}')">${t('worker.finishTask')}</button>`);
      if (o.status==='pending_review') buttons.push(`<div style="flex:1;text-align:center;font-size:12px;color:var(--text-muted);padding:8px">${t('worker.waitingApproval')}</div>`);
      const actionBtn = buttons.join('');
      return `<div class="wo-row">
        <div class="wo-row-top">
          <span class="wo-seq">#${o.sequenceNumber ?? '—'}</span>
          <span class="wo-date">${o.executionDate?fmtStoredDate(o.executionDate):''}</span>
          <span class="wo-status-badge wo-status-${normalizeWoStatus(o.status)}">${woStatusLabel(o.status)}</span>
        </div>
        <div class="wo-row-task">${taskLabel}</div>
        <div class="wo-row-sub">${plotLabel}</div>
        <div class="wo-row-sub">${roleLabel}</div>
        ${o.freeText?`<div class="wo-row-sub" style="margin-top:4px">${o.freeText}</div>`:''}
        ${(showCrewBtn||actionBtn)?`
          <div style="display:flex;gap:8px;margin-top:10px">
            ${showCrewBtn?`<button class="btn-ghost" style="flex:1" onclick="showCrewPicker('${o.id}')">${t('worker.selectWorkersBtn')}</button>`:''}
            ${actionBtn}
          </div>`:''}
      </div>`;
    }).join('');
  }catch(e){
    container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  }
}
window.showMyWorkOrders = showMyWorkOrders;

// Ends one specific entry by ID — used when the leader force-finishes a
// task and needs to auto-end other workers' (or their own) still-active
// entries linked to it, not just their own via the normal end-entry flow.
// Triggers the same settlement path as a normal end, and if this happens
// to be the *current* user's own active entry, also clears their local
// active-entry state so the UI reflects it immediately rather than
// waiting for a reload.
async function _forceEndEntry(entryDoc){
  const data = entryDoc.data();
  await db.collection('timeEntries').doc(entryDoc.id).update({
    endTime: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'complete',
  });
  if (data.workerId && data.date) {
    resettleDay(data.workerId, data.date).catch(e => console.warn('resettleDay after force-end:', e));
  }
  if (data.workerId === currentUser.uid && activeEntryId === entryDoc.id) {
    activeEntryId = null;
    activeEntryWorkOrderId = null;
    clearTimer();
    localStorage.removeItem('rh_active');
  }
}

async function finishWorkOrderTask(id){
  if(!await customConfirm(t('worker.confirmFinish'))) return;
  try{
    // Auto-end every still-active entry linked to this task — this is what
    // lets the leader finish regardless of whether anyone else (or they
    // themselves) is still actively working; nobody else needs to
    // separately end their own work first.
    const linkedSnap = await db.collection('timeEntries').where('workOrderId','==',id).get();
    const activeDocs = linkedSnap.docs.filter(d => d.data().status === 'active');
    for (const d of activeDocs) {
      await _forceEndEntry(d);
    }
    await db.collection('workOrders').doc(id).update({
      status: 'pending_review',
      finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      finishedBy: currentUser.uid,
    });
    showToast('המשימה נשלחה לבדיקת המנהל ✓');
    showMyWorkOrders();
  }catch(e){ showToast('שגיאה: ' + e.message); }
}
window.finishWorkOrderTask = finishWorkOrderTask;

async function showCrewPicker(workOrderId){
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-crew-picker');
  const container = document.getElementById('crew-picker-content');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try{
    const [doc, usersSnap] = await Promise.all([
      db.collection('workOrders').doc(workOrderId).get({source:'server'}),
      db.collection('users').where('role','==','worker').get(),
    ]);
    if(!doc.exists){ container.innerHTML = `<div class="empty-state">${t('mgr.wo.notFound')}</div>`; return; }
    const o = doc.data();
    const quota = o.additionalWorkersQuota || 0;
    const selected = o.selectedWorkerIds || [];
    const allWorkers = usersSnap.docs
      .map(d => ({uid:d.id, ...d.data()}))
      .filter(w => w.uid !== o.leaderId)
      .sort((a,b) => (a.name||'').localeCompare(b.name||'','he'));

    container.innerHTML = `
      <div style="padding:12px 20px;font-size:13px;color:var(--text-muted)" id="crew-quota-label">נבחרו ${selected.length} מתוך ${quota} מותרים</div>
      <input class="mgr-edit-input" style="margin:0 20px 10px;width:calc(100% - 40px)" placeholder="${t('mgr.wo.search')}" oninput="filterEditInlineRows('crew-picker-list', this.value)">
      <div class="edit-inline-list" id="crew-picker-list" style="margin:0 20px">
        ${allWorkers.map(w => `
          <label class="edit-inline-row" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" class="crew-cb" value="${w.uid}" data-name="${encodeURIComponent(w.name||'')}" ${selected.includes(w.uid)?'checked':''} onchange="_onCrewCbChange('${workOrderId}',${quota})">
            ${w.name||w.phone}
          </label>`).join('')}
      </div>
      <div style="padding:16px 20px 32px">
        <button class="btn-primary full-w" onclick="saveCrewSelection('${workOrderId}')">✓ שמור צוות</button>
      </div>
    `;
  }catch(e){
    container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  }
}
window.showCrewPicker = showCrewPicker;

// Enforces the hard quota limit live — once reached, remaining unchecked
// boxes are disabled so the leader can't select past what the manager set.
function _onCrewCbChange(workOrderId, quota){
  const boxes = [...document.querySelectorAll('.crew-cb')];
  const checked = boxes.filter(b=>b.checked);
  const label = document.getElementById('crew-quota-label');
  if(label) label.textContent = t('worker.crewSelectedCount').replace('{selected}',checked.length).replace('{quota}',quota);
  boxes.forEach(b => { if(!b.checked) b.disabled = checked.length >= quota; });
}
window._onCrewCbChange = _onCrewCbChange;

async function saveCrewSelection(workOrderId){
  const checked = [...document.querySelectorAll('.crew-cb:checked')];
  const ids = checked.map(c=>c.value);
  const names = checked.map(c=>decodeURIComponent(c.dataset.name));
  try{
    const woDoc = await db.collection('workOrders').doc(workOrderId).get();
    const wo = woDoc.exists ? woDoc.data() : {};
    const previousIds = wo.selectedWorkerIds || [];
    const newlyAdded = ids.filter(id => !previousIds.includes(id));

    await db.collection('workOrders').doc(workOrderId).update({
      selectedWorkerIds: ids,
      selectedWorkerNames: names,
    });

    // Task already started — mirror the leader's original entry for
    // anyone just added, so they aren't excluded just for joining late.
    if (newlyAdded.length && !wo.isBroadcast && wo.status === 'in_progress') {
      try {
        const linkedSnap = await db.collection('timeEntries').where('workOrderId','==',workOrderId).get();
        const leaderEntry = linkedSnap.docs.map(d=>d.data()).find(e => e.workerId === wo.leaderId && e.status === 'active');
        if (leaderEntry && leaderEntry.startTime) {
          const resolvedPlots = (wo.plots||[]).map(p => p.plotId ? PLOTS.find(pl => pl.id === p.plotId) : null).filter(Boolean);
          const plot = resolvedPlots[0] || null;
          const additionalPlots = resolvedPlots.slice(1);
          const act = (wo.task?.activityId ? findActivity(wo.task.activityId) : null) || findActivity('other');
          for (const workerId of newlyAdded) {
            const userDoc = await db.collection('users').doc(workerId).get();
            const u = userDoc.exists ? userDoc.data() : {};
            const check = await _checkStaleEntryBeforeStart(workerId, u.name||'—');
            if (check.blocked) {
              showToast(t('worker.blockedByActiveEntry').replace('{name}', check.workerName));
              continue; // crew list still includes them; just no mirrored entry yet
            }
            await _createTimeEntry({
              plot, act, freeText: wo.task?.freeText||'', workOrderId,
              additionalPlotIds: additionalPlots.map(p=>p.id),
              additionalPlotNames: additionalPlots.map(p=>p.name),
              additionalPlotDunams: additionalPlots.map(p=>p.dunams||0),
              forWorkerId: workerId, forWorkerName: u.name||'—', forWorkerPhone: u.phone||'—',
              sharedStartTime: leaderEntry.startTime,
              taskNote: wo.freeText || null,
            });
          }
        }
      } catch(e) { console.warn('mirroring for newly-added crew failed:', e); }
    }

    showToast('הצוות נשמר ✓');
    closeModal('modal-crew-picker');
    showMyWorkOrders();
  }catch(e){ showToast('שגיאה: ' + e.message); }
}
window.saveCrewSelection = saveCrewSelection;

// ── MESSAGES ──────────────────────────────────────────────────
function showMessages(){
  showModal('modal-messages');
  // Set placeholder text
  const inp=document.getElementById('msg-input');
  if(inp)inp.placeholder=t('msg.placeholder')||'כתוב הודעה למנהל...';
  loadMessages();
}

function loadMessages(){
  const container=document.getElementById('messages-list');
  if(!container||!currentUser)return;
  container.innerHTML=`<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  db.collection('messages')
    .where('workerId','==',currentUser.uid)
    .orderBy('timestamp','asc')
    .limit(50)
    .get()
    .then(snap=>{
      if(snap.empty){
        container.innerHTML=`<div class="msg-empty">${t('msg.empty')||'אין הודעות עדיין'}</div>`;
        return;
      }
      container.innerHTML=snap.docs.map(doc=>{
        const m=doc.data();
        const ts=m.timestamp?new Date(m.timestamp.toMillis()):null;
        const timeStr=ts?fmtDateDDMM(ts)+' '+ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}):'';
        // Show message in worker's language; translated if available
        const text=m.translated?.[currentLang]||m.originalText||'';
        const replyText=m.managerReply||'';
        return`<div class="msg-bubble-wrap">
          <div class="msg-bubble">${text}</div>
          <div class="msg-time">${timeStr}</div>
          ${replyText?`<div class="msg-bubble reply"><b style="font-size:11px;opacity:0.7">${t('msg.managerReply')||'תגובת המנהל'}:</b> ${replyText}</div>`:''}
        </div>`;
      }).join('');
      // Scroll to bottom (newest messages)
      setTimeout(()=>{ container.scrollTop = container.scrollHeight; }, 50);
    })
    .catch(err=>{console.error(err);container.innerHTML=`<div class="msg-empty">${t('error.generic')||'שגיאה'}</div>`;});
}

async function sendMessage(){
  const inp=document.getElementById('msg-input');
  const text=inp?.value.trim()||'';
  if(!text||!currentUser)return;
  inp.value='';
  inp.disabled=true;
  try{
    const translated=await translateText(text,currentLang);
    await db.collection('messages').add({
      workerId:currentUser.uid,
      workerName:document.getElementById('menu-name').textContent||'—',
      originalText:text,
      originalLang:currentLang,
      translated,
      managerReply:null,
      timestamp:firebase.firestore.FieldValue.serverTimestamp(),
      read:false,
    });
    showToast(t('msg.sent')||'הודעה נשלחה ✓');
    loadMessages();
  }catch(e){
    console.error('sendMessage:',e);
    showToast(t('error.generic')||'שגיאה');
  }finally{
    if(inp)inp.disabled=false;
  }
}

// ── MY SUMMARY ────────────────────────────────────────────────
function showSummary(){showModal('modal-summary');loadSummary();}

async function loadSummary(){
  const container=document.getElementById('summary-content');
  if(!container)return;
  container.innerHTML=`<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try{
    const weekStart=new Date(); weekStart.setDate(weekStart.getDate()-6); weekStart.setHours(0,0,0,0);
    const weekStartMs=weekStart.getTime();
    // Use workerId + timestamp index (existing)
    const snap=await db.collection('timeEntries')
      .where('workerId','==',currentUser.uid)
      .orderBy('timestamp','desc')
      .limit(200)
      .get();
    let todayMins=0,weekMins=0;
    snap.docs.forEach(doc=>{
      const e=doc.data();
      if(!e.startTime||!e.endTime)return;
      if(e.timestamp&&e.timestamp.toMillis()<weekStartMs)return;
      const mins=(e.endTime.toMillis()-e.startTime.toMillis())/60000;
      weekMins+=mins;
      if(e.date===todayStr())todayMins+=mins;
    });
    container.innerHTML=`
      <div class="summary-box" style="margin-bottom:12px">
        <div class="summary-row big"><span>${t('summary.today')||'היום'}</span><span>${durationStr(todayMins*60000)}</span></div>
      </div>
      <div class="summary-box">
        <div class="summary-row big"><span>${t('summary.week')||'שבוע זה'}</span><span>${durationStr(weekMins*60000)}</span></div>
      </div>`;
  }catch(e){
    console.error('loadSummary:',e);
    container.innerHTML=`<div class="empty-state">${t('error.generic')||'שגיאה'} — ${e.message}</div>`;
  }
}

// ── AUTO-FLAG (passive, farm-configurable threshold) ───────────
async function checkAutoFlag(){
  if(!currentUser)return;
  const settings = await getFarmSettings();
  const staleHours = settings.staleEntryHours ?? 13;
  const cutoff=new Date(Date.now()-staleHours*60*60*1000);
  try{
    const snap=await db.collection('timeEntries')
      .where('workerId','==',currentUser.uid)
      .where('status','==','active')
      .get();
    const stale=snap.docs.filter(doc=>{
      const e=doc.data();
      return e.startTime&&e.startTime.toMillis()<cutoff.getTime();
    });
    if(!stale.length)return;
    const batch=db.batch();
    stale.forEach(doc=>{
      batch.update(doc.ref,{
        status:'flagged',
        flagNote:`auto-flagged: entry exceeded ${staleHours} hours without end`,
        flagNoteLang:'en',
      });
    });
    await batch.commit();
    // Clear active entry if it was auto-flagged
    if(activeEntryId&&stale.find(d=>d.id===activeEntryId)){
      activeEntryId=null;
      activeEntryWorkOrderId=null;
      clearTimer();
    }
    showToast(t('autoflag.notice')||'רישום ישן סומן אוטומטית — צור קשר עם המנהל',4000);
  }catch(e){console.warn('checkAutoFlag:',e);}
}

// ── HELPERS ───────────────────────────────────────────────────
function todayStr(){return new Date().toISOString().slice(0,10);}
function durationStr(ms){
  const m=Math.floor(ms/60000),h=Math.floor(m/60);
  return h>0?`${h}:${String(m%60).padStart(2,'0')} ${t('unit.h')||"ש'"}`:`${m} ${t('unit.min')||"דק'"}`;
}
function updateEndWorkdayBtn(){
  // "סיום יום עבודה" has been replaced by automatic settlement — this
  // button stays permanently hidden. Kept as a no-op (rather than removing
  // the function) so existing calls elsewhere don't need to be touched.
  const wrap=document.getElementById('end-workday-wrap');
  if(wrap) wrap.hidden=true;
}

// ── MODALS ────────────────────────────────────────────────────
// All dates in the app render as dd-mm-yyyy regardless of language —
// deliberately not using toLocaleDateString, which varies by locale.
function fmtDateDDMMYYYY(date){
  if(!date) return '';
  const d=String(date.getDate()).padStart(2,'0');
  const m=String(date.getMonth()+1).padStart(2,'0');
  return `${d}-${m}-${date.getFullYear()}`;
}
// For dates already stored as 'YYYY-MM-DD' strings (not JS Date objects) —
// converts to the same dd-mm-yyyy display format without a timezone round-trip.
function fmtStoredDate(dateStr){
  if(!dateStr) return '';
  const parts = dateStr.split('-');
  if(parts.length!==3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}
window.fmtStoredDate = fmtStoredDate;

// Wraps a native <input type="date"> so it always DISPLAYS as dd-mm-yyyy,
// regardless of language or browser/OS locale, while keeping the native
// picker (calendar popup, mobile date wheel, keyboard entry) fully
// functional — the native input itself is invisible and stacked exactly
// over the visible formatted label, so any interaction with it opens the
// real native picker. The underlying <input>'s .value stays YYYY-MM-DD
// as required by the HTML spec, so existing code reading .value is
// unaffected — only how it LOOKS to the user changes.
// Reusable dd-mm-yyyy date field: a real, typeable text input showing/
// accepting dd-mm-yyyy (with auto-inserted dashes as digits are typed),
// plus a calendar button that explicitly opens a hidden native date
// input's picker via .showPicker(). We deliberately avoid the classic
// "invisible native input overlay" trick — opacity:0 date inputs are
// unreliable at triggering the native picker on tap in Android Chrome/
// WebView, which is what this app runs in. The hidden native input keeps
// the original element id (so all existing code reading .value in
// YYYY-MM-DD is untouched); the visible text input is a separate id.
function ddDateField(id, value, onChangeTemplate){
  const display = value ? fmtStoredDate(value) : '';
  const cbAttr = onChangeTemplate ? ` data-onchange-tpl="${onChangeTemplate.replace(/"/g,'&quot;')}"` : '';
  return `<div class="dd-date-wrap"${cbAttr}>
    <input type="text" id="${id}-text" class="dd-date-text" value="${display}" placeholder="dd-mm-yyyy"
           inputmode="numeric" maxlength="10"
           oninput="_ddTextTyped('${id}')" onblur="_ddTextBlur('${id}')" onkeydown="_ddArrowKey(event,'${id}')">
    <button type="button" class="dd-date-icon-btn" onclick="_ddOpenPicker('${id}')">📅</button>
    <input type="date" id="${id}" value="${value||''}" class="dd-date-hidden" onchange="_ddNativeChanged('${id}')">
  </div>`;
}
function _ddFireCallback(id, iso){
  const hidden = document.getElementById(id);
  const wrap = hidden?.closest('.dd-date-wrap');
  const tpl = wrap?.getAttribute('data-onchange-tpl');
  if (tpl) { try { new Function('iso', tpl.replace(/\{iso\}/g, "'"+iso+"'")).call(hidden); } catch(e){ console.warn('ddDate callback error:', e); } }
}
// Auto-inserts dashes as the user types digits: 20 -> 20-, 2007 -> 20-07-, etc.
function _ddTextTyped(id){
  const txt = document.getElementById(id+'-text');
  if (!txt) return;
  let digits = txt.value.replace(/\D/g,'').slice(0,8);
  let out = digits;
  if (digits.length > 4) out = digits.slice(0,2)+'-'+digits.slice(2,4)+'-'+digits.slice(4);
  else if (digits.length > 2) out = digits.slice(0,2)+'-'+digits.slice(2);
  txt.value = out;
}
// On blur, if a full valid dd-mm-yyyy was typed, sync it to the hidden
// native input (which holds the real YYYY-MM-DD value everything else reads).
// Arrow-key increment/decrement on the visible text field — native date
// inputs support this natively (adjusting whichever segment the cursor is
// on), but this custom text-field replacement doesn't get that for free,
// since it's a plain text input underneath. Replicated here by detecting
// cursor position within "dd-mm-yyyy" and using real Date arithmetic so
// month/year rollovers (e.g. day 31 -> 1, wrapping to next month) work
// correctly rather than just incrementing a raw number.
function _ddArrowKey(e, id){
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const txt = document.getElementById(id+'-text');
  if (!txt) return;
  const m = txt.value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return; // only works once a complete, valid date is present
  e.preventDefault();
  const delta = e.key === 'ArrowUp' ? 1 : -1;
  const pos = txt.selectionStart ?? 0;
  let day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  const d = new Date(year, month-1, day);
  if (pos <= 2) d.setDate(d.getDate() + delta);
  else if (pos <= 5) d.setMonth(d.getMonth() + delta);
  else d.setFullYear(d.getFullYear() + delta);

  const newDay = String(d.getDate()).padStart(2,'0');
  const newMonth = String(d.getMonth()+1).padStart(2,'0');
  const newYear = d.getFullYear();
  txt.value = `${newDay}-${newMonth}-${newYear}`;
  txt.setSelectionRange(pos<=2?0:(pos<=5?3:6), pos<=2?2:(pos<=5?5:10));

  const hidden = document.getElementById(id);
  if (hidden) {
    const iso = `${newYear}-${newMonth}-${newDay}`;
    hidden.value = iso;
    _ddFireCallback(id, iso);
  }
}
window._ddArrowKey = _ddArrowKey;

function _ddTextBlur(id){
  const txt = document.getElementById(id+'-text');
  const hidden = document.getElementById(id);
  if (!txt || !hidden) return;
  const m = txt.value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    hidden.value = iso;
    _ddFireCallback(id, iso);
  } else if (!txt.value) {
    hidden.value = '';
    _ddFireCallback(id, '');
  } else {
    // Invalid/incomplete — revert to last known good value
    txt.value = hidden.value ? fmtStoredDate(hidden.value) : '';
  }
}
// Calendar button — explicitly opens the native picker on the hidden
// input (a real user-initiated click on a real, momentarily-focused
// native input, unlike a permanently invisible overlay).
function _ddOpenPicker(id){
  const hidden = document.getElementById(id);
  if (!hidden) return;
  if (typeof hidden.showPicker === 'function') {
    try { hidden.showPicker(); return; } catch(e) {}
  }
  hidden.focus();
  hidden.click();
}
// When a date is picked via the native picker, sync it back to the text field.
function _ddNativeChanged(id){
  const hidden = document.getElementById(id);
  const txt = document.getElementById(id+'-text');
  if (hidden && txt) txt.value = hidden.value ? fmtStoredDate(hidden.value) : '';
  _ddFireCallback(id, hidden?.value || '');
}
window.ddDateField = ddDateField;
window._ddTextTyped = _ddTextTyped;
window._ddTextBlur = _ddTextBlur;
window._ddOpenPicker = _ddOpenPicker;
window._ddNativeChanged = _ddNativeChanged;

// Parallel component for time fields, forcing 24-hour display regardless of
// device locale — a native <input type="time"> always stores its value as
// 24-hour "HH:MM" internally, but renders it (AM/PM or 24-hour) according
// to the browser's own locale, which this app cannot control directly.
// Same fix pattern as ddDateField: a typeable text field showing the
// value we want, backed by a hidden native input used only for its picker.
function ddTimeField(id, value, onChangeTemplate){
  const cbAttr = onChangeTemplate ? ` data-onchange-tpl="${onChangeTemplate.replace(/"/g,'&quot;')}"` : '';
  return `<div class="dd-date-wrap"${cbAttr}>
    <input type="text" id="${id}-text" class="dd-date-text" value="${value||''}" placeholder="hh:mm"
           inputmode="numeric" maxlength="5"
           oninput="_ddTimeTyped('${id}')" onblur="_ddTimeBlur('${id}')">
    <button type="button" class="dd-date-icon-btn" onclick="_ddOpenPicker('${id}')">🕒</button>
    <input type="time" id="${id}" value="${value||''}" class="dd-date-hidden" onchange="_ddTimeNativeChanged('${id}')">
  </div>`;
}
// Auto-inserts a colon as digits are typed: 17 -> 17:, 1730 -> 17:30
function _ddTimeTyped(id){
  const txt = document.getElementById(id+'-text');
  if (!txt) return;
  let digits = txt.value.replace(/\D/g,'').slice(0,4);
  let out = digits;
  if (digits.length > 2) out = digits.slice(0,2)+':'+digits.slice(2);
  txt.value = out;
}
function _ddTimeBlur(id){
  const txt = document.getElementById(id+'-text');
  const hidden = document.getElementById(id);
  if (!txt || !hidden) return;
  const m = txt.value.match(/^(\d{2}):(\d{2})$/);
  if (m && Number(m[1])<=23 && Number(m[2])<=59) {
    hidden.value = txt.value;
    _ddFireCallback(id, txt.value);
  } else if (!txt.value) {
    hidden.value = '';
    _ddFireCallback(id, '');
  } else {
    // Invalid/incomplete — revert to last known good value
    txt.value = hidden.value || '';
  }
}
// When a time is picked via the native picker, sync it back to the text field.
function _ddTimeNativeChanged(id){
  const hidden = document.getElementById(id);
  const txt = document.getElementById(id+'-text');
  if (hidden && txt) txt.value = hidden.value || '';
  _ddFireCallback(id, hidden?.value || '');
}
window.ddTimeField = ddTimeField;
window._ddTimeTyped = _ddTimeTyped;
window._ddTimeBlur = _ddTimeBlur;
window._ddTimeNativeChanged = _ddTimeNativeChanged;
function fmtDateDDMM(date){
  if(!date) return '';
  const d=String(date.getDate()).padStart(2,'0');
  const m=String(date.getMonth()+1).padStart(2,'0');
  return `${d}-${m}`;
}
window.fmtDateDDMMYYYY = fmtDateDDMMYYYY;
window.fmtDateDDMM = fmtDateDDMM;

function showModal(id){
  document.getElementById(id)?.classList.add('open');
  document.getElementById('modal-overlay')?.classList.add('open');
}
function closeModal(id){
  document.getElementById(id)?.classList.remove('open');
  if(!document.querySelector('.modal.open'))
    document.getElementById('modal-overlay')?.classList.remove('open');
}

// ESC closes whatever is currently open — the confirm dialog (as a
// Cancel, so any caller awaiting its promise still gets resolved) takes
// priority over a regular modal underneath it, since it's the one
// actually on top when both happen to be open.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const confirmModal = document.getElementById('modal-custom-confirm');
  if (confirmModal?.classList.contains('open')) {
    _customConfirmResolve(false);
    return;
  }
  const openModal = document.querySelector('.modal.open');
  if (openModal) closeModal(openModal.id);
});
function setModalContent(html){
  const el=document.querySelector('.modal.open .modal-body');
  if(el)el.innerHTML=html;
}

// Promise-based replacement for the native browser confirm() dialog, which
// cannot be styled (shows the site URL, fixed font size, etc). Usage:
//   if (!await customConfirm('Delete this?')) return;
let _customConfirmResolver = null;
function customConfirm(message){
  document.getElementById('custom-confirm-message').textContent = message;
  showModal('modal-custom-confirm');
  return new Promise(resolve => { _customConfirmResolver = resolve; });
}
function _customConfirmResolve(result){
  closeModal('modal-custom-confirm');
  if (_customConfirmResolver) { _customConfirmResolver(result); _customConfirmResolver = null; }
}
window.customConfirm = customConfirm;
window._customConfirmResolve = _customConfirmResolve;

// ── OVERRIDE STUBS ────────────────────────────────────────────
window.startEntry=startEntry;
window.endEntry=endEntry;
window.endWorkday=endWorkday;
window.showMyEntries=showMyEntries;
window.showSummary=showSummary;
window.showMessages=showMessages;
window.sendMessage=sendMessage;

const _origInitWorker=window.initWorker;
window.initWorker=function(){
  if(_origInitWorker)_origInitWorker();
  updateEndWorkdayBtn();
  checkAutoFlag();
};

console.log('app.js Build 15 telem loaded ✓');
