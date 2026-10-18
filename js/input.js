/* Skybloom module: input (split from index.html in step 12; code unchanged) */
import { $, EDITOR, G, L, MASK, TH, TW, U, artSrc, center, reduce, same, tl, toWorld } from './core.js?v=0.7.26';
import { SFX, ac, music, musicNodes, vib } from './audio.js?v=0.7.26';
import { hud, overlay, scale, sheet, show, toast, transition } from './ui.js?v=0.7.26';
import { busy, cancelAd, checkStuck, doMerge, doPlace, gameOver, isTarget, newGame, onTap, openAd, saveGame, select, tutBlock, useItem } from './game.js?v=0.7.26';
import { drawn } from './renderer.js?v=0.7.26';
import { bubbleAt, popBubbleAt } from './bubbles.js?v=0.7.26';
import { closeShop, openShop } from './shop.js?v=0.7.26';
import { openCollection, openRanking, openSettings, saveCard, shareCard } from './screens.js?v=0.7.26';
import * as TM from './telemetry.js?v=0.7.26';

/* ---------- tilt (spec §6.6) ---------- */
export function updateTilt(dt) {
  const T = U.tilt, on = U.settings.tilt && !reduce();
  if (!on) { T.tx = T.ty = 0; }
  else if (T.src !== 'sensor' && T.src !== 'drag' && performance.now() - T.at > 4000) { T.tx *= .98; T.ty *= .98; }
  T.x += (T.tx - T.x) * Math.min(1, dt * 3); T.y += (T.ty - T.y) * Math.min(1, dt * 3);
}
const clamp1 = v => Math.max(-1, Math.min(1, v));
function onOrientation(e) {
  if (e.gamma == null) return;
  const T = U.tilt; T.src = 'sensor'; T.at = performance.now(); T.tx = clamp1(e.gamma / 30); T.ty = clamp1((e.beta - 45) / 30);
}
export let sensorOn = false;
export function enableSensor() {   // iOS asks for permission, and only from a tap
  if (sensorOn || !('DeviceOrientationEvent' in window)) return Promise.resolve(false);
  const go = () => { addEventListener('deviceorientation', onOrientation); sensorOn = true; return true; };
  const rp = DeviceOrientationEvent.requestPermission;
  return typeof rp === 'function' ? rp.call(DeviceOrientationEvent).then(s => s === 'granted' && go()).catch(() => false) : Promise.resolve(go());
}
addEventListener('pointermove', e => {   // desktop fallback: the mouse position stands in for tilt
  if (e.pointerType !== 'mouse' || U.tilt.src === 'sensor') return;
  const T = U.tilt; T.src = 'mouse'; T.at = performance.now();
  T.tx = clamp1((e.clientX / innerWidth - .5) * 2); T.ty = clamp1((e.clientY / innerHeight - .5) * 2);
});

/* ---------- input ---------- */
function stagePoint(e) { const r = $('stage').getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; }
const worldPoint = e => toWorld(stagePoint(e));
export function badgePos(r, c, lv) { const [x, y] = center(r, c); return [x + TW * .24, y + TH * .14 + (lv >= 13 ? 6 : 0)]; }   // Lv13+ badges sit a little further forward
function tileAt(x, y) {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const [cx, cy] = center(r, c); if (Math.abs(x - cx) / (TW / 2) + Math.abs(y - cy) / (TH / 2) <= 1) return [r, c]; }
  return null;
}
function opaqueAt(d, x, y) {
  if (x < d.x || x > d.x + d.w || y < d.y || y > d.y + d.h) return false;
  const m = MASK[d.key]; if (!m) return true;
  const px = Math.floor((x - d.x) / d.w * m.w), py = Math.floor((y - d.y) / d.h * m.h);
  return m.a[(py * m.w + px) * 4 + 3] > 40;
}
/** What the finger picks (v0.4 §2.2): 1) a level badge (44px reach), 2) the floor diamond under the finger,
    3) the front-most building whose visible pixels are hit. `list` holds every building under the finger for walking/picking. */
export function candidates(x, y) {
  const B = G.board, sprites = [];
  for (const d of [...drawn].sort((a, b) => (b.r + b.c) - (a.r + a.c))) if (opaqueAt(d, x, y)) sprites.push([d.r, d.c]);
  const tile = tileAt(x, y);
  let badge = null, best = 44;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (B[r][c]) { const [bx, by] = badgePos(r, c, B[r][c]), d = Math.hypot(x - bx, y - by); if (d < best) { best = d; badge = [r, c]; } }
  const floor = tile && B[tile[0]][tile[1]] ? tile : null;
  const list = []; for (const rc of [badge, floor, ...sprites]) if (rc && !list.some(q => same(q, rc))) list.push(rc);
  return { list, tile, primary: badge || floor || sprites[0] || null, how: badge ? 'badge' : floor ? 'floor' : sprites.length ? 'sprite' : null };
}
export let down = null;
const cv = $('cv');
/* long press (0.4 s) on overlapping buildings: a row of cards appears above the finger; slide onto one and lift to pick it */
function openPicker() {
  if (!down || !down.cands || down.cands.list.length < 2 || (U.drag && U.drag.active)) return;
  U.drag = null; U.press = null; vib(8); SFX.select();
  const pk = $('picker'), [sx, sy] = down.screen, list = down.cands.list;
  const depth = list.map(([r, c]) => r + c), hi = Math.max(...depth), lo = Math.min(...depth);   // cards say which one is in front
  const where = d => tl(d === hi ? 'pk.front' : d === lo ? 'pk.back' : 'pk.middle');
  pk.innerHTML = list.map(([r, c], i) => { const lv = G.board[r][c]; return `<div class="pk" data-i="${i}"><i>${where(depth[i])}</i><img src="${artSrc(lv)}" alt=""><b>Lv ${lv}</b></div>`; }).join('');
  pk.style.left = Math.max(20, Math.min(1060 - list.length * 170, sx - list.length * 85)) + 'px'; pk.style.top = Math.max(20, sy - 300) + 'px';
  pk.hidden = false; down.picker = true;
}
function pickerHit(e) {   // highlight the card under the finger and light up its building on the board
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pk'); document.querySelectorAll('.pk').forEach(p => p.classList.toggle('on', p === el));
  const i = el ? +el.dataset.i : -1; U.press = i >= 0 && down ? down.cands.list[i] : null; return i;
}
function closePicker() { $('picker').hidden = true; }
document.addEventListener('pointerdown', e => {   // tutorial 3/3: a tap near the guide box's Skip button that is really meant for the bubble pops the bubble instead of pressing Skip
  const tb = U.screen === 'game' && U.tut === 3 && U.tutBubble; if (!tb || !e.target.closest?.('#coach button')) return;
  const pt = toWorld(stagePoint(e)); if (Math.hypot(pt[0] - tb.sx, pt[1] - tb.y) < Math.max(tb.r * 1.8, 120)) { e.preventDefault(); e.stopPropagation(); popBubbleAt(tb); }
}, true);
cv.addEventListener('pointerdown', e => {
  ac(); if (busy()) return;
  const sp = stagePoint(e), pt = toWorld(sp), inGame = U.screen === 'game', cands = inGame ? candidates(...pt) : { list: [], tile: null, primary: null };
  // buildings always win over bubbles (bubbles float behind the garden)
  const tb = inGame && U.tut === 3 && U.tutBubble;   // tutorial 3/3: the guide bubble wins over the board, even over the island
  if (tb && Math.hypot(pt[0] - tb.sx, pt[1] - tb.y) < Math.max(tb.r * 1.8, 120)) { popBubbleAt(tb); down = null; return; }
  if (inGame && U.tut && (cands.list.length || cands.tile) && tutBlock(U.tut === 2 && cands.list.length ? 'board' : 'tile')) return;   // tutorial: step 2 only takes the two Dew Drops
  if (!cands.list.length && !(inGame && cands.tile && U.target)) { const b = bubbleAt(...pt); if (b) { if (inGame && U.tut && b !== U.tutBubble && tutBlock('bubble-other')) return; popBubbleAt(b); down = null; return; } }
  if (!inGame || (!cands.list.length && !cands.tile)) {   // empty sky: touch-drag stands in for tilt
    if (e.pointerType !== 'mouse' && U.tilt.src !== 'sensor') down = { tiltDrag: true, pt };
    else down = inGame ? { pt, cands } : null;
    if (down) try { cv.setPointerCapture(e.pointerId); } catch {}
    return;
  }
  down = { pt, cands, screen: sp };
  U.press = cands.primary;
  if (!U.target && cands.list.length > 1) down.lp = setTimeout(openPicker, 400);
  // a drag can start on the picked building (or any under the finger) when it has a matching neighbor
  const canDrag = rc => L.targets(G.board, rc[0], rc[1]).length && !isTarget(rc);
  const from = !U.target && (cands.primary && canDrag(cands.primary) ? cands.primary : cands.list.find(canDrag));
  U.drag = from ? { from, start: pt, pt, active: false } : null;
  try { cv.setPointerCapture(e.pointerId); } catch {}
});
cv.addEventListener('pointermove', e => {
  if (down && down.tiltDrag) { const p = worldPoint(e), T = U.tilt; T.src = 'drag'; T.at = performance.now(); T.tx = clamp1((p[0] - down.pt[0]) / 300); T.ty = clamp1((p[1] - down.pt[1]) / 300); return; }
  if (down && down.picker) { pickerHit(e); return; }
  if (down && down.lp && Math.hypot(...stagePoint(e).map((v, i) => v - down.screen[i])) > 18) { clearTimeout(down.lp); down.lp = 0; U.press = null; }
  if (!U.drag) return;
  U.drag.pt = worldPoint(e);
  if (!U.drag.active && Math.hypot(U.drag.pt[0] - U.drag.start[0], U.drag.pt[1] - U.drag.start[1]) > 18) { U.drag.active = true; U.sel = U.drag.from; U.press = null; SFX.select(); }
});
cv.addEventListener('pointerup', e => {
  U.press = null; if (down && down.lp) clearTimeout(down.lp);
  if (down && down.tiltDrag) { const T = U.tilt; T.src = 'none'; T.tx = T.ty = 0; down = null; if (U.screen === 'game') U.sel = null; return; }
  if (U.screen !== 'game' || !down) { down = null; U.drag = null; return; }
  if (down.picker) {   // lift on a card: pick that building (merging if it glows)
    const i = pickerHit(e), rc = down.cands.list[i]; closePicker(); down = null;
    if (rc) { if (isTarget(rc)) doMerge(U.sel, rc); else select(rc); }
    hud(); return;
  }
  if (U.drag && U.drag.active) {
    const t = tileAt(...worldPoint(e)), from = U.drag.from; U.drag = null;
    if (t && L.targets(G.board, from[0], from[1]).some(x => same(x, t))) doMerge(from, t);
    else U.sel = from;
  } else { U.drag = null; onTap(down.cands); }
  down = null; hud();
});
cv.addEventListener('pointercancel', () => { if (down && down.lp) clearTimeout(down.lp); closePicker(); U.drag = null; U.press = null; down = null; U.tilt.tx = U.tilt.ty = 0; });
addEventListener('keydown', e => {
  if (EDITOR || U.screen !== 'game' || busy()) return;
  if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; e.preventDefault(); doPlace(); }
  else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') useItem('rewind');
  else if (e.key === 'Escape') { U.target = null; U.sel = null; hud(); }
});
document.addEventListener('click', e => {
  if (EDITOR) return;
  ac(); if (U.settings.music && !musicNodes) music(true);   // audio may only start from a tap
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.item) useItem(b.dataset.item);
  if (b.dataset.open === 'collection' && !tutBlock('collection')) openCollection();
  if (b.dataset.open === 'settings') openSettings();
  if (b.dataset.open === 'shop') openShop();
  if (b.dataset.open === 'ranking') openRanking();
  if (b.hasAttribute('data-close')) { if (!$('ov-shop').hidden) closeShop(); for (const k of ['collection', 'settings', 'ranking']) overlay(k, false); }
});
// sign-in (v0.4 §6.1): only the guest path works until the server exists; no pretend Google / Apple sessions
$('btn-guest').onclick = () => SkyAuth.signIn('guest').then(() => transition('cloud', () => show('main')));
for (const pv of ['google', 'apple']) $('btn-' + pv).onclick = () => SkyAuth.signIn(pv).catch(() =>
  sheet(tl('signin.title', { p: pv === 'google' ? 'Google' : 'Apple' }), tl('signin.body')));
$('ov-sheet').addEventListener('click', e => { if (e.target.closest('[data-sheet-close]')) overlay('sheet', false); });
$('btn-play').onclick = () => transition('bubble', () => newGame(false, 'normal'), [400, 1660]);
$('btn-speed').onclick = () => transition('bubble', () => newGame(false, 'speed'), [815, 1660]);
$('place').onclick = () => doPlace();
$('cel-ok').onclick = () => { overlay('celebrate', false); if (U.afterCel) { toast(U.afterCel, 2400); U.afterCel = null; } checkStuck(); };
$('stuck-pop').onclick = () => useItem('pop');
$('stuck-ad').onclick = openAd; $('ad-refill').onclick = openAd; $('ad-cancel').onclick = cancelAd;
$('stuck-rewind').onclick = () => useItem('rewind');
$('stuck-end').onclick = () => gameOver('player_finish');
$('res-retry').onclick = () => TM.leaveResult(() => transition('pass', () => newGame(false, U.mode)));   // the first finished test run asks for feedback here (13-1)
$('res-home').onclick = () => TM.leaveResult(() => transition('cloud', () => { overlay('result', false); show('main'); }));
$('set-home').onclick = () => transition('cloud', () => { saveGame('quit'); TM.quit(); G.meta.over = true; overlay('settings', false); show('main'); });
$('res-save').onclick = saveCard; $('res-share').onclick = shareCard;


