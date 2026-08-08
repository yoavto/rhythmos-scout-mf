// ════════════════════════════════════════════════════════════════════
// Rhythmos Scout Multi-Farm — shared farm resolution & path helper
// Loaded by BOTH index.html and inspections.html, right after Firebase
// is initialized. Assumes globals `db` and `firebase` already exist.
//
// Data model:
//   farms/{farmId}                       name
//   farms/{farmId}/<col>                 per-farm data (plots, surveys,
//                                         traps, inspections, obs_records)
//   insp_pests, insects, obs_meta        GLOBAL — never farm-scoped
// ════════════════════════════════════════════════════════════════════

let currentFarmId = null, currentFarmName = '';

// ── Shared UI utilities used by both apps (verified byte-identical before
//    extraction, only whitespace/formatting differed between the two copies) ──
function di(d){ return d.toISOString().slice(0,10); }

function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);
}

let confirmCb=null;
function showConfirm(title,msg,cb){
  document.getElementById('cm-title').textContent=title;
  document.getElementById('cm-msg').textContent=msg;
  document.getElementById('confirm-modal').classList.add('open');
  confirmCb=cb;
}
function closeConfirm(ok){
  document.getElementById('confirm-modal').classList.remove('open');
  if(ok&&confirmCb)confirmCb();
  confirmCb=null;
}

function togglePwVisibility(){
  const inp=document.getElementById('l-pw'), btn=document.getElementById('pw-toggle-btn');
  if(inp.type==='password'){inp.type='text';btn.textContent='🙈';btn.setAttribute('aria-label','הסתר סיסמה');}
  else{inp.type='password';btn.textContent='👁';btn.setAttribute('aria-label','הצג סיסמה');}
}

function authMsg(c){return({'auth/invalid-email':'אימייל לא תקין','auth/user-not-found':'משתמש לא נמצא','auth/wrong-password':'סיסמה שגויה','auth/invalid-credential':'אימייל או סיסמה שגויים','auth/email-already-in-use':'אימייל כבר רשום','auth/weak-password':'סיסמה חלשה מדי'})[c]||'שגיאת התחברות';}

async function doLogin(){
  const email=document.getElementById('l-email').value.trim(), remember=document.getElementById('remember-me').checked;
  document.getElementById('auth-err').textContent='';
  try{
    await auth.setPersistence(remember?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithEmailAndPassword(email,document.getElementById('l-pw').value);
    if(remember)localStorage.setItem('r_saved_email',email);
    else localStorage.removeItem('r_saved_email');
  }catch(e){document.getElementById('auth-err').textContent=authMsg(e.code);}
}

window.addEventListener('load',()=>{
  const s=localStorage.getItem('r_saved_email');
  if(s){document.getElementById('l-email').value=s;document.getElementById('remember-me').checked=true;}
});

// Turns a bare collection name into this farm's nested path.
// Call ONLY for farm-scoped collections (plots/surveys/traps/inspections/obs_records) —
// insp_pests, insects, and obs_meta stay global and must NOT go through this.
function farmCol(name) {
  if (!currentFarmId) {
    throw new Error('farmCol("' + name + '") called before a farm was resolved');
  }
  return 'farms/' + currentFarmId + '/' + name;
}

function ptInPoly(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Shared GPS-to-plot lookup (plot only, no zone sub-division — that's a
// Samples-specific extra layer that stays local to inspections.html).
// Pass whichever plots array the calling app already has loaded.
function findPlotByGPS(lat, lng, plotsArr) {
  for (const plot of (plotsArr || [])) {
    if (!plot.polygon?.length) continue;
    if (ptInPoly(lat, lng, plot.polygon)) return plot;
  }
  return null;
}

// Resolves current farm: saved localStorage choice → GPS + polygon match
// across every farm's plots → manual picker. Always ends with a farm selected.
function resolveFarm() {
  return new Promise((resolve) => {
    const saved = localStorage.getItem('rhythmos_mf_farm');
    if (saved) {
      try {
        const f = JSON.parse(saved);
        if (f.farmId) {
          currentFarmId = f.farmId;
          currentFarmName = f.farmName || '';
          showFarmBadge();
          resolve();
          return;
        }
      } catch (e) {}
    }
    tryGpsThenPicker(resolve);
  });
}

async function tryGpsThenPicker(resolve) {
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }));
    const match = await findFarmByGPS(pos.coords.latitude, pos.coords.longitude);
    if (match) {
      setFarm(match.farmId, match.farmName);
      resolve();
      return;
    }
  } catch (e) { /* GPS failed, timed out, or no polygon matched — fall through */ }
  showFarmPicker(resolve);
}

// Scans every farm's plot polygons (Firestore collection-group query) to find
// which farm the current GPS position falls inside.
async function findFarmByGPS(lat, lng) {
  try {
    const snap = await db.collectionGroup('insp_plots').get();
    for (const doc of snap.docs) {
      const plot = doc.data();
      if (!plot.polygon || !plot.polygon.length) continue;
      if (ptInPoly(lat, lng, plot.polygon)) {
        const parts = doc.ref.path.split('/'); // farms/{farmId}/insp_plots/{plotId}
        const farmId = parts[1];
        const farmDoc = await db.collection('farms').doc(farmId).get();
        return { farmId, farmName: farmDoc.exists ? (farmDoc.data().name || '') : '' };
      }
    }
  } catch (e) { console.error('GPS farm detection failed', e); }
  return null;
}

function setFarm(farmId, farmName) {
  currentFarmId = farmId;
  currentFarmName = farmName || '';
  localStorage.setItem('rhythmos_mf_farm', JSON.stringify({ farmId, farmName }));
  showFarmBadge();
}

// "החלף חווה" — the user is explicitly choosing manually, so skip the GPS
// auto-detect step (which the normal resolveFarm() flow would try first, costing
// up to 6 seconds) and open the picker immediately. Reload only happens after a
// farm is actually picked, to cleanly reset all in-memory app state under it.
function switchFarm() {
  localStorage.removeItem('rhythmos_mf_farm');
  currentFarmId = null;
  currentFarmName = '';
  showFarmPicker(() => location.reload());
}

// ── Top-bar farm name + switch button (inline, same height as other bar buttons) ──
function showFarmBadge() {
  const gtb = document.getElementById('gtb');
  if (!gtb) return;

  let wrap = document.getElementById('farm-strip');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'farm-strip';
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;padding:0 4px;';
    wrap.innerHTML =
      '<span id="farm-name-label" style="color:var(--red,#890a0a);font-size:24px;font-weight:700;' +
      'max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
      '<button type="button" onclick="switchFarm()" style="background:rgba(255,255,255,0.2);' +
      'border:1px solid rgba(255,255,255,0.5);color:white;border-radius:14px;padding:12px 20px;' +
      'font-family:Arial,sans-serif;font-size:22px;font-weight:700;cursor:pointer;white-space:nowrap;">' +
      '🔀 החלף חווה</button>';
    gtb.appendChild(wrap);
  }
  const label = document.getElementById('farm-name-label');
  if (label) label.textContent = currentFarmName || 'חווה';
}

// ── Manual farm picker — full-screen overlay, built dynamically so it
//    doesn't need to be duplicated in both HTML files ─────────────────────
let __farmPickerDone = null;

function showFarmPicker(onDone) {
  __farmPickerDone = onDone;
  let overlay = document.getElementById('farm-picker-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'farm-picker-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:#f5f5f5;z-index:99999;display:flex;' +
    'flex-direction:column;font-family:Arial,sans-serif;direction:rtl;overflow-y:auto;';
  document.body.appendChild(overlay);
  renderFarmList();
}

function fpHeader(title) {
  return '<div style="background:var(--red,#890a0a);color:white;padding:20px 16px;font-size:18px;font-weight:700;display:flex;justify-content:space-between;align-items:center;">' +
    '<span>' + title + '</span>' +
    '<button onclick="logoutFromPicker()" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.5);color:white;border-radius:7px;padding:6px 12px;font-family:Arial,sans-serif;font-size:12px;font-weight:600;cursor:pointer;">יציאה</button>' +
    '</div>';
}
function logoutFromPicker() {
  const overlay = document.getElementById('farm-picker-overlay');
  if (overlay) overlay.remove();
  if (typeof doLogout === 'function') doLogout();
}
function fpEsc(s) { return String(s || '').replace(/'/g, "\\'"); }

async function renderFarmList() {
  const overlay = document.getElementById('farm-picker-overlay');
  overlay.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">טוען חוות...</div>';
  let farms = [];
  try {
    const snap = await db.collection('farms').orderBy('name').get();
    farms = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => !f.archived);
  } catch (e) {}

  overlay.innerHTML = fpHeader('בחר חווה') + `
    <div style="padding:16px;flex:1;">
      ${farms.length ? farms.map(f => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <div onclick="pickFarm('${f.id}','${fpEsc(f.name)}')"
            style="flex:1;background:white;border-radius:10px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,0.08);cursor:pointer;font-size:15px;font-weight:600;">
            ${f.name || '(ללא שם)'}
          </div>
          <button onclick="event.stopPropagation();confirmArchiveFarm('${f.id}','${fpEsc(f.name)}')"
            style="background:white;border:2px solid var(--red,#890a0a);color:var(--red,#890a0a);border-radius:9px;width:48px;height:48px;font-size:22px;cursor:pointer;flex-shrink:0;" title="העבר לארכיון">🗄</button>
        </div>`).join('') : '<p style="color:#888;text-align:center;margin-bottom:16px;">אין חוות עדיין</p>'}
      <button onclick="showAddFarmForm()"
        style="width:100%;padding:12px;background:white;border:1.5px dashed #999;border-radius:10px;font-size:14px;font-weight:600;color:#555;cursor:pointer;margin-top:6px;">
        + הוסף חווה
      </button>
    </div>`;
}

function confirmArchiveFarm(farmId, farmName) {
  const overlay = document.getElementById('farm-picker-overlay');
  overlay.innerHTML = fpHeader('העברה לארכיון') + `
    <div style="padding:16px;">
      <p style="font-size:14px;color:#444;line-height:1.6;">
        להעביר את "<b>${fpEsc(farmName)}</b>" לארכיון? החווה תיעלם מרשימת הבחירה, אבל <b>הנתונים שלה לא יימחקו</b> — חלקות, מדגמים, מלכודות ותצפיות יישארו שמורים.
      </p>
      <button onclick="doArchiveFarm('${farmId}')" style="width:100%;padding:12px;background:var(--red,#890a0a);color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;margin-top:10px;">העבר לארכיון</button>
      <button onclick="renderFarmList()" style="width:100%;padding:10px;background:none;border:none;font-size:13px;color:#888;cursor:pointer;margin-top:8px;">ביטול</button>
    </div>`;
}

async function doArchiveFarm(farmId) {
  try {
    await db.collection('farms').doc(farmId).update({ archived: true });
    // If the farm currently in use just got archived, force re-selection
    if (farmId === currentFarmId) {
      localStorage.removeItem('rhythmos_mf_farm');
      currentFarmId = null; currentFarmName = '';
    }
    renderFarmList();
  } catch (e) { alert('שגיאה: ' + e.message); }
}

function pickFarm(farmId, farmName) {
  setFarm(farmId, farmName);
  const overlay = document.getElementById('farm-picker-overlay');
  if (overlay) overlay.remove();
  const done = __farmPickerDone; __farmPickerDone = null;
  if (done) done();
}

function showAddFarmForm() {
  const overlay = document.getElementById('farm-picker-overlay');
  overlay.innerHTML = fpHeader('חווה חדשה') + `
    <div style="padding:16px;">
      <label style="font-size:13px;color:#666;">שם החווה</label>
      <input id="new-farm-name" type="text" style="width:100%;padding:11px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;margin:6px 0 16px;"/>
      <button onclick="saveNewFarm()" style="width:100%;padding:12px;background:var(--red,#890a0a);color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">שמור</button>
      <button onclick="renderFarmList()" style="width:100%;padding:10px;background:none;border:none;font-size:13px;color:#888;cursor:pointer;margin-top:8px;">ביטול</button>
    </div>`;
}

async function saveNewFarm() {
  const name = document.getElementById('new-farm-name').value.trim();
  if (!name) return;
  try {
    const ref = await db.collection('farms').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    pickFarm(ref.id, name);
  } catch (e) { alert('שגיאה: ' + e.message); }
}
