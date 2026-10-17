/* Skybloom module: game (split from index.html in step 12; code unchanged) */
import { $, APP_V, DEMO, G, ITEMS, L, NAMES, U, artSrc, center, itemName, reduce, same, set_G, store, tl } from './core.js?v=0.7.18';
import { SFX, vib } from './audio.js?v=0.7.18';
import { bumpBadge, hud, overlay, show, toast } from './ui.js?v=0.7.18';
import { bloomFx, floatText, mergeFx, rewindFx, tierOf, wrapFx } from './fx.js?v=0.7.18';
import { R, startDrop } from './renderer.js?v=0.7.18';
import { rollFor, setIcon, spawnBubble } from './bubbles.js?v=0.7.18';
import { buildCard } from './screens.js?v=0.7.18';
import * as TM from './telemetry.js?v=0.7.18';

/* ---------- game flow ---------- */
/* play time (ms) only runs while the game is on screen and nothing is open over it; speed mode's timer and the action log use it */
const PAUSE_OV = ['celebrate', 'result', 'collection', 'settings', 'ad', 'shop', 'ranking', 'sheet', 'confirm', 'export', 'stuck', 'age', 'consent', 'feedback'];
export const paused = () => PAUSE_OV.some(k => !$('ov-' + k).hidden);
export const bestNow = () => U.mode === 'speed' ? U.bestSpeed : U.best;
export function stamp() { tickSpeed(); G.t = Math.max(G.t, Math.round(U.playMs)); }   // action log time = play time
export function tickSpeed() {   // speed mode (11-2): automatic placements that are due
  if (G.mode !== 'speed' || U.screen !== 'game' || G.meta.over) return;
  for (const e of L.speedAdvance(G, Math.round(U.playMs))) { startDrop(e.at[0], e.at[1], e.lv, false); discover(e.lv); afterAction(); }
}
export function speedRing() {
  const on = U.mode === 'speed' && U.screen === 'game' && !G.meta.over; $('speed-ring').toggleAttribute('hidden', !on); $('speed-sec').hidden = !on;   // (an <svg> has no .hidden property) if (!on) return;
  const left = Math.max(0, G.nextAt - U.playMs), frac = Math.min(1, left / L.speedMs(U.playMs)), low = left <= 3000;
  $('sr-bar').setAttribute('stroke-dasharray', `${(frac * 1000).toFixed(0)} 1000`); $('sr-bar').setAttribute('stroke', low ? '#ff7a6b' : '#ffe878');
  $('speed-sec').textContent = tl('speed.secs', { n: Math.ceil(left / 1000) });
}
/* first-game tutorial (v0.5 §3.1): fixed board, three steps that each advance on the real action, Skip any time */
const TUT_BOARD = [[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], TUT_AT = [1, 2];   // the placed Dew Drop lands next to the one already there
function tutRand() { const i = L.empties(G.board).findIndex(([r, c]) => r === TUT_AT[0] && c === TUT_AT[1]), n = L.empties(G.board).length; let first = true;
  return () => first ? (first = false, (i + .5) / n) : Math.random(); }
export function tutStep(n) {
  U.tut = n; TM.tutStep(n);
  $('coach').hidden = !n; if (n) { $('coach-n').textContent = tl('tut.count', { n }); $('coach-t').textContent = tl('tut.step' + n); fitCoach(); }
  $('place').classList.toggle('dis', n === 2 || n === 3);   // Place waits until the guided step needs it
  $('place').classList.toggle('coach', n === 1 && !reduce()); $('place').classList.toggle('coach-r', n === 1 && reduce());
  if (n === 3 && !U.bubbles.includes(U.tutBubble)) tutBubble();
}
export function tutBubble() { if (R) { spawnBubble({ kind: 'empty' }); U.tutBubble = U.bubbles[U.bubbles.length - 1]; } }   // 10-2 F4: gold is skins-only now, the tutorial only teaches the pop
function fitCoach() {   // 10-2 F3: the instruction stays on one line: 36px down to 30px in steps of 2
  const s = $('coach-t'); let size = 36; s.style.fontSize = size + 'px';
  while (s.scrollWidth > s.clientWidth && size > 30) { size -= 2; s.style.fontSize = size + 'px'; }
}
/* 10-2 F2: only the guided action works. Anything else is ignored silently and the guide box shakes (not under Reduce Motion).
   Skip and Settings (pause) always work. */
const TUT_OK = { 1: ['place'], 2: ['board'], 3: [] };   // 3/3: only the tutorial bubble, handled in the tap code
export function tutBlock(kind) {
  if (!U.tut || U.screen !== 'game' || TUT_OK[U.tut].includes(kind)) return false;
  if (!reduce()) { const c = $('coach'); c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); }
  return true;
}
export function tutEnd(done) { TM.tutEnd(done); tutStep(0); U.tutBubble = null; store.set('tutorialDone', true); U.nextBubble = 0; if (done) toast(tl('tut.done'), 2600); }
$('coach-skip').onclick = () => tutEnd(false);
export function newGame(tut = false, mode = 'normal') {
  const demo = mode === 'speed' ? null : DEMO[location.hash.slice(1)];
  U.mode = mode; U.playMs = 0;
  U.tut = mode === 'normal' && !demo && (tut || !store.get('tutorialDone', false)) ? 1 : 0;
  const seed = Math.floor(Math.random() * 2 ** 31), board0 = U.tut ? TUT_BOARD : demo || null;
  set_G(L.newState(U.tut ? Math.random : seed, board0));   // the tutorial picks its own drop tile, so it is not seed-replayable
  G.meta = { gameId: 'g_' + Date.now().toString(36) + seed.toString(36), startedAt: new Date().toISOString(), tutorial: !!U.tut, board0, saved: false, over: false }; U.gameT0 = performance.now();
  if (mode === 'speed') L.startSpeed(G);
  if (U.tut) G.next = 1;
  else tutStep(0);
  Object.assign(U, { sel: null, drag: null, target: null, anim: null, drop: null, pops: {}, celebQueue: [], nope: null, phaseTop: 0 });
  for (const row of G.board) for (const v of row) if (v) discover(v, false);   // demo boards: no gold for buildings you did not build
  U.celebQueue = [];
  for (const k of ['celebrate', 'result', 'stuck']) overlay(k, false);
  show('game'); hud();
  for (const b of U.bubbles) { b.content = rollFor(b); setIcon(b); if (!U.tut) L.record(G, { a: 'bspawn', kind: b.content.kind }); }   // bubbles already on screen may now carry items
  TM.runStart();   // play log (13-1): the run begins here, before any tutorial step or action
  if (U.tut) tutStep(1);
  else if (location.hash !== '#stuck') toast(tl(location.hash === '#sunset' ? 't.demoSunset' : location.hash === '#night' ? 't.demoNight' : 't.tapHint'), 2600);
  checkStuck();
}
function discover(lv, reward = true) {
  if (U.discovered.has(lv)) return;
  U.discovered.add(lv); store.set('discovered', [...U.discovered]); TM.catalog('building', 'lv' + lv, reward ? 'build' : 'preset_board');
  if (reward && lv >= 2) { const g = L.firstBuildGold(lv); addGold(g, 'first_build_gold'); U.firstGold = (U.firstGold || 0) + g; }   // first time ever building this level
  if (lv >= 4) U.celebQueue.push(lv);
}
export function addGold(n, why = 'other') {   // why = the ledger reason of the play log (13-1)
  if (!n) return; U.gold += n; store.set('gold', U.gold); TM.gold(n, why);
  const el = $('gold'); el.textContent = U.gold.toLocaleString('en-US'); const p = el.parentElement; p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump');
}
function runCelebrations() {
  if (!U.celebQueue.length) return false;
  const lv = Math.max(...U.celebQueue); U.celebQueue = [];
  $('cel-img').src = artSrc(lv);
  $('cel-name').textContent = NAMES[lv];
  $('cel-sub').textContent = tl('cel.sub', { lv }) + (U.firstGold ? tl('cel.gold', { n: U.firstGold }) : ''); U.firstGold = 0;
  U.afterCel = $('toast').style.opacity === '1' ? $('toast').textContent : null;   // e.g. "+1 item" message: show it again after Continue
  $('toast').style.opacity = 0;
  overlay('celebrate'); SFX.fanfare(); vib([20, 40, 20]);
  return true;
}
function announceGrants(grants) {
  if (!grants.length) return;
  const why = g => g.why === 'combo' ? tl('grant.combo', { n: g.combo }) : g.why === 'milestone' ? tl('grant.milestone', { n: g.level }) : tl('grant.bloom');
  toast(grants.map(g => `${why(g)} ${tl('grant.item', { item: itemName(g.item) })}`).join('  ·  '), 2400);
  grants.forEach(g => bumpBadge(g.item)); SFX.gift();
}

export function doPlace(at = null) {
  if (busy() || tutBlock('place')) return;
  stamp(); const e = L.place(G, U.tut === 1 && !at ? tutRand() : undefined, at);
  if (!e.ok) { toast(tl(e.reason === 'full' ? 't.full' : 't.pickEmpty')); SFX.bad(); return; }
  U.sel = null; U.target = null;
  startDrop(e.at[0], e.at[1], e.lv, e.viaDrop);
  discover(e.lv); afterAction();
  if (U.tut === 1) tutStep(2);
}
export function doMerge(from, to) {
  if (busy()) return;
  stamp(); const e = L.merge(G, from, to);
  if (!e.ok) return;
  U.sel = null; U.drag = null;
  U.anim = { t0: performance.now(), dur: reduce() ? 0 : 170, e };
}
export function finishMerge(e) {
  const [r, c] = e.to, now = performance.now(), tier = tierOf(e.lv);
  U.pops[r + ',' + c] = { t0: now, amp: [.25, .3, .45, .55][tier], dur: tier >= 2 ? 380 : 260 }; U.boardBounce = now;
  if (e.bloom) bloomFx(r, c); else mergeFx(r, c, tier);
  if (e.combo >= 2) { const [x, y] = center(r, c); floatText(tl('float.combo', { n: e.combo }), x, y - 120, e.combo >= 5); }
  if (e.combo >= 5 && !reduce()) { U.shake = now; U.shakeAmp = Math.min(4 + e.combo, 12); }
  SFX.merge(e.combo); vib(Math.min(10 + 4 * e.combo, 60));
  if (e.bloom) { SFX.bloom(); vib([30, 50, 30, 50, 60]); toast(tl('t.bloom')); }
  else { if (tier === 3) SFX.grand(); else if (tier === 2) SFX.shimmer(); discover(e.lv); }
  announceGrants(e.grants);
  if (U.tut === 2) tutStep(3);
  U.toldNoPair = true;
  // 10-2 C2: keep the result selected only when the player turned 'Reselect After Merge' on (default off)
  if (!e.bloom && U.settings.cont && L.targets(G.board, r, c).length) U.sel = [r, c];
  afterAction();
}
function afterAction() { hud(); if (runCelebrations()) return; checkStuck(); }
export function checkStuck() {
  if (!L.isStuck(G.board)) return;
  const canPop = G.items.pop > 0, canRew = G.items.rewind > 0 && G.history.length > 0, canAd = L.canAdRefill(G);
  if (canPop || canRew || canAd) {
    if ($('ov-stuck').hidden) { stamp(); L.record(G, { a: 'stuck' }); TM.rescueEnter(); }
    $('stuck-pop').classList.toggle('dis', !canPop); $('stuck-rewind').classList.toggle('dis', !canRew); $('stuck-ad').hidden = !canAd;
    overlay('stuck');
  } else gameOver();
}
const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
/** Keep the last 20 games on this device (11): the action log plus the final numbers. No name, e-mail or account id. */
export function saveGame(endedBy, endGold = 0) {
  if (!G.meta || G.meta.saved || !G.log.length) return; G.meta.saved = true; stamp();
  const rec = { gameId: G.meta.gameId, seed: G.seed, appVersion: APP_V, config: 'fnv:' + fnv(JSON.stringify(L.CONFIG)), startedAt: G.meta.startedAt, durationMs: G.t,
    mode: G.mode === 'speed' ? 'speed' : undefined, tutorial: G.meta.tutorial || undefined, board0: G.meta.board0 || undefined, endedBy, actions: G.log, final: { score: G.score, top: G.top, gold: G.gold + endGold } };
  store.set('games', [...store.get('games', []), rec].slice(-20));
}
export function gameOver(why = 'game_over') {   // why: 'game_over' (no option left) or 'player_finish' (End Game in the stuck window)
  overlay('stuck', false);
  G.meta.over = true;
  const isNew = G.score > bestNow();
  if (isNew) { if (U.mode === 'speed') { U.bestSpeed = G.score; store.set('bestSpeed', G.score); } else { U.best = G.score; store.set('best', G.score); } }
  $('res-score').textContent = G.score.toLocaleString('en-US');
  $('res-new').hidden = !isNew;
  $('res-best').textContent = isNew ? '' : tl('res.best', { n: bestNow().toLocaleString('en-US') });
  $('res-img').src = artSrc(G.top);
  $('res-name').textContent = `${NAMES[G.top]} · Lv ${G.top}`;
  const endG = L.endGold(G); addGold(endG, 'run_end_gold'); saveGame('stuck', endG); TM.runEnd(why, endG);   // v0.4 §5.1: 10 + best level x 5, plus what bubbles gave this game
  $('res-gold').querySelector('span').textContent = tl('res.gold', { n: (endG + G.gold).toLocaleString('en-US') });
  buildCard();   // capture the final garden before the result overlay hides it
  overlay('result');
}
export function useItem(k) {
  if (busy() || tutBlock('item')) return;
  if (G.items[k] <= 0) { toast(tl('t.noItem', { item: itemName(k) })); SFX.bad(); return; }
  if (k === 'rewind') {
    stamp(); const before = L.clone(G.board), e = L.rewind(G);
    if (!e.ok) { toast(tl('t.nothingRewind')); SFX.bad(); return; }
    U.sel = null; U.target = null; rewindFx(before); SFX.rewind(); overlay('stuck', false); hud(); return;
  }
  if (k === 'drop' && !L.empties(G.board).length) { toast(tl('t.noEmptyDrop')); SFX.bad(); return; }
  U.sel = null; U.target = U.target === k ? null : k; overlay('stuck', false); hud();
}
export const busy = () => !!U.anim || ['celebrate', 'result', 'collection', 'settings', 'ad', 'shop', 'ranking', 'sheet', 'confirm', 'export', 'age', 'consent', 'feedback'].some(k => !$('ov-' + k).hidden);

/* ---------- rewarded-ad mock-up (v0.4 §4.3): a clearly labelled placeholder, no real or imitation ads ---------- */
let adTimer = 0;
export function openAd() {
  if (!L.canAdRefill(G)) return;
  overlay('stuck', false); $('ad-refill').hidden = true; overlay('ad'); TM.adStart();
  let n = 5; $('ad-count').textContent = n; $('ad-done').hidden = true;
  clearInterval(adTimer);
  adTimer = setInterval(() => {
    n--; $('ad-count').textContent = Math.max(0, n);
    if (n > 0) return;
    clearInterval(adTimer); $('ad-done').hidden = false;
    setTimeout(() => {   // reward only after the "ad" finished
      overlay('ad', false); stamp(); const e = L.adRefill(G);
      if (e.ok) { ITEMS.forEach(([k]) => bumpBadge(k)); SFX.gift(); toast(tl('ad.granted', { n: e.each }), 2400); }
      hud(); checkStuck();
    }, 700);
  }, 1000);
}
export function cancelAd() { TM.adCancel(); clearInterval(adTimer); overlay('ad', false); hud(); checkStuck(); }

/* ---------- selection / taps ---------- */
export function select(rc) {
  if (!rc || !G.board[rc[0]][rc[1]]) { U.sel = null; return; }
  if (!L.targets(G.board, rc[0], rc[1]).length) {
    U.sel = null; U.nope = { r: rc[0], c: rc[1], t0: performance.now() }; SFX.bad();
    if (!U.toldNoPair) { toast(tl('t.noPair')); U.toldNoPair = true; }
    return;
  }
  U.sel = rc; SFX.select(); vib(6);
}
export const isTarget = rc => U.sel && rc && L.targets(G.board, U.sel[0], U.sel[1]).some(t => same(t, rc));

export function onTap(cands) {
  const tile = cands.tile, list = cands.list, primary = cands.primary;
  if (U.target) {
    const rc = U.target === 'pop' ? primary : (tile && !G.board[tile[0]][tile[1]] ? tile : null);
    if (U.target === 'pop' && rc) { stamp(); const e = L.pop(G, rc); if (e.ok) { U.target = null; wrapFx(rc[0], rc[1], e.lv); vib(20); hud(); checkStuck(); } }
    else if (U.target === 'drop' && rc) { U.target = null; doPlace(rc); }
    else toast(tl(U.target === 'pop' ? 't.pickBuilding' : 't.pickEmpty'));
    return;
  }
  if (!primary) { U.sel = null; return; }
  // a precise pick (badge / floor) is taken as meant; a tap on building art merges with any glowing neighbour under the finger
  const tgt = cands.how === 'sprite' ? list.find(isTarget) : isTarget(primary) ? primary : null;
  if (tgt) { doMerge(U.sel, tgt); return; }
  // tapping the selected building again walks to the next one under the finger
  if (same(primary, U.sel)) { const nx = list[list.findIndex(rc => same(rc, U.sel)) + 1]; if (!nx) U.sel = null; else if (isTarget(nx)) doMerge(U.sel, nx); else select(nx); return; }
  select(primary);
}

export const localDate = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD in the player's time zone
/* ---------- treasures ---------- */
export function gainTreasure(id) {
  const had = !!U.treasures[id]; if (!had) TM.catalog('special', 'treasure:' + id, 'bubble');
  const t = U.treasures[id] || { n: 0, first: localDate() };
  t.n++; U.treasures[id] = t; store.set('treasures', U.treasures);
  return had;
}


