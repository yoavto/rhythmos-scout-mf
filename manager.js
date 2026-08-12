// ── RHYTHMOS HOURS — manager.js — Build 4 ────────────────────

const MGR_ACTIVITIES = [
  {id:'winter-pruning',          nameI18n:{he:'גיזום חורפי',         en:'Winter pruning'}},
  {id:'cane-tying',              nameI18n:{he:'קשירת זמורות',         en:'Cane tying'}},
  {id:'suckering',               nameI18n:{he:'ניקוי גזע',            en:'Desuckering'}},
  {id:'shoot-thinning',          nameI18n:{he:'דילול שריגים / ירוק',  en:'Shoot thinning'}},
  {id:'cluster-thinning',        nameI18n:{he:'דילול אשכולות',        en:'Cluster thinning'}},
  {id:'shoot-tucking',           nameI18n:{he:'שזירת שריגים',         en:'Shoot tucking'}},
  {id:'topping',                 nameI18n:{he:'קיטום אמירים',         en:'Topping'}},
  {id:'berry-thinning',          nameI18n:{he:'דילול גרגרים',         en:'Berry thinning'}},
  {id:'girdling',                nameI18n:{he:'חיגור',                en:'Girdling'}},
  {id:'leaf-removal',            nameI18n:{he:'חילון ידני',           en:'Leaf removal'}},
  {id:'manual-harvest',          nameI18n:{he:'בציר',                 en:'Harvest'}},
  {id:'net-covering',            nameI18n:{he:'כיסוי ביריעות / רשתות',en:'Net/sheet covering'}},
  {id:'net-removal',             nameI18n:{he:'הסרת יריעות / רשתות',  en:'Net/sheet removal'}},
  {id:'spraying',                nameI18n:{he:'ריסוס',                en:'Spraying'}},
  {id:'soil-cultivation',        nameI18n:{he:'תיחוח / עיבוד קרקע',  en:'Cultivation'}},
  {id:'mechanical-topping',      nameI18n:{he:'גיזום מכני',           en:'Mechanical topping'}},
  {id:'mechanical-leaf-removal', nameI18n:{he:'חילון מכני',           en:'Mechanical leaf removal'}},
  {id:'fruit-transport',         nameI18n:{he:'שינוע',                en:'Transport'}},
  {id:'sick-leave',              nameI18n:{he:'מחלה',                 en:'Sick leave'}},
  {id:'vacation',                nameI18n:{he:'חופשה',                en:'Vacation'}},
  {id:'packaging',               nameI18n:{he:'אריזה',                en:'Packaging'}},
  {id:'equipment-maintenance',   nameI18n:{he:'תחזוקת ציוד',          en:'Equipment maintenance'}},
  {id:'training',                nameI18n:{he:'הדרכה',                en:'Training'}},
  {id:'other',                   nameI18n:{he:'אחר',                  en:'Other'}},
];

// Unified lookup: checks live Firestore-backed activities first (via
// app.js's findActivity, which covers built-in, custom, imported, and
// migrated activities), falling back to the legacy MGR_ACTIVITIES list
// only for very old entries that predate the current activity IDs.
function mgrFindActivity(actId) {
  if (typeof findActivity === 'function') {
    const a = findActivity(actId);
    if (a) return a;
  }
  return MGR_ACTIVITIES.find(a => a.id === actId) || null;
}

// ── STATE ─────────────────────────────────────────────────────
let mgrWorkers = [];           // {uid, name, phone}
let mgrAllEntries = [];        // currently loaded entries
let mgrCurrentFilter = 'today';
let mgrCurrentEntryId = null;

// ── INIT ──────────────────────────────────────────────────────
async function initManager() {
  setMgrDateLabel();
  // Managers need the same live plot/activity data workers get, since
  // entry names, the edit wizard, and every screen that resolves an
  // activity or plot by ID all depend on it. Loaded before anything
  // renders, so the very first paint is correct.
  await Promise.all([
    typeof loadPlots === 'function' ? loadPlots() : Promise.resolve(),
    typeof loadCropData === 'function' ? loadCropData() : Promise.resolve(),
  ]);
  loadWorkers().then(() => {
    refreshDashboard();
  });
}

function setMgrDateLabel() {
  const el = document.getElementById('mgr-date-label');
  const now = new Date();
  const dayName = t('mgr.farm.day'+now.getDay());
  const name = document.getElementById('menu-name')?.textContent || '';
  if (el) el.textContent = `${name ? name+' · ' : ''}${dayName}, ${fmtDateDDMMYYYY(now)}`;
}

// ── WORKERS ───────────────────────────────────────────────────
async function loadWorkers() {
  try {
    const snap = await db.collection('users').where('role','==','worker').get();
    mgrWorkers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    // Populate worker filter dropdown
    const sel = document.getElementById('mgr-worker-filter');
    if (sel) {
      sel.innerHTML = '<option value="">כל העובדים</option>' +
        mgrWorkers.map(w => `<option value="${w.uid}">${w.name||w.phone}</option>`).join('');
    }
  } catch(e) { console.warn('loadWorkers:', e); }
}

function workerName(uid) {
  const w = mgrWorkers.find(w => w.uid === uid);
  return w ? (w.name || w.phone) : uid;
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function refreshDashboard() {
  try {
    // Today's time entries
    const todaySnap = await db.collection('timeEntries')
      .where('date','==',mgrTodayStr()).get();
    setCount('mgr-count-today', todaySnap.size);

    // Flagged entries
    const flaggedSnap = await db.collection('timeEntries')
      .where('status','==','flagged').get();
    setCount('mgr-count-flagged', flaggedSnap.size);

    // Entries this week (matches the new "רשומות" status card's default period)
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-6);
    const weekAgoStr = weekAgo.toISOString().slice(0,10);
    const weekSnap = await db.collection('timeEntries')
      .where('date','>=',weekAgoStr).where('date','<=',mgrTodayStr()).get();
    setCount('mgr-count-entries', weekSnap.size);

    // Unread messages
    const msgSnap = await db.collection('messages')
      .where('read','==',false).get();
    setCount('mgr-count-messages', msgSnap.size);
  } catch(e) { console.warn('refreshDashboard:', e); }
}

function setCount(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── ENTRIES LIST ──────────────────────────────────────────────
// Scans a set of already-fetched entries for any that are ended but not
// yet settled, and if found, injects a notice with a "force settle" button
// into the given container. onSettled is called after settling completes,
// so the caller can re-fetch/re-render with corrected data.
function mgrCheckUnsettledNotice(entries, containerId, onSettled) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const unsettled = entries.filter(e => e.endTime && !e.workdaySettled);
  if (!unsettled.length) { container.innerHTML = ''; return; }
  const pairs = new Set(unsettled.map(e => e.workerId+'|'+e.date));
  container.innerHTML = `<div class="mgr-unsettled-notice">
    <span>${t('mgr.unsettled.notice').replace('{count}', pairs.size)}</span>
    <button class="btn-primary" style="width:auto;padding:8px 14px;white-space:nowrap" id="mgr-settle-now-btn" onclick="mgrForceSettleNow('${containerId}')">${t('mgr.unsettled.settleNow')}</button>
  </div>`;
  container._mgrUnsettledPairs = [...pairs].map(p => { const [workerId,date] = p.split('|'); return {workerId,date}; });
  container._mgrOnSettled = onSettled;
}

async function mgrForceSettleNow(containerId) {
  const container = document.getElementById(containerId);
  const btn = document.getElementById('mgr-settle-now-btn');
  const pairs = container?._mgrUnsettledPairs || [];
  if (!pairs.length) return;
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-sm"></div>'; }
  try {
    for (const {workerId, date} of pairs) {
      await resettleDay(workerId, date);
    }
    showToast(t('mgr.unsettled.settled').replace('{count}', pairs.length));
    if (typeof container._mgrOnSettled === 'function') container._mgrOnSettled();
  } catch(e) {
    showToast(t('mgr.wo.error') + ': ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = t('mgr.unsettled.settleNow'); }
  }
}
window.mgrForceSettleNow = mgrForceSettleNow;

let _dsSelectedDate = null;

function mgrShowDaySummary() {
  showModal('modal-mgr-day-summary');
  _dsSelectedDate = mgrTodayStr();
  document.getElementById('day-summary-fixed-header').innerHTML = `
    <div class="entries-range-row" style="padding:12px 16px">
      <div style="flex:1"><div class="export-label">${t('mgr.daySummary.date')}</div>${ddDateField('ds-date', _dsSelectedDate, '')}</div>
      <button class="btn-primary" style="width:auto;padding:10px 16px;white-space:nowrap;align-self:flex-end" id="ds-generate-btn" onclick="mgrGenerateDaySummary()">${t('mgr.daySummary.generate')}</button>
    </div>`;
  document.getElementById('day-summary-content').innerHTML = '';
}
window.mgrShowDaySummary = mgrShowDaySummary;

async function mgrGenerateDaySummary() {
  const dateVal = document.getElementById('ds-date')?.value || mgrTodayStr();
  _dsSelectedDate = dateVal;
  const btn = document.getElementById('ds-generate-btn');
  const content = document.getElementById('day-summary-content');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-sm"></div>'; }
  content.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    // Four-step pipeline, in order: close out anything genuinely
    // abandoned, correct any task stuck at pending despite already having
    // real work logged against it, calculate everything that's ended but
    // not yet settled, then sweep any task still sitting in_progress to
    // pending_review.
    await sweepStaleEntriesFarmWide();
    await sweepStuckPendingTasks();
    await settleAllPendingForAllWorkers();
    await sweepInProgressTasks();

    const [entriesSnap, activeSnap, tasksSnap] = await Promise.all([
      db.collection('timeEntries').where('date','==',dateVal).get(),
      db.collection('timeEntries').where('status','==','active').get(),
      db.collection('workOrders').where('executionDate','==',dateVal).get(),
    ]);

    const entries = entriesSnap.docs.map(d=>({id:d.id,...d.data()}));
    const stillActiveByWorker = {}; // workerId -> the entry still genuinely open
    activeSnap.docs.forEach(d => { const e=d.data(); stillActiveByWorker[e.workerId] = {id:d.id, ...e}; });
    const pendingReviewTasks = tasksSnap.docs.map(d=>({id:d.id,...d.data()})).filter(o => o.status==='pending_review');

    mgrRenderDaySummary(entries, stillActiveByWorker, pendingReviewTasks);
  } catch(e) {
    content.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = t('mgr.daySummary.generate'); }
  }
}
window.mgrGenerateDaySummary = mgrGenerateDaySummary;

function mgrRenderDaySummary(entries, stillActiveByWorker, pendingReviewTasks) {
  const content = document.getElementById('day-summary-content');
  const to24 = (ts) => ts ? `${String(new Date(ts.toMillis()).getHours()).padStart(2,'0')}:${String(new Date(ts.toMillis()).getMinutes()).padStart(2,'0')}` : '—';

  const byWorker = {};
  entries.forEach(e => {
    const key = e.workerId || 'unknown';
    if (!byWorker[key]) byWorker[key] = { name: e.workerName||workerName(e.workerId)||key, entries: [] };
    byWorker[key].entries.push(e);
  });

  let html = `<div style="padding:10px 16px;text-align:left"><button class="btn-ghost" style="width:auto;padding:8px 14px" onclick="window.print()">🖨️ ${t('mgr.daySummary.print')}</button></div>`;

  if (!Object.keys(byWorker).length) {
    html += `<div class="empty-state" style="padding:24px 16px">${t('mgr.daySummary.noData')}</div>`;
  }

  for (const [workerId, w] of Object.entries(byWorker)) {
    const stillOpen = stillActiveByWorker[workerId];
    let totalMinutes = 0;
    const rows = w.entries.map(e => {
      const act = mgrFindActivity(e.activityId);
      const actName = act ? (act.nameI18n?.[currentLang]||act.nameI18n?.he||act.id) : (e.activityId||'—');
      const plotLabel = e.plotNames?.length ? e.plotNames.join(', ') : (e.plotName||t('mgr.entries.noPlot'));
      const isOpen = e.status === 'active';
      if (e.startTime && e.endTime) totalMinutes += (e.endTime.toMillis()-e.startTime.toMillis())/60000;
      const hoursBits = [
        e.regularHours ? `${t('mgr.daySummary.regular')}: ${e.regularHours.toFixed(1)}` : null,
        e.overtime1Hours ? `${t('mgr.daySummary.ot1')}: ${e.overtime1Hours.toFixed(1)}` : null,
        e.overtime2Hours ? `${t('mgr.daySummary.ot2')}: ${e.overtime2Hours.toFixed(1)}` : null,
        e.weekendHours ? `${t('mgr.daySummary.weekend')}: ${e.weekendHours.toFixed(1)}` : null,
        e.sickHours ? `${t('mgr.daySummary.sick')}: ${e.sickHours.toFixed(1)}` : null,
        e.vacationHours ? `${t('mgr.daySummary.vacation')}: ${e.vacationHours.toFixed(1)}` : null,
        e.travelMinutes ? `${t('mgr.daySummary.travel')}: ${Math.round(e.travelMinutes)}${t('mgr.daySummary.min')}` : null,
      ].filter(Boolean);
      return `<div class="ds-entry-row">
        <div class="ds-entry-top">
          <span>${plotLabel}</span>
          <span>${to24(e.startTime)} - ${isOpen?`<span class="ds-open-badge">${t('mgr.daySummary.stillOpen')}</span>`:to24(e.endTime)}</span>
        </div>
        <div class="ds-entry-main">${actName}${e.activityFreeText?': '+e.activityFreeText:''}</div>
        ${hoursBits.length?`<div class="ds-entry-hours">${hoursBits.map(b=>`<span>${b}</span>`).join('')}</div>`:''}
        ${e.notes?`<div style="margin-top:4px;font-size:12px;color:var(--text-muted)">📝 ${e.notes}</div>`:''}
      </div>`;
    }).join('');

    html += `<div class="ds-worker-section">
      <div class="ds-worker-header">
        <span>${w.name}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="ds-worker-total">${(totalMinutes/60).toFixed(1)} ${t('mgr.daySummary.hoursShort')}</span>
          ${stillOpen ? `<button class="ds-whatsapp-btn" onclick="mgrSendWhatsappNudge('${workerId}','${w.name.replace(/'/g,"\\'")}')">📲 WhatsApp</button>` : ''}
        </span>
      </div>
      ${rows}
    </div>`;
  }

  if (pendingReviewTasks.length) {
    html += `<div class="ds-tasks-section">
      <div style="font-weight:700;margin-bottom:8px">${t('mgr.daySummary.pendingTasks').replace('{count}', pendingReviewTasks.length)}</div>
      ${pendingReviewTasks.map(o => `<div style="padding:4px 0;font-size:13px">#${o.sequenceNumber??'—'} · ${o.task?.activityName||o.task?.freeText||'—'}</div>`).join('')}
    </div>`;
  }

  content.innerHTML = html;
}

// Opens a pre-filled WhatsApp message to a worker who still has a
// genuinely open entry, translated into their own preferred language.
// This is a plain wa.me link — nothing server-side, sent from whatever
// device/WhatsApp the manager is actually using.
async function mgrSendWhatsappNudge(workerId, workerName) {
  try {
    const userDoc = await db.collection('users').doc(workerId).get();
    const u = userDoc.exists ? userDoc.data() : {};
    const lang = u.language || 'he';
    const phone = (u.phone||'').replace(/[^0-9]/g,'');
    const baseMsg = t('mgr.daySummary.whatsappMessage') || 'לא סגרת את יום העבודה שלך';
    let translated = baseMsg;
    if (lang !== 'he') {
      try { translated = await translateText(baseMsg, lang); } catch(e) { console.warn('translation failed, using Hebrew:', e); }
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(translated)}`;
    window.open(url, '_blank');
  } catch(e) { showToast(t('mgr.wo.error') + ': ' + e.message); }
}
window.mgrSendWhatsappNudge = mgrSendWhatsappNudge;

let mgrEntriesPeriod = 'week';
let mgrEntriesFrom = null;
let mgrEntriesTo = null;
let _mgrEntriesSortCol = null;
let _mgrEntriesSortDir = 1;

function mgrPeriodRange(period) {
  const today = mgrTodayStr();
  if (period === 'week') {
    const d = new Date(); d.setDate(d.getDate()-6);
    return { from: d.toISOString().slice(0,10), to: today };
  }
  if (period === 'month') {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: d.toISOString().slice(0,10), to: today };
  }
  return { from: today, to: today };
}

// filter is one of: 'today' | 'week' | 'month' | 'custom' | 'flagged'.
// today/week/month/custom share the same period-based table screen;
// flagged is status-based (not period-based) but uses the identical
// table/sort/filter treatment, just without the period selector bar.
async function mgrShowEntries(filter, dateFrom, dateTo) {
  mgrCurrentFilter = filter;
  showModal('modal-mgr-entries');
  _mgrEntriesSortCol = null; _mgrEntriesSortDir = 1;
  mgrEntriesWorkerFilter = []; mgrEntriesPlotFilter = [];

  document.getElementById('mgr-entries-title').textContent =
    filter === 'flagged' ? t('mgr.entries.titleFlagged') : t('mgr.entries.titleDefault');

  if (filter !== 'flagged') {
    if (filter !== 'custom') { mgrEntriesPeriod = filter; mgrEntriesFrom = null; mgrEntriesTo = null; }
    else if (dateFrom && dateTo) { mgrEntriesPeriod = 'custom'; mgrEntriesFrom = dateFrom; mgrEntriesTo = dateTo; }
    else { mgrEntriesPeriod = 'custom'; }
  }
  await mgrLoadAndRenderEntries();
}

async function mgrEntriesSelectPeriod(period) {
  mgrEntriesPeriod = period;
  if (period !== 'custom') { mgrEntriesFrom = null; mgrEntriesTo = null; }
  await mgrLoadAndRenderEntries();
}
window.mgrEntriesSelectPeriod = mgrEntriesSelectPeriod;

async function mgrEntriesApplyCustomRange() {
  mgrEntriesFrom = document.getElementById('mgr-entries-from')?.value;
  mgrEntriesTo = document.getElementById('mgr-entries-to')?.value;
  await mgrLoadAndRenderEntries();
}
window.mgrEntriesApplyCustomRange = mgrEntriesApplyCustomRange;

async function mgrLoadAndRenderEntries() {
  const fixedHeader = document.getElementById('mgr-entries-fixed-header');
  const container = document.getElementById('mgr-entries-list');
  const isFlagged = mgrCurrentFilter === 'flagged';

  let periodBar = '';
  if (!isFlagged) {
    const periods = [
      {key:'today', label:t('entries.periodToday')},
      {key:'week',  label:t('entries.periodWeek')},
      {key:'month', label:t('entries.periodMonth')},
      {key:'custom',label:t('entries.periodCustom')},
    ];
    periodBar = `<div class="entries-period-bar">
      ${periods.map(p => `<button class="entries-period-btn ${mgrEntriesPeriod===p.key?'active':''}" onclick="mgrEntriesSelectPeriod('${p.key}')">${p.label}</button>`).join('')}
    </div>`;
  }

  let range = null;
  if (!isFlagged) {
    if (mgrEntriesPeriod === 'custom') {
      if (!mgrEntriesFrom || !mgrEntriesTo) {
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-6);
        fixedHeader.innerHTML = periodBar + `
          <div class="entries-range-row">
            <div style="flex:1"><div class="export-label">${t('mgr.export.dateFrom')}</div>${ddDateField('mgr-entries-from', weekAgo.toISOString().slice(0,10), '')}</div>
            <div style="flex:1"><div class="export-label">${t('mgr.export.dateTo')}</div>${ddDateField('mgr-entries-to', mgrTodayStr(), '')}</div>
            <button class="btn-primary" style="width:auto;padding:10px 16px;white-space:nowrap" onclick="mgrEntriesApplyCustomRange()">${t('mgr.entries.showRange')}</button>
          </div>`;
        container.innerHTML = '';
        return;
      }
      range = { from: mgrEntriesFrom, to: mgrEntriesTo };
    } else {
      range = mgrPeriodRange(mgrEntriesPeriod);
    }
  }

  const rangeRow = (!isFlagged && mgrEntriesPeriod === 'custom') ? `
      <div class="entries-range-row">
        <div style="flex:1"><div class="export-label">${t('mgr.export.dateFrom')}</div>${ddDateField('mgr-entries-from', range.from, '')}</div>
        <div style="flex:1"><div class="export-label">${t('mgr.export.dateTo')}</div>${ddDateField('mgr-entries-to', range.to, '')}</div>
        <button class="btn-primary" style="width:auto;padding:10px 16px;white-space:nowrap" onclick="mgrEntriesApplyCustomRange()">${t('mgr.entries.showRange')}</button>
      </div>` : '';

  const workerOptions = mgrWorkers.map(w => `<label class="mgr-multiselect-item"><input type="checkbox" value="${w.uid}" onchange="mgrToggleWorkerFilterItem('${w.uid}')" ${mgrEntriesWorkerFilter.includes(w.uid)?'checked':''}> ${w.name||w.phone}</label>`).join('');
  const sortedPlots = (typeof PLOTS!=='undefined'?PLOTS:[]).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','he',{numeric:true,sensitivity:'base'}));
  const plotOptions = sortedPlots.map(p => `<label class="mgr-multiselect-item"><input type="checkbox" value="${p.id}" onchange="mgrTogglePlotFilterItem('${p.id}')" ${mgrEntriesPlotFilter.includes(p.id)?'checked':''}> ${p.name}</label>`).join('');
  const workerBtnLabel = (mgrEntriesWorkerFilter.length ? mgrEntriesWorkerFilter.length+' '+t('mgr.entries.selected') : t('mgr.export.allWorkers')) + ' ▾';
  const plotBtnLabel = (mgrEntriesPlotFilter.length ? mgrEntriesPlotFilter.length+' '+t('mgr.entries.selected') : t('entries.allPlots')) + ' ▾';
  const filterRow = `<div class="mgr-entries-filter-row">
    <div class="mgr-multiselect-wrap">
      <button type="button" class="mgr-multiselect-btn" id="mgr-worker-filter-btn" onclick="mgrToggleWorkerFilterPanel()">${workerBtnLabel}</button>
      <div class="mgr-multiselect-panel" id="mgr-worker-filter-panel" style="display:none">${workerOptions}</div>
    </div>
    <div class="mgr-multiselect-wrap">
      <button type="button" class="mgr-multiselect-btn" id="mgr-plot-filter-btn" onclick="mgrTogglePlotFilterPanel()">${plotBtnLabel}</button>
      <div class="mgr-multiselect-panel" id="mgr-plot-filter-panel" style="display:none">${plotOptions}</div>
    </div>
    <div class="mgr-multiselect-wrap" style="flex:0.7">
      <button type="button" class="mgr-multiselect-btn" id="mgr-export-btn" onclick="mgrToggleExportPanel()">📥 ${t('mgr.export.title')}</button>
      <div class="mgr-multiselect-panel" id="mgr-export-panel" style="display:none">
        <div class="mgr-multiselect-item" onclick="mgrExportFull()">${t('mgr.export.fullFormat')}</div>
        <div class="mgr-multiselect-item" onclick="mgrExportTable()">${t('mgr.export.tableFormat')}</div>
      </div>
    </div>
  </div>`;

  fixedHeader.innerHTML = periodBar + rangeRow + filterRow;
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;

  try {
    let query = db.collection('timeEntries');
    if (isFlagged) query = query.where('status','==','flagged');
    else if (mgrEntriesPeriod === 'today') query = query.where('date','==',mgrTodayStr());
    else query = query.where('date','>=',range.from).where('date','<=',range.to);

    const snap = await query.get();
    mgrAllEntries = snap.docs.map(d => ({id:d.id,...d.data()}));
    mgrCheckUnsettledNotice(mgrAllEntries, 'mgr-entries-unsettled-notice', () => mgrLoadAndRenderEntries());
    mgrFilterEntries();
  } catch(e) {
    console.error('mgrLoadAndRenderEntries:', e);
    container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')} — ${e.message}</div>`;
  }
}

let mgrEntriesWorkerFilter = []; // array of worker uids, empty = all
let mgrEntriesPlotFilter = [];   // array of plot ids, empty = all

function mgrToggleExportPanel(){
  const panel = document.getElementById('mgr-export-panel');
  if (panel) panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}
window.mgrToggleExportPanel = mgrToggleExportPanel;

// Full payroll-style export — same rich format as the original standalone
// export screen (per-worker sheets, full OT/travel/night/sick/vacation
// breakdown), but sourced from whatever is currently filtered/loaded in
// the entries screen instead of its own separate date/worker pickers.
function mgrExportFull(){
  mgrToggleExportPanel();
  const entries = _mgrGetFilteredSortedEntries();
  if (!entries.length) { showToast(t('mgr.export.noData')); return; }

  const headers = ['תאריך','יום','כניסה','יציאה','נסיעות (דקות)',
    'סה"כ שעות','שעות רגילות','שעות נוספות 125%','שעות נוספות 150%',
    'שעות סוף שבוע','שעות לילה','שעות חופשה','שעות מחלה',
    'פעילות','חלקה','גידול + זן','הערות','דיווח בעיה','עריכת מנהל'];
  const DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  const byWorker = {};
  entries.forEach(e => {
    const key = e.workerId || 'unknown';
    if (!byWorker[key]) byWorker[key] = { name: e.workerName||e.workerPhone||key, phone: e.workerPhone||'', entries: [] };
    byWorker[key].entries.push(e);
  });

  const wb = XLSX.utils.book_new();
  const dates = entries.map(e=>e.date).filter(Boolean).sort();
  const monthStr = dates.length ? dates[0].slice(0,7) : mgrTodayStr().slice(0,7);
  const employerName = 'Rhythmos Farm 37';

  Object.entries(byWorker).forEach(([uid, worker]) => {
    const rows = [];
    rows.push([employerName, '', '', '', '', `חודש: ${monthStr}`, '', '', '', '', '', '', '', '', '', '', '', '', '']);
    rows.push(['']);
    rows.push([`שם העובד: ${worker.name}`, '', '', '', '', `טלפון: ${worker.phone}`, '', '', '', '', '', '', '', '', '', '', '', '', '']);
    rows.push(['']);
    rows.push(headers);

    worker.entries.forEach(e => {
      const act = mgrFindActivity(e.activityId);
      const actName = act ? (act.nameI18n?.he||act.id) : (e.activityId||'');
      const rnd = v => v ? Math.round(v*100)/100 : 0;
      const startStr = mgrTo24h(e.startTime);
      const endStr   = mgrTo24h(e.endTime);
      const dow = e.date ? new Date(e.date+'T12:00:00').getDay() : null;
      const dayStr = dow!==null ? DAYS_HE[dow] : '';
      const note = e.notes||'', flag = e.flagNote||'', edit = e.managerEdit?.reason||'';
      const actFull = actName + (e.activityFreeText?': '+e.activityFreeText:'');
      const cropVariety = [e.crop||'', e.variety||''].filter(Boolean).join(' - ');

      if (e.plotIds?.length > 1 && e.plotNames?.length > 1) {
        const dunams = e.plotDunams || e.plotIds.map(()=>0);
        const totalDunams = dunams.reduce((a,b)=>a+b,0);
        e.plotIds.forEach((pid, pi) => {
          const ratio = totalDunams > 0 ? (dunams[pi]||0)/totalDunams : 1/e.plotIds.length;
          rows.push([
            e.date?fmtStoredDate(e.date):'', dayStr, startStr, endStr,
            rnd((e.travelMinutes||0)*ratio), rnd((e.totalHours||0)*ratio), rnd((e.regularHours||0)*ratio),
            rnd((e.overtime1Hours||0)*ratio), rnd((e.overtime2Hours||0)*ratio), rnd((e.weekendHours||0)*ratio),
            rnd((e.nightHours||0)*ratio), rnd((e.vacationHours||0)*ratio), rnd((e.sickHours||0)*ratio),
            actFull, e.plotNames[pi]||'', cropVariety, note, flag, edit,
          ]);
        });
      } else {
        rows.push([
          e.date?fmtStoredDate(e.date):'', dayStr, startStr, endStr,
          e.travelMinutes||0, rnd(e.totalHours), rnd(e.regularHours),
          rnd(e.overtime1Hours), rnd(e.overtime2Hours), rnd(e.weekendHours),
          rnd(e.nightHours||0), rnd(e.vacationHours), rnd(e.sickHours),
          actFull, e.plotName||'', cropVariety, note, flag, edit,
        ]);
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      {wch:12},{wch:8},{wch:8},{wch:8},{wch:10},
      {wch:10},{wch:12},{wch:14},{wch:14},
      {wch:14},{wch:10},{wch:12},{wch:10},
      {wch:24},{wch:14},{wch:20},
      {wch:24},{wch:24},{wch:20},
    ];
    const sheetName = (worker.name||'Worker').replace(/[\\\/\?\*\[\]]/g,'').slice(0,31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `rhythmos-hours-${monthStr}.xlsx`);
  showToast(t('mgr.export.resultSummary').replace('{count}',entries.length).replace('{workers}',Object.keys(byWorker).length));
}
window.mgrExportFull = mgrExportFull;

// Simple export — exactly the 6 columns currently displayed on screen, in
// whatever sort order is currently active, as a single flat sheet.
function mgrExportTable(){
  mgrToggleExportPanel();
  const entries = _mgrGetFilteredSortedEntries();
  if (!entries.length) { showToast(t('mgr.export.noData')); return; }

  const to24 = (dt) => dt ? `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` : '';
  const headers = [t('entries.colWorker'), t('entries.colActivity'), t('entries.colPlot'), t('entries.colDate'), t('entries.colStart'), t('entries.colEnd')];
  const rows = [headers];
  entries.forEach(e => {
    const act = mgrFindActivity(e.activityId);
    const actName = act ? (act.nameI18n?.[currentLang]||act.nameI18n?.he||act.id) : (e.activityId||'');
    const start = e.startTime ? new Date(e.startTime.toMillis()) : null;
    const end = e.endTime ? new Date(e.endTime.toMillis()) : null;
    const plotLabel = e.plotNames?.length ? e.plotNames.join(', ') : (e.plotName||'');
    rows.push([
      e.workerName||workerName(e.workerId),
      actName + (e.activityFreeText?': '+e.activityFreeText:''),
      plotLabel,
      e.date?fmtStoredDate(e.date):'',
      to24(start),
      end?to24(end):'',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:16},{wch:22},{wch:18},{wch:12},{wch:10},{wch:10}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'רשומות');
  XLSX.writeFile(wb, `rhythmos-entries-${mgrTodayStr()}.xlsx`);
  showToast(t('mgr.export.resultSummary').replace('{count}',entries.length).replace('{workers}',new Set(entries.map(e=>e.workerId)).size));
}
window.mgrExportTable = mgrExportTable;

function mgrToggleWorkerFilterPanel(){
  const panel = document.getElementById('mgr-worker-filter-panel');
  if (panel) panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}
window.mgrToggleWorkerFilterPanel = mgrToggleWorkerFilterPanel;

function mgrTogglePlotFilterPanel(){
  const panel = document.getElementById('mgr-plot-filter-panel');
  if (panel) panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}
window.mgrTogglePlotFilterPanel = mgrTogglePlotFilterPanel;

function mgrToggleWorkerFilterItem(uid){
  const idx = mgrEntriesWorkerFilter.indexOf(uid);
  if (idx===-1) mgrEntriesWorkerFilter.push(uid); else mgrEntriesWorkerFilter.splice(idx,1);
  const btn = document.getElementById('mgr-worker-filter-btn');
  if (btn) btn.textContent = (mgrEntriesWorkerFilter.length ? mgrEntriesWorkerFilter.length+' '+t('mgr.entries.selected') : t('mgr.export.allWorkers')) + ' ▾';
  mgrFilterEntries();
}
window.mgrToggleWorkerFilterItem = mgrToggleWorkerFilterItem;

function mgrTogglePlotFilterItem(plotId){
  const idx = mgrEntriesPlotFilter.indexOf(plotId);
  if (idx===-1) mgrEntriesPlotFilter.push(plotId); else mgrEntriesPlotFilter.splice(idx,1);
  const btn = document.getElementById('mgr-plot-filter-btn');
  if (btn) btn.textContent = (mgrEntriesPlotFilter.length ? mgrEntriesPlotFilter.length+' '+t('mgr.entries.selected') : t('entries.allPlots')) + ' ▾';
  mgrFilterEntries();
}
window.mgrTogglePlotFilterItem = mgrTogglePlotFilterItem;

function mgrFilterEntries() {
  mgrRenderEntries();
}

function mgrSortEntries(col) {
  if (_mgrEntriesSortCol === col) { _mgrEntriesSortDir = -_mgrEntriesSortDir; }
  else { _mgrEntriesSortCol = col; _mgrEntriesSortDir = 1; }
  mgrFilterEntries();
}
window.mgrSortEntries = mgrSortEntries;

// Returns the exact same filtered+sorted set currently shown on screen —
// used by both the table renderer and both export formats, so exports
// always match what the manager is actually looking at.
function _mgrEntriesSortValue(e, col) {
  switch(col) {
    case 'worker': return e.workerName||'';
    case 'activity': { const act=mgrFindActivity(e.activityId); return act?(act.nameI18n?.[currentLang]||act.nameI18n?.he||''):(e.activityId||''); }
    case 'plot': return e.plotNames?.length ? e.plotNames.join(', ') : (e.plotName||'');
    case 'date': return e.date||'';
    case 'start': return e.startTime?e.startTime.toMillis():0;
    case 'end': return e.endTime?e.endTime.toMillis():0;
    default: return '';
  }
}
function _mgrGetFilteredSortedEntries() {
  let filtered = mgrAllEntries;
  if (mgrEntriesWorkerFilter.length) filtered = filtered.filter(e => mgrEntriesWorkerFilter.includes(e.workerId));
  if (mgrEntriesPlotFilter.length) filtered = filtered.filter(e => mgrEntriesPlotFilter.includes(e.plotId) || (e.plotIds||[]).some(pid => mgrEntriesPlotFilter.includes(pid)));
  filtered = filtered.slice();
  if (_mgrEntriesSortCol) {
    filtered.sort((a,b) => {
      const av = _mgrEntriesSortValue(a,_mgrEntriesSortCol), bv = _mgrEntriesSortValue(b,_mgrEntriesSortCol);
      const cmp = typeof av==='number' ? av-bv : String(av).localeCompare(String(bv),'he');
      return cmp * _mgrEntriesSortDir;
    });
  } else {
    filtered.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.startTime?.toMillis()||0)-(a.startTime?.toMillis()||0));
  }
  return filtered;
}

function mgrRenderEntries() {
  const container = document.getElementById('mgr-entries-list');
  if (!container) return;

  const entries = _mgrGetFilteredSortedEntries();

  if (!entries.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px 0">${t('mgr.entries.empty')}</div>`;
    return;
  }

  const colgroup = `<colgroup><col style="width:18%"><col style="width:20%"><col style="width:18%"><col style="width:20%"><col style="width:15%"><col style="width:15%"></colgroup>`;
  const arrow = col => _mgrEntriesSortCol===col ? (_mgrEntriesSortDir===1?' ▲':' ▼') : '';
  const th = (col,label) => `<th onclick="mgrSortEntries('${col}')" style="cursor:pointer">${label}${arrow(col)}</th>`;
  const to24=(dt)=>dt?`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`:'—';

  const rows = entries.map(e => {
    const act = mgrFindActivity(e.activityId);
    const actName = act ? (act.nameI18n?.[currentLang]||act.nameI18n?.he||act.id) : (e.activityId||'—');
    const start = e.startTime ? new Date(e.startTime.toMillis()) : null;
    const end = e.endTime ? new Date(e.endTime.toMillis()) : null;
    const plotLabel = e.plotNames?.length ? e.plotNames.join(', ') : (e.plotName||t('mgr.entries.noPlot'));
    return `<tr onclick="mgrShowEntryDetail('${e.id}')">
      <td>${e.workerName||workerName(e.workerId)}</td>
      <td>${actName}${e.activityFreeText?': '+e.activityFreeText:''}</td>
      <td>${plotLabel}</td>
      <td>${e.date?fmtStoredDate(e.date):'—'}</td>
      <td>${to24(start)}</td>
      <td>${end?to24(end):(e.status==='active'?'⏱':'—')}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `<div class="wo-table-wrap"><table class="wo-table" dir="rtl">${colgroup}
    <thead><tr>${th('worker',t('entries.colWorker'))}${th('activity',t('entries.colActivity'))}${th('plot',t('entries.colPlot'))}${th('date',t('entries.colDate'))}${th('start',t('entries.colStart'))}${th('end',t('entries.colEnd'))}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── ENTRY DETAIL ──────────────────────────────────────────────
async function mgrDeleteEntry(entryId) {
  if (!entryId) return;
  if (!await customConfirm(t('mgr.entries.deleteConfirm'))) return;
  try {
    const doc = await db.collection('timeEntries').doc(entryId).get();
    const e = doc.exists ? doc.data() : null;
    await db.collection('timeEntries').doc(entryId).delete();
    showToast(t('mgr.entries.deleted'));
    closeModal('modal-mgr-entry-detail');
    // Recalculate that worker's day so hours/travel reflect the deletion,
    // same as when an edit changes an already-settled day.
    if (e && e.workerId && e.date && typeof resettleDay === 'function') {
      try { await resettleDay(e.workerId, e.date); } catch(err) { console.warn('resettleDay after delete:', err); }
    }
    if (typeof mgrAllEntries !== 'undefined') {
      const idx = mgrAllEntries.findIndex(x => x.id === entryId);
      if (idx !== -1) mgrAllEntries.splice(idx, 1);
    }
    if (typeof mgrFilterEntries === 'function') mgrFilterEntries();
    if (typeof refreshDashboard === 'function') refreshDashboard();
  } catch(err) {
    showToast(t('mgr.wo.error') + ': ' + err.message);
  }
}
window.mgrDeleteEntry = mgrDeleteEntry;

async function mgrShowEntryDetail(entryId) {
  mgrCurrentEntryId = entryId;
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-entry-detail');
  document.getElementById('mgr-entry-detail-content').innerHTML =
    `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;

  try {
    // Ensure live activity/crop data is loaded — a manager session doesn't
    // load this by default the way a worker session does, and without it
    // any custom/migrated/imported activity would show as unresolved.
    if (typeof loadCropData === 'function') await loadCropData();
    const doc = await db.collection('timeEntries').doc(entryId).get();
    if (!doc.exists) return;
    mgrRenderEntryDetail(doc.id, doc.data());
  } catch(e) { console.error('mgrShowEntryDetail:', e); }
}

function mgrFormatEditPrevious(prev) {
  if (!prev) return '';
  const parts = [];
  if (prev.plotName)  parts.push(t('mgr.entries.prevPlot').replace('{val}',prev.plotName));
  if (prev.activityId){
    const a = mgrFindActivity(prev.activityId);
    parts.push(t('mgr.entries.prevActivity').replace('{val}',a?a.nameI18n.he:prev.activityId));
  }
  if (prev.date) parts.push(t('mgr.entries.prevDate').replace('{val}',prev.date));
  if (prev.startTime || prev.endTime) {
    parts.push(t('mgr.entries.prevTimes').replace('{start}',mgrTo24h(prev.startTime)||'—').replace('{end}',mgrTo24h(prev.endTime)||'—'));
  }
  return parts.length ? `<div class="mgr-edit-diff">${parts.join('<br>')}</div>` : '';
}

function mgrRenderEntryDetail(id, e) {
  const act = mgrFindActivity(e.activityId);
  const actName = act ? (act.nameI18n?.[currentLang]||act.nameI18n?.he||act.id) : (e.activityId||'—');
  const start = e.startTime ? new Date(e.startTime.toMillis()) : null;
  const end   = e.endTime   ? new Date(e.endTime.toMillis())   : null;
  const startTimeStr = mgrTo24h(e.startTime);
  const endTimeStr   = mgrTo24h(e.endTime);
  const dur = start&&end ? mgrDurationStr(end-start) : '—';

  document.getElementById('mgr-entry-detail-content').innerHTML = `
    ${e.status==='flagged'&&e.flagNote?`<div class="flag-existing">${t('mgr.entries.flagReport').replace('{val}',e.flagNote||'—')}</div>`:''}
    ${e.managerEdit?`<div style="padding:10px 20px">
      <div class="mgr-edited-badge">${t('mgr.entries.editedByManager').replace('{reason}',e.managerEdit.reason||'')}</div>
      ${mgrFormatEditPrevious(e.managerEdit.previous)}
    </div>`:''}
    ${e.workerEdit?`<div style="padding:10px 20px">
      <div class="mgr-edited-badge" style="background:#E3F2FD;color:#1565C0">${t('mgr.entries.editedByWorker').replace('{reason}',e.workerEdit.reason||'')}</div>
      ${mgrFormatEditPrevious(e.workerEdit.previous)}
    </div>`:''}
    <div class="detail-section"><div class="detail-label">${t('mgr.entries.worker')}</div><div class="detail-value">${e.workerName||'—'} · ${e.workerPhone||'—'}</div></div>
    <div class="detail-section"><div class="detail-label">${t('mgr.entries.activity')}</div><div class="detail-value">${actName}${e.activityFreeText?': '+e.activityFreeText:''}</div></div>
    <div class="detail-section"><div class="detail-label">${t('mgr.entries.plot')}</div><div class="detail-value">${e.plotNames?.length>1?e.plotNames.join(', '):e.plotName||t('mgr.entries.noPlot')}${e.variety&&!e.plotNames?.length>1?' · '+e.variety:''}</div></div>
    <div class="detail-section"><div class="detail-label">${t('mgr.entries.date')}</div><div class="detail-value">${e.date?fmtStoredDate(e.date):'—'}</div></div>
    <div class="detail-section"><div class="detail-label">${t('mgr.entries.startEndTime')}</div><div class="detail-value">${startTimeStr||'—'} — ${endTimeStr||'—'}</div></div>
    <div class="detail-section"><div class="detail-label">${t('mgr.entries.duration')}</div><div class="detail-value">${dur}</div></div>
    ${e.travelMinutes?`<div class="detail-section"><div class="detail-label">${t('mgr.entries.travel')}</div><div class="detail-value">${e.travelMinutes} ${t('mgr.entries.minUnit')}</div></div>`:''}
    ${e.taskNote?`<div class="detail-section"><div class="detail-label">${t('mgr.entries.taskNote')}</div><div class="detail-note">${e.taskNote}</div></div>`:''}
    ${e.notes?`<div class="detail-section"><div class="detail-label">${t('mgr.entries.notes')}</div><div class="detail-note">${e.notes}</div></div>`:''}
    ${e.status==='flagged'&&!e.flagReviewed?`
      <div style="padding:16px 20px 32px">
        <button class="btn-primary full-w" onclick="mgrMarkReviewed('${id}')">${t('mgr.entries.markReviewed')}</button>
      </div>`:''}
  `;
}

// ── MESSAGES ──────────────────────────────────────────────────
let _mgrMessagesCache = [];
let _mgrMessagesFilter = 'all';

async function mgrShowMessages() {
  showModal('modal-mgr-messages');
  const container = document.getElementById('mgr-messages-list');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;

  try {
    const snap = await db.collection('messages')
      .orderBy('timestamp','asc').limit(50).get();

    _mgrMessagesCache = snap.docs.map(d => ({id:d.id, ...d.data()}));
    _mgrMessagesFilter = 'all';

    // Mark all as read (after capturing their pre-read state above, so the
    // "new" filter still works correctly for this viewing session)
    const batch = db.batch();
    snap.docs.filter(d => !d.data().read).forEach(d => batch.update(d.ref, {read:true}));
    batch.commit();

    mgrRenderMessages();
    setCount('mgr-count-messages', 0);
  } catch(e) {
    console.error('mgrShowMessages:', e);
    container.innerHTML = `<div class="msg-empty">${t('mgr.msg.error')}</div>`;
  }
}

function mgrFilterMessages(filter) {
  _mgrMessagesFilter = filter;
  mgrRenderMessages();
}
window.mgrFilterMessages = mgrFilterMessages;

function mgrRenderMessages() {
  const container = document.getElementById('mgr-messages-list');
  const all = _mgrMessagesCache;
  const newCount = all.filter(m => !m.read && !m.managerReply).length;
  const filterBar = `<div class="wo-filter-bar">
    <button class="wo-filter-btn ${_mgrMessagesFilter==='all'?'active':''}" onclick="mgrFilterMessages('all')">${t('mgr.wo.filterAll')} (${all.length})</button>
    <button class="wo-filter-btn ${_mgrMessagesFilter==='new'?'active':''}" onclick="mgrFilterMessages('new')">${t('mgr.msg.filterNew')} (${newCount})</button>
  </div>`;

  const list = _mgrMessagesFilter==='new' ? all.filter(m => !m.read && !m.managerReply) : all;

  if (!list.length) {
    container.innerHTML = filterBar + `<div class="msg-empty">${t('mgr.msg.empty')}</div>`;
    return;
  }
  container.innerHTML = filterBar + list.map(m => {
    const ts = m.timestamp ? new Date(m.timestamp.toMillis()) : null;
    const to24m=(dt)=>dt?`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`:'';
    const timeStr = ts ? fmtDateDDMM(ts) + ' ' + to24m(ts) : '';
    // Show translated Hebrew version if available
    const text = m.translated?.he || m.originalText || '';
    const isOriginalLang = m.originalLang === 'he';
    const original = !isOriginalLang ? `<div class="mgr-msg-translated">${m.originalText}</div>` : '';
    const hasReply = m.managerReply;
    return `<div class="mgr-msg-row ${!m.read&&!hasReply?'unread':''}" onclick="mgrOpenReply('${m.id}')" style="position:relative">
      <span onclick="event.stopPropagation();mgrDeleteMessage('${m.id}')" style="position:absolute;left:12px;top:12px;font-size:15px;cursor:pointer;color:#c62828" title="${t('mgr.wo.tooltipDelete')}">🗑</span>
      <div class="mgr-msg-worker">👤 ${m.workerName||'—'}</div>
      <div class="mgr-msg-text">${text}</div>
      ${original}
      ${hasReply?`<div class="mgr-msg-translated" style="color:var(--crimson)">✓ ${t('mgr.msg.repliedTo')}: ${m.managerReply}</div>`:''}
      <div class="mgr-msg-time">${timeStr}</div>
    </div>`;
  }).join('');
}
window.mgrRenderMessages = mgrRenderMessages;

async function mgrDeleteMessage(msgId) {
  if (!await customConfirm(t('mgr.msg.deleteConfirm'))) return;
  try {
    await db.collection('messages').doc(msgId).delete();
    const idx = _mgrMessagesCache.findIndex(m => m.id === msgId);
    if (idx !== -1) _mgrMessagesCache.splice(idx, 1);
    mgrRenderMessages();
    showToast(t('mgr.msg.deleted'));
  } catch(e) { showToast(t('mgr.wo.error') + ': ' + e.message); }
}
window.mgrDeleteMessage = mgrDeleteMessage;

async function mgrOpenReply(msgId) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-reply');
  const container = document.getElementById('mgr-reply-content');

  try {
    const doc = await db.collection('messages').doc(msgId).get();
    const m = doc.data();
    const text = m.translated?.he || m.originalText || '';
    const workerName = m.workerName || '—';
    document.getElementById('mgr-reply-title').textContent = t('mgr.msg.replyTitle').replace('{worker}',workerName);

    container.innerHTML = `
      <div class="modal-step">
        <div style="background:var(--input-bg);border-radius:var(--radius-sm);padding:12px;font-size:14px;margin-bottom:4px">${text}</div>
        ${m.managerReply?`<div style="font-size:12px;color:var(--text-muted)">${t('mgr.msg.previousReply').replace('{reply}',m.managerReply)}</div>`:''}
        <div class="step-label" style="text-align:start;margin-top:4px">${t('mgr.msg.yourReply')}</div>
        <textarea id="mgr-reply-input" class="entry-textarea" rows="3" placeholder="${t('mgr.msg.writeReply')}"></textarea>
        <button class="btn-primary full-w" onclick="mgrSendReply('${msgId}')">${t('mgr.msg.sendReply')}</button>
        <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-reply')">${t('mgr.msg.cancel')}</button>
      </div>`;
    if (m.managerReply) {
      setTimeout(() => {
        const ta = document.getElementById('mgr-reply-input');
        if (ta) ta.value = m.managerReply;
      }, 50);
    }
  } catch(e) { console.error('mgrOpenReply:', e); }
}

async function mgrSendReply(msgId) {
  const reply = document.getElementById('mgr-reply-input')?.value.trim()||'';
  if (!reply) { showToast(t('mgr.msg.enterReply')); return; }
  try {
    await db.collection('messages').doc(msgId).update({ managerReply: reply });
    showToast(t('mgr.msg.replySent'));
    closeModal('modal-mgr-reply');
    mgrShowMessages();
  } catch(e) { showToast(t('mgr.msg.error')); }
}

// ── HELPERS ───────────────────────────────────────────────────
function mgrTodayStr() { return new Date().toISOString().slice(0,10); }

function mgrTo24h(ts) {
  if (!ts) return '';
  const dt = new Date(ts.toMillis());
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}

function mgrFmt(ts) {
  if (!ts) return '—';
  return mgrTo24h(ts);
}

function mgrDurationStr(ms) {
  const m = Math.floor(ms/60000), h = Math.floor(m/60);
  return h>0 ? t('mgr.plot.durHours').replace('{h}',h).replace('{m}',String(m%60).padStart(2,'0')) : t('mgr.plot.durMinutes').replace('{m}',m);
}

function mgrTimeToTimestamp(dateStr, timeStr) {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  return firebase.firestore.Timestamp.fromDate(dt);
}

window.initManager = initManager;
window.mgrShowEntries = mgrShowEntries;
window.mgrShowMessages = mgrShowMessages;
window.mgrShowEntryDetail = mgrShowEntryDetail;
window.mgrOpenReply = mgrOpenReply;
window.mgrSendReply = mgrSendReply;
window.mgrFilterEntries = mgrFilterEntries;

console.log('manager.js Build 15 telem loaded ✓');

// ── FARM SETTINGS ─────────────────────────────────────────────
const DEFAULT_FARM = {
  workdayHours: 8, overtime1MaxHours: 2, overtime1Rate: 1.25, overtime2Rate: 1.50,
  nightShiftStart: '22:00', nightShiftEnd: '06:00',
  weekendDays: [6], workdayResetHour: '06:00',
  allowWorkerEditReports: false,
};
let mgrFarmSettings = null;
const DAY_LABELS = [0,1,2,3,4,5,6].map(d=>t('mgr.farm.day'+d)); // Sun-Sat, translated

async function mgrShowFarmSettings() {
  showModal('modal-mgr-farm');
  const container = document.getElementById('farm-settings-content');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    const doc = await db.collection('farmSettings').doc('default').get();
    mgrFarmSettings = doc.exists ? { ...DEFAULT_FARM, ...doc.data() } : { ...DEFAULT_FARM };
    renderFarmSettings(mgrFarmSettings);
  } catch(e) { mgrFarmSettings = { ...DEFAULT_FARM }; renderFarmSettings(mgrFarmSettings); }
}

function renderFarmSettings(s) {
  const container = document.getElementById('farm-settings-content');
  const wdBtns = [0,1,2,3,4,5,6].map(d =>
    `<button class="weekday-btn${(s.weekendDays||[6]).includes(d)?' active':''}" onclick="mgrToggleWeekday(${d})" id="wd-btn-${d}">${DAY_LABELS[d]}</button>`
  ).join('');

  container.innerHTML = `
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.workHours')}</div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.regularHours')}</span><input class="farm-input" id="fs-workday" type="number" min="1" max="24" value="${s.workdayHours||8}"></div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.ot1Hours')}</span><input class="farm-input" id="fs-ot1" type="number" min="0" max="8" step="0.5" value="${s.overtime1MaxHours||2}"></div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.ot1Rate')}</span><input class="farm-input" id="fs-ot1-rate" type="number" min="1" max="3" step="0.01" value="${s.overtime1Rate||1.25}"></div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.ot2Rate')}</span><input class="farm-input" id="fs-ot2-rate" type="number" min="1" max="3" step="0.01" value="${s.overtime2Rate||1.50}"></div>
    </div>
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.nightShift')}</div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.nightStart')}</span><input class="farm-input farm-input-wide" id="fs-night-start" type="time" value="${s.nightShiftStart||'22:00'}"></div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.nightEnd')}</span><input class="farm-input farm-input-wide" id="fs-night-end" type="time" value="${s.nightShiftEnd||'06:00'}"></div>
    </div>
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.restDays')}</div>
      <div class="weekday-grid">${wdBtns}</div>
    </div>
    <div class="farm-section">
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.resetHour')}</span><input class="farm-input farm-input-wide" id="fs-reset" type="time" value="${s.workdayResetHour||'06:00'}"></div>
    </div>
    <div style="padding:16px 20px 32px">
      <button class="btn-primary full-w" onclick="mgrSaveFarmSettings()">שמור הגדרות</button>
    </div>
  `;
}

function mgrToggleWeekday(d) {
  const wd = mgrFarmSettings.weekendDays || [6];
  const idx = wd.indexOf(d);
  if (idx >= 0) wd.splice(idx, 1); else wd.push(d);
  mgrFarmSettings.weekendDays = wd;
  // Update button styles
  [0,1,2,3,4,5,6].forEach(i => {
    const btn = document.getElementById(`wd-btn-${i}`);
    if (btn) btn.className = 'weekday-btn' + (wd.includes(i) ? ' active' : '');
  });
}

async function mgrSaveFarmSettings() {
  const updated = {
    workdayHours:      parseFloat(document.getElementById('fs-workday')?.value) || 8,
    overtime1MaxHours: parseFloat(document.getElementById('fs-ot1')?.value) || 2,
    overtime1Rate:     parseFloat(document.getElementById('fs-ot1-rate')?.value) || 1.25,
    overtime2Rate:     parseFloat(document.getElementById('fs-ot2-rate')?.value) || 1.50,
    nightShiftStart:   document.getElementById('fs-night-start')?.value || '22:00',
    nightShiftEnd:     document.getElementById('fs-night-end')?.value || '06:00',
    weekendDays:       mgrFarmSettings.weekendDays || [6],
    workdayResetHour:  document.getElementById('fs-reset')?.value || '06:00',
  };
  try {
    await db.collection('farmSettings').doc('default').set(updated);
    mgrFarmSettings = updated;
    showToast(t('mgr.farm.settingsSaved'));
    closeModal('modal-mgr-farm');
  } catch(e) { showToast(t('mgr.wo.error') + ' — ' + e.message); }
}

// ── EXCEL EXPORT ──────────────────────────────────────────────
function mgrShowExport() {
  showModal('modal-mgr-export');
  const today = mgrTodayStr();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-6);
  const weekAgoStr = weekAgo.toISOString().slice(0,10);
  const workerOptions = mgrWorkers.map(w =>
    `<option value="${w.uid}">${w.name||w.phone}</option>`
  ).join('');

  document.getElementById('export-content').innerHTML = `
    <div class="export-form">
      <div>
        <div class="export-label">${t('mgr.export.dateFrom')}</div>
        ${ddDateField('exp-from', weekAgoStr, '')}
      </div>
      <div>
        <div class="export-label">${t('mgr.export.dateTo')}</div>
        ${ddDateField('exp-to', today, '')}
      </div>
      <div>
        <div class="export-label">${t('mgr.export.worker')}</div>
        <select class="export-input" id="exp-worker">
          <option value="">${t('mgr.export.allWorkers')}</option>
          ${workerOptions}
        </select>
      </div>
      <button class="btn-primary full-w" id="exp-btn" onclick="mgrDoExport()">
        ${t('mgr.export.generate')}
      </button>
    </div>
  `;
}

let mgrPlotHoursRows = []; // full aggregated rows for the current date range, before filtering
let mgrPlotHoursPlotFilter = [];
let mgrPlotHoursActivityFilter = [];
let _mgrPlotHoursSortCol = null;
let _mgrPlotHoursSortDir = 1;

function mgrShowPlotHours() {
  showModal('modal-mgr-plot-hours');
  mgrPlotHoursPlotFilter = []; mgrPlotHoursActivityFilter = [];
  _mgrPlotHoursSortCol = null; _mgrPlotHoursSortDir = 1;
  mgrPlotHoursRows = [];
  const today = mgrTodayStr();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-6);
  const weekAgoStr = weekAgo.toISOString().slice(0,10);

  document.getElementById('plot-hours-fixed-header').innerHTML = `
    <div class="entries-range-row" style="padding:12px 16px">
      <div style="flex:1"><div class="export-label">${t('mgr.export.dateFrom')}</div>${ddDateField('ph-from', weekAgoStr, '')}</div>
      <div style="flex:1"><div class="export-label">${t('mgr.export.dateTo')}</div>${ddDateField('ph-to', today, '')}</div>
      <button class="btn-primary" style="width:auto;padding:10px 16px;white-space:nowrap" id="ph-btn" onclick="mgrDoPlotHours()">${t('mgr.plotHours.generate')}</button>
    </div>`;
  document.getElementById('plot-hours-content').innerHTML = '';
}
window.mgrShowPlotHours = mgrShowPlotHours;

async function mgrDoPlotHours() {
  const btn = document.getElementById('ph-btn');
  const content = document.getElementById('plot-hours-content');
  const dateFrom = document.getElementById('ph-from')?.value;
  const dateTo = document.getElementById('ph-to')?.value;
  if (!dateFrom || !dateTo) { showToast(t('mgr.export.selectRange')); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-sm"></div>'; }
  content.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    const snap = await db.collection('timeEntries')
      .where('date','>=',dateFrom).where('date','<=',dateTo)
      .get();
    const allFetched = snap.docs.map(d=>({id:d.id,...d.data()}));
    mgrCheckUnsettledNotice(allFetched, 'plot-hours-unsettled-notice', () => mgrDoPlotHours());
    const byPlotActivity = {}; // "plotId|activityId" -> {plotId, activityId, plotName, activityName, minutes, dunams}
    snap.docs.forEach(d => {
      const e = d.data();
      if (!e.workdaySettled) return;
      const act = mgrFindActivity(e.activityId);
      const activityName = act ? (act.nameI18n?.[currentLang]||act.nameI18n?.he||act.id) : (e.activityFreeText || e.activityId || '—');
      (e.plotAllocations||[]).forEach(a => {
        if (!a.plotId) return;
        const key = a.plotId + '|' + (e.activityId||'—');
        if (!byPlotActivity[key]) byPlotActivity[key] = { plotId:a.plotId, activityId:e.activityId||'—', plotName: a.plotName||'—', activityName, minutes: 0, dunams: a.dunams||0 };
        byPlotActivity[key].minutes += a.minutes||0;
      });
    });
    mgrPlotHoursRows = Object.values(byPlotActivity);
    mgrRenderPlotHoursFilters(dateFrom, dateTo);
    mgrFilterPlotHours();
  } catch(e) {
    content.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = t('mgr.plotHours.generate'); }
  }
}
window.mgrDoPlotHours = mgrDoPlotHours;

function mgrRenderPlotHoursFilters(dateFrom, dateTo) {
  const header = document.getElementById('plot-hours-fixed-header');
  const rangeRow = `<div class="entries-range-row" style="padding:12px 16px">
      <div style="flex:1"><div class="export-label">${t('mgr.export.dateFrom')}</div>${ddDateField('ph-from', dateFrom, '')}</div>
      <div style="flex:1"><div class="export-label">${t('mgr.export.dateTo')}</div>${ddDateField('ph-to', dateTo, '')}</div>
      <button class="btn-primary" style="width:auto;padding:10px 16px;white-space:nowrap" id="ph-btn" onclick="mgrDoPlotHours()">${t('mgr.plotHours.generate')}</button>
    </div>`;

  const plotsInData = [...new Map(mgrPlotHoursRows.map(r=>[r.plotId,r.plotName])).entries()]
    .sort((a,b)=>a[1].localeCompare(b[1],'he',{numeric:true,sensitivity:'base'}));
  const activitiesInData = [...new Map(mgrPlotHoursRows.map(r=>[r.activityId,r.activityName])).entries()]
    .sort((a,b)=>a[1].localeCompare(b[1],'he'));

  const plotOptions = plotsInData.map(([id,name]) => `<label class="mgr-multiselect-item"><input type="checkbox" value="${id}" onchange="mgrTogglePlotHoursPlotFilter('${id}')" ${mgrPlotHoursPlotFilter.includes(id)?'checked':''}> ${name}</label>`).join('');
  const activityOptions = activitiesInData.map(([id,name]) => `<label class="mgr-multiselect-item"><input type="checkbox" value="${id}" onchange="mgrTogglePlotHoursActivityFilter('${id}')" ${mgrPlotHoursActivityFilter.includes(id)?'checked':''}> ${name}</label>`).join('');
  const plotBtnLabel = (mgrPlotHoursPlotFilter.length ? mgrPlotHoursPlotFilter.length+' '+t('mgr.entries.selected') : t('entries.allPlots')) + ' ▾';
  const activityBtnLabel = (mgrPlotHoursActivityFilter.length ? mgrPlotHoursActivityFilter.length+' '+t('mgr.entries.selected') : t('mgr.plotHours.allActivities')) + ' ▾';

  const filterRow = `<div class="mgr-entries-filter-row">
    <div class="mgr-multiselect-wrap">
      <button type="button" class="mgr-multiselect-btn" id="ph-plot-filter-btn" onclick="mgrTogglePlotHoursPlotPanel()">${plotBtnLabel}</button>
      <div class="mgr-multiselect-panel" id="ph-plot-filter-panel" style="display:none">${plotOptions}</div>
    </div>
    <div class="mgr-multiselect-wrap">
      <button type="button" class="mgr-multiselect-btn" id="ph-activity-filter-btn" onclick="mgrTogglePlotHoursActivityPanel()">${activityBtnLabel}</button>
      <div class="mgr-multiselect-panel" id="ph-activity-filter-panel" style="display:none">${activityOptions}</div>
    </div>
    <div class="mgr-multiselect-wrap" style="flex:0.6">
      <button type="button" class="mgr-multiselect-btn" onclick="mgrExportPlotHours()">📥 ${t('mgr.export.title')}</button>
    </div>
  </div>`;

  header.innerHTML = rangeRow + filterRow;
}

function mgrTogglePlotHoursPlotPanel(){ const p=document.getElementById('ph-plot-filter-panel'); if(p) p.style.display = p.style.display==='none'?'block':'none'; }
window.mgrTogglePlotHoursPlotPanel = mgrTogglePlotHoursPlotPanel;
function mgrTogglePlotHoursActivityPanel(){ const p=document.getElementById('ph-activity-filter-panel'); if(p) p.style.display = p.style.display==='none'?'block':'none'; }
window.mgrTogglePlotHoursActivityPanel = mgrTogglePlotHoursActivityPanel;

function mgrTogglePlotHoursPlotFilter(id){
  const idx = mgrPlotHoursPlotFilter.indexOf(id);
  if (idx===-1) mgrPlotHoursPlotFilter.push(id); else mgrPlotHoursPlotFilter.splice(idx,1);
  const btn = document.getElementById('ph-plot-filter-btn');
  if (btn) btn.textContent = (mgrPlotHoursPlotFilter.length ? mgrPlotHoursPlotFilter.length+' '+t('mgr.entries.selected') : t('entries.allPlots')) + ' ▾';
  mgrFilterPlotHours();
}
window.mgrTogglePlotHoursPlotFilter = mgrTogglePlotHoursPlotFilter;

function mgrTogglePlotHoursActivityFilter(id){
  const idx = mgrPlotHoursActivityFilter.indexOf(id);
  if (idx===-1) mgrPlotHoursActivityFilter.push(id); else mgrPlotHoursActivityFilter.splice(idx,1);
  const btn = document.getElementById('ph-activity-filter-btn');
  if (btn) btn.textContent = (mgrPlotHoursActivityFilter.length ? mgrPlotHoursActivityFilter.length+' '+t('mgr.entries.selected') : t('mgr.plotHours.allActivities')) + ' ▾';
  mgrFilterPlotHours();
}
window.mgrTogglePlotHoursActivityFilter = mgrTogglePlotHoursActivityFilter;

function mgrSortPlotHours(col){
  if (_mgrPlotHoursSortCol === col) { _mgrPlotHoursSortDir = -_mgrPlotHoursSortDir; }
  else { _mgrPlotHoursSortCol = col; _mgrPlotHoursSortDir = 1; }
  mgrFilterPlotHours();
}
window.mgrSortPlotHours = mgrSortPlotHours;

function _mgrGetFilteredSortedPlotHours(){
  let rows = mgrPlotHoursRows;
  if (mgrPlotHoursPlotFilter.length) rows = rows.filter(r => mgrPlotHoursPlotFilter.includes(r.plotId));
  if (mgrPlotHoursActivityFilter.length) rows = rows.filter(r => mgrPlotHoursActivityFilter.includes(r.activityId));
  rows = rows.slice();
  const sortValue = (r,col) => {
    if (col==='plot') return r.plotName;
    if (col==='activity') return r.activityName;
    if (col==='hours') return r.minutes;
    if (col==='perDunam') return r.dunams>0 ? r.minutes/r.dunams : -1;
    return '';
  };
  if (_mgrPlotHoursSortCol) {
    rows.sort((a,b) => {
      const av=sortValue(a,_mgrPlotHoursSortCol), bv=sortValue(b,_mgrPlotHoursSortCol);
      const cmp = typeof av==='number' ? av-bv : String(av).localeCompare(String(bv),'he');
      return cmp * _mgrPlotHoursSortDir;
    });
  } else {
    rows.sort((a,b) => (a.plotName||'').localeCompare(b.plotName||'','he') || b.minutes-a.minutes);
  }
  return rows;
}

function mgrFilterPlotHours(){
  const content = document.getElementById('plot-hours-content');
  const rows = _mgrGetFilteredSortedPlotHours();
  if (!rows.length) {
    content.innerHTML = `<div class="empty-state" style="padding:16px 0">${t('mgr.plotHours.empty')}</div>`;
    return;
  }
  const arrow = col => _mgrPlotHoursSortCol===col ? (_mgrPlotHoursSortDir===1?' ▲':' ▼') : '';
  const th = (col,label) => `<th onclick="mgrSortPlotHours('${col}')" style="cursor:pointer">${label}${arrow(col)}</th>`;
  content.innerHTML = `
    <div class="wo-table-wrap">
      <table class="wo-table" dir="rtl">
        <colgroup><col style="width:22%"><col style="width:38%"><col style="width:20%"><col style="width:20%"></colgroup>
        <thead><tr>${th('plot',t('mgr.plotHours.colPlot'))}${th('activity',t('mgr.plotHours.colActivity'))}${th('hours',t('mgr.plotHours.colHours'))}${th('perDunam',t('mgr.plotHours.colPerDunam'))}</tr></thead>
        <tbody>${rows.map(r => {
          const hours = r.minutes/60;
          const perDunam = r.dunams>0 ? hours/r.dunams : null;
          return `<tr><td>${r.plotName}</td><td>${r.activityName}</td><td>${hours.toFixed(1)}</td><td>${perDunam!==null?perDunam.toFixed(2):'—'}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

function mgrExportPlotHours(){
  const rows = _mgrGetFilteredSortedPlotHours();
  if (!rows.length) { showToast(t('mgr.export.noData')); return; }
  const headers = [t('mgr.plotHours.colPlot'), t('mgr.plotHours.colActivity'), t('mgr.plotHours.colHours'), t('mgr.plotHours.colPerDunam')];
  const aoa = [headers, ...rows.map(r => {
    const hours = r.minutes/60;
    const perDunam = r.dunams>0 ? hours/r.dunams : null;
    return [r.plotName, r.activityName, Math.round(hours*100)/100, perDunam!==null?Math.round(perDunam*100)/100:''];
  })];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:16},{wch:24},{wch:12},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'שעות לפי חלקה');
  XLSX.writeFile(wb, `rhythmos-plot-hours-${mgrTodayStr()}.xlsx`);
  showToast(t('mgr.export.resultSummary').replace('{count}',rows.length).replace('{workers}','—'));
}
window.mgrExportPlotHours = mgrExportPlotHours;

async function mgrDoExport() {
  const btn = document.getElementById('exp-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-sm"></div>'; }

  try {
    const dateFrom  = document.getElementById('exp-from')?.value;
    const dateTo    = document.getElementById('exp-to')?.value;
    const workerUid = document.getElementById('exp-worker')?.value || '';

    if (!dateFrom || !dateTo) { showToast(t('mgr.export.selectRange')); return; }

    // Build date array for 'in' query (max 10 dates)
    const dates = [];
    const d = new Date(dateFrom);
    const dEnd = new Date(dateTo);
    while (d <= dEnd && dates.length < 30) {
      dates.push(d.toISOString().slice(0,10));
      d.setDate(d.getDate()+1);
    }

    // Fetch in batches of 10 (Firestore 'in' limit)
    let allEntries = [];
    for (let i = 0; i < dates.length; i += 10) {
      const batch = dates.slice(i, i+10);
      let q = db.collection('timeEntries').where('date','in',batch);
      if (workerUid) q = q.where('workerId','==',workerUid);
      const snap = await q.get();
      snap.docs.forEach(d => allEntries.push({id:d.id,...d.data()}));
    }

    // Sort by date, worker, startTime
    allEntries.sort((a,b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.workerId !== b.workerId) return a.workerId.localeCompare(b.workerId);
      return (a.startTime?.toMillis()||0) - (b.startTime?.toMillis()||0);
    });

    // Build Excel rows
    const headers = [
      'תאריך','שם עובד','טלפון','חלקה','גידול + זן','פעילות',
      'התחלה','סיום','נסיעה (דקות)',
      'שעות רגילות','שעות נוספות 125%','שעות נוספות 150%',
      'שעות סוף שבוע','שעות לילה','שעות חופשה','שעות מחלה',
      'הערות','דיווח בעיה','עריכת מנהל'
    ];

    const rows = [headers, ...allEntries.map(e => {
      const act = mgrFindActivity(e.activityId);
      const actName = act ? `${act.nameI18n?.he||''} / ${act.nameI18n?.en||''}` : (e.activityId||'');
      const rnd = v => v ? Math.round(v * 100) / 100 : 0;
      return [
        e.date?fmtStoredDate(e.date):'',
        e.workerName||'',
        e.workerPhone||'',
        e.plotName||'',
        [e.crop||'', e.variety||''].filter(Boolean).join(' - '),
        actName + (e.activityFreeText ? ': ' + e.activityFreeText : ''),
        mgrTo24h(e.startTime),
        mgrTo24h(e.endTime),
        e.travelMinutes||0,
        rnd(e.regularHours),
        rnd(e.overtime1Hours),
        rnd(e.overtime2Hours),
        rnd(e.weekendHours),
        rnd(e.nightHours||0),
        rnd(e.vacationHours),
        rnd(e.sickHours),
        e.notes||'',
        e.flagNote||'',
        e.managerEdit?.reason||'',
      ];
    })];

    // Generate Excel
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Column widths
    ws['!cols'] = [
      {wch:12},{wch:16},{wch:14},{wch:14},{wch:20},{wch:28},
      {wch:8},{wch:8},{wch:10},
      {wch:12},{wch:14},{wch:14},
      {wch:14},{wch:10},{wch:12},{wch:10},
      {wch:24},{wch:24},{wch:20},
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hours Export');
    XLSX.writeFile(wb, `rhythmos-hours-${dateFrom}-${dateTo}.xlsx`);
    showToast(t('mgr.export.resultSummary').replace('{count}',allEntries.length).replace('{workers}',''));
    closeModal('modal-mgr-export');
  } catch(e) {
    console.error('export:', e);
    showToast(t('mgr.wo.error') + ' — ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = t('mgr.export.generate'); }
  }
}

window.mgrShowFarmSettings = mgrShowFarmSettings;
window.mgrSaveFarmSettings = mgrSaveFarmSettings;
window.mgrToggleWeekday = mgrToggleWeekday;
window.mgrShowExport = mgrShowExport;
window.mgrDoExport = mgrDoExport;

// ── FLAG REVIEWED ─────────────────────────────────────────────
async function mgrMarkReviewed(entryId) {
  try {
    await db.collection('timeEntries').doc(entryId).update({ flagReviewed: true, status: 'complete' });
    // Remove from the local list entirely — it no longer matches the
    // flagged-status query this screen is built from, so it shouldn't
    // just be re-sorted within the list, it should actually disappear.
    const idx = mgrAllEntries.findIndex(e => e.id === entryId);
    if (idx !== -1) mgrAllEntries.splice(idx, 1);
    mgrFilterEntries();
    if (mgrCurrentEntryId === entryId) closeModal('modal-mgr-entry-detail');
    showToast(t('mgr.entries.markedHandled'));
    refreshDashboard();
  } catch(e) { showToast(t('mgr.msg.error')); }
}

// ── HOLIDAYS IN FARM SETTINGS ────────────────────────────────
function renderHolidays(holidays) {
  const list = holidays||[];
  return `
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.holidays')}</div>
      ${list.map((h,i) => `
        <div class="farm-field" style="gap:6px">
          ${ddDateField('holiday-date-'+i, h.date, `updateHoliday(${i},'date','{iso}')`)}
          <input class="farm-input farm-input-wide" type="text" value="${h.name}" placeholder="${t('mgr.farm.holidayName')}" onchange="updateHoliday(${i},'name',this.value)" style="flex:1">
          <button onclick="removeHoliday(${i})" style="background:none;border:none;color:var(--crimson);font-size:18px;cursor:pointer;padding:0 4px">✕</button>
        </div>`).join('')}
      <button class="btn-secondary" style="width:auto;padding:8px 14px;margin-top:4px" onclick="addHoliday()">${t('mgr.farm.addHoliday')}</button>
    </div>`;
}

function addHoliday() {
  if (!mgrFarmSettings.holidays) mgrFarmSettings.holidays = [];
  const today = new Date().toISOString().slice(0,10);
  mgrFarmSettings.holidays.push({ date: today, name: '' });
  refreshHolidaysUI();
}

function removeHoliday(i) {
  mgrFarmSettings.holidays.splice(i, 1);
  refreshHolidaysUI();
}

function updateHoliday(i, field, val) {
  if (!mgrFarmSettings.holidays) return;
  mgrFarmSettings.holidays[i][field] = val;
}

function refreshHolidaysUI() {
  const container = document.getElementById('farm-settings-content');
  if (!container) return;
  // Re-render just the holidays section by re-rendering full settings
  renderFarmSettings(mgrFarmSettings);
}

// Override renderFarmSettings to include holidays
const _origRenderFarmSettings = renderFarmSettings;
function renderFarmSettings(s) {
  const container = document.getElementById('farm-settings-content');
  const wdBtns = [0,1,2,3,4,5,6].map(d =>
    `<button class="weekday-btn${(s.weekendDays||[6]).includes(d)?' active':''}" onclick="mgrToggleWeekday(${d})" id="wd-btn-${d}">${DAY_LABELS[d]}</button>`
  ).join('');

  container.innerHTML = `
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.workHours')}</div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.regularHours')}</span><input class="farm-input" id="fs-workday" type="number" min="1" max="24" value="${s.workdayHours||8}"></div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.ot1Hours')}</span><input class="farm-input" id="fs-ot1" type="number" min="0" max="8" step="0.5" value="${s.overtime1MaxHours||2}"></div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.ot1Rate')}</span><input class="farm-input" id="fs-ot1-rate" type="number" min="1" max="3" step="0.01" value="${s.overtime1Rate||1.25}"></div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.ot2Rate')}</span><input class="farm-input" id="fs-ot2-rate" type="number" min="1" max="3" step="0.01" value="${s.overtime2Rate||1.50}"></div>
    </div>
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.nightShift')}</div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.nightStart')}</span><div style="width:140px">${ddTimeField('fs-night-start', s.nightShiftStart||'22:00', '')}</div></div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.nightEnd')}</span><div style="width:140px">${ddTimeField('fs-night-end', s.nightShiftEnd||'06:00', '')}</div></div>
    </div>
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.restDays')}</div>
      <div class="weekday-grid">${wdBtns}</div>
    </div>
    ${renderHolidays(s.holidays)}
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.editReports')}</div>
      <div class="farm-field">
        <span class="farm-label">${t('mgr.farm.allowWorkerEdit')}</span>
        <label class="toggle-switch">
          <input type="checkbox" id="fs-allow-worker-edit" ${s.allowWorkerEditReports?'checked':''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div style="font-size:11px;color:var(--text-muted);padding:0 4px">${t('mgr.farm.allowWorkerEditHint')}</div>
    </div>
    <div class="farm-section">
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.resetHour')}</span><div style="width:140px">${ddTimeField('fs-reset', s.workdayResetHour||'06:00', '')}</div></div>
    </div>
    <div class="farm-section">
      <div class="farm-section-title">${t('mgr.farm.staleEntry')}</div>
      <div class="farm-field"><span class="farm-label">${t('mgr.farm.staleEntryHours')}</span><input class="farm-input" id="fs-stale-hours" type="number" min="1" max="48" step="1" value="${s.staleEntryHours??13}"></div>
      <div style="font-size:11px;color:var(--text-muted);padding:0 4px">${t('mgr.farm.staleEntryHint')}</div>
    </div>
    <div style="padding:16px 20px 32px">
      <button class="btn-primary full-w" onclick="mgrSaveFarmSettings()">${t('mgr.farm.saveSettings')}</button>
    </div>
  `;
}

// Override mgrSaveFarmSettings to include holidays
const _origSave = mgrSaveFarmSettings;
async function mgrSaveFarmSettings() {
  const updated = {
    workdayHours:      parseFloat(document.getElementById('fs-workday')?.value) || 8,
    overtime1MaxHours: parseFloat(document.getElementById('fs-ot1')?.value) || 2,
    overtime1Rate:     parseFloat(document.getElementById('fs-ot1-rate')?.value) || 1.25,
    overtime2Rate:     parseFloat(document.getElementById('fs-ot2-rate')?.value) || 1.50,
    nightShiftStart:   document.getElementById('fs-night-start')?.value || '22:00',
    nightShiftEnd:     document.getElementById('fs-night-end')?.value || '06:00',
    weekendDays:       mgrFarmSettings.weekendDays || [6],
    workdayResetHour:  document.getElementById('fs-reset')?.value || '06:00',
    holidays:          (mgrFarmSettings.holidays||[]).filter(h => h.date && h.name),
    allowWorkerEditReports: document.getElementById('fs-allow-worker-edit')?.checked || false,
    staleEntryHours:   parseFloat(document.getElementById('fs-stale-hours')?.value) || 13,
  };
  try {
    await db.collection('farmSettings').doc('default').set(updated);
    mgrFarmSettings = updated;
    cachedFarmSettings = updated; // keep the worker-side cache in sync too, since it's shared page state
    showToast(t('mgr.farm.settingsSaved'));
    closeModal('modal-mgr-farm');
  } catch(e) { showToast(t('mgr.wo.error') + ' — ' + e.message); }
}

// ── EXCEL EXPORT — ONE SHEET PER WORKER ───────────────────────
async function mgrDoExport() {
  const btn = document.getElementById('exp-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-sm"></div>'; }
  try {
    const dateFrom  = document.getElementById('exp-from')?.value;
    const dateTo    = document.getElementById('exp-to')?.value;
    const workerUid = document.getElementById('exp-worker')?.value || '';
    if (!dateFrom || !dateTo) { showToast(t('mgr.export.selectRange')); return; }

    // Build date array for 'in' queries
    const dates = [];
    const d = new Date(dateFrom);
    const dEnd = new Date(dateTo);
    while (d <= dEnd && dates.length < 30) { dates.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }

    // Fetch all entries
    let allEntries = [];
    for (let i = 0; i < dates.length; i += 10) {
      const batch = dates.slice(i, i+10);
      let q = db.collection('timeEntries').where('date','in',batch);
      if (workerUid) q = q.where('workerId','==',workerUid);
      const snap = await q.get();
      snap.docs.forEach(d => allEntries.push({id:d.id,...d.data()}));
    }
    allEntries.sort((a,b) => { if(a.date!==b.date) return a.date.localeCompare(b.date); return (a.startTime?.toMillis()||0)-(b.startTime?.toMillis()||0); });

    const headers = ['תאריך','יום','כניסה','יציאה','נסיעות (דקות)',
      'סה"כ שעות','שעות רגילות','שעות נוספות 125%','שעות נוספות 150%',
      'שעות סוף שבוע','שעות לילה','שעות חופשה','שעות מחלה',
      'פעילות','חלקה','גידול + זן','הערות','דיווח בעיה','עריכת מנהל'];

    const DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

    // Group by worker
    const byWorker = {};
    allEntries.forEach(e => {
      const key = e.workerId || 'unknown';
      if (!byWorker[key]) byWorker[key] = { name: e.workerName||e.workerPhone||key, phone: e.workerPhone||'', entries: [] };
      byWorker[key].entries.push(e);
    });

    const wb = XLSX.utils.book_new();
    const monthStr = dateFrom.slice(0,7);
    const employerName = 'Rhythmos Farm 37';

    Object.entries(byWorker).forEach(([uid, worker]) => {
      const rows = [];
      // Header rows
      rows.push([employerName, '', '', '', '', `חודש: ${monthStr}`, '', '', '', '', '', '', '', '', '', '', '', '', '']);
      rows.push(['']);
      rows.push([`שם העובד: ${worker.name}`, '', '', '', '', `טלפון: ${worker.phone}`, '', '', '', '', '', '', '', '', '', '', '', '', '']);
      rows.push(['']);
      rows.push(headers);

      worker.entries.forEach(e => {
        const act = mgrFindActivity(e.activityId);
        const actName = act ? (act.nameI18n?.he||act.id) : (e.activityId||'');
        const rnd = v => v ? Math.round(v*100)/100 : 0;
        const startStr = mgrTo24h(e.startTime);
        const endStr   = mgrTo24h(e.endTime);
        const dow = e.date ? new Date(e.date+'T12:00:00').getDay() : null;
        const dayStr = dow!==null ? DAYS_HE[dow] : '';
        const note = e.notes||'', flag = e.flagNote||'', edit = e.managerEdit?.reason||'';
        const actFull = actName + (e.activityFreeText?': '+e.activityFreeText:'');
        const cropVariety = [e.crop||'', e.variety||''].filter(Boolean).join(' - ');

        if (e.plotIds?.length > 1 && e.plotNames?.length > 1) {
          // Multi-plot: split time proportionally by dunams
          const dunams = e.plotDunams || e.plotIds.map(()=>0);
          const totalDunams = dunams.reduce((a,b)=>a+b,0);
          e.plotIds.forEach((pid, pi) => {
            const ratio = totalDunams > 0 ? (dunams[pi]||0)/totalDunams : 1/e.plotIds.length;
            rows.push([
              e.date?fmtStoredDate(e.date):'', dayStr, startStr, endStr,
              rnd((e.travelMinutes||0)*ratio),
              rnd((e.totalHours||0)*ratio),
              rnd((e.regularHours||0)*ratio),
              rnd((e.overtime1Hours||0)*ratio),
              rnd((e.overtime2Hours||0)*ratio),
              rnd((e.weekendHours||0)*ratio),
              rnd((e.nightHours||0)*ratio),
              rnd((e.vacationHours||0)*ratio),
              rnd((e.sickHours||0)*ratio),
              actFull, e.plotNames[pi]||'', cropVariety, note, flag, edit,
            ]);
          });
        } else {
          rows.push([
            e.date?fmtStoredDate(e.date):'', dayStr, startStr, endStr,
            e.travelMinutes||0,
            rnd(e.totalHours),
            rnd(e.regularHours),
            rnd(e.overtime1Hours),
            rnd(e.overtime2Hours),
            rnd(e.weekendHours),
            rnd(e.nightHours||0),
            rnd(e.vacationHours),
            rnd(e.sickHours),
            actFull, e.plotName||'', cropVariety, note, flag, edit,
          ]);
        }
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        {wch:12},{wch:8},{wch:8},{wch:8},{wch:10},
        {wch:10},{wch:12},{wch:14},{wch:14},
        {wch:14},{wch:10},{wch:12},{wch:10},
        {wch:24},{wch:14},{wch:20},
        {wch:24},{wch:24},{wch:20},
      ];
      // Sheet name: worker name (max 31 chars, no special chars)
      const sheetName = (worker.name||'Worker').replace(/[\\\/\?\*\[\]]/g,'').slice(0,31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `rhythmos-hours-${dateFrom}-${dateTo}.xlsx`);
    showToast(t('mgr.export.resultSummary').replace('{count}',allEntries.length).replace('{workers}',Object.keys(byWorker).length));
    closeModal('modal-mgr-export');
  } catch(e) {
    console.error('export:', e);
    showToast(t('mgr.wo.error') + ' — ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = t('mgr.export.generate'); }
  }
}

window.mgrMarkReviewed = mgrMarkReviewed;
window.addHoliday = addHoliday;
window.removeHoliday = removeHoliday;
window.updateHoliday = updateHoliday;
window.changeLanguage = changeLanguage;
window.submitPinChange = submitPinChange;

// ── USER MANAGEMENT ───────────────────────────────────────────
const FB_API_KEY = 'AIzaSyBVjFVF2Xrc1R6Tcc8BGRIilNOa-mlifoA';

async function mgrShowUsers() {
  showModal('modal-mgr-users');
  const container = document.getElementById('users-list');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    const snap = await db.collection('users').get();
    const users = snap.docs.map(d => ({uid:d.id, ...d.data()}))
      .sort((a,b) => {
        if (a.role!==b.role) return a.role==='manager'?-1:1;
        return (a.name||'').localeCompare(b.name||'', 'he');
      });
    if (!users.length) { container.innerHTML = `<div class="empty-state">${t('mgr.user.empty')}</div>`; return; }
    container.innerHTML = users.map(u => `
      <div class="user-row${u.active===false?' inactive':''}" data-uid="${u.uid}" ondblclick="event.stopPropagation();mgrEditUserByUid(this.dataset.uid)">
        <div class="user-info">
          <div class="user-name">
            ${u.name||'—'}
            <span class="user-role-badge ${u.role||'worker'}">${u.role==='manager'?t('mgr.user.manager'):t('mgr.user.worker')}</span>
            ${u.active===false?`<span style="font-size:11px;color:var(--text-muted)">${t('mgr.user.inactive')}</span>`:''}
          </div>
          <div class="user-meta">${u.phone||''} · ${{he:t('mgr.user.langHebrew'),en:'English',th:'ไทย'}[u.language]||u.language||t('mgr.user.langHebrew')}</div>
        </div>
        <div class="user-actions">
          <button class="user-action-btn" onclick="event.stopPropagation();mgrEditUser('${u.uid}','${(u.name||'').replace(/'/g,"\\'")}','${u.phone||''}','${u.role||'worker'}','${u.language||'he'}')">✏️</button>
          <button class="user-action-btn" onclick="event.stopPropagation();mgrToggleActive('${u.uid}',${u.active!==false})">${u.active===false?t('mgr.user.activate'):t('mgr.user.deactivate')}</button>
        </div>
      </div>`).join('');
    mgrRestoreScroll('users');
  } catch(e) { container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`; }
}
async function mgrEditUserByUid(uid){
  if(!uid)return;
  mgrSaveScroll('users');
  const doc=await db.collection('users').doc(uid).get();
  const u=doc.data()||{};
  mgrEditUser(uid,u.name||'',u.phone||'',u.role||'worker',u.language||'he');
}
window.mgrEditUserByUid=mgrEditUserByUid;

function mgrShowAddUser() {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-user-form');
  document.getElementById('user-form-title').textContent = t('mgr.user.addTitle');
  document.getElementById('user-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.user.fullName')}</div>
        <input id="uf-name" class="mgr-edit-input" type="text" placeholder="${t('mgr.user.namePlaceholder')}">
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.user.phone')}</div>
        <input id="uf-phone" class="mgr-edit-input" type="tel" inputmode="numeric" placeholder="0501234567">
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${t('mgr.user.usernameHint')}</div>
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.user.role')}</div>
        <select id="uf-role" class="mgr-edit-input">
          <option value="worker">${t('mgr.user.worker')}</option>
          <option value="manager">${t('mgr.user.manager')}</option>
        </select>
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.user.language')}</div>
        <select id="uf-lang" class="mgr-edit-input">
          <option value="he">${t('mgr.user.langHebrew')}</option>
          <option value="en">English</option>
          <option value="th">ภาษาไทย</option>
        </select>
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.user.initialPin')}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="uf-pin" class="mgr-edit-input" type="text" inputmode="numeric" maxlength="6" value="${pin}" style="flex:1;font-size:20px;letter-spacing:4px;font-family:monospace">
          <button onclick="document.getElementById('uf-pin').value=Math.floor(100000+Math.random()*900000).toString()" style="background:var(--input-bg);border:none;border-radius:6px;padding:8px 10px;cursor:pointer;font-size:14px" title="${t('mgr.user.generateNew')}">🔄</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${t('mgr.user.pinHint')}</div>
      </div>
      <button class="btn-primary full-w" onclick="mgrCreateUser()">${t('mgr.user.createBtn')}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-user-form')">${t('mgr.user.cancel')}</button>
    </div>`;
}

async function mgrCreateUser() {
  const name  = document.getElementById('uf-name')?.value.trim();
  const phone = document.getElementById('uf-phone')?.value.replace(/\D/g,''); // strip anything non-numeric
  const role  = document.getElementById('uf-role')?.value || 'worker';
  const lang  = document.getElementById('uf-lang')?.value || 'he';
  const pin   = document.getElementById('uf-pin')?.value.trim();

  if (!name)  { showToast(t('mgr.user.enterName')); return; }
  if (!phone || phone.length < 9 || phone.length > 10 || phone[0] !== '0') {
    showToast(t('mgr.user.invalidPhone')); return;
  }
  if (!pin || !/^\d{6}$/.test(pin)) { showToast(t('mgr.user.pinDigits')); return; }

  const btn = document.querySelector('#user-form-content .btn-primary');
  if (btn) { btn.disabled=true; btn.textContent=t('mgr.user.creating'); }

  try {
    const email = `${phone}@rhythmos.ag`;
    // Create Firebase Auth user via REST API (does not affect current session)
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_API_KEY}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, password: pin, returnSecureToken: true })
    });
    const data = await res.json();
    if (data.error) {
      console.error('Firebase signUp error:', JSON.stringify(data.error));
      const code = data.error.message || '';
      if (code.includes('EMAIL_EXISTS'))   throw new Error(t('mgr.user.phoneExists'));
      if (code.includes('WEAK_PASSWORD'))  throw new Error(t('mgr.user.weakPin'));
      if (code.includes('INVALID_EMAIL'))  throw new Error(t('mgr.user.invalidPhoneFormat'));
      if (code.includes('OPERATION_NOT_ALLOWED')) throw new Error(t('mgr.user.passwordDisabled'));
      throw new Error(code || `HTTP ${res.status}`);
    }
    const uid = data.localId;

    // Create Firestore user document
    await db.collection('users').doc(uid).set({ name, phone, role, language: lang, active: true });

    // Show success with PIN
    document.getElementById('user-form-content').innerHTML = `
      <div class="mgr-edit-form" style="text-align:center">
        <div style="font-size:36px">✅</div>
        <div style="font-weight:700;font-size:16px">${name} ${t('mgr.user.addedSuccess')}</div>
        <div style="color:var(--text-muted);font-size:13px">${email}</div>
        <div style="margin:16px 0">
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">${t('mgr.user.firstLoginPin')}</div>
          <div class="pin-display">${pin}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px">${t('mgr.user.pinWarning')}</div>
        </div>
        <button class="btn-primary full-w" onclick="closeModal('modal-mgr-user-form');mgrShowUsers()">${t('mgr.user.close')}</button>
      </div>`;
    // Reload worker list for filter dropdowns
    loadWorkers();
  } catch(e) {
    if (btn) { btn.disabled=false; btn.textContent=t('mgr.user.createBtn'); }
    const msg = e.message.includes('EMAIL_EXISTS') ? t('mgr.user.phoneAlreadyRegistered') : e.message;
    showToast('שגיאה: ' + msg);
  }
}

function mgrEditUser(uid, name, phone, role, lang) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-user-form');
  document.getElementById('user-form-title').textContent = t('mgr.user.editTitle');
  document.getElementById('user-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.user.fullName')}</div>
        <input id="uf-edit-name" class="mgr-edit-input" type="text" value="${name}">
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.user.phoneNoChange')}</div>
        <input class="mgr-edit-input" type="text" value="${phone}" disabled style="opacity:0.5">
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.user.role')}</div>
        <select id="uf-edit-role" class="mgr-edit-input">
          <option value="worker"${role==='worker'?' selected':''}>${t('mgr.user.worker')}</option>
          <option value="manager"${role==='manager'?' selected':''}>${t('mgr.user.manager')}</option>
        </select>
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.user.language')}</div>
        <select id="uf-edit-lang" class="mgr-edit-input">
          <option value="he"${lang==='he'?' selected':''}>${t('mgr.user.langHebrew')}</option>
          <option value="en"${lang==='en'?' selected':''}>English</option>
          <option value="th"${lang==='th'?' selected':''}>ภาษาไทย</option>
        </select>
      </div>
      <div style="background:var(--input-bg);border-radius:var(--radius-sm);padding:12px;font-size:12px;color:var(--text-muted)">
        <div style="margin-bottom:8px">${t('mgr.user.resetPinHint').replace('{phone}',phone)}</div>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn-ghost" style="flex:1;padding:8px;font-size:12px" onclick="mgrCopyUserEmail('${phone}')">📋 ${t('mgr.user.copyEmail')}</button>
          <a href="https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/users" target="_blank" rel="noopener" class="btn-ghost" style="flex:1;padding:8px;font-size:12px;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center">🔗 ${t('mgr.user.openConsole')}</a>
        </div>
      </div>
      <button class="btn-primary full-w" onclick="mgrSaveEditUser('${uid}')">${t('mgr.user.saveChanges')}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-user-form')">${t('mgr.user.cancel')}</button>
    </div>`;
}

// Copies the exact login email (matching PHONE_DOMAIN, the same constant
// the app itself uses to construct fake-but-valid auth emails) so a
// manager doesn't need to manually reconstruct it when searching for the
// user in the Firebase Console.
function mgrCopyUserEmail(phone) {
  const email = phone + PHONE_DOMAIN;
  navigator.clipboard.writeText(email).then(() => {
    showToast(t('mgr.user.emailCopied'));
  }).catch(() => {
    showToast(email); // fallback: at least show it if clipboard access fails
  });
}
window.mgrCopyUserEmail = mgrCopyUserEmail;

async function mgrSaveEditUser(uid) {
  const name = document.getElementById('uf-edit-name')?.value.trim();
  const role = document.getElementById('uf-edit-role')?.value || 'worker';
  const lang = document.getElementById('uf-edit-lang')?.value || 'he';
  if (!name) { showToast(t('mgr.user.enterName')); return; }
  try {
    await db.collection('users').doc(uid).update({ name, role, language: lang });
    showToast(t('mgr.user.changesSaved'));
    closeModal('modal-mgr-user-form');
    mgrShowUsers();
    loadWorkers();
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

async function mgrToggleActive(uid, currentlyActive) {
  const newState = !currentlyActive;
  const label = newState ? t('mgr.user.activated') : t('mgr.user.deactivated');
  try {
    await db.collection('users').doc(uid).update({ active: newState });
    showToast(t('mgr.user.userStatusChanged').replace('{label}',label));
    mgrShowUsers();
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

async function mgrExportLoginLog() {
  try {
    const [logsSnap, usersSnap] = await Promise.all([
      db.collection('loginLogs').orderBy('timestamp','desc').limit(5000).get(),
      db.collection('users').get()
    ]);
    if (logsSnap.empty) { showToast('אין רשומות התחברות'); return; }

    const userMap = {};
    usersSnap.docs.forEach(d => { userMap[d.id] = d.data(); });

    const rows = logsSnap.docs.map(d => {
      const l = d.data();
      const u = userMap[l.uid] || {};
      const ts = l.timestamp ? l.timestamp.toDate() : null;
      return {
        'שם':     u.name  || '(נמחק)',
        'טלפון':  l.phone || u.phone || '',
        'תפקיד':  u.role === 'manager' ? 'מנהל' : 'עובד',
        'תאריך':  ts ? ts.toLocaleDateString('he-IL') : '',
        'שעה':    ts ? ts.toLocaleTimeString('he-IL',{hour12:false}) : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'התחברויות');
    const dateStr = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `login-log-${dateStr}.xlsx`);
  } catch(e) {
    // Deliberately generic — do not reveal whether this failed due to
    // permissions or a real error. Only the owner should ever succeed here.
    console.warn('login log export failed:', e);
  }
}
window.mgrExportLoginLog = mgrExportLoginLog;

window.mgrShowUsers = mgrShowUsers;
window.mgrShowAddUser = mgrShowAddUser;
window.mgrCreateUser = mgrCreateUser;
window.mgrEditUser = mgrEditUser;
window.mgrSaveEditUser = mgrSaveEditUser;
window.mgrToggleActive = mgrToggleActive;

// ── PLOT MANAGEMENT ───────────────────────────────────────────
async function mgrShowPlots() {
  showModal('modal-mgr-plots');
  const container = document.getElementById('plots-list');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    const snap = await db.collection('plots').orderBy('name').get();
    if (snap.empty) {
      container.innerHTML = `
        <div class="empty-state" style="padding:24px;text-align:center">
          <div style="font-size:13px;color:var(--text-muted)">${t('mgr.plot.empty')}</div>
        </div>`;
      return;
    }
    container.innerHTML = snap.docs.map(doc => {
      const p = doc.data();
      const hasPolygon = (p.polygon||[]).length >= 3;
      return `<div class="plot-row${p.active===false?' inactive':''}" ondblclick="event.stopPropagation();mgrEditPlotSafe('${doc.id}')">
        <div class="plot-info">
          <div class="plot-name"><strong>${p.name||'—'}</strong><span class="plot-meta-inline">${p.variety?' · '+p.variety:''}${p.dunams?' · '+p.dunams+' '+t('mgr.plot.dunam'):''} · ⏱ ${p.travelMinutes||0} דק'${!hasPolygon?` · <span style="color:#c62828">${t('mgr.plot.noPolygon')}</span>`:''}</span>${p.active===false?` <span style="font-size:11px;color:var(--text-muted)">${t('mgr.plot.inactive')}</span>`:''}</div>
        </div>
        <div class="user-actions">
          <button class="user-action-btn" onclick="event.stopPropagation();mgrEditPlotSafe('${doc.id}')">✏️</button>
          <button class="user-action-btn" onclick="event.stopPropagation();mgrTogglePlotActive('${doc.id}',${p.active!==false})">${p.active===false?t('mgr.plot.activate'):t('mgr.plot.deactivate')}</button>
          <button class="user-action-btn" style="color:#c62828" onclick="event.stopPropagation();mgrDeletePlot('${doc.id}','${(p.name||'').replace(/'/g,"\\'")}')">🗑</button>
        </div>
      </div>`;
    }).join('');
    mgrRestoreScroll('plots');
  } catch(e) {
    container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  }
}
function mgrEditPlotSafe(id){mgrSaveScroll('plots');mgrShowEditPlot(id);}
window.mgrEditPlotSafe=mgrEditPlotSafe;

// ── Scroll position memory ───────────────────────────────────
const _scrollPos = {};
function mgrSaveScroll(key) {
  const modal = document.getElementById(`modal-mgr-${key}`);
  const body = modal?.querySelector('.modal-body');
  if (body) _scrollPos[key] = body.scrollTop;
}
function mgrRestoreScroll(key) {
  setTimeout(() => {
    const modal = document.getElementById(`modal-mgr-${key}`);
    const body = modal?.querySelector('.modal-body');
    if (body) body.scrollTop = _scrollPos[key] || 0;
  }, 60);
}

// ── Global state for map drawing ─────────────────────────────
let _plotMap = null, _plotPolygon = null, _plotPoints = [], _plotMapMode = 'map';

function plotFormHTML(data={}, docId=null) {
  const existingPoly = (data.polygon||[]).map(p=>Array.isArray(p)?`${p[0]},${p[1]}`:`${p.lat},${p.lng}`).filter(Boolean).join('\n');
  const saveId = docId ? `'${docId}'` : 'null';
  return `
    <div class="mgr-edit-form">
      <div class="pf-layout">
        <!-- Right column: fields -->
        <div class="pf-fields-col">
          <div>
            <div class="mgr-edit-label">${t('mgr.plot.name')}</div>
            <input id="pf-name" class="mgr-edit-input" type="text" value="${data.name||''}">
          </div>
          <div>
            <div class="mgr-edit-label">${t('mgr.plot.crop')}</div>
            <select id="pf-crop" class="mgr-edit-input">
              <option value="">${t('mgr.plot.selectCrop')}</option>
              ${(window.mgrCropOptions||[]).map(cr=>`<option value="${cr.id}"${(data.cropId||'')===(cr.id)?' selected':''}>${cr.nameI18n?.he||cr.id}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="mgr-edit-label">${t('mgr.plot.variety')}</div>
            <input id="pf-variety" class="mgr-edit-input" type="text" placeholder="Crimson Seedless" value="${data.variety||''}">
          </div>
          <div style="display:flex;gap:8px">
            <div style="flex:1">
              <div class="mgr-edit-label">${t('mgr.plot.travel')}</div>
              <input id="pf-travel" class="mgr-edit-input" type="number" min="0" max="120" value="${data.travelMinutes||0}">
            </div>
            <div style="flex:1">
              <div class="mgr-edit-label">${t('mgr.plot.area')}</div>
              <input id="pf-dunams" class="mgr-edit-input" type="number" min="0" step="0.1" value="${data.dunams||0}">
            </div>
          </div>
          ${docId && data.standardTimes && Object.keys(data.standardTimes).length ? `
          <div>
            <div class="mgr-edit-label">${t('mgr.plot.standardTimes')}</div>
            <div style="background:var(--input-bg);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px">
              ${Object.entries(data.standardTimes).map(([actId, st]) => {
                const act = mgrFindActivity(actId);
                const name = act ? (act.nameI18n?.[currentLang]||act.nameI18n?.he||actId) : actId;
                return `<div style="display:flex;justify-content:space-between;padding:3px 0">
                  <span>${name}</span><span style="color:var(--text-muted)">${(st.minutesPerDunam/60).toFixed(2)} ${t('mgr.plot.hoursPerDunam')}</span>
                </div>`;
              }).join('')}
            </div>
          </div>` : ''}
          <div class="pf-btn-row">
            <button class="pf-btn pf-btn-cancel" onclick="closeModal('modal-mgr-plot-form')">${t('mgr.plot.cancel')}</button>
            <button class="pf-btn pf-btn-save" onclick="mgrSavePlot(${saveId})">${docId?t('mgr.plot.saveChanges'):t('mgr.plot.addBtn')}</button>
          </div>
        </div>
        <!-- Left column: map -->
        <div class="pf-map-col">
          <div style="display:flex;gap:6px;margin-bottom:4px">
            <button class="map-tab-btn active" id="tab-map" onclick="mgrSwitchPlotTab('map')">${t('mgr.plot.tabDraw')}</button>
            <button class="map-tab-btn" id="tab-coords" onclick="mgrSwitchPlotTab('coords')">${t('mgr.plot.tabCoords')}</button>
          </div>
          <div id="pf-map-panel">
            <div class="plot-map-toolbar">
              <button class="map-tool-btn active" id="btn-draw" onclick="mgrSetDrawMode(true)">${t('mgr.plot.toolDraw')}</button>
              <button class="map-tool-btn" onclick="mgrUndoLastPoint()">${t('mgr.plot.toolUndo')}</button>
              <button class="map-tool-btn danger" onclick="mgrClearPolygon()">${t('mgr.plot.toolClear')}</button>
              <button class="map-tool-btn" onclick="mgrCenterMapGPS()">${t('mgr.plot.toolGPS')}</button>
              <button class="map-tool-btn" id="btn-maptype" onclick="mgrToggleMapType()">${t('mgr.plot.toolSatellite')}</button>
              <span class="plot-point-count" id="pf-point-count"></span>
            </div>
            <div id="pf-map" class="plot-map-container" style="height:340px"></div>
            <div class="coord-hint" style="margin-top:4px;font-size:11px">${t('mgr.plot.mapHint')}</div>
          </div>
          <div id="pf-coords-panel" style="display:none">
            <textarea id="pf-polygon" class="coord-textarea" rows="14" placeholder="32.192507,34.923707&#10;32.192709,34.923881&#10;...">${existingPoly}</textarea>
            <div class="coord-hint" style="font-size:11px">${t('mgr.plot.coordHint')}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function mgrSwitchPlotTab(tab) {
  _plotMapMode = tab;
  document.getElementById('pf-map-panel').style.display    = tab==='map'    ? '' : 'none';
  document.getElementById('pf-coords-panel').style.display = tab==='coords' ? '' : 'none';
  document.getElementById('tab-map').className    = 'map-tab-btn' + (tab==='map'    ? ' active' : '');
  document.getElementById('tab-coords').className = 'map-tab-btn' + (tab==='coords' ? ' active' : '');
  if (tab==='map') setTimeout(()=>mgrInitMap(), 100);
  else {
    // Sync map polygon to textarea
    const pts = _plotPoints.map(p=>`${p.lat().toFixed(6)},${p.lng().toFixed(6)}`).join('\n');
    const ta = document.getElementById('pf-polygon');
    if (ta && pts) ta.value = pts;
  }
}

function mgrInitMap(existingPolygon) {
  const mapEl = document.getElementById('pf-map');
  if (!mapEl || !window.google) return;
  // Default center: Israel
  const center = {lat:31.55, lng:34.85};
  _plotMap = new google.maps.Map(mapEl, {
    zoom:15, center, mapTypeId:'roadmap',
    disableDefaultUI:true, zoomControl:true,
    gestureHandling:'greedy',
  });
  _plotPolygon = new google.maps.Polygon({
    map: _plotMap, strokeColor:'#FF4444', strokeWeight:2,
    fillColor:'#FF4444', fillOpacity:0.15, editable:false, clickable:false,
  });
  _plotPoints = [];
  mgrUpdatePointCount();

  // Load existing polygon if editing
  const existing = existingPolygon || [];
  if (existing.length >= 2) {
    existing.forEach(p => {
      const lat = Array.isArray(p) ? p[0] : p.lat;
      const lng = Array.isArray(p) ? p[1] : p.lng;
      mgrAddMapPoint({latLng: new google.maps.LatLng(lat, lng)});
    });
    // Wait for map to be ready before fitting bounds
    google.maps.event.addListenerOnce(_plotMap, 'idle', () => {
      google.maps.event.trigger(_plotMap, 'resize');
      const bounds = new google.maps.LatLngBounds();
      existing.forEach(p => {
        const lat = Array.isArray(p) ? p[0] : p.lat;
        const lng = Array.isArray(p) ? p[1] : p.lng;
        bounds.extend({lat, lng});
      });
      _plotMap.fitBounds(bounds, 60);
    });
  }

  // Click to add point
  _plotMap.addListener('click', e => {
    const btn = document.getElementById('btn-draw');
    if (!btn || !btn.classList.contains('active')) return;
    mgrAddMapPoint(e);
  });
}

function mgrAddMapPoint(event) {
  const ll = event.latLng;
  const marker = new google.maps.Marker({
    position: ll, map: _plotMap, draggable: true,
    icon:{ path:google.maps.SymbolPath.CIRCLE, scale:6,
      fillColor:'#FF4444', fillOpacity:1, strokeColor:'#fff', strokeWeight:1.5 },
  });
  marker.addListener('click', () => {
    const idx = _plotPoints.indexOf(marker);
    if (idx >= 0) { _plotPoints.splice(idx,1); marker.setMap(null); mgrRedrawPolygon(); }
  });
  marker.addListener('drag', () => mgrRedrawPolygon());
  _plotPoints.push(marker);
  mgrRedrawPolygon();
}

function mgrRedrawPolygon() {
  const path = _plotPoints.map(m => m.getPosition());
  _plotPolygon.setPath(path);
  mgrUpdatePointCount();
}

function mgrUndoLastPoint() {
  const m = _plotPoints.pop();
  if (m) { m.setMap(null); mgrRedrawPolygon(); }
}

function mgrClearPolygon() {
  _plotPoints.forEach(m => m.setMap(null));
  _plotPoints = [];
  mgrRedrawPolygon();
}

function mgrSetDrawMode(active) {
  const btn = document.getElementById('btn-draw');
  if (btn) btn.className = 'map-tool-btn' + (active ? ' active' : '');
}

function mgrUpdatePointCount() {
  const el = document.getElementById('pf-point-count');
  if (el) el.textContent = _plotPoints.length ? `${_plotPoints.length} ${t('mgr.plot.points')}` : '';
}

function mgrCenterMapGPS() {
  if (!navigator.geolocation || !_plotMap) return;
  navigator.geolocation.getCurrentPosition(pos => {
    _plotMap.setCenter({lat:pos.coords.latitude, lng:pos.coords.longitude});
    _plotMap.setZoom(17);
  }, () => showToast(t('mgr.plot.gpsUnavailable')));
}

async function mgrShowAddPlot() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-plot-form');
  document.getElementById('plot-form-title').textContent = t('mgr.plot.addTitle');
  await mgrLoadCropOptions();
  document.getElementById('plot-form-content').innerHTML = plotFormHTML();
  setTimeout(() => mgrInitMap(), 200);
}

async function mgrShowEditPlot(docId) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-plot-form');
  document.getElementById('plot-form-title').textContent = t('mgr.plot.editTitle');
  document.getElementById('plot-form-content').innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  await mgrLoadCropOptions();
  const doc = await db.collection('plots').doc(docId).get();
  const data = doc.data()||{};
  document.getElementById('plot-form-content').innerHTML = plotFormHTML(data, docId);
  setTimeout(() => mgrInitMap(data.polygon||[]), 200);
}

async function mgrSavePlot(docId) {
  const name    = document.getElementById('pf-name')?.value.trim();
  const variety = document.getElementById('pf-variety')?.value.trim()||'';
  const travel  = parseInt(document.getElementById('pf-travel')?.value)||0;
  const dunams  = parseFloat(document.getElementById('pf-dunams')?.value)||0;

  if (!name) { showToast(t('mgr.plot.enterName')); return; }

  let polygon = [];
  if (_plotMapMode === 'map' && _plotPoints.length >= 3) {
    // Get from map markers
    polygon = _plotPoints.map(m => ({lat:m.getPosition().lat(), lng:m.getPosition().lng()}));
  } else {
    // Get from textarea
    const polyRaw = document.getElementById('pf-polygon')?.value||'';
    polygon = polyRaw.trim().split('\n')
      .map(l => l.trim()).filter(l => l.includes(','))
      .map(l => { const [a,b] = l.split(',').map(Number); return {lat:a,lng:b}; })
      .filter(p => !isNaN(p.lat) && !isNaN(p.lng));
  }
  // polygon can be empty — saved as placeholder, no GPS auto-detection

  const cropId = document.getElementById('pf-crop')?.value || null;
  const cropName = window.mgrCropOptions?.find(c=>c.id===cropId)?.nameI18n?.he || 'tableGrapes';
  const plotData = { name, variety, crop:'tableGrapes', cropId: cropId||null, travelMinutes:travel, dunams, polygon, active:true };

  try {
    if (docId) {
      await db.collection('plots').doc(docId).update(plotData);
      showToast(t('mgr.plot.updated'));
    } else {
      await db.collection('plots').add(plotData);
      showToast(t('mgr.plot.added'));
    }
    closeModal('modal-mgr-plot-form');
    mgrShowPlots();
    // Invalidate plots cache so workers get fresh data
    localStorage.removeItem('rh_plots');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

async function mgrTogglePlotActive(docId, currentlyActive) {
  try {
    await db.collection('plots').doc(docId).update({ active: !currentlyActive });
    showToast(!currentlyActive ? t('mgr.plot.activated') : t('mgr.plot.deactivated'));
    mgrShowPlots();
    localStorage.removeItem('rh_plots');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

async function mgrSeedDefaultPlots() {
  if (!confirm || typeof DEFAULT_PLOTS === 'undefined') return;
  try {
    const batch = db.batch();
    // We can't access DEFAULT_PLOTS from manager.js — call app's exposed version
    const defaults = typeof window.getDefaultPlots === 'function' ? window.getDefaultPlots() : [];
    if (!defaults.length) { showToast(t('mgr.plot.noDefaults')); return; }
    defaults.forEach(p => {
      const ref = db.collection('plots').doc(p.id);
      batch.set(ref, {name:p.name,variety:p.variety||'',crop:p.crop||'tableGrapes',
        travelMinutes:p.travelMinutes||0,
        polygon:(p.polygon||[]).map(([lat,lng])=>({lat,lng})),
        active:true});
    });
    await batch.commit();
    showToast(t('mgr.plot.seedLoaded').replace('{count}',defaults.length));
    mgrShowPlots();
    localStorage.removeItem('rh_plots');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

// ── PLOT FILE IMPORT ──────────────────────────────────────────
function mgrHandleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = ''; // reset so same file can be re-selected

  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      let rows = [];
      if (isCsv) {
        // Parse CSV
        const text = e.target.result;
        rows = text.trim().split('\n').map(line =>
          line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        );
      } else {
        // Parse Excel with SheetJS
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:false});
      }

      // Skip header row if first cell looks like a label
      const firstCell = String(rows[0]?.[0]||'').toLowerCase();
      if (['plot','name','חלקה','plot name','plot_name'].includes(firstCell) || firstCell.startsWith('plot')) rows = rows.slice(1);

      // Detect format by column count (5-col new, 3-col old)
      const sampleRow = rows.find(r=>r.some(v=>String(v||'').trim())) || [];
      const isNewFormat = sampleRow.length >= 5;

      // Group by plot name
      const plotMap = {};
      rows.forEach(row => {
        const name = String(row[0]||'').trim();
        if (!name) return;
        let lat, lng, crop='', variety='';
        if (isNewFormat) {
          // New: plot name | crop | variety | longitude | latitude
          crop    = String(row[1]||'').trim();
          variety = String(row[2]||'').trim();
          lng     = parseFloat(String(row[3]||'').trim());
          lat     = parseFloat(String(row[4]||'').trim());
        } else {
          // Old: plot name | latitude | longitude
          lat = parseFloat(String(row[1]||'').trim());
          lng = parseFloat(String(row[2]||'').trim());
        }
        if (isNaN(lat) || isNaN(lng)) return;
        if (!plotMap[name]) plotMap[name] = { polygon:[], crop, variety };
        else if (isNewFormat) {
          // Keep first row's crop/variety (ignore inconsistent subsequent rows)
        }
        plotMap[name].polygon.push([lat, lng]);
      });

      if (!Object.keys(plotMap).length) {
        showToast(t('mgr.plot.noPlotsInFile')); return;
      }
      mgrShowImportPreview(plotMap);
    } catch(e) {
      console.error('Import error:', e);
      showToast(t('mgr.plot.readError').replace('{msg}',e.message));
    }
  };

  if (isCsv) reader.readAsText(file, 'UTF-8');
  else reader.readAsArrayBuffer(file);
}

function mgrShowImportPreview(plotMap) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-plot-import');
  const plots = Object.entries(plotMap);
  const container = document.getElementById('plot-import-content');

  container.innerHTML = `
    <div style="padding:12px 16px;background:var(--input-bg);font-size:13px;color:var(--text-muted)">
      ${t('mgr.plot.foundInFile').replace('{count}',plots.length)}
    </div>
    <div id="import-preview-list">
      ${plots.map(([name, data]) => {
        const polygon = Array.isArray(data) ? data : data.polygon;
        const crop    = Array.isArray(data) ? '' : (data.crop||'');
        const variety = Array.isArray(data) ? '' : (data.variety||'');
        const ok = polygon.length >= 3;
        return `<div class="import-preview-row">
          <div class="import-preview-name">${name}${crop?'<br><span style="font-size:11px;color:var(--text-muted)">'+crop+(variety?' · '+variety:'')+'</span>':''}</div>
          <div class="import-preview-pts">${polygon.length} ${t('mgr.plot.points')}</div>
          <div class="import-preview-status ${ok?'ok':'warn'}">${ok?t('mgr.plot.valid'):t('mgr.plot.lessThan3')}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="padding:16px 20px 32px;display:flex;gap:10px">
      <button class="btn-primary" style="flex:1" id="btn-confirm-import">
        ${t('mgr.plot.importAll').replace('{count}',plots.filter(([,d])=>(Array.isArray(d)?d:d.polygon).length>=3).length)}
      </button>
      <button class="btn-ghost" style="flex:1" onclick="closeModal('modal-mgr-plot-import')">${t('mgr.plot.cancel2')}</button>
    </div>`;

  // Store plotMap on the button via closure
  document.getElementById('btn-confirm-import').onclick = () => mgrConfirmImport(plotMap);
}

async function mgrConfirmImport(plotMap) {
  const btn = document.getElementById('btn-confirm-import');
  if (btn) { btn.disabled = true; btn.textContent = t('mgr.plot.importing'); }

  try {
    await mgrLoadCropOptions();
    const batch = db.batch();
    let count = 0;
    Object.entries(plotMap).forEach(([name, data]) => {
      const polygon = Array.isArray(data) ? data : data.polygon;
      const cropName = Array.isArray(data) ? '' : (data.crop||'');
      const variety  = Array.isArray(data) ? '' : (data.variety||'');
      if (polygon.length < 3) return;
      // Match crop name to Firestore crop
      const matchedCrop = (window.mgrCropOptions||[]).find(c=>
        c.nameI18n?.he===cropName || (c.nameI18n?.en||'').toLowerCase()===cropName.toLowerCase()
      );
      // Use Firestore auto-generated ID (fixes Hebrew name collision bug)
      batch.set(db.collection('plots').doc(), {
        name, variety, crop:'tableGrapes',
        cropId: matchedCrop?.id || null,
        travelMinutes: 0,
        polygon: polygon.map(p=>Array.isArray(p)?{lat:p[0],lng:p[1]}:p),
        active: true
      });
      count++;
    });
    await batch.commit();
    localStorage.removeItem('rh_plots');
    showToast(t('mgr.plot.imported').replace('{count}',count));
    closeModal('modal-mgr-plot-import');
    mgrShowPlots();
  } catch(e) {
    showToast('שגיאה: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = t('mgr.plot.importAllBtn'); }
  }
}

function mgrToggleMapType() {
  if (!_plotMap) return;
  const isSatellite = _plotMap.getMapTypeId() === 'satellite';
  _plotMap.setMapTypeId(isSatellite ? 'roadmap' : 'satellite');
  const btn = document.getElementById('btn-maptype');
  if (btn) btn.textContent = isSatellite ? t('mgr.plot.toolSatellite') : t('mgr.plot.toolMap');
}

window.mgrToggleMapType = mgrToggleMapType;

async function mgrLoadCropOptions() {
  try {
    const snap = await db.collection('crops').where('active','==',true).get();
    window.mgrCropOptions = snap.docs.map(d=>({id:d.id,...d.data()}));
  } catch(e) { window.mgrCropOptions = []; }
}
async function mgrDeletePlot(docId, name) {
  if (!await customConfirm(t('mgr.plot.deleteConfirm').replace('{name}',name))) return;
  try {
    await db.collection('plots').doc(docId).delete();
    localStorage.removeItem('rh_plots');
    showToast(t('mgr.plot.deleted'));
    mgrShowPlots();
  } catch(e) { showToast('שגיאה: ' + e.message); }
}
window.mgrDeletePlot = mgrDeletePlot;

window.mgrShowAddPlot = mgrShowAddPlot;
window.mgrShowEditPlot = mgrShowEditPlot;
window.mgrSavePlot = mgrSavePlot;
window.mgrTogglePlotActive = mgrTogglePlotActive;
window.mgrSeedDefaultPlots = mgrSeedDefaultPlots;
window.mgrSwitchPlotTab = mgrSwitchPlotTab;
window.mgrUndoLastPoint = mgrUndoLastPoint;
window.mgrClearPolygon = mgrClearPolygon;
window.mgrSetDrawMode = mgrSetDrawMode;
window.mgrCenterMapGPS = mgrCenterMapGPS;
window.mgrHandleImportFile = mgrHandleImportFile;
window.mgrConfirmImport = mgrConfirmImport;

// ── CROP & ACTIVITY MANAGEMENT ────────────────────────────────
const DEFAULT_TABLE_GRAPE_IDS = [
  'winter-pruning','cane-tying','suckering','shoot-thinning','cluster-thinning',
  'shoot-tucking','topping','berry-thinning','girdling','leaf-removal',
  'manual-harvest','net-covering','net-removal',
  'spraying','soil-cultivation','mechanical-topping','mechanical-leaf-removal','fruit-transport'
];

// Auto-translate Hebrew text to EN, TH, AR via MyMemory
async function autoTranslate(heText) {
  const translate = async (target) => {
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(heText)}&langpair=he|${target}`);
      const data = await res.json();
      return data.responseData?.translatedText || heText;
    } catch(e) { return heText; }
  };
  const [en, th, ar] = await Promise.all([translate('en'), translate('th'), translate('ar')]);
  return { he: heText, en, th, ar };
}

// ── CROP LIST ─────────────────────────────────────────────────
async function mgrShowCrops() {
  showModal('modal-mgr-crops');
  const container = document.getElementById('crops-list');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    const snap = await db.collection('crops').orderBy('nameI18n.he').get();
    if (snap.empty) {
      container.innerHTML = `
        <div style="padding:20px;text-align:center">
          <div style="color:var(--text-muted);font-size:13px;margin-bottom:12px">${t('mgr.crop.empty')}</div>
          <button class="btn-secondary" style="width:auto;padding:8px 16px" onclick="mgrSeedTableGrapes()">${t('mgr.crop.seedDefault')}</button>
        </div>`;
      return;
    }
    container.innerHTML = snap.docs.map(doc => {
      const cr = doc.data();
      return `<div class="crop-row${cr.active===false?' inactive':''}" ondblclick="mgrShowEditCropSave('${doc.id}')">
        <div class="crop-info">
          <div class="crop-name-main">${cr.nameI18n?.he||'—'} ${cr.active===false?`<span style="font-size:11px;color:var(--text-muted)">${t('mgr.crop.inactive')}</span>`:''}</div>
          <div class="crop-name-sub">${cr.nameI18n?.en||''}</div>
        </div>
        <div class="user-actions">
          <button class="user-action-btn" onclick="event.stopPropagation();mgrShowCropActivities('${doc.id}','${(cr.nameI18n?.he||'').replace(/'/g,"\\'")}')">${t('mgr.crop.activities')}</button>
          <button class="user-action-btn" onclick="event.stopPropagation();mgrShowEditCropSave('${doc.id}')">✏️</button>
          <button class="user-action-btn" onclick="event.stopPropagation();mgrToggleCropActive('${doc.id}',${cr.active!==false})">${cr.active===false?'✓':'✕'}</button>
        </div>
      </div>`;
    }).join('');
    mgrRestoreScroll('crops');
  } catch(e) { container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`; }
}

function mgrShowEditCropSave(docId) { mgrSaveScroll('crops'); mgrShowEditCrop(docId); }
window.mgrShowEditCropSave = mgrShowEditCropSave;

function mgrShowAddCrop() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-crop-form');
  document.getElementById('crop-form-title').textContent = t('mgr.crop.addTitle');
  document.getElementById('crop-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.crop.nameHe')}</div>
        <input id="cf-he" class="mgr-edit-input" type="text" placeholder="${t('mgr.crop.namePlaceholder')}">
      </div>
      <div id="cf-translations">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div class="mgr-edit-label" style="margin-bottom:0">${t('mgr.crop.translations')}</div>
          <button id="cf-translate-btn" type="button" class="btn-ghost" style="padding:4px 10px;font-size:12px" onclick="mgrTranslateCrop()">${t('mgr.crop.translate')}</button>
        </div>
        <div class="translation-grid">
          <div class="translation-field"><span class="translation-label">English</span><input id="cf-en" class="translation-input" type="text" dir="ltr"></div>
          <div class="translation-field"><span class="translation-label">ภาษาไทย</span><input id="cf-th" class="translation-input" type="text" dir="ltr"></div>
          <div class="translation-field"><span class="translation-label">عربي</span><input id="cf-ar" class="translation-input" type="text" dir="rtl"></div>
        </div>
      </div>
      <button class="btn-primary full-w" onclick="mgrSaveCrop(null)">${t('mgr.crop.addBtn')}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-crop-form')">${t('mgr.crop.cancel')}</button>
    </div>`;
}

async function mgrTranslateCrop() {
  const he = document.getElementById('cf-he')?.value.trim();
  if (!he) { showToast(t('mgr.crop.enterHeFirst')); return; }
  const btn = document.getElementById('cf-translate-btn');
  if (btn) { btn.disabled=true; btn.textContent=t('mgr.crop.translating'); }
  const t = await autoTranslate(he);
  const tv = document.getElementById('cf-translations');
  if (tv) tv.style.display='';
  if (document.getElementById('cf-en')) document.getElementById('cf-en').value = t.en;
  if (document.getElementById('cf-th')) document.getElementById('cf-th').value = t.th;
  if (document.getElementById('cf-ar')) document.getElementById('cf-ar').value = t.ar;
  if (btn) { btn.disabled=false; btn.textContent=t('mgr.crop.translateAgain'); }
}

async function mgrShowEditCrop(docId) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-crop-form');
  document.getElementById('crop-form-title').textContent = t('mgr.crop.editTitle');
  const doc = await db.collection('crops').doc(docId).get();
  const cr = doc.data()||{};
  const n = cr.nameI18n||{};
  document.getElementById('crop-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.crop.nameHeOnly')}</div>
        <input id="cf-he" class="mgr-edit-input" type="text" value="${n.he||''}">
      </div>
      <div>
        <div class="mgr-edit-label" style="margin-bottom:6px">${t('mgr.crop.translations')}</div>
        <div class="translation-grid">
          <div class="translation-field"><span class="translation-label">English</span><input id="cf-en" class="translation-input" type="text" dir="ltr" value="${n.en||''}"></div>
          <div class="translation-field"><span class="translation-label">ภาษาไทย</span><input id="cf-th" class="translation-input" type="text" dir="ltr" value="${n.th||''}"></div>
          <div class="translation-field"><span class="translation-label">عربي</span><input id="cf-ar" class="translation-input" type="text" dir="rtl" value="${n.ar||''}"></div>
        </div>
      </div>
      <button class="btn-primary full-w" onclick="mgrSaveCrop('${docId}')">${t('mgr.crop.save')}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-crop-form')">${t('mgr.crop.cancel')}</button>
    </div>`;
}

async function mgrSaveCrop(docId) {
  const he = document.getElementById('cf-he')?.value.trim();
  if (!he) { showToast(t('mgr.crop.enterHe')); return; }
  const nameI18n = {
    he,
    en: document.getElementById('cf-en')?.value.trim() || '',
    th: document.getElementById('cf-th')?.value.trim() || '',
    ar: document.getElementById('cf-ar')?.value.trim() || '',
  };
  try {
    if (docId) {
      await db.collection('crops').doc(docId).update({ nameI18n });
    } else {
      await db.collection('crops').add({
        nameI18n, active: true,
        builtinActivityIds: [], // manager configures per crop
      });
    }
    showToast(docId ? t('mgr.crop.updated') : t('mgr.crop.added'));
    closeModal('modal-mgr-crop-form');
    mgrShowCrops();
    // Invalidate crop cache
    localStorage.removeItem('rh_crops');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

async function mgrToggleCropActive(docId, currentlyActive) {
  try {
    await db.collection('crops').doc(docId).update({ active: !currentlyActive });
    showToast(!currentlyActive ? t('mgr.crop.activated') : t('mgr.crop.deactivated'));
    mgrShowCrops();
    localStorage.removeItem('rh_crops');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

async function mgrSeedTableGrapes() {
  try {
    await db.collection('crops').add({
      nameI18n: { he:'ענבי מאכל', en:'Table Grapes', th:'องุ่นโต๊ะ', ar:'عنب المائدة' },
      active: true,
      builtinActivityIds: [
        'winter-pruning','cane-tying','suckering','shoot-thinning','cluster-thinning',
        'shoot-tucking','topping','berry-thinning','girdling','leaf-removal',
        'manual-harvest','net-covering','net-removal',
        'spraying','soil-cultivation','mechanical-topping','mechanical-leaf-removal','fruit-transport'
      ],
    });
    showToast('ענבי שולחן נוסף ✓');
    mgrShowCrops();
    localStorage.removeItem('rh_crops');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

// ── CROP ACTIVITIES ───────────────────────────────────────────
let _currentCropId = null;

// ── ACTIVITY ORDERING (shared by crop activities and general activities) ──
// Sorts a list by its `order` field (missing = treated as unordered, falls
// back to Hebrew-alphabetical for a stable initial order), then — if any
// item's stored order doesn't match its position — renumbers everything
// 0..n-1 and persists it. This means order "heals" itself the first time
// any list is viewed after this feature ships, with no separate migration
// step needed.
async function mgrOrderAndHeal(list) {
  const sorted = [...list].sort((a,b) => {
    const oa = typeof a.order === 'number' ? a.order : Infinity;
    const ob = typeof b.order === 'number' ? b.order : Infinity;
    if (oa !== ob) return oa - ob;
    return (a.nameI18n?.he||'').localeCompare(b.nameI18n?.he||'', 'he');
  });
  let needsWrite = false;
  sorted.forEach((a,i) => { if (a.order !== i) { a.order = i; needsWrite = true; } });
  if (needsWrite) {
    try {
      const batch = db.batch();
      sorted.forEach(a => batch.update(db.collection('activities').doc(a.id), { order: a.order }));
      await batch.commit();
    } catch(e) { /* non-fatal — display still works even if this write fails */ }
  }
  return sorted;
}

// Writes new order values (0..n-1) for a given list of doc IDs, in the
// order provided. Pure data write — does not touch or re-render any UI,
// so the list it belongs to never gets rebuilt (and never collapses).
async function mgrPersistOrder(orderedIds) {
  try {
    const batch = db.batch();
    orderedIds.forEach((id,i) => batch.update(db.collection('activities').doc(id), { order: i }));
    await batch.commit();
  } catch(e) { showToast('שגיאה בשמירת הסדר: ' + e.message); }
}

// Touch- and mouse-friendly drag-to-reorder. Attaches to a container whose
// direct children are rows with a `.act-drag-handle` and a `data-id`
// attribute. Reordering happens by physically moving the DOM node during
// drag (no framework needed); on release, the new order is persisted and
// nothing is re-rendered, so open/closed section state is untouched.
function mgrEnableDragReorder(containerEl) {
  if (!containerEl || containerEl._dragEnabled) return;
  containerEl._dragEnabled = true;

  containerEl.addEventListener('pointerdown', (ev) => {
    const handle = ev.target.closest('.act-drag-handle');
    if (!handle) return;
    const row = handle.closest('.act-mgr-row');
    if (!row) return;
    ev.preventDefault();

    row.setPointerCapture(ev.pointerId);
    row.classList.add('dragging');

    const onMove = (mv) => {
      const y = mv.clientY;
      const rows = Array.from(containerEl.querySelectorAll('.act-mgr-row')).filter(r => r !== row);
      const overEl = rows.find(r => {
        const rect = r.getBoundingClientRect();
        return y >= rect.top && y <= rect.bottom;
      });
      if (overEl) {
        const rect = overEl.getBoundingClientRect();
        const before = y < rect.top + rect.height / 2;
        containerEl.insertBefore(row, before ? overEl : overEl.nextSibling);
      }
    };
    const onUp = () => {
      row.classList.remove('dragging');
      try { row.releasePointerCapture(ev.pointerId); } catch(e){}
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const newIds = Array.from(containerEl.querySelectorAll('.act-mgr-row')).map(r => r.dataset.id);
      mgrPersistOrder(newIds);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

// Remembers which sections the manager left open, keyed by a stable string
// (e.g. "crop:<id>:manual", "general"), so re-rendering the screen after a
// toggle/edit/delete doesn't snap everything shut again.
const mgrOpenSections = {};
function mgrWireSectionPersistence(detailsEl, key) {
  if (!detailsEl) return;
  detailsEl.open = mgrOpenSections[key] === true;
  detailsEl.addEventListener('toggle', () => { mgrOpenSections[key] = detailsEl.open; });
}


async function mgrShowCropActivities(cropId, cropName) {
  _currentCropId = cropId;
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-crop-activities');
  document.getElementById('crop-activities-title').textContent = t('mgr.act.title').replace('{crop}',cropName);
  const container = document.getElementById('crop-activities-list');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;

  try {
    // Uniform model: every field activity for this crop is a real Firestore
    // record — no distinction between built-in, custom, or imported.
    const snap = await db.collection('activities').where('cropId','==',cropId).get();
    const acts = snap.docs.map(d => ({id:d.id,...d.data()})).filter(a => a.type === 'field');

    const manual     = await mgrOrderAndHeal(acts.filter(a => a.subtype==='manual'));
    const mechanical = await mgrOrderAndHeal(acts.filter(a => a.subtype==='mechanical'));

    const section = (title, list, subtype) => {
      if (!list.length) return '';
      const dragId = `drag-crop-${cropId}-${subtype}`;
      const rows = list.map(a => `<div class="act-mgr-row" data-id="${a.id}">
          <span class="act-drag-handle" title="${t('mgr.act.reorderHint')}">⠿</span>
          <div class="act-mgr-info">
            <div class="act-mgr-name">${a.nameI18n?.he||''}</div>
            <div class="act-mgr-sub">${a.nameI18n?.en||''}</div>
          </div>
          <div class="user-actions">
            <label class="toggle-switch">
              <input type="checkbox" ${a.active?'checked':''} onchange="mgrToggleActivityActive('${a.id}',this.checked,'${cropId}')">
              <span class="toggle-slider"></span>
            </label>
            <button class="user-action-btn" onclick="mgrEditCropActivity('${a.id}','${cropId}')">✏️</button>
            <button class="user-action-btn" style="color:#c62828" onclick="mgrDeleteCropActivity('${a.id}','${cropId}')">🗑</button>
          </div>
        </div>`).join('');
      return `<details class="act-mgr-section" data-section-key="crop:${cropId}:${subtype}" style="margin-bottom:8px">
        <summary style="padding:10px 16px;font-weight:700;font-size:13px;cursor:pointer;color:var(--text)">${title} <span style="color:var(--text-muted);font-weight:400">(${list.length})</span></summary>
        <div id="${dragId}">${rows}</div>
      </details>`;
    };

    let html = '';
    if (!acts.length) {
      html += `<div class="empty-state" style="padding:16px 0">${t('mgr.act.emptyForCrop')}</div>`;
    } else {
      html += section(t('mgr.act.manual'), manual, 'manual');
      html += section(t('mgr.act.mechanical'), mechanical, 'mechanical');
    }

    html += `<div style="padding:16px 20px 32px">
      <div style="font-size:12px;color:var(--text-muted)">${t('mgr.act.generalNote')}</div>
    </div>`;

    container.innerHTML = html;
    container.querySelectorAll('details.act-mgr-section').forEach(d => {
      mgrWireSectionPersistence(d, d.dataset.sectionKey);
    });
    container.querySelectorAll('[id^="drag-crop-"]').forEach(mgrEnableDragReorder);
  } catch(e) {
    container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  }
}

async function mgrToggleActivityActive(docId, enabled, cropId) {
  try {
    await db.collection('activities').doc(docId).update({ active: enabled });
    localStorage.removeItem('rh_custom_acts');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}
window.mgrToggleActivityActive = mgrToggleActivityActive;

// One-time, per-crop: copies the hardcoded default field activities into
// Firestore as real, independent records for this crop — respecting the
// crop's current on/off state if it was previously configured the old way.
// Only the Hebrew name is carried over; English/Thai/Arabic start blank,
// same as any manually-typed activity — translation is always an explicit
// manager action, never pre-filled, even for built-in-origin activities.
async function mgrMigrateBuiltinActivities(cropId) {
  if (!await customConfirm(t('mgr.act.migrateConfirm'))) return;
  try {
    const cropDoc = await db.collection('crops').doc(cropId).get();
    const legacyIds = cropDoc.data()?.builtinActivityIds || [];
    const wasConfigured = legacyIds.length > 0;
    const builtins = window.BUILTIN_ACTIVITIES || [];

    const existingSnap = await db.collection('activities').where('cropId','==',cropId).get();
    const existingByName = {};
    existingSnap.docs.forEach(d => {
      const name = (d.data().nameI18n?.he||'').trim();
      if (name) existingByName[name] = d.id;
    });

    const batch = db.batch();
    let added = 0, updated = 0;
    builtins.forEach(a => {
      const active = wasConfigured ? legacyIds.includes(a.id) : true;
      const nameI18n = { he: a.nameI18n.he, en:'', th:'', ar:'' };
      const data = { nameI18n, subtype: a.subtype, type: 'field', cropId, active, custom: true };
      const existingId = existingByName[a.nameI18n.he.trim()];
      if (existingId) {
        // Clear out any old translations (auto-generated or pre-baked) —
        // Hebrew name only, manager translates manually if they want to.
        batch.update(db.collection('activities').doc(existingId), { nameI18n, subtype: data.subtype });
        updated++;
      } else {
        batch.set(db.collection('activities').doc(), data);
        added++;
      }
    });
    await batch.commit();
    showToast(t('mgr.act.importedSummary').replace('{added}',added).replace('{updated}',updated));
    localStorage.removeItem('rh_custom_acts');
    localStorage.removeItem('rh_all_acts');
    mgrShowCropActivities(cropId, document.getElementById('crop-activities-title')?.textContent.split(' —')[0]||'');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}
window.mgrMigrateBuiltinActivities = mgrMigrateBuiltinActivities;

// ── GENERAL ACTIVITIES (not tied to a crop) ───────────────────
// Uniform model applies here too: whether an activity started as a
// hardcoded default (sick leave, vacation, etc.), something a manager
// typed in, or something imported from Excel, it's the same kind of
// Firestore record with the same toggle/edit/delete.
async function mgrShowGeneralActivities() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-general-activities');
  const container = document.getElementById('general-activities-list');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    const snap = await db.collection('activities').where('type','==','other').get();
    const acts = snap.docs.map(d => ({id:d.id,...d.data()})).filter(a => !a.cropId);
    const ordered = await mgrOrderAndHeal(acts);

    let html = '';
    if (!ordered.length) {
      html += `<div class="empty-state" style="padding:16px 0">${t('mgr.act.emptyGeneral')}</div>`;
    } else {
      const rows = ordered.map(a => `<div class="act-mgr-row" data-id="${a.id}">
          <span class="act-drag-handle" title="${t('mgr.act.reorderHint')}">⠿</span>
          <div class="act-mgr-info">
            <div class="act-mgr-name">${a.nameI18n?.he||''}</div>
            <div class="act-mgr-sub">${a.nameI18n?.en||''}</div>
          </div>
          <div class="user-actions">
            <label class="toggle-switch">
              <input type="checkbox" ${a.active?'checked':''} onchange="mgrToggleActivityActive('${a.id}',this.checked)">
              <span class="toggle-slider"></span>
            </label>
            <button class="user-action-btn" onclick="mgrEditGeneralActivity('${a.id}')">✏️</button>
            <button class="user-action-btn" style="color:#c62828" onclick="mgrDeleteGeneralActivity('${a.id}')">🗑</button>
          </div>
        </div>`).join('');
      html += `<details class="act-mgr-section" data-section-key="general">
        <summary style="padding:10px 16px;font-weight:700;font-size:13px;cursor:pointer;color:var(--text)">${t('mgr.act.generalSectionTitle')} <span style="color:var(--text-muted);font-weight:400">(${ordered.length})</span></summary>
        <div id="drag-general">${rows}</div>
      </details>`;
    }

    container.innerHTML = html;
    container.querySelectorAll('details.act-mgr-section').forEach(d => {
      mgrWireSectionPersistence(d, d.dataset.sectionKey);
    });
    const dragGeneral = document.getElementById('drag-general');
    if (dragGeneral) mgrEnableDragReorder(dragGeneral);
  } catch(e) {
    container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  }
}
window.mgrShowGeneralActivities = mgrShowGeneralActivities;

// ── WORK ORDERS (משימות) ────────────────────────
// A work order tells specific workers what to do (task + plot(s)) on a
// given date. One assigned worker is the "leader" — the manager sets how
// many additional crew members the leader may bring, but not who they
// are; the leader picks the actual people through their own app, from
// the full worker list, up to that fixed quota. Only workers the leader
// has actually picked (plus the leader) can see the work order at all.
// Linking an hours entry to a work order is always the worker's free
// choice — never enforced.

let mgrCurrentWorkOrderId = null;

let _mgrWorkOrdersCache = [];
let _mgrWorkOrdersFilter = new Set(['pending','in_progress','draft']);
let _mgrWorkOrdersPeriod = 'today';

async function mgrShowWorkOrders(resetFilter = true) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-work-orders');
  const container = document.getElementById('work-orders-list');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    // Self-heal any task stuck at "pending" despite already having real
    // work logged against it — same check the day-summary sweep runs
    // farm-wide, run here too so the manager's regular task list doesn't
    // depend on someone having run day-summary first to see it corrected.
    await sweepStuckPendingTasks().catch(e => console.warn('sweepStuckPendingTasks:', e));
    const snap = await db.collection('workOrders').get({source:'server'});
    _mgrWorkOrdersCache = snap.docs.map(d => ({id:d.id, ...d.data()}));
    if (resetFilter) { _mgrWorkOrdersFilter = new Set(['pending','in_progress','draft']); _mgrWorkOrdersPeriod = 'today'; _mgrWoSortCol = null; _mgrWoSortDir = 1; }
    mgrRenderWorkOrdersTable();
  } catch(e) {
    container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  }
}
window.mgrShowWorkOrders = mgrShowWorkOrders;

function mgrFilterWorkOrders(status) {
  if (_mgrWorkOrdersFilter.has(status)) _mgrWorkOrdersFilter.delete(status);
  else _mgrWorkOrdersFilter.add(status);
  mgrRenderWorkOrdersTable();
}
window.mgrFilterWorkOrders = mgrFilterWorkOrders;

function mgrWorkOrdersSelectPeriod(period) {
  _mgrWorkOrdersPeriod = period;
  mgrRenderWorkOrdersTable();
}
window.mgrWorkOrdersSelectPeriod = mgrWorkOrdersSelectPeriod;

let _mgrWoSortCol = null;   // null = default (led-by-worker) sort
let _mgrWoSortDir = 1;      // 1 = ascending, -1 = descending

function mgrSortWorkOrders(col) {
  if (_mgrWoSortCol === col) { _mgrWoSortDir = -_mgrWoSortDir; }
  else { _mgrWoSortCol = col; _mgrWoSortDir = 1; }
  mgrRenderWorkOrdersTable();
}
window.mgrSortWorkOrders = mgrSortWorkOrders;

function mgrRenderWorkOrdersTable() {
  const fixedHeader = document.getElementById('work-orders-fixed-header');
  const container = document.getElementById('work-orders-list');
  const all = _mgrWorkOrdersCache;
  const filter = _mgrWorkOrdersFilter;

  const statuses = [
    {key:'draft', label:t('mgr.wo.filterDraft')},
    {key:'pending', label:t('mgr.wo.filterPending')},
    {key:'in_progress', label:t('mgr.wo.filterInProgress')},
    {key:'pending_review', label:t('mgr.wo.filterPendingReview')},
    {key:'closed', label:t('mgr.wo.filterClosed')},
  ];
  const filterBar = `<div class="wo-filter-bar">
    ${statuses.map(s => {
      const count = all.filter(o=>normalizeWoStatus(o.status)===s.key).length;
      return `<button class="wo-filter-btn ${filter.has(s.key)?'active':''}" onclick="mgrFilterWorkOrders('${s.key}')">${s.label} (${count})</button>`;
    }).join('')}
  </div>`;

  const range = _myWorkOrdersRange(_mgrWorkOrdersPeriod);
  const orders = all
    .filter(o=>filter.has(normalizeWoStatus(o.status)))
    .filter(o => !range || (o.executionDate && o.executionDate >= range.from && o.executionDate <= range.to))
    .slice();

  const sortValue = (o, col) => {
    switch(col){
      case 'activity': return o.task?.activityName || o.task?.freeText || '';
      case 'worker':   return o.leaderName || '';
      case 'plot':     return (o.plots||[]).map(p=>p.plotName||p.freeText).filter(Boolean).join(', ');
      case 'date':     return o.executionDate || '';
      case 'seq':      return o.sequenceNumber ?? 0;
      case 'status':   return woStatusLabel(o.status);
      default: return '';
    }
  };

  if (_mgrWoSortCol) {
    orders.sort((a,b) => {
      const av = sortValue(a, _mgrWoSortCol), bv = sortValue(b, _mgrWoSortCol);
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'he');
      return cmp * _mgrWoSortDir;
    });
  } else {
    // Default: led by worker, then execution date + sequence.
    orders.sort((a,b) => {
      const nameCmp = (a.leaderName||'').localeCompare(b.leaderName||'', 'he');
      if (nameCmp !== 0) return nameCmp;
      const dateCmp = (a.executionDate||'').localeCompare(b.executionDate||'');
      if (dateCmp !== 0) return dateCmp;
      return (a.sequenceNumber||0) - (b.sequenceNumber||0);
    });
  }

  // Shared colgroup, identical in both tables, guarantees the columns line
  // up exactly between the fixed header table and the scrolling body table.
  const colgroup = `<colgroup>
    <col class="c-activity"><col class="c-worker"><col class="c-plot">
    <col class="c-date"><col class="c-seq"><col class="c-status">
  </colgroup>`;

  const arrow = col => _mgrWoSortCol===col ? (_mgrWoSortDir===1?' ▲':' ▼') : '';
  const th = (col, label) => `<th onclick="mgrSortWorkOrders('${col}')" style="cursor:pointer">${label}${arrow(col)}</th>`;

  const periodBar = `<div class="entries-period-bar">
    ${[['today',t('entries.periodToday')],['week',t('entries.periodWeek')],['month',t('entries.periodMonth')],['all',t('worker.periodAll')||'הכל']]
      .map(([key,label]) => `<button class="entries-period-btn ${_mgrWorkOrdersPeriod===key?'active':''}" onclick="mgrWorkOrdersSelectPeriod('${key}')">${label}</button>`).join('')}
  </div>`;

  fixedHeader.innerHTML = periodBar + filterBar + `
    <div class="wo-table-wrap" id="wo-header-wrap">
      <table class="wo-table" dir="rtl">
        ${colgroup}
        <thead><tr>
          ${th('activity',t('mgr.wo.colActivity'))}${th('worker',t('mgr.wo.colWorker'))}${th('plot',t('mgr.wo.colPlot'))}${th('date',t('mgr.wo.colDate'))}${th('seq',t('mgr.wo.colSeq'))}${th('status',t('mgr.wo.colStatus'))}
        </tr></thead>
      </table>
    </div>`;

  if (!orders.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px 0">${t('mgr.wo.noneInStatus')}</div>`;
    return;
  }

  const rows = orders.map(o => {
    const taskLabel = o.task?.activityName || o.task?.freeText || '—';
    const plotNames = (o.plots||[]).map(p=>p.plotName||p.freeText).filter(Boolean);
    const plotLabel = plotNames.length ? plotNames.join(', ') : '—';
    const crewCount = (o.selectedWorkerIds||[]).length;
    const crewLabel = o.additionalWorkersQuota ? `${crewCount}/${o.additionalWorkersQuota}` : '—';
    return `<tr onclick="mgrShowWorkOrderDetail('${o.id}')">
      <td>${taskLabel}</td>
      <td class="wo-td-worker">${o.leaderName||'—'}${o.additionalWorkersQuota?`<div class="wo-td-sub">${t('mgr.wo.crew')} ${crewLabel}</div>`:''}</td>
      <td>${plotLabel}</td>
      <td>${o.executionDate?fmtStoredDate(o.executionDate):''}</td>
      <td>#${o.sequenceNumber ?? '—'}</td>
      <td><span class="wo-status-badge wo-status-${normalizeWoStatus(o.status)}">${woStatusLabel(o.status)}</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="wo-table-wrap" id="wo-body-wrap">
      <table class="wo-table" dir="rtl">
        ${colgroup}
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Keep horizontal scroll position in sync between the fixed header and
  // the scrolling body, since they're now two separate tables/wrappers.
  const headerWrap = document.getElementById('wo-header-wrap');
  const bodyWrap = document.getElementById('wo-body-wrap');
  if (headerWrap && bodyWrap) {
    bodyWrap.onscroll = () => { headerWrap.scrollLeft = bodyWrap.scrollLeft; };
  }
}
window.mgrRenderWorkOrdersTable = mgrRenderWorkOrdersTable;

// Builds the inline task-picker list: every field activity across every
// crop (not scoped to one crop, since a work order's plots can span more
// than one), plus general activities, plus a manual "אחר" option.
async function _mgrAllTasksForPicker() {
  const fieldSnap = await db.collection('activities').where('type','==','field').get();
  const generalSnap = await db.collection('activities').where('type','==','other').get();
  const cropSnap = await db.collection('crops').get();
  const cropNameById = {};
  cropSnap.docs.forEach(d => { cropNameById[d.id] = d.data().nameI18n?.he || ''; });
  const field = fieldSnap.docs.map(d => {
    const a = d.data();
    return { id:d.id, name:a.nameI18n?.he||'', cropName:cropNameById[a.cropId]||'' };
  }).sort((a,b)=>(a.cropName||'').localeCompare(b.cropName||'','he')||a.name.localeCompare(b.name,'he'));
  const general = generalSnap.docs.filter(d=>!d.data().cropId).map(d => {
    const a = d.data();
    return { id:d.id, name:a.nameI18n?.he||'', cropName:'' };
  }).sort((a,b)=>a.name.localeCompare(b.name,'he'));
  return { field, general };
}

function mgrShowAddWorkOrder() {
  mgrRenderWorkOrderForm(null);
}
window.mgrShowAddWorkOrder = mgrShowAddWorkOrder;

async function mgrEditWorkOrder(id) {
  const doc = await db.collection('workOrders').doc(id).get({source:'server'});
  if (!doc.exists) { showToast(t('mgr.wo.notFound')); return; }
  mgrRenderWorkOrderForm({ id, ...doc.data() });
}
window.mgrEditWorkOrder = mgrEditWorkOrder;

let _mgrWoState = null; // transient in-memory state while the form is open

async function mgrRenderWorkOrderForm(existing) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-work-order-form');
  document.getElementById('work-order-form-title').textContent = existing ? t('mgr.wo.editTitle') : t('mgr.wo.newTitle');
  const content = document.getElementById('work-order-form-content');
  content.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner-dark"></div></div>`;

  const { field, general } = await _mgrAllTasksForPicker();
  if (typeof loadPlots === 'function') await loadPlots();

  _mgrWoState = existing ? {
    id: existing.id,
    originalStatus: existing.status || 'draft',
    taskActivityId: existing.task?.activityId || null,
    taskFreeText: existing.task?.freeText || '',
    plotIds: (existing.plots||[]).filter(p=>p.plotId).map(p=>p.plotId),
    plotFreeText: (existing.plots||[]).find(p=>p.freeText)?.freeText || '',
    leaderId: existing.leaderId || null,
    additionalWorkersQuota: existing.additionalWorkersQuota ?? 0,
    sequenceNumber: existing.sequenceNumber ?? '',
    freeText: existing.freeText || '',
    executionDate: existing.executionDate || todayStr(),
    isBroadcast: !!existing.isBroadcast,
    broadcastWorkerIds: existing.isBroadcast ? (existing.selectedWorkerIds||[]) : [],
    _taskListOpen: false, _plotListOpen: false, _leaderListOpen: false, _broadcastListOpen: false,
  } : {
    id: null, taskActivityId:null, taskFreeText:'', plotIds:[], plotFreeText:'',
    leaderId:null, additionalWorkersQuota:0, sequenceNumber:'', freeText:'',
    executionDate: (typeof todayStr==='function')?todayStr():new Date().toISOString().slice(0,10),
    isBroadcast:false, broadcastWorkerIds:[],
    _taskListOpen:false, _plotListOpen:false, _leaderListOpen:false, _broadcastListOpen:false,
  };

  mgrDrawWorkOrderForm(field, general);
}

function _mgrCaptureWoFields() {
  const s = _mgrWoState; if (!s) return;
  const seq=document.getElementById('wo-seq'); if(seq) s.sequenceNumber=seq.value;
  const date=document.getElementById('wo-date'); if(date) s.executionDate=date.value;
  const quota=document.getElementById('wo-quota'); if(quota) s.additionalWorkersQuota=parseInt(quota.value)||0;
  const notes=document.getElementById('wo-notes'); if(notes) s.freeText=notes.value;
  const taskFt=document.getElementById('wo-task-freetext'); if(taskFt) s.taskFreeText=taskFt.value;
  const plotFt=document.getElementById('wo-plot-freetext'); if(plotFt) s.plotFreeText=plotFt.value;
}

function mgrDrawWorkOrderForm(field, general) {
  const s = _mgrWoState;
  const taskName = s.taskActivityId
    ? ([...field, ...general].find(a=>a.id===s.taskActivityId)?.name || '')
    : (s.taskFreeText ? `${t('mgr.wo.other')}: ${s.taskFreeText}` : '');
  const plotNames = s.plotIds.map(id => PLOTS.find(p=>p.id===id)?.name).filter(Boolean);
  const plotSummary = [...plotNames, s.plotFreeText?`${t('mgr.wo.other')}: ${s.plotFreeText}`:null].filter(Boolean).join(', ');
  const leader = mgrWorkers.find(w=>w.uid===s.leaderId);
  const sortedPlots = [...PLOTS].sort((a,b)=>(a.name||'').localeCompare(b.name||'','he',{numeric:true,sensitivity:'base'}));
  const sortedWorkers = [...mgrWorkers].sort((a,b)=>(a.name||'').localeCompare(b.name||'','he'));

  const taskRow = a => `<div class="edit-inline-row" onclick="mgrSelectWoTask('${a.id}')">${a.cropName?`<span style="color:var(--text-muted);font-size:12px">${a.cropName} · </span>`:''}${a.name}</div>`;

  document.getElementById('work-order-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.wo.colActivity')}</div>
        <div class="edit-select-row" onclick="mgrToggleWoTaskList()">
          <span>${taskName||t('mgr.wo.selectTask')}</span>
          <span class="edit-select-chevron">${s._taskListOpen?'▴':'▾'}</span>
        </div>
        ${s._taskListOpen?`
          <input class="mgr-edit-input" placeholder="${t('mgr.wo.search')}" oninput="filterEditInlineRows('wo-task-list', this.value)" style="margin-top:6px">
          <div class="edit-inline-list" id="wo-task-list">
            ${field.length?`<div class="edit-inline-group-title">${t('mgr.wo.fieldActivities')}</div>${field.map(taskRow).join('')}`:''}
            ${general.length?`<div class="edit-inline-group-title">${t('mgr.wo.generalActivities')}</div>${general.map(taskRow).join('')}`:''}
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px">
            <input type="checkbox" id="wo-task-other-cb" ${s.taskFreeText&&!s.taskActivityId?'checked':''} onchange="mgrToggleWoTaskOther(this.checked)">
            ${t('mgr.wo.otherFreeText')}
          </label>
          ${(s.taskFreeText&&!s.taskActivityId)?`<input id="wo-task-freetext" class="mgr-edit-input" style="margin-top:6px" value="${s.taskFreeText}" placeholder="${t('mgr.wo.taskDescPlaceholder')}">`:''}
        `:''}
      </div>

      <div>
        <div class="mgr-edit-label">${t('mgr.wo.fieldPlotMulti')}</div>
        <div class="edit-select-row" onclick="mgrToggleWoPlotList()">
          <span>${plotSummary||t('mgr.wo.selectPlots')}</span>
          <span class="edit-select-chevron">${s._plotListOpen?'▴':'▾'}</span>
        </div>
        ${s._plotListOpen?`
          <input class="mgr-edit-input" placeholder="${t('mgr.wo.search')}" oninput="filterEditInlineRows('wo-plot-list', this.value)" style="margin-top:6px">
          <div class="edit-inline-list" id="wo-plot-list">
            ${sortedPlots.map(p=>`
              <label class="edit-inline-row" style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" value="${p.id}" ${s.plotIds.includes(p.id)?'checked':''} onchange="mgrToggleWoPlot('${p.id}',this.checked)">
                ${p.name}${p.variety?' · '+p.variety:''}
              </label>`).join('')}
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px">
            <input type="checkbox" id="wo-plot-other-cb" ${s.plotFreeText?'checked':''} onchange="mgrToggleWoPlotOther(this.checked)">
            ${t('mgr.wo.otherFreeText')}
          </label>
          ${s.plotFreeText?`<input id="wo-plot-freetext" class="mgr-edit-input" style="margin-top:6px" value="${s.plotFreeText}" placeholder="${t('mgr.wo.plotDescPlaceholder')}">`:''}
          <button type="button" class="btn-primary full-w" style="margin-top:10px" onclick="mgrToggleWoPlotList()">${t('mgr.wo.finishPlotSelection')}</button>
        `:''}
      </div>

      <div>
        <label style="display:flex;align-items:center;gap:8px;background:var(--input-bg);border-radius:8px;padding:12px 14px;cursor:pointer">
          <input type="checkbox" id="wo-broadcast-cb" ${s.isBroadcast?'checked':''} onchange="mgrToggleWoBroadcast(this.checked)">
          <span style="font-size:14px;font-weight:600">${t('mgr.wo.broadcastToggle')}</span>
        </label>
      </div>

      ${s.isBroadcast ? `
      <div>
        <div class="mgr-edit-label">${t('mgr.wo.fieldBroadcastWorkers')}</div>
        <div class="edit-select-row" onclick="mgrToggleWoBroadcastList()">
          <span>${s.broadcastWorkerIds.length ? s.broadcastWorkerIds.length+' '+t('mgr.entries.selected') : t('mgr.wo.selectWorkers')}</span>
          <span class="edit-select-chevron">${s._broadcastListOpen?'▴':'▾'}</span>
        </div>
        ${s._broadcastListOpen?`
          <input class="mgr-edit-input" placeholder="${t('mgr.wo.search')}" oninput="filterEditInlineRows('wo-broadcast-list', this.value)" style="margin-top:6px">
          <div class="edit-inline-list" id="wo-broadcast-list">
            ${sortedWorkers.map(w=>`
              <label class="edit-inline-row" style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" value="${w.uid}" ${s.broadcastWorkerIds.includes(w.uid)?'checked':''} onchange="mgrToggleWoBroadcastWorker('${w.uid}',this.checked)">
                ${w.name} · ${w.phone||''}
              </label>`).join('')}
          </div>
          <button type="button" class="btn-primary full-w" style="margin-top:10px" onclick="mgrToggleWoBroadcastList()">${t('mgr.wo.finishWorkerSelection')}</button>
        `:''}
      </div>
      ` : `
      <div>
        <div class="mgr-edit-label">${t('mgr.wo.fieldLeader')}</div>
        <div class="edit-select-row" onclick="mgrToggleWoLeaderList()">
          <span>${leader?leader.name:t('mgr.wo.selectLeader')}</span>
          <span class="edit-select-chevron">${s._leaderListOpen?'▴':'▾'}</span>
        </div>
        ${s._leaderListOpen?`
          <input class="mgr-edit-input" placeholder="${t('mgr.wo.search')}" oninput="filterEditInlineRows('wo-leader-list', this.value)" style="margin-top:6px">
          <div class="edit-inline-list" id="wo-leader-list">
            ${sortedWorkers.map(w=>`<div class="edit-inline-row" onclick="mgrSelectWoLeader('${w.uid}')">${w.name} · ${w.phone||''}</div>`).join('')}
          </div>
        `:''}
      </div>
      `}

      <div style="display:flex;gap:8px">
        ${!s.isBroadcast ? `
        <div style="flex:1">
          <div class="mgr-edit-label">${t('mgr.wo.fieldQuota')}</div>
          <input id="wo-quota" class="mgr-edit-input" type="number" min="0" value="${s.additionalWorkersQuota}">
        </div>
        ` : ''}
        <div style="flex:1">
          <div class="mgr-edit-label">${t('mgr.wo.fieldSeq')}</div>
          <input id="wo-seq" class="mgr-edit-input" type="number" min="1" step="1" value="${s.sequenceNumber}">
        </div>
        <div style="flex:1.3">
          <div class="mgr-edit-label">${t('mgr.wo.fieldDate')}</div>
          ${ddDateField('wo-date', s.executionDate, '')}
        </div>
      </div>

      <div>
        <div class="mgr-edit-label">${t('mgr.wo.fieldNotes')}</div>
        <textarea id="wo-notes" class="mgr-edit-input entry-textarea" rows="2">${s.freeText}</textarea>
      </div>
    </div>
    <button class="btn-primary full-w" id="btn-save-send-wo" onclick="mgrSaveWorkOrder(true)">${t('mgr.wo.btnSaveSend')}</button>
    <button class="btn-ghost full-w" id="btn-save-wo" onclick="mgrSaveWorkOrder(false)">${t('mgr.wo.btnSaveOnly')}</button>
    <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-work-order-form')">${t('mgr.wo.btnCancel')}</button>
  `;
}

function mgrToggleWoTaskList(){ _mgrCaptureWoFields(); _mgrWoState._taskListOpen=!_mgrWoState._taskListOpen; _mgrWoState._plotListOpen=false; _mgrWoState._leaderListOpen=false; _mgrRedrawWo(); }
window.mgrToggleWoTaskList = mgrToggleWoTaskList;
function mgrToggleWoPlotList(){ _mgrCaptureWoFields(); _mgrWoState._plotListOpen=!_mgrWoState._plotListOpen; _mgrWoState._taskListOpen=false; _mgrWoState._leaderListOpen=false; _mgrRedrawWo(); }
window.mgrToggleWoPlotList = mgrToggleWoPlotList;
function mgrToggleWoLeaderList(){ _mgrCaptureWoFields(); _mgrWoState._leaderListOpen=!_mgrWoState._leaderListOpen; _mgrWoState._taskListOpen=false; _mgrWoState._plotListOpen=false; _mgrRedrawWo(); }
window.mgrToggleWoLeaderList = mgrToggleWoLeaderList;

function mgrSelectWoTask(activityId){ _mgrCaptureWoFields(); _mgrWoState.taskActivityId=activityId; _mgrWoState.taskFreeText=''; _mgrWoState._taskListOpen=false; _mgrRedrawWo(); }
window.mgrSelectWoTask = mgrSelectWoTask;
function mgrToggleWoTaskOther(checked){ _mgrCaptureWoFields(); if(checked){ _mgrWoState.taskActivityId=null; _mgrWoState.taskFreeText=_mgrWoState.taskFreeText||' '; } else { _mgrWoState.taskFreeText=''; } _mgrRedrawWo(); }
window.mgrToggleWoTaskOther = mgrToggleWoTaskOther;

function mgrToggleWoPlot(plotId, checked){ _mgrCaptureWoFields(); if(checked){ if(!_mgrWoState.plotIds.includes(plotId)) _mgrWoState.plotIds.push(plotId); } else { _mgrWoState.plotIds=_mgrWoState.plotIds.filter(id=>id!==plotId); } }
window.mgrToggleWoPlot = mgrToggleWoPlot;
function mgrToggleWoPlotOther(checked){ _mgrCaptureWoFields(); _mgrWoState.plotFreeText = checked ? (_mgrWoState.plotFreeText||' ') : ''; _mgrRedrawWo(); }
window.mgrToggleWoPlotOther = mgrToggleWoPlotOther;

function mgrSelectWoLeader(uid){ _mgrCaptureWoFields(); _mgrWoState.leaderId=uid; _mgrWoState._leaderListOpen=false; _mgrRedrawWo(); }
window.mgrSelectWoLeader = mgrSelectWoLeader;

function mgrToggleWoBroadcast(checked){
  _mgrCaptureWoFields();
  _mgrWoState.isBroadcast = checked;
  _mgrWoState._leaderListOpen = false; _mgrWoState._broadcastListOpen = false;
  _mgrRedrawWo();
}
window.mgrToggleWoBroadcast = mgrToggleWoBroadcast;

function mgrToggleWoBroadcastList(){ _mgrCaptureWoFields(); _mgrWoState._broadcastListOpen=!_mgrWoState._broadcastListOpen; _mgrWoState._taskListOpen=false; _mgrWoState._plotListOpen=false; _mgrRedrawWo(); }
window.mgrToggleWoBroadcastList = mgrToggleWoBroadcastList;

function mgrToggleWoBroadcastWorker(uid, checked){
  _mgrCaptureWoFields();
  if (checked) { if (!_mgrWoState.broadcastWorkerIds.includes(uid)) _mgrWoState.broadcastWorkerIds.push(uid); }
  else { _mgrWoState.broadcastWorkerIds = _mgrWoState.broadcastWorkerIds.filter(id=>id!==uid); }
}
window.mgrToggleWoBroadcastWorker = mgrToggleWoBroadcastWorker;

async function _mgrRedrawWo(){
  const { field, general } = await _mgrAllTasksForPicker();
  mgrDrawWorkOrderForm(field, general);
}

async function mgrSaveWorkOrder(andSend) {
  _mgrCaptureWoFields();
  const s = _mgrWoState;
  const seqNum = Number(s.sequenceNumber);
  if (!Number.isInteger(seqNum) || seqNum <= 0) { showToast(t('mgr.wo.errSeqInvalid')); return; }
  if (!s.executionDate) { showToast(t('mgr.wo.errDate')); return; }
  if (!s.taskActivityId && !s.taskFreeText.trim()) { showToast(t('mgr.wo.errTask')); return; }
  if (!s.plotIds.length && !s.plotFreeText.trim()) { showToast(t('mgr.wo.errPlot')); return; }
  if (s.isBroadcast) {
    if (!s.broadcastWorkerIds.length) { showToast(t('mgr.wo.errBroadcastWorkers')); return; }
  } else {
    if (!s.leaderId) { showToast(t('mgr.wo.errLeader')); return; }
  }

  // Moving a task to an already-used sequence number reorders the whole
  // day's list for every worker this task shares, rather than blocking —
  // the moved task is removed from its old spot (if it had one) and
  // reinserted at the requested position; everything else shifts to make
  // room, in whichever direction that requires, and the full set is
  // renumbered 1..N so no gap is ever left behind regardless of which
  // direction the move went.
  const myWorkers = s.isBroadcast ? s.broadcastWorkerIds : [s.leaderId];
  let seqNumFinal = seqNum; // fallback if the reorder below can't complete
  try {
    const sameDateSnap = await db.collection('workOrders').where('executionDate','==',s.executionDate).get();
    const others = sameDateSnap.docs
      .filter(d => d.id !== s.id) // exclude itself when editing
      .map(d => ({ id: d.id, seq: Number(d.data().sequenceNumber)||0, workers: [d.data().leaderId, ...(d.data().selectedWorkerIds||[])].filter(Boolean) }))
      .filter(o => myWorkers.some(w => o.workers.includes(w)))
      .sort((a,b) => a.seq - b.seq);

    const selfId = s.id || '__new__';
    const insertAt = Math.max(0, Math.min(seqNum - 1, others.length));
    others.splice(insertAt, 0, { id: selfId, seq: seqNum });

    const batch = db.batch();
    others.forEach((o, i) => {
      const newSeq = i + 1;
      if (o.id === selfId) {
        seqNumFinal = newSeq; // wherever it actually lands, after clamping
      } else if (newSeq !== o.seq) {
        batch.update(db.collection('workOrders').doc(o.id), { sequenceNumber: newSeq });
      }
    });
    await batch.commit();
  } catch(e) { console.warn('sequence reorder failed:', e); }

  const leader = mgrWorkers.find(w=>w.uid===s.leaderId);
  const { field, general } = await _mgrAllTasksForPicker();
  const taskObj = s.taskActivityId
    ? { activityId: s.taskActivityId, activityName: [...field,...general].find(a=>a.id===s.taskActivityId)?.name||'', freeText:null }
    : { activityId: null, activityName: null, freeText: s.taskFreeText.trim() };
  const plotsArr = [
    ...s.plotIds.map(id => ({ plotId:id, plotName: PLOTS.find(p=>p.id===id)?.name||'', freeText:null })),
    ...(s.plotFreeText.trim() ? [{ plotId:null, plotName:null, freeText:s.plotFreeText.trim() }] : []),
  ];

  const btnId = andSend ? 'btn-save-send-wo' : 'btn-save-wo';
  const btn = document.getElementById(btnId);
  if (btn) { btn.disabled=true; btn.innerHTML='<div class="spinner-sm"></div>'; }

  try {
    const data = s.isBroadcast ? {
      task: taskObj,
      plots: plotsArr,
      leaderId: null,
      leaderName: null,
      additionalWorkersQuota: 0,
      isBroadcast: true,
      sequenceNumber: seqNumFinal,
      freeText: s.freeText.trim() || null,
      executionDate: s.executionDate,
      selectedWorkerIds: s.broadcastWorkerIds,
      selectedWorkerNames: s.broadcastWorkerIds.map(id => mgrWorkers.find(w=>w.uid===id)?.name||''),
    } : {
      task: taskObj,
      plots: plotsArr,
      leaderId: s.leaderId,
      leaderName: leader?.name||'',
      additionalWorkersQuota: s.additionalWorkersQuota,
      isBroadcast: false,
      sequenceNumber: seqNumFinal,
      freeText: s.freeText.trim() || null,
      executionDate: s.executionDate,
    };
    if (s.id) {
      // Editing an already-sent work order means the worker may be looking
      // at stale info — send it back to draft so the manager has to
      // explicitly re-send before it's visible to workers again, unless
      // "save and send" was used, which re-sends immediately.
      const wasSent = s.originalStatus && s.originalStatus !== 'draft';
      data.status = andSend ? 'pending' : (wasSent ? 'draft' : s.originalStatus);
      await db.collection('workOrders').doc(s.id).update(data);
      showToast(andSend ? t('mgr.wo.toastUpdatedSent') : (wasSent ? t('mgr.wo.toastUpdatedResend') : t('mgr.wo.toastUpdated')));
    } else {
      data.status = andSend ? 'pending' : 'draft';
      if (!s.isBroadcast) {
        data.selectedWorkerIds = [];
        data.selectedWorkerNames = [];
      }
      data.createdBy = currentUser.uid;
      data.createdByName = document.getElementById('menu-name')?.textContent || '—';
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('workOrders').add(data);
      showToast(andSend ? t('mgr.wo.toastCreatedSent') : t('mgr.wo.toastCreated'));
    }
    closeModal('modal-mgr-work-order-form');
    mgrShowWorkOrders(false);
    refreshDashboard();
  } catch(e) {
    showToast('שגיאה: ' + e.message);
    if (btn) { btn.disabled=false; btn.innerHTML=andSend?t('mgr.wo.btnSaveSend'):t('mgr.wo.btnSaveOnly'); }
  }
}
window.mgrSaveWorkOrder = mgrSaveWorkOrder;

async function mgrSendWorkOrder(id) {
  try {
    await db.collection('workOrders').doc(id).update({ status: 'pending' });
    showToast(t('mgr.wo.toastSent'));
    mgrShowWorkOrderDetail(id);
    refreshDashboard();
  } catch(e) { showToast('שגיאה: ' + e.message); }
}
window.mgrSendWorkOrder = mgrSendWorkOrder;

async function mgrDeleteWorkOrder(id) {
  try {
    const linkedSnap = await db.collection('timeEntries').where('workOrderId','==',id).limit(50).get();
    const count = linkedSnap.size;
    const msg = count > 0
      ? t('mgr.wo.deleteConfirmLinked').replace('{count}', count)
      : t('mgr.wo.deleteConfirm');
    if (!await customConfirm(msg)) return;
    await db.collection('workOrders').doc(id).delete();
    showToast(t('mgr.wo.toastDeleted'));
    closeModal('modal-mgr-work-order-detail');
    mgrShowWorkOrders(false);
    refreshDashboard();
  } catch(e) { showToast('שגיאה: ' + e.message); }
}
window.mgrDeleteWorkOrder = mgrDeleteWorkOrder;

async function mgrShowWorkOrderDetail(id) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  mgrCurrentWorkOrderId = id;
  showModal('modal-mgr-work-order-detail');
  const container = document.getElementById('work-order-detail-content');
  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="spinner-dark"></div></div>`;
  try {
    const doc = await db.collection('workOrders').doc(id).get({source:'server'});
    if (!doc.exists) { container.innerHTML = `<div class="empty-state">${t('mgr.wo.notFound')}</div>`; return; }
    const o = doc.data();

    const linkedSnap = await db.collection('timeEntries').where('workOrderId','==',id).get();
    const linked = linkedSnap.docs.map(d => d.data());
    let totalMins = 0;
    // Per-worker detail — actual start/end times for each of their entries
    // on this task, not just an aggregate total (item 6).
    const byWorkerDetail = {};
    linked.forEach(e => {
      if (e.startTime && e.endTime) {
        const name = e.workerName || e.workerId || '—';
        if (!byWorkerDetail[name]) byWorkerDetail[name] = { totalMins: 0, entries: [] };
        const mins = (e.endTime.toMillis()-e.startTime.toMillis())/60000;
        totalMins += mins;
        byWorkerDetail[name].totalMins += mins;
        byWorkerDetail[name].entries.push({ start: mgrTo24h(e.startTime), end: mgrTo24h(e.endTime) });
      }
    });
    const hoursStr = m => (m/60).toFixed(1);

    const taskLabel = o.task?.activityName || o.task?.freeText || '—';
    const plotLabel = (o.plots||[]).map(p=>p.plotName||p.freeText).filter(Boolean).join(', ') || '—';
    const crew = (o.selectedWorkerNames||[]).join(', ') || t('mgr.wo.notYetSelected');

    const sendBtn = document.getElementById('wo-detail-send-btn');
    if (sendBtn) sendBtn.style.display = (o.status==='draft') ? '' : 'none';

    container.innerHTML = `
      <div style="padding:4px 20px 16px">
        <span class="wo-status-badge wo-status-${normalizeWoStatus(o.status)}">${woStatusLabel(o.status)}</span>
      </div>
      <div class="detail-section"><div class="detail-label">${t('mgr.wo.colActivity')}</div><div class="detail-value">${taskLabel}</div></div>
      <div class="detail-section"><div class="detail-label">${t('mgr.wo.colPlot')}</div><div class="detail-value">${plotLabel}</div></div>
      <div class="detail-section"><div class="detail-label">${t('mgr.wo.detailLeader')}</div><div class="detail-value">${o.leaderName||'—'}</div></div>
      <div class="detail-section"><div class="detail-label">${t('mgr.wo.detailCrew').replace('{selected}',(o.selectedWorkerIds||[]).length).replace('{quota}',o.additionalWorkersQuota||0)}</div><div class="detail-value">${crew}</div></div>
      <div class="detail-section"><div class="detail-label">${t('mgr.wo.fieldDate')}</div><div class="detail-value">${o.executionDate?fmtStoredDate(o.executionDate):'—'}</div></div>
      <div class="detail-section"><div class="detail-label">${t('mgr.wo.fieldSeq')}</div><div class="detail-value">${o.sequenceNumber??'—'}</div></div>
      ${o.freeText?`<div class="detail-section"><div class="detail-label">${t('mgr.wo.fieldNotes')}</div><div class="detail-note">${o.freeText}</div></div>`:''}
      <div class="detail-section"><div class="detail-label">${t('mgr.wo.detailTotalHours')}</div><div class="detail-value">${t('mgr.wo.detailHoursEntries').replace('{hours}',hoursStr(totalMins)).replace('{count}',linked.length)}</div></div>
      ${Object.keys(byWorkerDetail).length?`<div class="detail-section"><div class="detail-label">${t('mgr.wo.detailByWorker')}</div>
        ${Object.entries(byWorkerDetail).map(([name,data])=>`
          <div style="margin-bottom:10px">
            <div class="detail-value" style="font-weight:700">${name} — ${hoursStr(data.totalMins)} ${t('mgr.daySummary.hoursShort')}</div>
            ${data.entries.map(e=>`<div style="font-size:12px;color:var(--text-muted);padding-right:6px">${e.start} - ${e.end}</div>`).join('')}
          </div>`).join('')}
      </div>`:''}
      ${o.createdAt?`<div style="padding:8px 20px 0;font-size:11px;color:var(--text-muted)">${t('mgr.wo.createdBy').replace('{name}',o.createdByName||'—').replace('{date}',fmtDateDDMMYYYY(new Date(o.createdAt.toMillis()))+' '+mgrTo24h(o.createdAt))}</div>`:''}
      ${o.status==='pending_review'?`
        <div style="padding:16px 20px 32px">
          <button class="btn-primary full-w" onclick="mgrApproveWorkOrder('${id}')">${t('mgr.wo.btnApprove')}</button>
        </div>`:''}
    `;
  } catch(e) {
    container.innerHTML = `<div class="empty-state">${t('mgr.wo.error')}: ${e.message}</div>`;
  }
}
window.mgrShowWorkOrderDetail = mgrShowWorkOrderDetail;

async function mgrApproveWorkOrder(id) {
  try {
    await db.collection('workOrders').doc(id).update({
      status: 'closed',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUser.uid,
    });
    showToast(t('mgr.wo.toastApproved'));
    closeModal('modal-mgr-work-order-detail');
    mgrShowWorkOrders(false);
    refreshDashboard();
    // Standard-time no longer triggers here — it now folds automatically
    // at the moment each entry settles (app.js, resettleDay), regardless
    // of whether it's linked to a task at all. This also means a worker
    // who starts after a task is already approved still gets counted.
  } catch(e) { showToast('שגיאה: ' + e.message); }
}
window.mgrApproveWorkOrder = mgrApproveWorkOrder;

function mgrShowAddGeneralActivity() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-general-activity-form');
  document.getElementById('general-activity-form-title').textContent = t('mgr.act.addGeneralTitle');
  document.getElementById('general-activity-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.act.nameHe')}</div>
        <input id="gf-he" class="mgr-edit-input" type="text" placeholder="${t('mgr.act.namePlaceholderGeneral')}">
      </div>
      <div id="gf-translations">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div class="mgr-edit-label" style="margin-bottom:0">${t('mgr.crop.translations')}</div>
          <button type="button" class="btn-ghost" style="padding:4px 10px;font-size:12px" onclick="mgrTranslateGeneralActivity()">${t('mgr.crop.translate')}</button>
        </div>
        <div class="translation-grid">
          <div class="translation-field"><span class="translation-label">English</span><input id="gf-en" class="translation-input" dir="ltr" type="text"></div>
          <div class="translation-field"><span class="translation-label">ภาษาไทย</span><input id="gf-th" class="translation-input" dir="ltr" type="text"></div>
          <div class="translation-field"><span class="translation-label">عربي</span><input id="gf-ar" class="translation-input" dir="rtl" type="text"></div>
        </div>
      </div>
      <button class="btn-primary full-w" onclick="mgrSaveGeneralActivity(null)">${t('mgr.act.addBtn')}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-general-activity-form')">${t('mgr.act.cancel')}</button>
    </div>`;
}
window.mgrShowAddGeneralActivity = mgrShowAddGeneralActivity;

async function mgrTranslateGeneralActivity() {
  const he = document.getElementById('gf-he')?.value.trim();
  if (!he) { showToast(t('mgr.crop.enterHeFirst')); return; }
  const tr = await autoTranslate(he);
  if (document.getElementById('gf-en')) document.getElementById('gf-en').value = tr.en;
  if (document.getElementById('gf-th')) document.getElementById('gf-th').value = tr.th;
  if (document.getElementById('gf-ar')) document.getElementById('gf-ar').value = tr.ar;
}
window.mgrTranslateGeneralActivity = mgrTranslateGeneralActivity;

async function mgrEditGeneralActivity(docId) {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-general-activity-form');
  document.getElementById('general-activity-form-title').textContent = t('mgr.act.editGeneralTitle');
  const doc = await db.collection('activities').doc(docId).get();
  const a = doc.data()||{};
  const n = a.nameI18n||{};
  document.getElementById('general-activity-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.act.nameHeOnly')}</div>
        <input id="gf-he" class="mgr-edit-input" type="text" value="${n.he||''}">
      </div>
      <div>
        <div class="mgr-edit-label" style="margin-bottom:6px">${t('mgr.crop.translations')}</div>
        <div class="translation-grid">
          <div class="translation-field"><span class="translation-label">English</span><input id="gf-en" class="translation-input" dir="ltr" type="text" value="${n.en||''}"></div>
          <div class="translation-field"><span class="translation-label">ภาษาไทย</span><input id="gf-th" class="translation-input" dir="ltr" type="text" value="${n.th||''}"></div>
          <div class="translation-field"><span class="translation-label">عربي</span><input id="gf-ar" class="translation-input" dir="rtl" type="text" value="${n.ar||''}"></div>
        </div>
      </div>
      <button class="btn-primary full-w" onclick="mgrSaveGeneralActivity('${docId}')">${t('mgr.act.save')}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-general-activity-form')">${t('mgr.act.cancel')}</button>
    </div>`;
}
window.mgrEditGeneralActivity = mgrEditGeneralActivity;

async function mgrSaveGeneralActivity(docId) {
  const he = document.getElementById('gf-he')?.value.trim();
  if (!he) { showToast(t('mgr.crop.enterHe')); return; }
  const nameI18n = {
    he,
    en: document.getElementById('gf-en')?.value.trim() || '',
    th: document.getElementById('gf-th')?.value.trim() || '',
    ar: document.getElementById('gf-ar')?.value.trim() || '',
  };
  try {
    if (docId) await db.collection('activities').doc(docId).update({nameI18n});
    else await db.collection('activities').add({nameI18n, type:'other', cropId:null, active:true, custom:true});
    showToast(docId?t('mgr.act.updated'):t('mgr.act.added'));
    closeModal('modal-mgr-general-activity-form');
    localStorage.removeItem('rh_custom_acts');
    mgrShowGeneralActivities();
  } catch(e) { showToast('שגיאה: ' + e.message); }
}
window.mgrSaveGeneralActivity = mgrSaveGeneralActivity;

async function mgrDeleteGeneralActivity(docId) {
  if (!await customConfirm(t('mgr.act.deleteConfirm'))) return;
  try {
    await db.collection('activities').doc(docId).delete();
    showToast(t('mgr.act.deleted'));
    localStorage.removeItem('rh_custom_acts');
    mgrShowGeneralActivities();
  } catch(e) { showToast('שגיאה'); }
}
window.mgrDeleteGeneralActivity = mgrDeleteGeneralActivity;

async function mgrMigrateGeneralActivities() {
  if (!await customConfirm(t('mgr.act.migrateGeneralConfirm'))) return;
  try {
    const general = window.GENERAL_ACTIVITIES || [];
    const existingSnap = await db.collection('activities').where('type','==','other').get();
    const existingByName = {};
    existingSnap.docs.forEach(d => {
      if (d.data().cropId) return;
      const name = (d.data().nameI18n?.he||'').trim();
      if (name) existingByName[name] = d.id;
    });

    const batch = db.batch();
    let added = 0, updated = 0;
    general.forEach(a => {
      const nameI18n = { he: a.nameI18n.he, en:'', th:'', ar:'' };
      const existingId = existingByName[a.nameI18n.he.trim()];
      if (existingId) {
        batch.update(db.collection('activities').doc(existingId), { nameI18n });
        updated++;
      } else {
        batch.set(db.collection('activities').doc(), {nameI18n, type:'other', cropId:null, active:true, custom:true});
        added++;
      }
    });
    await batch.commit();
    showToast(t('mgr.act.importedSummary').replace('{added}',added).replace('{updated}',updated));
    localStorage.removeItem('rh_custom_acts');
    localStorage.removeItem('rh_all_acts');
    mgrShowGeneralActivities();
  } catch(e) { showToast('שגיאה: ' + e.message); }
}
window.mgrMigrateGeneralActivities = mgrMigrateGeneralActivities;

function mgrShowAddCropActivity() {
  if (!_currentCropId) return;
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-activity-form');
  document.getElementById('activity-form-title').textContent = t('mgr.act.addTitle');
  document.getElementById('activity-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.act.nameHe')}</div>
        <input id="af-he" class="mgr-edit-input" type="text" placeholder="${t('mgr.act.namePlaceholder')}">
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.act.type')}</div>
        <select id="af-subtype" class="mgr-edit-input">
          <option value="manual">${t('mgr.act.manual')}</option>
          <option value="mechanical">${t('mgr.act.mechanical')}</option>
        </select>
      </div>
      <div id="af-translations">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div class="mgr-edit-label" style="margin-bottom:0">${t('mgr.crop.translations')}</div>
          <button id="af-translate-btn" type="button" class="btn-ghost" style="padding:4px 10px;font-size:12px" onclick="mgrTranslateActivity()">${t('mgr.crop.translate')}</button>
        </div>
        <div class="translation-grid">
          <div class="translation-field"><span class="translation-label">English</span><input id="af-en" class="translation-input" dir="ltr" type="text"></div>
          <div class="translation-field"><span class="translation-label">ภาษาไทย</span><input id="af-th" class="translation-input" dir="ltr" type="text"></div>
          <div class="translation-field"><span class="translation-label">عربي</span><input id="af-ar" class="translation-input" dir="rtl" type="text"></div>
        </div>
      </div>
      <button class="btn-primary full-w" onclick="mgrSaveCropActivity(null)">${t('mgr.act.addBtn')}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-activity-form')">${t('mgr.act.cancel')}</button>
    </div>`;
}

async function mgrTranslateActivity() {
  const he = document.getElementById('af-he')?.value.trim();
  if (!he) { showToast(t('mgr.crop.enterHeFirst')); return; }
  const btn = document.getElementById('af-translate-btn');
  if (btn) { btn.disabled=true; btn.textContent=t('mgr.crop.translating'); }
  const tr = await autoTranslate(he);
  const tv = document.getElementById('af-translations');
  if (tv) tv.style.display='';
  if (document.getElementById('af-en')) document.getElementById('af-en').value = tr.en;
  if (document.getElementById('af-th')) document.getElementById('af-th').value = tr.th;
  if (document.getElementById('af-ar')) document.getElementById('af-ar').value = tr.ar;
  if (btn) { btn.disabled=false; btn.textContent=t('mgr.crop.translateAgain'); }
}

async function mgrSaveCropActivity(docId) {
  const he      = document.getElementById('af-he')?.value.trim();
  const subtype = document.getElementById('af-subtype')?.value || 'manual';
  if (!he) { showToast(t('mgr.crop.enterHe')); return; }
  const nameI18n = {
    he,
    en: document.getElementById('af-en')?.value.trim() || '',
    th: document.getElementById('af-th')?.value.trim() || '',
    ar: document.getElementById('af-ar')?.value.trim() || '',
  };
  const data = { nameI18n, subtype, type:'field', cropId:_currentCropId, active:true, custom:true };
  try {
    if (docId) await db.collection('activities').doc(docId).update({nameI18n,subtype});
    else await db.collection('activities').add(data);
    showToast(docId?t('mgr.act.updated'):t('mgr.act.added'));
    closeModal('modal-mgr-activity-form');
    localStorage.removeItem('rh_custom_acts');
    mgrShowCropActivities(_currentCropId, document.getElementById('crop-activities-title')?.textContent.split(' —')[0]||'');
  } catch(e) { showToast('שגיאה: ' + e.message); }
}

async function mgrEditCropActivity(docId, cropId) {
  _currentCropId = cropId;
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  showModal('modal-mgr-activity-form');
  document.getElementById('activity-form-title').textContent = t('mgr.act.editTitle');
  const doc = await db.collection('activities').doc(docId).get();
  const a = doc.data()||{};
  const n = a.nameI18n||{};
  document.getElementById('activity-form-content').innerHTML = `
    <div class="mgr-edit-form">
      <div>
        <div class="mgr-edit-label">${t('mgr.act.nameHeOnly')}</div>
        <input id="af-he" class="mgr-edit-input" type="text" value="${n.he||''}">
      </div>
      <div>
        <div class="mgr-edit-label">${t('mgr.act.type')}</div>
        <select id="af-subtype" class="mgr-edit-input">
          <option value="manual"${a.subtype==='manual'?' selected':''}>${t('mgr.act.manual')}</option>
          <option value="mechanical"${a.subtype==='mechanical'?' selected':''}>${t('mgr.act.mechanical')}</option>
        </select>
      </div>
      <div>
        <div class="mgr-edit-label" style="margin-bottom:6px">${t('mgr.crop.translations')}</div>
        <div class="translation-grid">
          <div class="translation-field"><span class="translation-label">English</span><input id="af-en" class="translation-input" dir="ltr" type="text" value="${n.en||''}"></div>
          <div class="translation-field"><span class="translation-label">ภาษาไทย</span><input id="af-th" class="translation-input" dir="ltr" type="text" value="${n.th||''}"></div>
          <div class="translation-field"><span class="translation-label">عربي</span><input id="af-ar" class="translation-input" dir="rtl" type="text" value="${n.ar||''}"></div>
        </div>
      </div>
      <button class="btn-primary full-w" onclick="mgrSaveCropActivity('${docId}')">${t('mgr.act.save')}</button>
      <button class="btn-ghost full-w" onclick="closeModal('modal-mgr-activity-form')">${t('mgr.act.cancel')}</button>
    </div>`;
}

async function mgrDeleteCropActivity(docId, cropId) {
  if (!await customConfirm(t('mgr.act.deleteConfirm'))) return;
  try {
    await db.collection('activities').doc(docId).delete();
    showToast(t('mgr.act.deleted'));
    localStorage.removeItem('rh_custom_acts');
    mgrShowCropActivities(cropId, document.getElementById('crop-activities-title')?.textContent.split(' —')[0]||'');
  } catch(e) { showToast('שגיאה'); }
}

// Expose BUILTIN_ACTIVITIES to manager scope (it's in app.js but both load in same page)
// This is handled by app.js defining it as window-scoped via const at top level

window.mgrShowCrops = mgrShowCrops;
window.mgrShowAddCrop = mgrShowAddCrop;
window.mgrShowEditCrop = mgrShowEditCrop;
window.mgrSaveCrop = mgrSaveCrop;
window.mgrToggleCropActive = mgrToggleCropActive;
window.mgrSeedTableGrapes = mgrSeedTableGrapes;
window.mgrTranslateCrop = mgrTranslateCrop;
window.mgrShowCropActivities = mgrShowCropActivities;
window.mgrShowAddCropActivity = mgrShowAddCropActivity;
window.mgrTranslateActivity = mgrTranslateActivity;
window.mgrSaveCropActivity = mgrSaveCropActivity;
window.mgrEditCropActivity = mgrEditCropActivity;
window.mgrDeleteCropActivity = mgrDeleteCropActivity;

// ── ACTIVITIES BULK IMPORT FROM EXCEL ────────────────────────
async function mgrHandleActivitiesImport(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  showToast(t('mgr.act.readingFile'));
  try {
    const buf = await new Promise((res,rej)=>{
      const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsArrayBuffer(file);
    });
    const wb = XLSX.read(new Uint8Array(buf),{type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});

    await mgrLoadCropOptions();
    const crops = window.mgrCropOptions||[];
    if(!crops.length){showToast(t('mgr.act.noCropsDefined'));return;}

    const existingSnap = await db.collection('activities').where('custom','==',true).get();
    const existingMap = {};
    existingSnap.docs.forEach(d=>{
      const a=d.data();
      existingMap[(a.nameI18n?.he||'')+':'+(a.cropId||'null')]=d.id;
    });

    const batch = db.batch();
    let added=0, updated=0, skipped=0;

    const dataRows = rows.filter((row,i)=>{
      if(i===0){const f=String(row[0]||'').trim().toLowerCase();return!['עברית','שם','hebrew','name'].includes(f);}
      return true;
    });

    dataRows.forEach(row=>{
      const he      = String(row[0]||'').trim();
      const en      = String(row[1]||'').trim();
      const ar      = String(row[2]||'').trim();
      const th      = String(row[3]||'').trim();
      const typeRaw = String(row[4]||'').trim();
      if(!he) return;

      let type='field', subtype='manual';
      if(typeRaw==='ממוכנת'){type='field';subtype='mechanical';}
      else if(typeRaw==='כללית'){type='other';subtype=null;}

      const nameI18n={he,en:en||'',ar:ar||'',th:th||''};

      if(type==='other'){
        const key=he+':null';
        const data={nameI18n,subtype:null,type:'other',cropId:null,active:true,custom:true};
        if(existingMap[key]){batch.update(db.collection('activities').doc(existingMap[key]),data);updated++;}
        else{batch.set(db.collection('activities').doc(),data);added++;}
        return;
      }

      const cropNames=row.slice(5,10).map(v=>String(v||'').trim()).filter(Boolean);
      if(!cropNames.length){skipped++;return;}

      cropNames.forEach(cropName=>{
        const matchedCrop=crops.find(cr=>
          cr.nameI18n?.he===cropName||
          cr.nameI18n?.he?.includes(cropName)||
          cropName.includes(cr.nameI18n?.he||'')
        );
        if(!matchedCrop){skipped++;return;}
        const key=he+':'+matchedCrop.id;
        const data={nameI18n,subtype,type,cropId:matchedCrop.id,active:true,custom:true};
        if(existingMap[key]){batch.update(db.collection('activities').doc(existingMap[key]),data);updated++;}
        else{batch.set(db.collection('activities').doc(),data);added++;}
      });
    });

    await batch.commit();
    localStorage.removeItem('rh_custom_acts');
    showToast(t('mgr.act.importSummary').replace('{added}',added).replace('{updated}',updated).replace('{skippedPart}',skipped?t('mgr.act.importSkipped').replace('{skipped}',skipped):''));
  }catch(e){console.error('Activities import error:',e);showToast(t('mgr.act.importError').replace('{msg}',e.message));}
}
window.mgrHandleActivitiesImport = mgrHandleActivitiesImport;
