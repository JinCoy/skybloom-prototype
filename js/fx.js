/* Skybloom module: fx (split from index.html in step 12; code unchanged) */
import { CX, CY, G, U, center, reduce } from './core.js?v=0.7.1';
import { SFX } from './audio.js?v=0.7.1';
import { R, ghostOf, tex } from './renderer.js?v=0.7.1';

/* ---------- effects data (spec §7). Each fx: { type, x, y, t0, life, tier, parts, spr } ---------- */
export const MAX_PARTS = 300;   // spec §8 particle budget
export let partCount = 0;
export function freeParts(n) { partCount -= n; }   // (called from the effects drawing module)
export const tierOf = lv => lv >= 15 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0;   // merge VFX grades: Lv2-4 / 5-9 / 10-14 / 15-17
const FX_LIFE = { merge: [600, 800, 1000, 1400], bloom: 2000, rewind: 1000, splash: 520, bubble: 600, clouddrop: 820, wrap: 760, burst: 1100 };
/** Add particles to an fx. kind: drop (bubble ring), spark (white/gold dot), petal (pink), spray (aqua droplet). */
export function parts(f, n, kind, o = {}) {
  n = Math.min(n, Math.max(0, MAX_PARTS - partCount)); partCount += n;
  for (let i = 0; i < n; i++) {
    const a = o.up ? -Math.PI / 2 + (Math.random() - .5) * (o.cone || 1.2) : Math.random() * Math.PI * 2, sp = (o.speed || 5) * (.4 + Math.random());
    f.parts.push({ x: f.x + (o.spread ? (Math.random() - .5) * o.spread : 0), y: f.y + (o.dy ?? -30),
      vx: Math.cos(a) * sp * (o.flat ? 1.4 : 1), vy: Math.sin(a) * sp * (o.flat ? .45 : .7) - (o.lift ?? 2.5), r: (o.r || 6) * (.6 + Math.random() * .8), kind, g: o.g ?? .12, spin: Math.random() * 6 });
  }
}
export function addFxXY(type, x, y, tier = 0) {
  if (reduce() && type !== 'rewind') return null;
  const f = { type, x, y, t0: performance.now(), life: type === 'merge' ? FX_LIFE.merge[tier] : FX_LIFE[type] || 600, parts: [], spr: [], tier };
  if (type === 'bubble') parts(f, 14, 'drop', { r: 14, speed: 4 });
  if (type === 'burst') parts(f, 60, 'spark', { speed: 9 });
  U.fx.push(f); return f;
}
function addFx(type, r, c, lv = 1) { const [x, y] = r == null ? [CX, CY] : center(r, c); return addFxXY(type, x, y, tierOf(lv)); }
/** Merge result grade VFX: rings, droplets/petals/spray, light pillar, edge glow, flash, rising light, Garden Pulse x3. */
export function mergeFx(r, c, tier) {
  const f = addFx('merge', r, c, [2, 5, 10, 15][tier]); if (!f) return;
  parts(f, 10 + tier * 4, 'drop', { r: 9, speed: 4 + tier });
  parts(f, 8 + tier * 6, 'spark', { r: 7, speed: 5 + tier * 1.5 });
  if (tier >= 1) parts(f, 10 + tier * 4, 'petal', { r: 9, speed: 4, lift: 4, g: .06 });
  if (tier >= 2) parts(f, 26, 'spray', { up: true, cone: 1.1, speed: 11, r: 8, g: .35, lift: 0, dy: -20 });
  const now = performance.now();
  if (tier >= 2) U.edge = now;                                 // warm glow from the screen edges
  if (tier === 3) { U.flash = now; U.pulseBoost = now; }       // flash + Garden Pulse x3
}
export function bloomFx(r, c) {   // Lv17 + Lv17: a flower of light, petal shower over the whole garden, light into the sky
  const f = addFx('bloom', r, c, 17); if (!f) return;
  parts(f, 60, 'spark', { speed: 10 });
  for (let i = 0; i < 70; i++) parts(f, 1, 'petal', { r: 10, speed: 1, lift: -1, g: .03, spread: 900, dy: -700 - Math.random() * 300 });
  const now = performance.now(); U.edge = now; U.flash = now; U.pulseBoost = now;
}
export function rewindFx(before) {   // clock swirl + afterimages of the buildings that rewind takes away
  const f = addFxXY('rewind', CX, CY); if (!f || !R) return;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (before[r][c] && before[r][c] !== G.board[r][c]) {
    const g = ghostOf(before[r][c], r, c); if (g) { g.alpha = .6; R.fxTop.addChild(g); f.spr.push(g); g.home = [g.x, g.y]; }
  }
}
export function wrapFx(r, c, lv) {   // Bubble Pop: a bubble wraps the building, swells, then pops
  const [x, y] = center(r, c), f = addFxXY('wrap', x, y - 60);
  if (!f || !R) { SFX.pop(); return; }
  const g = ghostOf(lv, r, c), b = new PIXI.Sprite(tex('bubble')); b.anchor.set(.5); b.alpha = .95;
  if (g) { R.fxTop.addChild(g); f.spr.push(g); g.home = [g.x, g.y]; f.size = Math.max(g.width, g.height * .8); } else f.size = 160;
  R.fxTop.addChild(b); f.spr.push(b); f.bub = b; SFX.inflate();
}
export let floatText = () => {};   // set by the renderer


/* setters for state that other modules assign */
export function set_floatText(v) { floatText = v; }

