/* Skybloom module: sandbox (shop > Decorate tab): place any building on the showcase garden (SHOW) to check sizes, skins and light. Never touches the game board G.board.
   Edits are a draft: only the Save button (or "Save" when leaving) writes the garden; leaving without saving restores the last saved one. */
import { $, MASK, SHOW, TH, TW, U, artSrc, center, hasBuilt, store, tl } from './core.js?v=0.7.50';
import { addFxXY } from './fx.js?v=0.7.50';
import { drawn } from './renderer.js?v=0.7.50';
import { Mini } from './minianim.js?v=0.7.50';

/* ponytail: TEST BUILD ONLY. All 17 buildings can be placed; the Silhouette button previews the real rule (locked levels cannot be placed). Set false before a public release. */
const TEST_ALL = true;
/* The single place that decides whether a building level is unlocked for a skin: built at least once with that set equipped (per-skin collection, 10-18). set = U.bset (null = Classic). */
export const unlockedFor = (set, lv) => hasBuilt(set, lv);
const rulesOn = () => !TEST_ALL || !!U.sbRules;
export const sbLocked = lv => !!U.sbOn && rulesOn() && !unlockedFor(U.bset, lv);   // the renderer draws these as silhouettes

const GRID = SHOW;   // the main-screen garden is the sandbox garden
const snap = () => GRID.map(r => r.slice());
let base = snap();   // the garden as last saved (or this visit's showcase): "Save" moves it, leaving without saving returns to it
(function load() {   // a saved garden replaces this visit's random showcase
  const g = store.get('garden', null);
  if (Array.isArray(g) && g.length === 4 && g.every(r => Array.isArray(r) && r.length === 4 && r.every(v => Number.isInteger(v) && v >= 0 && v <= 17))) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) GRID[r][c] = g[r][c];
    base = snap();
  }
})();
export const sbBegin = () => { base = snap(); U.sbShot = false; };   // the shop was just opened
export const sbDirty = () => JSON.stringify(GRID) !== JSON.stringify(base);
export function sbSave() { base = snap(); store.set('garden', base); }
export function sbRevert() { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) GRID[r][c] = base[r][c]; }

const PH = ['sb.p0', 'sb.p1', 'sb.p2'], realPhase = () => U.phaseW.indexOf(Math.max(...U.phaseW));
export function sbRefresh() {   // keep the tool buttons in step with the state
  $('sb-ui').hidden = !U.sbOn || !!U.sbShot;
  const t = U.sbTool ?? 1, on = (id, v) => { const b = document.querySelector(`#sb-ui [data-sb="${id}"]`); b.classList.toggle('forest', v); b.classList.toggle('lime', !v); };
  on('build', t > 0); on('erase', t === -1); on('rules', !!U.sbRules);
  document.querySelector('#sb-ui [data-sb="rules"]').hidden = !TEST_ALL;
  $('sb-ph').textContent = tl(PH[U.shopPhase ?? realPhase()]);
  $('ov-shop').classList.toggle('shot', !!U.sbShot);
}
export function renderPalette(el) {
  const keep = el.querySelector('.sb-pal')?.scrollLeft || 0, tool = U.sbTool ?? 1, ok = lv => !rulesOn() || unlockedFor(U.bset, lv);
  el.className = 'shop-cards sb';
  let h = '<div class="sb-pal">';
  for (let lv = 1; lv <= 17; lv++) h += `<button class="sb-b${tool === lv ? ' on' : ''}${ok(lv) ? '' : ' lock'}" data-lv="${lv}"><span class="sb-art"><img src="${artSrc(lv)}" alt=""></span><b>${lv}</b></button>`;
  el.innerHTML = h + `</div><div class="sb-foot"><button class="gel orange sbs" data-sb="clear">${tl('sb.clear')}</button><button class="gel green sbs" data-sb="save">${tl('sb.save')}</button></div>`;
  el.querySelector('.sb-pal').scrollLeft = keep; sbRefresh();
  // the cards move like the garden (Classic, Candy, Eco; Aqua gets its own motion map later). Locked ones stay a still silhouette.
  for (const m of CARDS) m.destroy(); CARDS = [];
  const pal = el.querySelector('.sb-pal');
  for (const b of pal.querySelectorAll('.sb-b:not(.lock)')) { const m = new Mini(b.querySelector('.sb-art'), 174, 292, 20, pal); if (m.ok) { m.show(+b.dataset.lv); CARDS.push(m); } }
}
let CARDS = [];
/** A palette thumbnail or a tool button was tapped. api = { palette(), toast(text), fold(down) }. Returns true when it was one of ours. */
export function sbClick(t, api) {
  const btn = t.closest('[data-sb]'), b = t.closest('[data-lv]');
  if (b) {
    const lv = +b.dataset.lv; if (rulesOn() && !unlockedFor(U.bset, lv)) { api.toast(tl('sb.locked')); return true; }
    U.sbTool = lv; U.sbLast = lv; api.palette(); return true;
  }
  if (!btn) return false;
  const id = btn.dataset.sb;
  if (id === 'build') { U.sbTool = U.sbLast || 1; api.fold(false); api.palette(); }
  else if (id === 'erase') { U.sbTool = U.sbTool === -1 ? (U.sbLast || 1) : -1; api.palette(); }
  else if (id === 'clear') { for (const r of GRID) r.fill(0); }
  else if (id === 'phase') U.shopPhase = ((U.shopPhase ?? realPhase()) + 1) % 3;
  else if (id === 'rules') { U.sbRules = !U.sbRules; api.palette(); }
  else if (id === 'shot') U.sbShot = true;
  else if (id === 'save') { sbSave(); api.toast(tl('sb.saved')); }
  sbRefresh(); return true;
}
export function sbShotOff() { if (!U.sbShot) return false; U.sbShot = false; sbRefresh(); return true; }
export function sbOff() { U.sbOn = false; U.sbShot = false; sbRefresh(); }   // the shop closed
const tileAt = (x, y) => { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const [cx, cy] = center(r, c); if (Math.abs(x - cx) / (TW / 2) + Math.abs(y - cy) / (TH / 2) <= 1) return [r, c]; } return null; };
const opaqueAt = (d, x, y) => {
  if (x < d.x || x > d.x + d.w || y < d.y || y > d.y + d.h) return false;
  const m = MASK[d.key]; if (!m) return true;
  return m.a[(Math.floor((y - d.y) / d.h * m.h) * m.w + Math.floor((x - d.x) / d.w * m.w)) * 4 + 3] > 40;
};
/** World point tapped on the garden: place the chosen building on the tile / erase the building under the finger.
    Returns false when the tap was on empty background (the caller then folds the panel). */
export function sbTap(pt) {
  const tool = U.sbTool ?? 1;
  const sprite = [...drawn].sort((a, b) => (b.r + b.c) - (a.r + a.c)).find(d => opaqueAt(d, pt[0], pt[1])), tile = tileAt(pt[0], pt[1]);
  const cell = tool === -1 ? (sprite ? [sprite.r, sprite.c] : tile) : (tile || (sprite && [sprite.r, sprite.c]));   // placing prefers the floor diamond, erasing the front-most building
  if (!cell) return false;
  const next = tool === -1 ? 0 : tool; if (GRID[cell[0]][cell[1]] === next) return true;
  GRID[cell[0]][cell[1]] = next; const [x, y] = center(...cell); addFxXY('splash', x, y + 20); return true;
}
