/* Skybloom module: telemetry (13-1) — play-log recorder v2.  Contract: 00_Spec/telemetry_contract_skybloom_v2.json
   Rules: nothing is stored or created before the tester agrees; a recorder failure never reaches the game (every entry point is wrapped);
   the game rules (logic.js) are untouched — the public rule functions are wrapped from here to see their results.
   Queue = IndexedDB 'skybloom-telemetry'. Export = one zip (events.ndjson + manifest.json + device_contexts.json + snapshots.json).
   Imports only core.js and age.js, so every other module may import this one without a cycle; main.js hands over the few functions it needs (bind). */
import { $, APP_V, G, L, U, tl, toWorld } from './core.js?v=0.7.39';
import { age13 } from './age.js?v=0.7.39';   // child mode (under 13, or age not answered yet): nothing is recorded, asked or stored here

const CONSENT_V = 'c1', PROTOCOL_V = 'p1', LSK = 'skybloom.tm.', ITEMS = ['rewind', 'pop', 'drop'];
const CAP = 20000, LIMIT_MS = +((/[?&]tlimit=(\d+)/.exec(location.search) || [])[1] || 1200000);
const DEBUG = location.search.includes('debug');
const ls = {   // only ever touched after consent (reads are fine); 'declined' is a flag without any id
  get(k) { try { return JSON.parse(localStorage.getItem(LSK + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(LSK + k, JSON.stringify(v)); } catch { T.health.storage++; } },
  del(k) { try { localStorage.removeItem(LSK + k); } catch { /* ignore */ } }
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const r1 = n => Math.round(n * 10) / 10, now = () => performance.now();
const X = { busy: () => false, candidates: () => ({ list: [], tile: null, primary: null }), bubbleAt: () => null, inIsland: () => false };   // filled by bind()

const T = {
  on: false, pid: uuid().slice(0, 8), gseq: 0, seq: 0, sid: null, c: null, started: false, cfg: null, testMode: 'natural', sessionNo: 0,
  meta: { sessions: [], contexts: [], snaps: {}, counts: { created: 0, dropped: 0, by: {} } },
  health: { storage: 0, internal: 0, overflow: false, errorsByCode: {} }, complete: true, fg: !document.hidden, hiddenAt: 0, fgTotal: 0, visitN: 0, ctxN: 0, ctxId: null, lastCtx: '',
  scr: { id: 'login', visit: 'v0', parent: null }, iv: null, lastInput: -1e9, lastFrame: now(), frames: [], lat: [], frameN: 0,
  runId: null, mode: null, aidx: -1, ended: true, ia: null, iaStat: null, revStack: [], maxTop: 1, streak: 0, lastCombo: 0, stuckN: 0, rescue: null, oppKey: {}, itemReason: {}, oppN: 0, rid: 0, tid: 0, bn: 0, adN: 0,
  ad: null, hudOffer: null, stuckOffer: null, popping: null, lastId: null, lastSuccess: null, phase: 'day', tutPrev: 0, tutAt: 0, lastRun: null, lastRun0: false, runFg: 0, limitHit: false, loadMs: null, errSupp: 0
};
let buf = [], mem = [], db = null, fq = Promise.resolve(), metaTimer = 0, flushTimer = 0, ovEls = null;

/* ---------- safety: nothing here may throw into the game ---------- */
const safe = (fn, fallback) => { try { return fn(); } catch (e) { T.health.internal++; if (DEBUG) console.warn('telemetry', e); return fallback; } };

/* ---------- storage (IndexedDB) ---------- */
function idbOpen() {
  return new Promise(res => {
    try {
      const r = indexedDB.open('skybloom-telemetry', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('events', { keyPath: 'event_id' }); r.result.createObjectStore('meta', { keyPath: 'k' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch { res(null); }
  });
}
const idbAll = store => new Promise(res => { try { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); } catch { res([]); } });
function flush() {
  fq = fq.then(async () => {
    if (!buf.length) return; const batch = buf; buf = [];
    if (!db) { mem.push(...batch); return; }
    try {
      await new Promise((res, rej) => { const tx = db.transaction('events', 'readwrite'), st = tx.objectStore('events'); batch.forEach(e => st.put(e)); tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });
    } catch { mem.push(...batch); T.health.storage++; T.complete = false; }
  }).catch(() => { T.health.storage++; });
  return fq;
}
function saveMeta() {
  if (metaTimer) return;
  metaTimer = setTimeout(() => {
    metaTimer = 0; if (!db) return;
    try { db.transaction('meta', 'readwrite').objectStore('meta').put({ k: 'meta', v: T.meta }); } catch { T.health.storage++; }
  }, 800);
}
async function loadMeta() {
  if (!db) return; const m = (await idbAll('meta')).find(r => r.k === 'meta'); if (m && m.v) T.meta = Object.assign(T.meta, m.v);
}

/* ---------- context (web estimates only: no model, no brand, no ad id) ---------- */
function captureContext(reason) {
  const ua = navigator.userAgent || '', plat = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? (navigator.maxTouchPoints > 1 ? 'ios' : 'macos') : /Windows/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : 'other';
  const m = re => { const x = re.exec(ua); return x ? +x[1] : null; };
  const browser = /Edg\//.test(ua) ? ['edge', m(/Edg\/(\d+)/)] : /SamsungBrowser/.test(ua) ? ['samsung', m(/SamsungBrowser\/(\d+)/)] : /Chrome\//.test(ua) || /CriOS/.test(ua) ? ['chrome', m(/(?:Chrome|CriOS)\/(\d+)/)] : /Firefox\//.test(ua) ? ['firefox', m(/Firefox\/(\d+)/)] : /Safari\//.test(ua) ? ['safari', m(/Version\/(\d+)/)] : ['other', null];
  const mem0 = navigator.deviceMemory, st = $('stage').getBoundingClientRect();
  const c = { reason, runtime: 'web', platform: plat, os: { family: plat, major_est: plat === 'ios' ? m(/OS (\d+)_/) : null }, browser: { name: browser[0], major: browser[1] },
    screen: { w: screen.width, h: screen.height, dpr: Math.round(devicePixelRatio * 100) / 100 }, viewport: { w: innerWidth, h: innerHeight }, content_rect: { w: 1080, h: 1920, css_w: Math.round(st.width), css_h: Math.round(st.height), version: 'cr1' },
    input: { touch: navigator.maxTouchPoints > 0, mouse: matchMedia('(pointer:fine)').matches }, lang: navigator.language, timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })(),
    mem_class: mem0 == null ? 'unknown' : mem0 <= 2 ? 'low' : mem0 <= 4 ? 'mid' : 'high', cpu_cores: navigator.hardwareConcurrency || null, standalone: !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches),
    orientation: innerHeight >= innerWidth ? 'portrait' : 'landscape', reduced_motion_os: matchMedia('(prefers-reduced-motion: reduce)').matches };
  const key = JSON.stringify([c.screen, c.viewport, c.orientation]);
  if (key !== T.lastCtx || !T.ctxId) { T.lastCtx = key; T.ctxId = 'dc' + (++T.ctxN) + '-' + T.pid; T.meta.contexts.push({ device_context_id: T.ctxId, captured_at_utc: new Date().toISOString(), mono_ms: r1(now()), ...c }); saveMeta(); }
  return c;
}
let resizeT = 0; addEventListener('resize', () => { if (!T.on) return; clearTimeout(resizeT); resizeT = setTimeout(() => safe(() => captureContext('resize')), 400); });

/* ---------- the writer ---------- */
function admit(name) {   // queue limit: past CAP the detail events go first, the rest may use a 25% reserve
  const n = T.meta.counts.created - T.meta.counts.dropped;
  if (n < CAP) return true;
  if (n < CAP * 1.25 && !['ui_interaction', 'performance_summary', 'screen_time'].includes(name)) return true;
  T.meta.counts.dropped++; T.complete = false;
  if (!T.health.overflow) { T.health.overflow = true; emit('telemetry_health', { checkpoint: 'queue_overflow', created_count: T.meta.counts.created, acknowledged_count: n, dropped_count: T.meta.counts.dropped, pending_count: buf.length + mem.length, collection_complete: false, reason: 'queue_limit' }, { force: true }); }
  return false;
}
function emit(name, p, o = {}) {
  if (!T.on) return null;
  try {
    if (!o.force && !admit(name)) return null;
    const sc = o.scr || T.scr, e = { event_id: `${T.pid}.${++T.gseq}`, event_name: name, session_id: T.sid, session_seq: ++T.seq, mono_ms: r1(o.mono ?? now()), client_time_utc: new Date().toISOString(),
      screen_id: sc.id, screen_visit_id: sc.visit, device_context_id: T.ctxId, run_id: T.runId, mode: T.mode, properties: p };
    if (T.runId) { e.play_ms = Math.round(o.play ?? U.playMs); if (T.aidx >= 0) e.action_index = T.aidx; }
    const ia = o.ia === undefined ? T.ia : o.ia; if (ia) e.interaction_id = ia;
    const c = T.meta.counts; c.created++; c.by[name] = (c.by[name] || 0) + 1;
    buf.push(e); T.lastId = e.event_id;
    if (buf.length >= 50) flush(); else if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = 0; flush(); }, 1000);
    saveMeta(); return e.event_id;
  } catch { T.health.internal++; return null; }
}

/* ---------- state helpers ---------- */
const pairs = b => { let n = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (b[r][c]) { if (c < 3 && b[r][c + 1] === b[r][c]) n++; if (r < 3 && b[r + 1][c] === b[r][c]) n++; } return n; };
const cellOf = rc => rc ? rc[0] * 4 + rc[1] : null;
const hashOf = s => window.SkyHash.stateHash(s);
const logT = s => s.log.length ? s.log[s.log.length - 1].t : s.t;   // the play time the rules stamped on the last logged command (what replay.js uses)
function sum(s) {
  if (T.lastCombo === 0 && s.combo > 0) T.streak++; T.lastCombo = s.combo;
  return { score: s.score, combo: s.combo, highest_tier: s.top, empty_cells: L.empties(s.board).length, merge_pairs: pairs(s.board), next_building_id: 'lv' + s.next, items: { ...s.items }, moves: s.stats.merges + s.stats.places, streak_id: `${T.runId}:${T.streak}` };
}
function snapshot(reason) {
  const id = 's' + Object.keys(T.meta.snaps).length + '-' + T.pid;
  T.meta.snaps[id] = { board: L.clone(G.board), items: { ...G.items }, next: G.next, rs: G.rs, score: G.score, combo: G.combo, top: G.top, got: G.got.slice(), bandLeft: G.bandLeft.slice(), adsUsed: G.adsUsed, hist: G.history.length, t: G.t };   // copies: events are written a moment later
  emit('state_snapshot', { snapshot_id: id, snapshot_ref: id, state_hash: hashOf(G), reason, resolved_config_ref: T.cfg, logical_state_only: true });
}
function ledger(item, before, after, op, reason, cause, rewardId, scope = 'run') {
  if (before === after) return;
  emit('item_balance_changed', { transaction_id: `${T.pid}.x${++T.tid}`, item_id: item, delta: after - before, balance_before: before, balance_after: after, operation: op, reason, caused_by_event_id: cause, reward_id: rewardId || null, scope });
}
function reward(type, content, qty, cause, ex = {}) {
  const id = `${T.pid}.r${++T.rid}`;
  emit('reward_granted', { reward_id: id, reward_type: type, reward_content_id: content, quantity: qty, trigger_action_id: cause || null, streak_id: ex.streak || null, threshold: ex.threshold ?? null, bubble_id: ex.bubble || null });
  return id;
}

/* ---------- wrapping the rules (logic.js): see each result at the commit point ---------- */
const REASON = { full: 'disabled_no_space', 'no-item': 'disabled_no_inventory', occupied: 'target_occupied', 'not-adjacent-same': 'non_adjacent', empty: 'invalid_target', nothing: 'no_undo_target', limit: 'ad_limit', 'has-items': 'has_items' };
const pre = s => ({ sum: sum(s), hash: hashOf(s), items: { ...s.items }, adsUsed: s.adsUsed });
function wrap(name, handler) {
  const orig = L[name];
  L[name] = function (...a) {
    if (!T.on || !T.runId || T.ended || a[0] !== G) return orig.apply(this, a);
    const p = safe(() => pre(a[0])), res = orig.apply(this, a);   // a rules exception reaches the game exactly as before
    if (p) safe(() => handler(p, res, a, a[0]));
    return res;
  };
}
function act(action, p, res, s, ex = {}) {
  const ok = !res || res.ok !== false, after = ok ? sum(s) : p.sum;
  if (ok) T.aidx++;
  const props = { action, status: ok ? 'success' : 'rejected', reason: ok ? 'ok' : REASON[res.reason] || 'unknown', from_cell: ex.from ?? null, target_cell: ex.target ?? null, actual_cell: ex.actual ?? null,
    building_id: ex.bid ?? null, building_tier: ex.tier ?? null, before: p.sum, after, state_hash_before: p.hash, state_hash_after: ok && !ex.hashNull ? hashOf(s) : ok ? null : p.hash, item_id: ok ? ex.item || null : null,
    reverted_action_id: ex.reverted ?? null, reward_ids: ex.rewards || [], gained_score: ex.gained ?? null, combo: ex.combo ?? null };
  if (ex.approx) props.summary_approx = true;
  const ev = emit('game_action', props, { ia: ex.noIa ? null : undefined, play: ok ? (ex.play ?? logT(s)) : s.t });
  if (T.iaStat && !ex.noIa) { if (ok) T.iaStat.ok++; else { T.iaStat.rej++; T.iaStat.reason = props.reason; } }
  if (ok) { T.lastSuccess = ev; if (T.rescue && !T.rescue.choice && ['pop', 'rewind'].includes(action)) T.rescue.choice = action; }
  return { ev, ok };
}
function pushRev(ev) { T.revStack.push(ev); if (T.revStack.length > L.CONFIG.historyLimit) T.revStack.shift(); }
function topCheck(s) {
  if (s.top > T.maxTop) { for (let lv = T.maxTop + 1; lv <= s.top; lv++) emit('milestone_reached', { building_id: 'lv' + lv, building_tier: lv, numeric_equivalent: 2 ** (lv - 1), is_target: lv === 12 }, { play: logT(s) }); T.maxTop = s.top; }
}
function installWraps() {
  wrap('place', (p, res, a, s) => {
    const at = a[2], r = act(at ? 'drop' : 'place_random', p, res, s, { target: at ? cellOf(at) : null, item: at ? 'drop' : null, ...(res.ok ? { actual: cellOf(res.at), bid: 'lv' + res.lv, tier: res.lv } : {}) });
    if (!r.ok) return;
    pushRev(r.ev); if (at) ledger('drop', p.items.drop, s.items.drop, 'consume', 'item_use', r.ev); topCheck(s);
  });
  wrap('merge', (p, res, a, s) => {
    const gr = res.ok ? res.grants : [], rids = gr.map(() => `${T.pid}.r${++T.rid}`);   // reward ids exist before the action event that lists them
    const r = act('merge', p, res, s, res.ok ? { from: cellOf(a[1]), target: cellOf(a[2]), actual: cellOf(a[2]), bid: res.bloom ? 'bloom' : 'lv' + res.lv, tier: res.bloom ? null : res.lv, gained: res.gained, combo: res.combo, rewards: rids } : { from: cellOf(a[1]), target: cellOf(a[2]) });
    if (!r.ok) return;
    pushRev(r.ev); const run = { ...p.items };
    gr.forEach((g, i) => {
      emit('reward_granted', { reward_id: rids[i], reward_type: g.why === 'combo' ? 'combo' : g.why === 'milestone' ? 'building_milestone' : 'bloom', reward_content_id: g.item, quantity: 1, trigger_action_id: r.ev, streak_id: `${T.runId}:${T.streak}`, threshold: g.combo || g.level || 17, bubble_id: null });
      ledger(g.item, run[g.item], run[g.item] + 1, 'grant', g.why === 'milestone' ? 'building_milestone' : g.why, r.ev, rids[i]); run[g.item]++;
    });
    topCheck(s);
  });
  wrap('pop', (p, res, a, s) => {
    const r = act('pop', p, res, s, { target: cellOf(a[1]), ...(res.ok ? { actual: cellOf(a[1]), bid: 'lv' + res.lv, tier: res.lv, item: 'pop' } : {}) });
    if (r.ok) { pushRev(r.ev); ledger('pop', p.items.pop, s.items.pop, 'consume', 'item_use', r.ev); }
  });
  wrap('rewind', (p, res, a, s) => {
    const reverted = res.ok ? T.revStack.pop() || null : null, r = act('rewind', p, res, s, res.ok ? { item: 'rewind', reverted } : {});
    if (r.ok) for (const k of ITEMS) ledger(k, p.items[k], s.items[k], k === 'rewind' ? 'consume' : 'adjust', k === 'rewind' ? 'item_use' : 'rewind_restore', r.ev);
  });
  wrap('adRefill', (p, res, a, s) => {
    if (!res.ok) return;
    T.aidx++;
    const ad = T.ad || { id: `ad${++T.adN}-${T.pid}`, placement: T.rescue ? 'stuck_window' : 'hud_button', offer: now() };
    const ev = emit('ad_event', { ad_instance_id: ad.id, stage: 'complete', placement_id: ad.placement, mock: true, dwell_ms: Math.round(now() - ad.offer), ads_left: L.CONFIG.ads.maxPerGame - s.adsUsed }, { ia: null, play: logT(s) });
    for (const k of ITEMS) { const id = reward('ad', k, res.each, ev); ledger(k, p.items[k], s.items[k], 'grant', 'ad', ev, id); }
    T.ad = null; T.hudOffer = null; T.stuckOffer = null; T.lastSuccess = ev;
  });
  wrap('popBubble', (p, res, a, s) => {
    T.aidx++;
    const c = a[1], rec = T.popping; T.popping = null;
    const ev = emit('bubble_lifecycle', { bubble_id: rec ? rec.id : `b?-${T.pid}`, stage: 'collected', kind: c.kind, content_id: c.kind === 'item' ? c.item : c.kind === 'treasure' ? c.id : c.kind === 'gold' ? c.amount : null, side: rec ? rec.side : 'bottom',
      eligible_visible_ms: Math.round(rec ? rec.el : 0), screen_visible_ms: Math.round(rec ? rec.sv : 0), tappable_ms: Math.round(rec ? rec.tp : 0), reason: 'ok', is_new: c.kind === 'treasure' ? !a[2] : null, age_ms: rec ? Math.round(now() - rec.t0) : null }, { play: logT(s) });
    if (T.iaStat) T.iaStat.bubble = true;
    if (res.item) { const id = reward('bubble', res.item, 1, ev, { bubble: rec && rec.id }); ledger(res.item, p.items[res.item], s.items[res.item], 'grant', 'bubble', ev, id); }
    T.lastSuccess = ev;
  });
  const sa = L.speedAdvance;   // automatic placements (speed mode) happen inside the rules; they are seen here
  L.speedAdvance = function (...a) {
    if (!T.on || !T.runId || T.ended || a[0] !== G || G.mode !== 'speed' || !(G.nextAt <= a[1])) return sa.apply(this, a);   // called every frame: only look when a placement is due
    const p = safe(() => pre(a[0])), res = sa.apply(this, a);
    if (p && res.length) safe(() => {
      const s = a[0], autos = s.log.filter(x => x.a === 'auto').slice(-res.length);
      res.forEach((e, i) => { const r = act('auto_place', i === 0 ? p : { ...p, sum: sum(s), hash: null }, e, s, { actual: cellOf(e.at), bid: 'lv' + e.lv, tier: e.lv, noIa: true, play: autos[i] ? autos[i].t : undefined, approx: res.length > 1, hashNull: res.length > 1 }); pushRev(r.ev); topCheck(s); });
    });
    return res;
  };
}

/* ---------- screens and time (foreground / running / input-enabled / recent / quiet) ---------- */
const OVS = ['feedback', 'consent', 'export', 'confirm', 'settings', 'collection', 'sheet', 'ranking', 'shop', 'result', 'ad', 'stuck', 'celebrate'];   // top-most first (document order, reversed)
const OVID = n => ['settings', 'shop', 'ranking', 'collection'].includes(n) ? n : 'ov:' + n;
function topScreen() {
  ovEls = ovEls || OVS.map(n => [n, $('ov-' + n)]);
  const open = ovEls.filter(([, el]) => el && !el.hidden).map(([n]) => n);
  return open.length ? { id: OVID(open[0]), parent: open[1] ? OVID(open[1]) : U.screen } : { id: U.screen, parent: null };
}
const newIv = t => ({ start: t, run: 0, inp: 0, rec: 0, scr: T.scr });
const running = () => T.scr.id === 'game' && !!T.runId && !T.ended && !(G.meta && G.meta.over);
const inputOn = () => T.scr.id === 'ov:stuck' ? false : T.scr.id === 'game' ? !X.busy() : true;
function closeInterval(why, t = now(), keep = true) {
  const iv = T.iv; T.iv = keep && T.fg ? newIv(t) : null; if (!iv) return;
  const dur = t - iv.start; if (dur < 1) return; const rec = Math.min(dur, iv.rec); T.fgTotal += dur;
  emit('screen_time', { interval_id: `${iv.scr.visit}.${T.seq + 1}`, start_mono_ms: r1(iv.start), end_mono_ms: r1(t), foreground_ms: r1(dur), running_ms: r1(Math.min(dur, iv.run)), input_enabled_ms: r1(Math.min(dur, iv.inp)), recent_input_ms: r1(rec), quiet_visible_ms: r1(dur - rec), close_reason: why }, { scr: iv.scr, mono: t });
}
function setScreen(id, parent, reason) {
  closeInterval('navigate'); const prev = T.scr.id;
  T.scr = { id, visit: 'v' + (++T.visitN) + '-' + T.pid, parent }; if (T.iv) T.iv.scr = T.scr;
  emit('screen_entered', { previous_screen_id: prev, enter_reason: reason, overlay_parent: parent, input_enabled: id !== 'ov:stuck' });
}
function pollScreen() {
  const t = topScreen(); if (t.id === T.scr.id) return;
  const wasOv = T.scr.parent != null, isOv = t.parent != null;
  setScreen(t.id, t.parent, isOv ? 'overlay_open' : wasOv ? 'overlay_close' : T.scr.id === 'main' && t.id === 'game' ? 'game_start' : 'navigate');
}

/* ---------- bubbles ---------- */
const bmap = new Map();
const bcontent = c => c.kind === 'item' ? c.item : c.kind === 'treasure' ? c.id : c.kind === 'gold' ? c.amount : null;
function endBubble(b, rec, stage, reason) {
  emit('bubble_lifecycle', { bubble_id: rec.id, stage, kind: b.content.kind, content_id: bcontent(b.content), side: rec.side, eligible_visible_ms: Math.round(rec.el), screen_visible_ms: Math.round(rec.sv), tappable_ms: Math.round(rec.tp), reason, age_ms: Math.round(now() - rec.t0) });
}
function trackBubbles(dt) {
  if (!T.runId || T.ended) return;
  const live = U.screen === 'game' ? U.bubbles : [], [x0, y0] = toWorld([0, 0]), [x1, y1] = toWorld([1080, 1920]), on = T.scr.id === 'game' && !X.busy();   // eligible = on the board screen with nothing open over it
  for (const b of live) {
    if (b.sx == null) continue;   // not positioned yet
    let rec = bmap.get(b);
    if (!rec) {
      rec = { id: `b${++T.bn}-${T.pid}`, t0: now(), sv: 0, el: 0, tp: 0, vis: false, side: b.sx < x0 ? 'left' : b.sx > x1 ? 'right' : 'bottom' }; bmap.set(b, rec);
      emit('bubble_lifecycle', { bubble_id: rec.id, stage: 'spawned', kind: b.content.kind, content_id: bcontent(b.content), side: rec.side, eligible_visible_ms: 0, screen_visible_ms: 0, tappable_ms: 0, reason: 'ok' });
    }
    if (b.sx >= x0 && b.sx <= x1 && b.y >= y0 && b.y <= y1) {
      if (!rec.vis) { rec.vis = true; emit('bubble_lifecycle', { bubble_id: rec.id, stage: 'visible', kind: b.content.kind, content_id: bcontent(b.content), side: rec.side, eligible_visible_ms: 0, screen_visible_ms: 0, tappable_ms: 0, reason: 'ok', age_ms: Math.round(now() - rec.t0) }); }
      rec.sv += dt; if (on) { rec.el += dt; if (!X.inIsland(b.sx, b.y)) rec.tp += dt; }
    }
  }
  for (const [b, rec] of bmap) if (!live.includes(b)) { bmap.delete(b); if (!rec.popping) endBubble(b, rec, 'expired', 'left_screen'); }
}

/* ---------- items, the stuck window (rescue episode), ads ---------- */
function itemReason(k) {
  const bal = G.items[k], full = !L.empties(G.board).length;
  return bal <= 0 ? 'disabled_no_inventory' : k === 'rewind' && !G.history.length ? 'no_undo_target' : k === 'drop' && full ? 'disabled_no_space' : k === 'pop' && !G.board.flat().some(Boolean) ? 'invalid_target' : 'ok';
}
function oppPoll() {
  if (!T.runId || T.ended || U.screen !== 'game' || !G.meta || G.meta.over) return;
  const blds = G.board.flat().filter(Boolean).length;
  for (const k of ITEMS) {
    const reason = T.itemReason[k] = itemReason(k), bal = G.items[k], key = bal + '|' + reason;
    if (T.oppKey[k] === key) continue; T.oppKey[k] = key;
    emit('item_opportunity', { item_id: k, opportunity_id: `${T.pid}.o${++T.oppN}`, visible: true, enabled: reason === 'ok', balance: bal, reason, eligible_cell_count: k === 'pop' ? blds : k === 'drop' ? 16 - blds : 0 });
  }
  const hud = !$('ad-refill').hidden;
  if (hud && !T.hudOffer && !T.rescue) { T.hudOffer = { id: `ad${++T.adN}-${T.pid}`, t: now() }; emit('ad_event', { ad_instance_id: T.hudOffer.id, stage: 'offer', placement_id: 'hud_button', mock: true, ads_left: L.CONFIG.ads.maxPerGame - G.adsUsed }); }
  else if (!hud && T.hudOffer && !T.ad) T.hudOffer = null;
  if (T.rescue && !L.isStuck(G.board)) rescueExit('playing');   // the episode ends when the board can move again (after a pop, a rewind, or both with an ad in between)
}
function rescueExit(status, choice = null) {
  const r = T.rescue; if (!r) return; T.rescue = null;
  const usable = []; if (G.items.pop > 0) usable.push('pop'); if (G.items.rewind > 0 && G.history.length) usable.push('rewind'); if (L.canAdRefill(G)) usable.push('ad');
  emit('board_status_changed', { previous_status: 'rescue', status, empty_cells: L.empties(G.board).length, merge_pairs: pairs(G.board), available_items: usable, episode_id: r.ep, choice: choice || r.choice || 'none', dwell_ms: Math.round(now() - r.t0), stuck_index: r.n });
}

/* ---------- interactions (ui_interaction): capture-phase listeners; the game's own handlers run unchanged ---------- */
let gesture = null;
const newIa = () => `${T.pid}.i${++T.gseq}`;
function stageNorm(e) { const r = $('stage').getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
const blockReason = () => U.tut && U.screen === 'game' ? 'tutorial_lock' : U.anim ? 'animation_lock' : X.busy() ? 'modal_open' : null;
function begin(g) { T.ia = g.ia; T.iaStat = { ok: 0, rej: 0, bubble: false, reason: null }; g.selB = cellOf(U.sel); g.tgtB = U.target; g.block = blockReason(); }
function outcomeOf(g) {
  const st = T.iaStat, selA = cellOf(U.sel);
  if (st.bubble) return ['bubble_collected', 'ok'];
  if (st.ok) return ['command_dispatched', 'ok'];
  if (st.rej) return ['ignored', st.reason];
  if (g.btn && g.itemBlock) return ['ignored', g.itemBlock];
  if (!g.btn && U.nope && now() - U.nope.t0 < 200) return ['ignored', 'no_pair'];   // a building with no partner: the game deselects it and shakes it
  if (g.tgtB && U.target === g.tgtB && !g.btn) return ['ignored', g.tgtB === 'drop' && g.hit.startsWith('cell:') ? 'target_occupied' : 'invalid_target'];   // item target mode stays open: wrong cell picked
  if (U.target !== g.tgtB) return U.target ? ['item_target_selected', 'ok'] : ['cancelled', 'ok'];
  if (selA !== g.selB) return selA == null ? ['deselected', g.hitEmpty ? 'empty_cell_deselect' : 'selection_toggle'] : g.selB == null ? ['selected', 'ok'] : ['selection_changed', 'selection_changed'];
  if (g.btn) return g.block && g.gameBtn ? ['ignored', g.block] : ['activated', 'ok'];
  if (g.block) return ['ignored', g.block];
  return ['ignored', g.hit === 'sky' || g.hit === 'island' ? 'outside_board' : 'unknown'];
}
function finishGesture(g, up) {
  const [outcome, reason] = outcomeOf(g), props = { input_type: g.type, target_id: g.target, hit_target_id: g.hit, x_norm: g.nx == null ? null : Math.round(g.nx * 1000) / 1000, y_norm: g.ny == null ? null : Math.round(g.ny * 1000) / 1000, cell_index: g.cell ?? null,
    selection_before: g.selB, selection_after: cellOf(U.sel), outcome: g.picker && !['command_dispatched', 'selected', 'selection_changed'].includes(outcome) ? 'picker_opened' : outcome, reason, feedback_latency_ms: null, latency_endpoint: 'next_raf_after_release', input_block_reason: g.block,
    content_rect_version: 'cr1', gesture: g.gesture, press_ms: g.press ?? null, near_bubble_id: g.near || null, over_island: g.isl ?? null };
  const ia = g.ia; if (T.ia === ia) { T.ia = null; T.iaStat = null; }
  let done = false; const send = () => { if (done) return; done = true; props.feedback_latency_ms = r1(now() - up); T.lat.push(props.feedback_latency_ms); emit('ui_interaction', props, { ia }); };
  requestAnimationFrame(send); setTimeout(send, 120);
}
const later = (g, t) => setTimeout(() => safe(() => finishGesture(g, t)), 0);   // after the game's own handlers have run
function onDown(e) {
  if (!T.on) return; T.lastInput = now();
  if (!(e.target && e.target.id === 'cv')) return;
  safe(() => {
    const [nx, ny] = stageNorm(e), g = { ia: newIa(), t0: now(), nx, ny, type: e.pointerType || 'mouse', gesture: 'tap', x0: e.clientX, y0: e.clientY, target: 'sky', hit: 'sky' };
    begin(g);
    const w = toWorld([nx * 1080, ny * 1920]);
    if (U.screen === 'game') {
      const c = X.candidates(w[0], w[1]);
      if (c.primary) { g.cell = cellOf(c.primary); g.hit = `cell:${g.cell}`; g.target = `cell:${g.cell}`; }
      else if (c.tile) { g.cell = cellOf(c.tile); g.hit = `tile:${g.cell}`; g.target = `tile:${g.cell}`; g.hitEmpty = true; }
    }
    if (g.hit === 'sky') { const b = X.bubbleAt(w[0], w[1]); if (b) { const rec = bmap.get(b); g.hit = g.target = 'bubble:' + (rec ? rec.id : '?'); } else if (X.inIsland(w[0], w[1])) g.hit = 'island'; }
    g.isl = X.inIsland(w[0], w[1]);
    if (!g.hit.startsWith('bubble')) for (const b of U.bubbles) { const rec = bmap.get(b); if (rec && b.sx != null && Math.hypot(w[0] - b.sx, w[1] - b.y) < b.r + 40) { g.near = rec.id; break; } }
    gesture = g;
  });
}
function onUp(e) {
  if (!gesture) return; const g = gesture; gesture = null;
  safe(() => { g.press = Math.round(now() - g.t0); if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 18) g.gesture = 'drag'; else if (g.press >= 400) g.gesture = 'long_press'; g.picker = !$('picker').hidden; later(g, now()); });
}
function onCancel() { if (!gesture) return; const g = gesture; gesture = null; safe(() => { g.block = g.block || 'gesture_cancelled'; later(g, now()); }); }
const PRE = { res: 'result', set: 'settings', log: 'export', cf: 'confirm', cel: 'celebrate', rk: 'ranking', tab: 'collection', fb: 'feedback', cs: 'consent' };
function btnId(b) {
  if (b.dataset.item) return 'btn:item:' + b.dataset.item; if (b.id === 'place') return 'btn:place'; if (b.id === 'ad-refill') return 'btn:ad_refill';
  if (b.dataset.open) return 'btn:open:' + b.dataset.open; if (b.hasAttribute('data-close')) return 'btn:close';
  if (b.dataset.bd) return 'btn:bd:' + b.dataset.bd; if (b.dataset.tr) return 'btn:tr:' + b.dataset.tr; if (b.dataset.buy !== undefined) return 'btn:shop:buy'; if (b.dataset.equip !== undefined) return 'btn:shop:equip';
  const m = /^(btn|[a-z]+)-(.+)$/.exec(b.id || ''); if (m) return m[1] === 'btn' ? 'btn:' + m[2] : `btn:${PRE[m[1]] || m[1]}:${m[2]}`;
  return 'btn:' + (b.id || (b.getAttribute('aria-label') || 'unknown').slice(0, 16));
}
function onClick(e) {
  if (!T.on) return; T.lastInput = now();
  safe(() => {
    const b = e.target && e.target.closest && e.target.closest('button'); if (!b || e.target.id === 'cv') return;
    const kb = e.detail === 0, g = { ia: newIa(), t0: now(), type: kb ? 'keyboard' : (e.pointerType || 'mouse'), gesture: kb ? 'key' : 'click', btn: true, target: btnId(b), hit: btnId(b), nx: null, ny: null, cell: null };
    if (!kb) { const [nx, ny] = stageNorm(e); g.nx = nx; g.ny = ny; }
    g.gameBtn = !!(b.dataset.item || b.id === 'place' || b.id === 'ad-refill');
    begin(g);
    if (b.dataset.item && !g.block) { const why = itemReason(b.dataset.item); if (why !== 'ok') g.itemBlock = why; }
    later(g, now());
  });
}
const KEYS = { ' ': 'place', Enter: 'place', z: 'rewind', Z: 'rewind', Backspace: 'rewind', Escape: 'cancel' };
function onKey(e) {
  if (!T.on || U.screen !== 'game' || !KEYS[e.key] || (document.activeElement && document.activeElement.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter'))) return;
  T.lastInput = now();
  safe(() => { const g = { ia: newIa(), t0: now(), type: 'keyboard', gesture: 'key', target: 'key:' + KEYS[e.key], hit: null, nx: null, ny: null, cell: null, btn: true, gameBtn: true }; begin(g); later(g, now()); });
}
document.addEventListener('pointerdown', onDown, true); document.addEventListener('pointerup', onUp, true); document.addEventListener('pointercancel', onCancel, true);
document.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey, true);

/* ---------- lifecycle, errors ---------- */
document.addEventListener('visibilitychange', () => {
  if (!T.on) return;
  safe(() => {
    if (document.hidden) { closeInterval('background', now(), false); T.fg = false; T.hiddenAt = now(); emit('app_lifecycle', { state: 'background', reason: 'visibility_hidden', previous_state: 'foreground' }); flush(); saveMeta(); }
    else if (now() - T.hiddenAt > 30 * 60000) { T.fg = true; T.lastFrame = now(); startSession('timeout_resume'); }
    else { T.fg = true; T.lastFrame = now(); T.iv = newIv(now()); emit('app_lifecycle', { state: 'foreground', reason: 'visibility_visible', previous_state: 'background' }); }
  });
});
addEventListener('pagehide', () => { if (T.on) safe(() => { closeInterval('background', now(), false); emit('app_lifecycle', { state: 'paused', reason: 'pagehide', previous_state: 'foreground' }); flush(); saveMeta(); }); });
function err(code, sev, msg) {
  if (!T.on) return; const n = T.health.errorsByCode[code] = (T.health.errorsByCode[code] || 0) + 1; if (n > 10) { T.errSupp++; return; }
  safe(() => emit('error_reported', { error_code: code, severity: sev, state_hash: T.runId ? safe(() => hashOf(G), null) : null, related_event_id: T.lastId, snapshot_ref: null, sanitized_message: String(msg || '').replace(/https?:\/\/\S+/g, '<url>').replace(/\/Users\/\S+/g, '<path>').slice(0, 200) }));
}
document.addEventListener('webglcontextlost', () => { if (T.on) safe(() => { emit('app_lifecycle', { state: 'context_suspended', reason: 'webgl_context_lost', previous_state: 'foreground' }); err('webgl_context_lost', 'error', 'WebGL context lost'); }); }, true);
document.addEventListener('webglcontextrestored', () => { if (T.on) safe(() => emit('app_lifecycle', { state: 'context_resumed', reason: 'webgl_context_restored', previous_state: 'context_suspended' })); }, true);
addEventListener('error', e => err('js_error', 'error', e.message)); addEventListener('unhandledrejection', e => err('js_unhandled_rejection', 'error', (e.reason && e.reason.message) || e.reason));
window.__tmAsset = src => err('asset_load_failed', 'warning', String(src).split('/').pop());

/* ---------- the clock (rAF; a hidden tab does not run it) ---------- */
function frame() {
  requestAnimationFrame(frame);
  if (!T.on || !T.fg) return;
  try {
    const t = now(), raw = t - T.lastFrame; T.lastFrame = t; const dt = Math.min(raw, 100);
    if (raw < 1000) T.frames.push(raw);
    pollScreen(); if (!T.iv) T.iv = newIv(t);
    const iv = T.iv; if (t - T.lastInput <= 30000) iv.rec += dt; if (running()) iv.run += dt; if (inputOn()) iv.inp += dt;
    trackBubbles(dt);
    if (++T.frameN % 6 === 0) oppPoll();
    if (T.runId && !T.ended && U.screen === 'game') {   // scene phase (day -> sunset at Lv12 -> night at Lv15) and the test time limit
      const ph = U.phaseTop >= 15 ? 'night' : U.phaseTop >= 12 ? 'sunset' : 'day';
      if (ph !== T.phase) { emit('scene_phase_changed', { previous_phase: T.phase, phase: ph, building_tier: U.phaseTop }); T.phase = ph; }
      if (!T.limitHit && T.lastRun0 && running() && (T.runFg += dt) > LIMIT_MS) testLimit();
    }
    if (t - iv.start >= 15000) tick15(t);
  } catch { T.health.internal++; }
}
function tick15(t) {
  closeInterval('heartbeat', t);
  const f = T.frames.slice().sort((a, b) => a - b); T.frames = [];
  if (f.length >= 20) { const lat = T.lat.slice().sort((a, b) => a - b); emit('performance_summary', { frame_count: f.length, frame_time_p50_ms: r1(f[f.length >> 1]), frame_time_p95_ms: r1(f[Math.floor(f.length * .95)]), slow_frame_count: f.filter(x => x > 33.4).length, threshold_ms: 33.4, input_latency_p95_ms: lat.length ? lat[Math.floor(lat.length * .95)] : null, measurement_method: 'raf_delta' }); }
  T.lat = [];
  emit('session_heartbeat', { foreground_total_ms: r1(T.fgTotal), last_action_index: T.runId ? T.aidx : null, pending_events: buf.length + mem.length, collection_complete: T.complete });
}

/* ---------- consent and sessions ---------- */
const hostEnv = () => /^(localhost|127\..*|\[::1\]|)$/.test(location.hostname) ? 'dev' : 'playtest';
function startSession(reason) {
  T.sid = uuid(); T.seq = 0; T.fgTotal = 0;
  const prev = T.meta.sessions.at(-1), ctx = captureContext('start'), demo = location.hash.slice(1);
  const testMode = navigator.webdriver ? 'automated' : location.search.includes('internal') ? 'internal_task' : ['combo', 'lv17', 'stuck', 'sunset', 'night'].includes(demo) ? 'review_preset' : 'natural';
  T.cfg = 'fnv:' + window.SkyHash.fnv(JSON.stringify(L.CONFIG)); T.testMode = testMode; T.sessionNo = T.meta.sessions.length + 1;
  T.meta.sessions.push({ session_id: T.sid, started_at_utc: new Date().toISOString(), start_reason: reason, previous_session_id: prev ? prev.session_id : null,
    schema_version: 2, tester_id: T.c.tester_id, test_id: T.c.test_id, install_id: T.c.install_id, process_id: T.pid, build_id: `web-${APP_V}+tm1`, ruleset_version: 'rules-0.4', config_hash: T.cfg, layout_version: 'stage-1080x1920-v1',
    environment: hostEnv(), test_mode: testMode, preset_id: testMode === 'review_preset' ? demo : null, runtime: 'web', platform: ctx.platform, consent_version: CONSENT_V, sample_rate: 1 });
  T.iv = newIv(now()); const ts = topScreen(); T.scr = { id: ts.id, visit: 'v' + (++T.visitN) + '-' + T.pid, parent: ts.parent }; T.iv.scr = T.scr;
  if (!T.started) { T.started = true; emit('telemetry_started', { protocol_version: PROTOCOL_V, collection_mode: 'local_export', trace_enabled: false }); }
  emit('session_started', { start_reason: reason, previous_session_id: prev ? prev.session_id : null, device_context: ctx, assignment_group: 'web', prior_2048_experience: 'unknown', session_no: T.sessionNo, games_total: T.c.games || 0, first_open_utc: T.c.at, install_age_days: Math.floor((Date.now() - Date.parse(T.c.at)) / 864e5) });
  emit('screen_entered', { previous_screen_id: null, enter_reason: reason === 'timeout_resume' ? 'return' : 'boot', overlay_parent: T.scr.parent, input_enabled: true });
  if (T.loadMs != null && reason !== 'timeout_resume') { const nav = performance.getEntriesByType('navigation')[0]; emit('loading_span', { span_id: 'load-' + T.pid, operation: 'initial_load', duration_ms: r1(T.loadMs), status: 'success', cache_state: nav ? (nav.transferSize === 0 ? 'warm' : 'cold') : 'unknown' }); }
  emit('telemetry_health', { checkpoint: 'start', created_count: T.meta.counts.created, acknowledged_count: T.meta.counts.created - T.meta.counts.dropped, dropped_count: T.meta.counts.dropped, pending_count: buf.length + mem.length, collection_complete: T.complete, reason: 'ok' });
  saveMeta();
}
async function start() {
  if (T.on || !age13()) return;
  db = await idbOpen(); await loadMeta();
  if (!db) { T.health.storage++; T.complete = false; }
  T.on = true; T.fg = !document.hidden; T.lastFrame = now();
  const nav = performance.getEntriesByType('navigation')[0];
  safe(() => startSession(T.meta.sessions.length ? (nav && nav.type === 'reload' ? 'reload' : 'fresh_launch') : 'fresh_launch'));
}
export function boot() {
  safe(() => {
    if (!age13()) { if (ls.get('consent') || ls.get('declined')) withdraw().then(() => ls.del('declined')); return; }   // child mode: wipe anything an earlier session stored, ask nothing
    const c = ls.get('consent');
    if (c && c.v === CONSENT_V) { T.c = c; start(); }
    else if (!ls.get('declined')) openConsent();
  });
}
export function openConsent() {
  const p = $('cs-panel'); if (!p || !age13()) return;
  p.innerHTML = `<h2 style="font-size:60px">${tl('tm.consent.title')}</h2><div class="cap" style="letter-spacing:.02em;font-size:30px;line-height:1.42;color:var(--navy);text-align:left;white-space:pre-line">${tl('tm.consent.body')}</div>
    <div style="display:flex;gap:26px;margin-top:6px"><button class="gel ghost" id="cs-no" style="position:relative;width:360px;height:120px;font-size:40px">${tl('tm.consent.no')}</button><button class="gel aqua" id="cs-yes" style="position:relative;width:420px;height:120px;font-size:44px">${tl('tm.consent.yes')}</button></div>`;
  $('ov-consent').hidden = false;
  $('cs-yes').onclick = () => {
    $('ov-consent').hidden = true;
    T.c = { v: CONSENT_V, at: new Date().toISOString(), tester_id: 'T-' + Math.random().toString(36).slice(2, 8), test_id: 'test-' + Date.now().toString(36), install_id: uuid(), games: 0, fbDone: false, testDone: false };
    ls.set('consent', T.c); ls.del('declined'); start();
  };
  $('cs-no').onclick = () => { $('ov-consent').hidden = true; ls.set('declined', 1); };
}
export const active = () => T.on;
export const loaded = ms => { T.loadMs = ms; };
export const bind = x => { Object.assign(X, x); };
const persistConsent = () => ls.set('consent', T.c);

/* ---------- hooks called from the game (all safe no-ops while recording is off) ---------- */
export function runStart() {
  safe(() => {
    if (!T.on) return;
    if (T.runId && !T.ended) runEnd('new_run');
    pollScreen();
    const eligible = T.testMode === 'natural' && !G.meta.tutorial && G.mode !== 'speed';
    Object.assign(T, { runId: G.meta.gameId, mode: G.mode === 'speed' ? 'speed' : 'normal', aidx: -1, ended: false, revStack: [], maxTop: G.top, streak: 0, lastCombo: G.combo, stuckN: 0, rescue: null, oppKey: {}, phase: 'day', tutPrev: 0, ia: null, popping: null, limitHit: false, runFg: 0, lastRun0: eligible, lastSuccess: null });
    bmap.clear(); T.c.games = (T.c.games || 0) + 1; persistConsent();
    emit('run_started', { initial_state: { ...sum(G), board: L.clone(G.board), seed: G.seed }, seed: G.seed == null ? null : String(G.seed), target_building_id: 'lv12', stop_policy_version: 'sp1', resolved_config_ref: T.cfg, mode: T.mode, tutorial: !!G.meta.tutorial, board_kind: G.meta.tutorial ? 'tutorial' : G.meta.board0 ? 'preset' : 'random2' }, { play: 0 });
    for (const k of ITEMS) ledger(k, 0, G.items[k], 'initial', 'initial', T.lastId);
    snapshot('run_start');
  });
}
export function runEnd(reason, endGold = 0) {
  safe(() => {
    if (!T.on || !T.runId || T.ended) return;
    if (T.rescue) rescueExit(reason === 'player_finish' ? 'finished' : 'playing', reason === 'player_finish' ? 'end' : 'none');
    else if (reason === 'game_over') emit('board_status_changed', { previous_status: 'playing', status: 'over', empty_cells: 0, merge_pairs: 0, available_items: [], episode_id: `ep-over-${T.stuckN + 1}`, stuck_index: T.stuckN + 1 });
    for (const [b, rec] of bmap) if (!rec.popping) endBubble(b, rec, 'removed', 'game_end');
    bmap.clear(); closeInterval('end');
    snapshot('run_end');
    emit('run_ended', { reason, final_state: { ...sum(G), play_ms: Math.round(G.t || U.playMs) }, end_observation: 'complete', last_success_event_id: T.lastSuccess, end_gold: endGold });
    T.lastRun = { eligible: T.lastRun0 && !G.meta.tutorial, reason, aidx: T.aidx };
    T.ended = true; T.runId = null; T.mode = null; T.aidx = -1; T.rescue = null;
  });
}
export function rescueEnter() {
  safe(() => {
    if (!T.on || !T.runId || T.rescue) return;
    const opts = []; if (G.items.pop > 0) opts.push('pop'); if (G.items.rewind > 0 && G.history.length) opts.push('rewind'); if (L.canAdRefill(G)) opts.push('ad');
    T.stuckN++; T.rescue = { ep: `${T.pid}.ep${T.stuckN}`, n: T.stuckN, t0: now(), choice: null };
    emit('board_status_changed', { previous_status: 'playing', status: 'rescue', empty_cells: 0, merge_pairs: 0, available_items: opts, episode_id: T.rescue.ep, options_shown: opts, stuck_index: T.stuckN, items_held: { ...G.items } });
    snapshot('rescue');
    if (opts.includes('ad')) { T.stuckOffer = { id: `ad${++T.adN}-${T.pid}`, t: now() }; emit('ad_event', { ad_instance_id: T.stuckOffer.id, stage: 'offer', placement_id: 'stuck_window', mock: true, ads_left: L.CONFIG.ads.maxPerGame - G.adsUsed }); }
  });
}
export function adStart() {
  safe(() => {
    if (!T.on || !T.runId) return;
    const placement = T.rescue ? 'stuck_window' : 'hud_button', off = placement === 'stuck_window' ? T.stuckOffer : T.hudOffer, id = off ? off.id : `ad${++T.adN}-${T.pid}`;
    T.ad = { id, placement, offer: off ? off.t : now() }; if (T.rescue && !T.rescue.choice) T.rescue.choice = 'ad';
    emit('ad_event', { ad_instance_id: id, stage: 'start', placement_id: placement, mock: true, dwell_ms: Math.round(now() - T.ad.offer), ads_left: L.CONFIG.ads.maxPerGame - G.adsUsed });
  });
}
export function adCancel() {
  safe(() => { if (!T.on || !T.ad) return; emit('ad_event', { ad_instance_id: T.ad.id, stage: 'cancel', placement_id: T.ad.placement, mock: true, dwell_ms: Math.round(now() - T.ad.offer), ads_left: L.CONFIG.ads.maxPerGame - G.adsUsed }); T.ad = null; });
}
const GOLD_REWARD = { first_build_gold: 'first_build', run_end_gold: 'run_end', dup_treasure_gold: 'dup_treasure', menu_gold: 'menu_gold', bubble: 'bubble' };
export function gold(n, why = 'other') {   // called right after U.gold changed
  safe(() => {
    if (!T.on || !n) return;
    const cause = T.runId ? T.lastSuccess : null, rid = n > 0 && GOLD_REWARD[why] ? reward(GOLD_REWARD[why], 'gold', n, cause) : null;
    ledger('gold', U.gold - n, U.gold, n > 0 ? 'grant' : 'consume', n > 0 ? why : 'other', cause, rid, 'wallet');
  });
}
export function catalog(type, id, source) { safe(() => { if (T.on) emit('catalog_discovered', { catalog_type: type, content_id: id, source, caused_by_event_id: T.lastId }); }); }
const TUT = ['', 'tut1_place', 'tut2_merge', 'tut3_bubble'];
export function tutStep(n) {
  safe(() => {
    if (!T.on || !T.runId || n === T.tutPrev) return;
    if (T.tutPrev && n > T.tutPrev) emit('tutorial_step', { step_id: TUT[T.tutPrev], status: 'completed', eligible_ms: Math.round(now() - T.tutAt) });
    if (n > 0) { emit('tutorial_step', { step_id: TUT[n], status: 'shown', eligible_ms: 0 }); T.tutAt = now(); T.tutPrev = n; }
  });
}
export function tutEnd(done) {
  safe(() => { if (!T.on || !T.tutPrev || !T.runId) return; emit('tutorial_step', { step_id: TUT[T.tutPrev], status: done ? 'completed' : 'skipped', eligible_ms: Math.round(now() - T.tutAt) }); T.tutPrev = 0; });
}
export function setting(id, before, after) { safe(() => { if (T.on && before !== after) emit('setting_changed', { setting_id: id, before_value: before ?? null, after_value: after ?? null }); }); }
export function bubbleTap(b) { safe(() => { const rec = bmap.get(b); if (rec) { rec.popping = true; T.popping = rec; } }); }

/* ---------- test completion and feedback ---------- */
function testDone(stop, ex = {}) {
  if (!T.on || !T.c || T.c.testDone) return;
  T.c.testDone = true; persistConsent();
  emit('test_completed', { stop_reason: stop, run_finished: stop === 'run_ended', observation_status: 'complete', final_action_index: T.runId ? T.aidx : (T.lastRun ? T.lastRun.aidx : -1), operator_assisted: false, feedback_expected: stop === 'run_ended' || stop === 'time_limit', ...ex }, { ia: null });
}
function testLimit() {
  T.limitHit = true; testDone('time_limit', { limit_ms: LIMIT_MS });
  const t = $('toast'); t.textContent = tl('tm.limit'); t.style.opacity = 1; setTimeout(() => { t.style.opacity = 0; }, 4000);
}
export function quit() { safe(() => { const el = T.lastRun0 && T.runId && !G.meta.tutorial; runEnd('quit_home'); if (el) testDone('voluntary_stop'); }); }
export function leaveResult(next) {   // the result screen is being left: ask once, after the first full test run
  let asked = false;
  safe(() => {
    if (!T.on || !T.lastRun || !T.lastRun.eligible) return;
    if (!T.c.fbDone) { asked = true; openFeedback('post_run', () => { T.c.fbDone = true; persistConsent(); testDone('run_ended'); next(); }); }
    else testDone('run_ended');
  });
  if (!asked) next();
}
export function openFeedback(kind, done) {
  const p = $('fb-panel'); if (!p || !age13()) { done && done(); return; }
  const fb = { clarity: 0, comfort: 0, bubble: '', use: { rewind: 0, pop: 0, drop: 0 }, category: 'controls' };
  const five = k => [1, 2, 3, 4, 5].map(n => `<button class="gel ghost tmq" data-k="${k}" data-v="${n}" style="position:relative;width:110px;height:84px;font-size:40px">${n}</button>`).join('');
  const BOPT = ['not_seen', 'seen_not_used', 'used_understood', 'used_confused'];   // the old item answers, now asked once for the bubbles
  const bubbleQ = `<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%">${BOPT.map(o => `<button class="gel ghost tmq" data-b="${o}" style="position:relative;height:66px;padding:0 16px;font-size:26px">${tl('tm.fb.b.' + o)}</button>`).join('')}</div>`;
  const rate = k => `<div style="display:flex;align-items:center;justify-content:space-between;width:100%"><div style="font:800 30px/1.2 var(--font);color:var(--navy)">${tl('item.' + k)}</div><div style="display:flex;gap:8px">${[1, 2, 3, 4, 5].map(n => `<button class="gel ghost tmq" data-u="${k}" data-v="${n}" style="position:relative;width:96px;height:76px;font-size:36px">${n}</button>`).join('')}</div></div>`;
  const q = key => `<div style="width:100%;text-align:left;font:800 30px/1.25 var(--font);color:var(--navy)">${tl(key)}</div>`;
  p.innerHTML = kind === 'issue'
    ? `<h2 style="font-size:60px">${tl('tm.issue.title')}</h2><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">${['controls', 'items', 'readability', 'performance', 'other'].map(c => `<button class="gel ghost tmq" data-c="${c}" style="position:relative;height:84px;padding:0 24px;font-size:34px">${tl('tm.cat.' + c)}</button>`).join('')}</div>
       <textarea id="fb-text" maxlength="500" rows="4" placeholder="${tl('tm.fb.comment')}" style="width:100%;font:700 30px/1.3 var(--font);border-radius:24px;border:4px solid var(--rim);padding:14px;box-sizing:border-box;user-select:text"></textarea><div style="width:100%;text-align:left;font:700 24px/1.3 var(--font);color:var(--navy)">${tl('tm.fb.hint')}</div>`
    : `<h2 style="font-size:60px">${tl('tm.fb.title')}</h2>${q('tm.fb.q1')}<div style="display:flex;gap:10px">${five('clarity')}</div>${q('tm.fb.q2')}${bubbleQ}${q('tm.fb.q2i')}${ITEMS.map(rate).join('')}${q('tm.fb.q3')}<div style="display:flex;gap:10px">${five('comfort')}</div>
       <textarea id="fb-text" maxlength="500" rows="2" placeholder="${tl('tm.fb.comment')}" style="width:100%;font:700 28px/1.3 var(--font);border-radius:24px;border:4px solid var(--rim);padding:12px;box-sizing:border-box;user-select:text"></textarea><div style="width:100%;text-align:left;font:700 24px/1.3 var(--font);color:var(--navy)">${tl('tm.fb.hint')}</div>`;
  p.insertAdjacentHTML('beforeend', `<div style="display:flex;gap:26px;margin-top:6px"><button class="gel ghost" id="fb-skip" style="position:relative;width:340px;height:104px;font-size:40px">${tl(kind === 'issue' ? 'set.close' : 'tm.fb.skip')}</button><button class="gel aqua" id="fb-send" style="position:relative;width:340px;height:104px;font-size:42px">${tl('tm.fb.send')}</button></div>`);
  const setOn = (btn, group) => p.querySelectorAll(group).forEach(b => { b.classList.toggle('aqua', b === btn); b.classList.toggle('ghost', b !== btn); });
  p.querySelectorAll('.tmq').forEach(b => { b.onclick = () => {
    if (b.dataset.k) { fb[b.dataset.k] = +b.dataset.v; setOn(b, `[data-k="${b.dataset.k}"]`); }
    else if (b.dataset.u) { fb.use[b.dataset.u] = +b.dataset.v; setOn(b, `[data-u="${b.dataset.u}"]`); }
    else if (b.dataset.b) { fb.bubble = b.dataset.b; setOn(b, '[data-b]'); }
    else if (b.dataset.c) { fb.category = b.dataset.c; setOn(b, '[data-c]'); }
  }; });
  const close = () => { $('ov-feedback').hidden = true; done && done(); };
  $('fb-skip').onclick = close;
  $('fb-send').onclick = () => {
    safe(() => {
      const txt = ($('fb-text').value || '').trim().slice(0, 500);
      emit('feedback_submitted', { feedback_id: `${T.pid}.f${++T.gseq}`, feedback_kind: kind === 'issue' ? 'issue_marker' : 'post_run', related_event_id: T.lastId, category: kind === 'issue' ? fb.category : 'other',
        answers: kind === 'issue' ? {} : { survey_v: 2, controls_clarity: fb.clarity || null, bubble: fb.bubble || null, item_usefulness: Object.fromEntries(ITEMS.map(k => [k, fb.use[k] || null])), comfort: fb.comfort || null }, comment: txt || null }, { ia: null });
    });
    close();
  };
  $('ov-feedback').hidden = false;
}

/* ---------- export (one zip) and withdrawal ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function deflate(u8) {   // raw deflate where the browser has it; otherwise the zip stores the bytes as they are
  if (typeof CompressionStream === 'undefined') return null;
  try { const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); } catch { return null; }
}
async function makeZip(files) {
  const enc = new TextEncoder(), d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), raw = enc.encode(f.text), crc = crc32(raw), comp = await deflate(raw), method = comp ? 8 : 0, body = comp || raw;
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, body);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name); off += 30 + name.length + body.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
async function allEvents() {
  await flush(); const out = new Map();
  if (db) for (const e of await idbAll('events')) out.set(e.event_id, e);
  for (const e of mem) out.set(e.event_id, e); for (const e of buf) out.set(e.event_id, e);
  return [...out.values()];
}
const CARRY = ['run_id', 'mode', 'screen_id', 'screen_visit_id', 'device_context_id'], DROP_NULL = ['action_index', 'interaction_id', 'play_ms'];
export async function buildBundle() {
  if (!T.on) return null;
  const c = T.meta.counts;
  emit('telemetry_health', { checkpoint: 'export', created_count: c.created, acknowledged_count: c.created - c.dropped, dropped_count: c.dropped, pending_count: 0, collection_complete: T.complete, reason: 'ok' });
  const evs = await allEvents(), order = {}; T.meta.sessions.forEach((s, i) => { order[s.session_id] = i; });
  evs.sort((a, b) => (order[a.session_id] - order[b.session_id]) || (a.session_seq - b.session_seq));
  const prev = {}, lines = [], ranges = {};
  for (const e of evs) {
    const o = { ...e }, pv = prev[e.session_id] = prev[e.session_id] || {};
    for (const k of CARRY) { if (k in pv && pv[k] === (o[k] ?? null)) delete o[k]; else { pv[k] = o[k] ?? null; o[k] = pv[k]; } }
    for (const k of DROP_NULL) if (o[k] == null) delete o[k];
    lines.push(JSON.stringify(o));
    const r = ranges[e.session_id] = ranges[e.session_id] || { session_id: e.session_id, min: e.session_seq, max: e.session_seq }; r.min = Math.min(r.min, e.session_seq); r.max = Math.max(r.max, e.session_seq);
  }
  const created = Math.max(c.created, evs.length + c.dropped);
  const manifest = { format: 'skybloom-telemetry-bundle', contract_version: 2, schema_version: 2, exported_at_utc: new Date().toISOString(), app_version: APP_V, runtime: 'web', tester_id: T.c.tester_id, test_id: T.c.test_id, install_id: T.c.install_id,
    sessions: T.meta.sessions, counts: { created, acknowledged: evs.length, dropped: c.dropped, pending: 0, by_event: c.by }, seq_ranges: Object.values(ranges).map(r => ({ ...r, count: r.max - r.min + 1 })),
    health: { dropped_count: c.dropped, queue_overflow: T.health.overflow, storage_errors: T.health.storage, internal_errors: T.health.internal, suppressed_errors: T.errSupp, collection_complete: T.complete }, retention: { days: 30 }, files: { events: 'events.ndjson', device_contexts: 'device_contexts.json', snapshots: 'snapshots.json' } };
  const ndjson = lines.join('\n') + '\n', blob = await makeZip([{ name: 'events.ndjson', text: ndjson }, { name: 'manifest.json', text: JSON.stringify(manifest) }, { name: 'device_contexts.json', text: JSON.stringify(T.meta.contexts) }, { name: 'snapshots.json', text: JSON.stringify(T.meta.snaps) }]);
  return { file: new File([blob], `skybloom-telemetry-${T.c.test_id}-${new Date().toLocaleDateString('en-CA')}.zip`, { type: 'application/zip' }), events: evs.length, rawBytes: ndjson.length, zipBytes: blob.size, runs: T.c.games || 0 };
}
export const summary = () => T.on ? { events: T.meta.counts.created, runs: T.c.games || 0 } : null;
export async function withdraw() {   // delete the queue, the ids and the consent; recording stops and is asked again only if the tester chooses to join
  T.on = false; buf = []; mem = []; bmap.clear(); T.runId = null; T.ended = true;
  try { if (db) db.close(); await new Promise(res => { const r = indexedDB.deleteDatabase('skybloom-telemetry'); r.onsuccess = r.onerror = r.onblocked = () => res(); }); } catch { /* ignore */ }
  db = null; ls.del('consent'); ls.set('declined', 1); T.c = null; T.meta = { sessions: [], contexts: [], snaps: {}, counts: { created: 0, dropped: 0, by: {} } }; T.started = false; T.seq = 0; T.sid = null; T.ctxId = null; T.lastCtx = '';
}

installWraps(); requestAnimationFrame(frame);
if (DEBUG) window.__tm = { T, flush, allEvents, buildBundle, withdraw, boot, get buf() { return buf; }, get counts() { return T.meta.counts; }, get db() { return db; } };
