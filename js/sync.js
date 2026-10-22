/* Skybloom module: progress sync (step 12). Mirrors users/{uid}/state/progress (firestore.rules) with this device's localStorage.
   Synced: the collection (discovered, discoveredBy, treasures), equipped skins, the Decorate layout (garden) and settings.
   Never synced: gold, best scores, owned skins (the server cannot check them; a skin equipped elsewhere but not owned here is ignored).
   localStorage stays the truth on the device: offline, device-only mode or any server error leaves the game exactly as before.
   Collections only grow, so every exchange is a union (two devices never lose each other's finds); equip / garden / settings follow the newer side. */
import { $, U, applyI18n, store, tl } from './core.js?v=0.7.66';
import { applySkins } from './shop.js?v=0.7.66';
import { confirmBox } from './screens.js?v=0.7.66';

const KEYS = ['discovered', 'discoveredBy', 'treasures', 'equip', 'garden', 'settings'], PREFS = ['equip', 'garden', 'settings'];
const A = window.SkyAuth || { serverConnected: false, currentUser: () => null, onChange() {} };   // auth.js missing: device-only
let ref = null, F = null, timer = 0, applying = false, busy = Promise.resolve();

const readLocal = () => ({ ...Object.fromEntries(KEYS.map(k => [k, store.get(k, null)]).filter(([, v]) => v != null)), updatedAt: store.get('progressAt', 0) });
const has = p => !!p && ((p.discovered || []).length > 0 || Object.values(p.discoveredBy || {}).some(v => v.length) || Object.keys(p.treasures || {}).length > 0);
const uni = (a = [], b = []) => [...new Set([...a, ...b])].sort((x, y) => x - y);
/** a and b: progress docs; prefer: 'a' | 'b' | 'newer' decides equip / garden / settings. Pure, so it can be checked on its own. */
export function mergeProgress(a = {}, b = {}, prefer = 'newer') {
  a = a || {}; b = b || {};
  const win = prefer === 'a' ? a : prefer === 'b' ? b : (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b, lose = win === a ? b : a;
  const by = {}; for (const s of new Set([...Object.keys(a.discoveredBy || {}), ...Object.keys(b.discoveredBy || {})])) by[s] = uni((a.discoveredBy || {})[s], (b.discoveredBy || {})[s]);
  const tr = { ...(a.treasures || {}) };
  for (const [id, t] of Object.entries(b.treasures || {})) { const o = tr[id]; tr[id] = !o ? t : { ...o, n: Math.max(o.n || 0, t.n || 0), first: [o.first, t.first].filter(Boolean).sort()[0] }; }   // the most found, the earliest first-find date
  const out = { discovered: uni(a.discovered, b.discovered), discoveredBy: by, treasures: tr, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
  for (const k of PREFS) { const v = win[k] ?? lose[k]; if (v != null) out[k] = v; }
  return out;
}
function writeLocal(p) {   // into localStorage and the running game, without marking it as a local change
  applying = true;
  try {
    for (const k of KEYS) if (p[k] != null) store.set(k, p[k]);
    store.set('progressAt', p.updatedAt || Date.now());
    U.discovered = new Set(p.discovered || []);
    U.discBy = Object.fromEntries(Object.entries(p.discoveredBy || {}).map(([k, v]) => [k, new Set(v)]));
    U.treasures = p.treasures || {};
    if (p.settings) Object.assign(U.settings, p.settings);
    if (p.equip) for (const [tab, id] of Object.entries(p.equip)) if ((U.owned[tab] || []).includes(id)) U.equip[tab] = id;   // only skins owned on this device
    store.set('equip', U.equip);
    if (U.screen !== 'game') applySkins();   // never swap the art under a running game; it applies on the next screen
    applyI18n();
  } finally { applying = false; }
}
const free = () => new Promise(res => { const t = setInterval(() => { if (['age', 'consent', 'confirm'].every(k => $('ov-' + k).hidden)) { clearInterval(t); res(); } }, 300); });   // ask only once the age / play-test windows are closed
const push = (r, p) => F.setDoc(r, { ...p, updatedAt: p.updatedAt || Date.now() });

/** A user signed in (or the page loaded with one): pull, merge, push. First time for this uid on this device: ask before moving the device's progress in. */
async function start(user) {
  ref = null; clearTimeout(timer);
  if (!user || user.local || !A.serverConnected) return;
  const { app, CDN, emu } = await A.fb();
  F = F || await import(CDN + 'firebase-firestore.js');
  const db = F.getFirestore(app);
  if (emu && !db._skyEmu) { F.connectFirestoreEmulator(db, '127.0.0.1', 8080); db._skyEmu = true; }
  const r = F.doc(db, 'users', user.id, 'state', 'progress'), srv = (await F.getDoc(r)).data() || null, local = readLocal();
  let merged;
  if (store.get('syncUid', null) !== user.id && has(local)) {   // first sign-in with this account on this device, and the device has progress
    await free();
    if (await confirmBox(tl('sync.moveQ'), tl('sync.moveBody'), tl('sync.move'), tl('sync.keep'))) merged = mergeProgress(local, srv, 'a');
    else { store.set('progressBackup', local); merged = mergeProgress(srv || {}, {}, 'a'); if (!srv) for (const k of PREFS) if (local[k] != null) merged[k] = local[k]; }   // "no": the account's own progress (the device copy is kept aside, never thrown away); an empty account keeps this device's settings
  } else merged = mergeProgress(local, srv, 'newer');
  merged.updatedAt = Date.now();
  writeLocal(merged); await push(r, merged);
  store.set('syncUid', user.id); ref = r;
}
/** A synced key changed on this device: push a little later (one write for a burst of changes), merged with the server so another device's finds stay. */
function changed(k) {
  if (applying || !KEYS.includes(k)) return;
  store.set('progressAt', Date.now());
  if (!ref) return;
  clearTimeout(timer);
  timer = setTimeout(() => { busy = busy.then(async () => {
    if (!ref) return;
    const srv = (await F.getDoc(ref)).data() || {}, merged = mergeProgress(readLocal(), srv, 'a');
    merged.updatedAt = Date.now(); await push(ref, merged);
    if (JSON.stringify(mergeProgress(readLocal(), {}, 'a').discoveredBy) !== JSON.stringify(merged.discoveredBy) || Object.keys(merged.treasures).length !== Object.keys(U.treasures).length) writeLocal(merged);   // pull another device's finds in
  }).catch(e => console.warn('[sync] push failed:', e?.code || e?.message || e)); }, 2500);
}

store.onSet = changed;
const run = u => { busy = busy.then(() => (u && ref && ref.path.split('/')[1] === u.id) ? null : start(u)).catch(e => { ref = null; console.warn('[sync] device-only:', e?.code || e?.message || e); }); };   // any failure (offline, rules, blocked SDK) = device-only until the next sign-in or reload
A.onChange(run);
run(A.currentUser());   // a session restored from the last visit (auth.js may already have reported it before this module loaded)
/** For local QA (?debug): the synced uid, or null when device-only. */
export const syncedUid = () => ref ? ref.path.split('/')[1] : null;
