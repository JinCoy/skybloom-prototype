/* Skybloom module: sandbox (shop > Decorate tab): place any building on the showcase garden (SHOW) to check sizes, skins and light. Never touches the game board G.board. */
import { MASK, SHOW, TH, TW, U, artSrc, center, genShow, store, tl } from './core.js?v=0.7.27';
import { addFxXY } from './fx.js?v=0.7.27';
import { drawn } from './renderer.js?v=0.7.27';

/* ponytail: TEST BUILD ONLY. All 17 buildings can be placed; the "Locks" chip previews the real rule. Set false before a public release. */
const TEST_ALL = true;
/* The single place that decides whether a building level is unlocked for a skin. Today unlocks are shared by level (U.discovered);
   the per-skin collection (later step) only has to change this one function. */
export const unlockedFor = (set, lv) => U.discovered.has(lv);
const rulesOn = () => !TEST_ALL || !!U.sbRules;
export const sbLocked = lv => !!U.sbOn && rulesOn() && !unlockedFor(U.bset, lv);   // the renderer draws these as silhouettes

const GRID = SHOW;   // the main-screen garden is the sandbox garden
const save = () => store.set('garden', GRID.map(r => r.slice()));
(function load() {   // a saved garden replaces this visit's random showcase
  const g = store.get('garden', null);
  if (Array.isArray(g) && g.length === 4 && g.every(r => Array.isArray(r) && r.length === 4 && r.every(v => Number.isInteger(v) && v >= 0 && v <= 17)))
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) GRID[r][c] = g[r][c];
})();

const ORDER = [...Array(16).keys()].map(i => [Math.floor(i / 4), i % 4]).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);   // back to front
function fill(top) { ORDER.forEach(([r, c], i) => { GRID[r][c] = top - i; }); save(); }   // tall ones behind, small in front

const PHASE = [['☀', 0, 'sb.day'], ['🌇', 1, 'sb.sunset'], ['🌙', 2, 'sb.night'], ['⟳', null, 'sb.auto']];
export function renderPalette(el) {
  const keep = el.querySelector('.sb-pal')?.scrollLeft || 0; el.className = 'shop-cards sb';
  const tool = U.sbTool ?? 0, ok = lv => !rulesOn() || unlockedFor(U.bset, lv);
  const chip = (id, label, on) => `<button class="sb-c${on ? ' on' : ''}" data-sb="${id}">${label}</button>`;
  let h = `<div class="sb-tools">${chip('erase', '✕ ' + tl('sb.erase'), tool === -1)}${chip('clear', tl('sb.clear'))}${chip('reset', tl('sb.reset'))}${chip('f16', '1–16')}${chip('f17', '2–17')}`;
  if (TEST_ALL) h += chip('rules', (U.sbRules ? '🔒 ' : '🔓 ') + tl('sb.rules'), !!U.sbRules);
  h += PHASE.map(([ic, v]) => chip('ph' + v, ic, (U.shopPhase ?? null) === v)).join('') + '</div><div class="sb-pal">';
  for (let lv = 1; lv <= 17; lv++) h += `<button class="sb-b${tool === lv ? ' on' : ''}${ok(lv) ? '' : ' lock'}" data-lv="${lv}"><img src="${artSrc(lv)}" alt=""><b>${lv}</b></button>`;
  el.innerHTML = h + '</div>'; el.querySelector('.sb-pal').scrollLeft = keep;
}
export function sbClick(t, rerender, toast) {   // a chip or palette button was tapped
  const chip = t.closest('[data-sb]'), b = t.closest('[data-lv]');
  if (b) { const lv = +b.dataset.lv; if (rulesOn() && !unlockedFor(U.bset, lv)) { toast(tl('sb.locked')); return true; } U.sbTool = U.sbTool === lv ? 0 : lv; rerender(); return true; }
  if (!chip) return false;
  const id = chip.dataset.sb;
  if (id === 'erase') U.sbTool = U.sbTool === -1 ? 0 : -1;
  else if (id === 'clear') { for (const r of GRID) r.fill(0); save(); }
  else if (id === 'reset') { store.set('garden', null); genShow(); }
  else if (id === 'f16') fill(16);
  else if (id === 'f17') fill(17);
  else if (id === 'rules') U.sbRules = !U.sbRules;
  else if (id.startsWith('ph')) { const v = id.slice(2); U.shopPhase = v === 'null' ? null : +v; }
  rerender(); return true;
}
const tileAt = (x, y) => { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const [cx, cy] = center(r, c); if (Math.abs(x - cx) / (TW / 2) + Math.abs(y - cy) / (TH / 2) <= 1) return [r, c]; } return null; };
const opaqueAt = (d, x, y) => {
  if (x < d.x || x > d.x + d.w || y < d.y || y > d.y + d.h) return false;
  const m = MASK[d.key]; if (!m) return true;
  return m.a[(Math.floor((y - d.y) / d.h * m.h) * m.w + Math.floor((x - d.x) / d.w * m.w)) * 4 + 3] > 40;
};
export function sbTap(pt) {   // world point: place the chosen building on the tile, or erase the building under the finger
  const tool = U.sbTool ?? 0; if (!tool) return;
  const sprite = [...drawn].sort((a, b) => (b.r + b.c) - (a.r + a.c)).find(d => opaqueAt(d, pt[0], pt[1])), tile = tileAt(pt[0], pt[1]);
  const cell = tool === -1 ? (sprite ? [sprite.r, sprite.c] : tile) : (tile || (sprite && [sprite.r, sprite.c]));   // placing prefers the floor diamond, erasing the front-most building
  if (!cell || GRID[cell[0]][cell[1]] === (tool === -1 ? 0 : tool)) return;
  GRID[cell[0]][cell[1]] = tool === -1 ? 0 : tool; save();
  const [x, y] = center(...cell); addFxXY('splash', x, y + 20);
}
