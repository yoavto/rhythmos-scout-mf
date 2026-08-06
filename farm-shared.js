// ════════════════════════════════════════════════════════════════════
// Rhythmos Scout Multi-Farm — shared farm resolution & path helper
// Loaded by BOTH index.html and inspections.html, right after Firebase
// is initialized. Assumes globals `db` and `firebase` already exist.
//
// Data model:
//   clients/{clientId}                         name
//   clients/{clientId}/farms/{farmId}          name
//   clients/{clientId}/farms/{farmId}/<col>    per-farm data (plots, surveys,
//                                               traps, inspections, obs_records)
//   insp_pests, insects, obs_meta              GLOBAL — never farm-scoped
// ════════════════════════════════════════════════════════════════════

let currentClientId = null, currentFarmId = null, currentClientName = '', currentFarmName = '';

// Turns a bare collection name into this farm's nested path.
// Call ONLY for farm-scoped collections (plots/surveys/traps/inspections/obs_records) —
// insp_pests, insects, and obs_meta stay global and must NOT go through this.
function farmCol(name) {
  if (!currentClientId || !currentFarmId) {
    throw new Error('farmCol("' + name + '") called before a farm was resolved');
  }
  return 'clients/' + currentClientId + '/farms/' + currentFarmId + '/' + name;
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

// Resolves current client+farm: saved localStorage choice → GPS + polygon match
// across every farm's plots → manual picker. Always ends with a farm selected.
function resolveFarm() {
  return new Promise((resolve) => {
    const saved = localStorage.getItem('rhythmos_mf_farm');
    if (saved) {
      try {
        const f = JSON.parse(saved);
        if (f.clientId && f.farmId) {
          currentClientId = f.clientId; currentFarmId = f.farmId;
          currentClientName = f.clientName || ''; currentFarmName = f.farmName || '';
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
      setFarm(match.clientId, match.farmId, match.clientName, match.farmName);
      resolve();
      return;
    }
  } catch (e) { /* GPS failed, timed out, or no polygon matched — fall through */ }
  showFarmPicker(resolve);
}

// Scans every farm's plot polygons (Firestore collection-group query) to find
// which client/farm the current GPS position falls inside.
async function findFarmByGPS(lat, lng) {
  try {
    const snap = await db.collectionGroup('insp_plots').get();
    for (const doc of snap.docs) {
      const plot = doc.data();
      if (!plot.polygon || !plot.polygon.length) continue;
      if (ptInPoly(lat, lng, plot.polygon)) {
        const parts = doc.ref.path.split('/'); // clients/{c}/farms/{f}/insp_plots/{p}
        const clientId = parts[1], farmId = parts[3];
        const [clientDoc, farmDoc] = await Promise.all([
          db.collection('clients').doc(clientId).get(),
          db.collection('clients').doc(clientId).collection('farms').doc(farmId).get(),
        ]);
        return {
          clientId, farmId,
          clientName: clientDoc.exists ? (clientDoc.data().name || '') : '',
          farmName: farmDoc.exists ? (farmDoc.data().name || '') : '',
        };
      }
    }
  } catch (e) { console.error('GPS farm detection failed', e); }
  return null;
}

function setFarm(clientId, farmId, clientName, farmName) {
  currentClientId = clientId; currentFarmId = farmId;
  currentClientName = clientName || ''; currentFarmName = farmName || '';
  localStorage.setItem('rhythmos_mf_farm', JSON.stringify({ clientId, farmId, clientName, farmName }));
  showFarmBadge();
}

// "החלף חווה" — clears the saved farm and reloads, which re-runs resolveFarm()
// from a clean slate (simplest way to guarantee every screen re-reads the new farm's data).
function switchFarm() {
  localStorage.removeItem('rhythmos_mf_farm');
  location.reload();
}

// ── Top-bar farm badge ──────────────────────────────────────────────────────
function showFarmBadge() {
  let badge = document.getElementById('farm-badge');
  if (!badge) {
    badge = document.createElement('button');
    badge.id = 'farm-badge';
    badge.onclick = switchFarm;
    badge.style.cssText = 'background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.4);' +
      'color:white;border-radius:8px;padding:5px 10px;font-family:Arial,sans-serif;font-size:11px;' +
      'font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap;' +
      'max-width:130px;overflow:hidden;text-overflow:ellipsis;margin-left:8px;';
    const gtb = document.getElementById('gtb');
    if (gtb) gtb.insertBefore(badge, gtb.firstChild);
  }
  badge.innerHTML = '🔀 ' + (currentFarmName || 'חווה');
  badge.title = (currentClientName ? currentClientName + ' · ' : '') + 'לחץ להחלפת חווה';
}

// ── Manual client/farm picker — full-screen overlay, built dynamically so it
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
  renderClientList();
}

function fpHeader(title) {
  return '<div style="background:var(--red,#890a0a);color:white;padding:20px 16px;font-size:18px;font-weight:700;">' + title + '</div>';
}
function fpEsc(s) { return String(s || '').replace(/'/g, "\\'"); }

async function renderClientList() {
  const overlay = document.getElementById('farm-picker-overlay');
  overlay.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">טוען לקוחות...</div>';
  let clients = [];
  try {
    const snap = await db.collection('clients').orderBy('name').get();
    clients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {}

  overlay.innerHTML = fpHeader('בחר לקוח') + `
    <div style="padding:16px;flex:1;">
      ${clients.length ? clients.map(c => `
        <div onclick="pickClient('${c.id}','${fpEsc(c.name)}')"
          style="background:white;border-radius:10px;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,0.08);cursor:pointer;font-size:15px;font-weight:600;">
          ${c.name || '(ללא שם)'}
        </div>`).join('') : '<p style="color:#888;text-align:center;margin-bottom:16px;">אין לקוחות עדיין</p>'}
      <button onclick="showAddClientForm()"
        style="width:100%;padding:12px;background:white;border:1.5px dashed #999;border-radius:10px;font-size:14px;font-weight:600;color:#555;cursor:pointer;margin-top:6px;">
        + הוסף לקוח
      </button>
    </div>`;
}

async function pickClient(clientId, clientName) {
  const overlay = document.getElementById('farm-picker-overlay');
  overlay.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">טוען חוות...</div>';
  let farms = [];
  try {
    const snap = await db.collection('clients').doc(clientId).collection('farms').orderBy('name').get();
    farms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {}

  overlay.innerHTML = fpHeader(fpEsc(clientName) + ' — בחר חווה') + `
    <div style="padding:16px;flex:1;">
      ${farms.length ? farms.map(f => `
        <div onclick="pickFarm('${clientId}','${fpEsc(clientName)}','${f.id}','${fpEsc(f.name)}')"
          style="background:white;border-radius:10px;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,0.08);cursor:pointer;font-size:15px;font-weight:600;">
          ${f.name || '(ללא שם)'}
        </div>`).join('') : '<p style="color:#888;text-align:center;margin-bottom:16px;">אין חוות ללקוח זה</p>'}
      <button onclick="showAddFarmForm('${clientId}','${fpEsc(clientName)}')"
        style="width:100%;padding:12px;background:white;border:1.5px dashed #999;border-radius:10px;font-size:14px;font-weight:600;color:#555;cursor:pointer;margin-top:6px;">
        + הוסף חווה
      </button>
      <button onclick="renderClientList()"
        style="width:100%;padding:10px;background:none;border:none;font-size:13px;color:#888;cursor:pointer;margin-top:10px;">
        ← חזרה לרשימת לקוחות
      </button>
    </div>`;
}

function pickFarm(clientId, clientName, farmId, farmName) {
  setFarm(clientId, farmId, clientName, farmName);
  const overlay = document.getElementById('farm-picker-overlay');
  if (overlay) overlay.remove();
  const done = __farmPickerDone; __farmPickerDone = null;
  if (done) done();
}

function showAddClientForm() {
  const overlay = document.getElementById('farm-picker-overlay');
  overlay.innerHTML = fpHeader('לקוח חדש') + `
    <div style="padding:16px;">
      <label style="font-size:13px;color:#666;">שם הלקוח</label>
      <input id="new-client-name" type="text" style="width:100%;padding:11px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;margin:6px 0 16px;"/>
      <button onclick="saveNewClient()" style="width:100%;padding:12px;background:var(--red,#890a0a);color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">שמור</button>
      <button onclick="renderClientList()" style="width:100%;padding:10px;background:none;border:none;font-size:13px;color:#888;cursor:pointer;margin-top:8px;">ביטול</button>
    </div>`;
}

async function saveNewClient() {
  const name = document.getElementById('new-client-name').value.trim();
  if (!name) return;
  try {
    const ref = await db.collection('clients').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    pickClient(ref.id, name);
  } catch (e) { alert('שגיאה: ' + e.message); }
}

function showAddFarmForm(clientId, clientName) {
  const overlay = document.getElementById('farm-picker-overlay');
  overlay.innerHTML = fpHeader('חווה חדשה — ' + fpEsc(clientName)) + `
    <div style="padding:16px;">
      <label style="font-size:13px;color:#666;">שם החווה</label>
      <input id="new-farm-name" type="text" style="width:100%;padding:11px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;margin:6px 0 16px;"/>
      <button onclick="saveNewFarm('${clientId}','${fpEsc(clientName)}')" style="width:100%;padding:12px;background:var(--red,#890a0a);color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">שמור</button>
      <button onclick="pickClient('${clientId}','${fpEsc(clientName)}')" style="width:100%;padding:10px;background:none;border:none;font-size:13px;color:#888;cursor:pointer;margin-top:8px;">ביטול</button>
    </div>`;
}

async function saveNewFarm(clientId, clientName) {
  const name = document.getElementById('new-farm-name').value.trim();
  if (!name) return;
  try {
    const ref = await db.collection('clients').doc(clientId).collection('farms').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    pickFarm(clientId, clientName, ref.id, name);
  } catch (e) { alert('שגיאה: ' + e.message); }
}
