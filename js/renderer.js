/* Skybloom module: renderer (split from index.html in step 12; code unchanged) */
import { $, CAL, CX, CY, FALLS, FILL, G, GUIDE, HR, IMG, ISLAND, L, MOTION, MOTION_A, MOTION_E, SHOW, TH, TW, U, WS, ambient, bkey, center, reduce, same } from './core.js?v=0.7.54';
import { sbLocked } from './sandbox.js?v=0.7.54';
import { SFX, vib } from './audio.js?v=0.7.54';
import { busy, finishMerge, paused, speedRing, tickSpeed } from './game.js?v=0.7.54';
import { addFxXY, floatText, parts, set_floatText } from './fx.js?v=0.7.54';
import { updateBubbles } from './bubbles.js?v=0.7.54';
import { updateFx } from './drawfx.js?v=0.7.54';
import { badgePos, updateTilt } from './input.js?v=0.7.54';
import { perfGuard } from './perfguard.js?v=0.7.54';

/* ======================================================================
   RENDERER (PixiJS v7)
   ====================================================================== */
export const ADD = () => PIXI.BLEND_MODES.ADD;
const TEXC = {};
// single clouds in assets/cloud_atlas.webp: [x, y, w, h] each (03_Sprites/Ambient/make_cloud_atlas.py prints this array)
const CLOUD_FRAMES = [[0, 0, 345, 305], [347, 0, 374, 278], [0, 307, 348, 259], [350, 307, 291, 245], [643, 307, 330, 222], [0, 568, 272, 207], [274, 568, 320, 203], [596, 568, 248, 190], [0, 777, 314, 188], [316, 777, 270, 178], [588, 777, 185, 134], [775, 777, 177, 122], [0, 967, 174, 121], [176, 967, 186, 121], [364, 967, 165, 119], [531, 967, 168, 118], [701, 967, 160, 113], [863, 967, 131, 94], [0, 1090, 187, 93], [189, 1090, 157, 91], [348, 1090, 190, 91], [540, 1090, 177, 88], [719, 1090, 167, 86], [0, 1185, 161, 86], [163, 1185, 157, 85], [322, 1185, 160, 85], [484, 1185, 136, 82], [622, 1185, 118, 66]];
// held-still clouds: [x, y, depth 0..1] in world units; the drifting ones are random (spawnCloud)
const STILL_CLOUDS = [[150, 235, .25], [900, 170, .6], [520, 400, .35], [985, 520, .75], [70, 610, .45], [610, 105, .15]];
export const tex = k => TEXC[k] || (TEXC[k] = IMG[k] ? PIXI.Texture.from(IMG[k]) : PIXI.Texture.EMPTY);
function canvasTex(w, h, paint) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return PIXI.Texture.from(c); }
let GEN = null;
function petalTex(kind) {   // Blossom Island sky petals: 4 shapes (0 cherry petal with a notch, 1 round petal, 2 narrow folded petal, 3 small pale petal), 64x64, drawn upright (tip up), centred
  return canvasTex(64, 64, (x) => {
    const g = (y0, y1, a, b) => { const q = x.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; };
    x.translate(32, 32); x.lineJoin = 'round';
    if (kind === 0) { x.beginPath(); x.moveTo(0, 26); x.bezierCurveTo(-26, 14, -22, -14, -11, -24); x.quadraticCurveTo(-4, -20, 0, -14); x.quadraticCurveTo(4, -20, 11, -24); x.bezierCurveTo(22, -14, 26, 14, 0, 26); x.fillStyle = g(-24, 26, '#fff6fa', '#ffb3d0'); }
    else if (kind === 1) { x.beginPath(); x.ellipse(0, 0, 21, 25, 0, 0, Math.PI * 2); x.fillStyle = g(-25, 25, '#ffe4ef', '#ffc1d9'); }
    else if (kind === 2) { x.beginPath(); x.moveTo(0, 28); x.bezierCurveTo(-18, 14, -14, -16, 3, -28); x.bezierCurveTo(16, -12, 14, 16, 0, 28); x.fillStyle = g(-28, 28, '#ffd9e8', '#ff9fc3'); }
    else { x.beginPath(); x.ellipse(0, 2, 13, 21, 0, 0, Math.PI * 2); x.fillStyle = g(-21, 23, '#ffffff', '#ffa6c8'); }
    x.fill(); x.strokeStyle = 'rgba(255,140,185,.55)'; x.lineWidth = 1.6; x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 20); x.quadraticCurveTo(kind === 2 ? 5 : -2, 2, 0, -14); x.stroke();   // centre vein / highlight
    if (kind === 2) { x.fillStyle = 'rgba(255,120,170,.28)'; x.beginPath(); x.moveTo(3, -28); x.bezierCurveTo(16, -12, 14, 16, 0, 28); x.bezierCurveTo(6, 8, 6, -14, 3, -28); x.fill(); }   // the folded half is a shade darker
  });
}
export function genTextures() {
  if (GEN) return GEN;
  const radial = (stops) => (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); stops.forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.fillRect(0, 0, w, h); };
  GEN = {
    rays: canvasTex(512, 512, (x, w, h) => { x.translate(w / 2, h / 2); const g = x.createRadialGradient(0, 0, 0, 0, 0, w / 2); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.7, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g;
      for (let i = 0; i < 9; i++) for (let k = 0; k < 5; k++) { const a = i * Math.PI * 2 / 9 + .17 * (i % 2), hw = (.1 + .05 * (i % 3)) * (1 - k * .18); x.globalAlpha = .22; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, w / 2, a - hw, a + hw); x.closePath(); x.fill(); } }),   // sun rays: 9 beams, each 5 stacked wedges = soft edges
    glow: canvasTex(256, 256, radial([[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']])),
    dot: canvasTex(32, 32, radial([[0, 'rgba(255,255,255,1)'], [.5, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']])),
    star: canvasTex(64, 64, (x) => { x.translate(32, 32); x.fillStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 8;
      x.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 6 : 28, a = i * Math.PI / 4; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); }),
    petal: canvasTex(28, 16, (x) => { x.fillStyle = '#ffd3e6'; x.beginPath(); x.ellipse(14, 8, 13, 7, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ffeef6'; x.beginPath(); x.ellipse(11, 6, 6, 3, 0, 0, Math.PI * 2); x.fill(); }),
    edge: canvasTex(216, 384, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, h * .28, w / 2, h / 2, h * .62); g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(1, 'rgba(255,240,180,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }),
    puff: canvasTex(160, 100, (x) => { for (const [cx, cy, r] of [[50, 62, 34], [82, 46, 40], [116, 62, 30], [80, 70, 34]]) { const g = x.createRadialGradient(cx - r * .3, cy - r * .4, r * .1, cx, cy, r); g.addColorStop(0, '#ffffff'); g.addColorStop(.75, '#eef7ff'); g.addColorStop(1, 'rgba(220,236,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); } }),
    coin: canvasTex(96, 96, (x) => { const g = x.createRadialGradient(36, 30, 4, 48, 48, 44); g.addColorStop(0, '#fff8c8'); g.addColorStop(.45, '#ffe878'); g.addColorStop(1, '#f2a91d');
      x.fillStyle = g; x.beginPath(); x.arc(48, 48, 42, 0, Math.PI * 2); x.fill(); x.lineWidth = 6; x.strokeStyle = '#fff3c0'; x.stroke();
      x.fillStyle = 'rgba(150,90,0,.55)'; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(48 + Math.cos(a) * r, 50 + Math.sin(a) * r); } x.closePath(); x.fill(); }),
    pillar: canvasTex(32, 256, (x, w, h) => {   // light column: fades upward and toward both sides
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,250,210,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      const sd = x.createLinearGradient(0, 0, w, 0); sd.addColorStop(0, 'rgba(0,0,0,0)'); sd.addColorStop(.5, 'rgba(0,0,0,1)'); sd.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalCompositeOperation = 'destination-in'; x.fillStyle = sd; x.fillRect(0, 0, w, h); }),
    badge: Array.from({ length: 18 }, (_, n) => n && canvasTex(64, 64, (x) => {
      const gr = x.createRadialGradient(24, 22, 2, 32, 32, 28); gr.addColorStop(0, '#fff6b8'); gr.addColorStop(.4, '#ffe878'); gr.addColorStop(1, '#f2a91d');
      x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fillStyle = gr; x.fill(); x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke();
      x.fillStyle = '#6a3c00'; x.font = `900 ${n < 10 ? 28 : 24}px Nunito, ui-rounded, system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, 32, 33); })),
  };
  return GEN;
}
let SILF = null;   // silhouette for buildings that are not unlocked yet (Decorate tab): flat navy, 62% opaque
const silFilter = () => SILF || (SILF = Object.assign(new (PIXI.ColorMatrixFilter || PIXI.filters.ColorMatrixFilter)(), { matrix: [0, 0, 0, 0, .16, 0, 0, 0, 0, .30, 0, 0, 0, 0, .50, 0, 0, 0, .62, 0] }));
export const hsl = (h, s = .75, l = .7) => { const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return (f(0) << 16) | (f(8) << 8) | f(4); };
export const lerpColor = (a, b, t) => { const c = s => [(s >> 16) & 255, (s >> 8) & 255, s & 255], A = c(a), B = c(b); return A.map((v, i) => Math.round(v + (B[i] - v) * t)).reduce((s, v) => (s << 8) | v, 0); };
export const mix3 = (w, a, b, c) => lerpColor(lerpColor(a, b, w[1] / Math.max(1e-6, w[0] + w[1])), c, w[2]);

/* ---------- building sprite size (shared with taps) ---------- */
/* Building size rule v1 (00_Spec/Building_Size_Rule_v1.md): the drawn width of a building may not exceed WCAP[lv] x the tile width, in every building set (Classic, Candy, Eco, Aqua).
   Taller / wider pictures are scaled down together (about the ground point), never stretched. Lv1-5 and Lv14+ are not capped. Table: 03_Sprites/_guides/building_size_table.py */
const WCAP = { 6: .68, 7: .62, 8: .77, 9: .77, 10: .77, 11: .77, 12: .77, 13: .83 };
/* Lv14-17 (rule v1.1): three caps on the drawn picture, the strictest wins: width <= GCAP.w x tile width, height <= GCAP.h px, and the geometric mean sqrt(w x h) <= GCAP.gm px. */
const GCAP = { w: 1.10, h: 320, gm: 300 };
/* Lv13-17 (rule v1.3): sqrt(opaque area) <= MCAP[lv] px, opaque area = drawn w x h x FILL (core.js). Classic is the reference set: MCAP = Classic's own value,
   so a solid picture (Aqua, Dreamcore) carries no more bulk than the Classic building of that level. Applied last, after every box cap. */
const MCAP = { 13: 176, 14: 199, 15: 205, 16: 201, 17: 220 };
/* Documented exceptions (00_Spec/Building_Size_Rule_v1.md): pictures that still read too big under every cap (dark, full-width bases); one extra factor each, applied last. */
const ADJ = { g15: .85, g16: .85 };
function sprite(lv) {
  const k = bkey(lv), im = IMG[k]; if (!im) return null;
  const gb = GUIDE[k];
  if (gb) { let s = .97 * TW / 640;   // ox/oy: offset of the drawn box from the default (centred, bottom at centre+.4TH)
    if (WCAP[lv]) s = Math.min(s, WCAP[lv] * TW / (gb[2] - gb[0]));
    else if (lv >= 14) { const w0 = (gb[2] - gb[0]) * s, h0 = (gb[3] - gb[1]) * s; s *= Math.min(1, GCAP.w * TW / w0, GCAP.h / h0, GCAP.gm / Math.sqrt(w0 * h0)); }
    if (MCAP[lv] && FILL[k]) s *= Math.min(1, MCAP[lv] / (s * Math.sqrt(FILL[k] * (gb[2] - gb[0]) * (gb[3] - gb[1]))));
    s *= ADJ[k] || 1;
    return { im, w: (gb[2] - gb[0]) * s, h: (gb[3] - gb[1]) * s, ox: ((gb[0] + gb[2]) / 2 - 512) * s, oy: (gb[3] - 820) * s - .4 * TH }; }
  const want = (HR[lv] * TH + .4 * TH) * CAL[lv];
  const s = Math.min(want / im.height, (WCAP[lv] || .92) * TW / im.width);
  return { im, w: im.width * s, h: im.height * s, ox: 0, oy: 0 };
}

/* ---------- motion map: parts are clipped out of the sprite once, then animated as plain sprites ---------- */
export const BAKE = {};
// The motion map was drawn on the Classic art. Candy Glass keeps only the overlay effects that do not copy image regions.
/* Which motion parts a building set uses: Classic ('b') all of them; Candy ('c') shares Classic's silhouette so the same map fits (checked on an overlay sheet), except the windmill's spinning sails (no sails layer in
   the Candy art); Eco / Aqua keep only the effects drawn on top of the picture until they get maps of their own. */
const OVERLAY = ['sparkle', 'ripple', 'rise', 'petals'];
const motionFor = (lv, key = bkey(lv)) => {
  const k = key[0]; if (k === 'p' || k === 'r') return [];   // Dreamcore sets: still pictures until they get maps of their own (no Classic overlay in the wrong place)
  const own = k === 'e' ? MOTION_E[lv] : k === 'g' ? MOTION_A[lv] : null;
  if (own) return own.filter(p => !p.need || IMG[p.need]);   // Eco / Aqua: their own maps; a part that needs extra art (train, rotors, fish, cars) waits until that art is loaded   // Eco: its own map; a part that needs extra art (the train, the rotors) waits until that art is loaded
  return (MOTION[lv] || []).filter(p => k === 'b' || (k === 'c' && (p.type !== 'spin' || IMG.sails_c)) || OVERLAY.includes(p.type));
};
/* Baked frames shared by every copy of a building: the region in N hue-shifted copies (colour-cycling lights), and a sphere in N rotation steps (hologram globe). */
const FRAMES = {};
function hueShift(cv, deg) {   // standard hue-rotation matrix on the pixels (no canvas filter: Safari lacks it)
  const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height; const x = o.getContext('2d'); x.drawImage(cv, 0, 0);
  const d = x.getImageData(0, 0, o.width, o.height), a = d.data, r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), q = v => v < 0 ? 0 : v > 255 ? 255 : v;
  const m = [.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, .213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283, .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072];
  for (let i = 0; i < a.length; i += 4) { const R0 = a[i], G0 = a[i + 1], B0 = a[i + 2]; a[i] = q(R0 * m[0] + G0 * m[1] + B0 * m[2]); a[i + 1] = q(R0 * m[3] + G0 * m[4] + B0 * m[5]); a[i + 2] = q(R0 * m[6] + G0 * m[7] + B0 * m[8]); }
  x.putImageData(d, 0, 0); return o;
}
function hueFrames(key, i, cv, n) { const id = `${key}:h${i}`; return FRAMES[id] || (FRAMES[id] = Array.from({ length: n }, (_, k) => PIXI.Texture.from(k ? hueShift(cv, k * 360 / n) : cv))); }
function globeFrames(key, i, img, W, H, p, n = 16) {   // a flat picture of a globe turned into a rotating sphere: longitude shifts, the middle moves fastest
  const id = `${key}:g${i}`; if (FRAMES[id]) return FRAMES[id];
  const [cx, cy, rr] = [p.c[0] * W, p.c[1] * H, p.r * W], R = Math.max(4, Math.round(rr)), S = R * 2;
  const src = document.createElement('canvas'); src.width = S; src.height = S; const sx = src.getContext('2d'); sx.drawImage(img, cx - R, cy - R, S, S, 0, 0, S, S);
  const sd = sx.getImageData(0, 0, S, S).data;
  return FRAMES[id] = Array.from({ length: n }, (_, k) => {
    const cvs = document.createElement('canvas'); cvs.width = S; cvs.height = S; const x = cvs.getContext('2d'), out = x.createImageData(S, S), o = out.data, th = k * Math.PI * 2 / n;
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
      const u = (xx + .5 - R) / R, v = (y + .5 - R) / R; if (u * u + v * v > 1) continue;
      let ph2 = Math.asin(u) + th; ph2 = ((ph2 + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;   // wrap on the visible half
      const su = Math.min(S - 1, Math.max(0, Math.round(R + Math.sin(ph2) * R - .5))), si = (y * S + su) * 4, oi = (y * S + xx) * 4;
      o[oi] = sd[si]; o[oi + 1] = sd[si + 1]; o[oi + 2] = sd[si + 2]; o[oi + 3] = sd[si + 3];
    }
    x.putImageData(out, 0, 0); return PIXI.Texture.from(cvs);
  });
}
const JELLY = { sway: 3, bob: 3, squish: .04 };
const jelly = p => p.type === 'spin' ? { ...p, tex: 'sails_c', pt: [.484, .128], size: 1 }   // Candy windmill: its own sails, hub at the pink orb of the Candy body
  : p.type in JELLY ? { ...p, amp: (p.amp ?? JELLY[p.type]) * 1.3 } : p;   // Candy is jelly: a little more give
function bake(lv, k = bkey(lv)) {
  const img = IMG[k]; if (!img) return (BAKE[k] = []);
  const W = img.width, H = img.height;
  BAKE[k] = motionFor(lv, k).map(p => {
    if (!p.poly || p.poly.length < 3) return null;
    const pts = p.poly.map(([x, y]) => [x * W, y * H]), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(W, Math.ceil(Math.max(...xs))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));
    const b = { x0, y0, x1, y1, pts };
    if (p.type !== 'flow') {
      const c = document.createElement('canvas'); c.width = Math.max(1, x1 - x0); c.height = Math.max(1, y1 - y0);
      const x = c.getContext('2d'); x.beginPath(); pts.forEach(([a, bb], i) => i ? x.lineTo(a - x0, bb - y0) : x.moveTo(a - x0, bb - y0)); x.closePath(); x.clip(); x.drawImage((p.src && IMG[p.src]) || img, -x0, -y0);   // src: cut the part out of another picture (the building without the train, versus the original with it)
      b.tex = PIXI.Texture.from(c); b.cv = c;
    }
    return b;
  });
  return BAKE[k];
}
/** One building on screen: base sprite + additive glow copy (Garden Pulse / night) + its motion parts. Local units = texture px, origin = bottom centre. */
export function makeInst(lv, key = bkey(lv)) {   // key: the picture to use (default: the equipped set's)
  const T = genTextures(), base = tex(key), W = base.width, H = base.height, c = new PIXI.Container();
  const sp = new PIXI.Sprite(base); sp.anchor.set(.5, 1); c.addChild(sp);
  const B = BAKE[key] && BAKE[key].length === motionFor(lv, key).length ? BAKE[key] : bake(lv, key),   // re-cut when the part list changed (a part that waits for extra art, or the art itself, loaded since)
    L2 = (u, v) => [u - W / 2, v - H];
  const parts = motionFor(lv, key).map((p0, i) => {
    const b = B[i], candy = key[0] === 'c', p = candy ? jelly(p0) : p0, P = { p, ph: Math.random() * 6, fc: candy ? 0xc9a2ff : 0x6f9dff };   // Candy: jelly amplitudes, its own sails; fc: flowing water is lilac
    const at = (nx, ny) => L2(nx * W, ny * H);
    if (p.type === 'sweep' && b) {   // a band of the region texture, clipped to the region box (no stencil mask)
      P.g = new PIXI.Graphics(); P.g.blendMode = ADD(); c.addChild(P.g); P.b = b; P.bw = (b.x1 - b.x0) * .28;
      P.m = new PIXI.Matrix().translate(...L2(b.x0, b.y0));
    } else if (['sway', 'bob', 'squish', 'glow'].includes(p.type) && b) {
      const s = new PIXI.Sprite(b.tex); P.s = s; c.addChild(s);
      if (p.type === 'sway' || p.type === 'squish') { const pv = p.pivot || [(b.x0 + b.x1) / 2 / W, b.y1 / H]; s.pivot.set(pv[0] * W - b.x0, pv[1] * H - b.y0); s.position.set(...at(...pv)); }
      else s.position.set(...L2(b.x0, b.y0));
      P.y0 = s.y;
      if (p.type === 'glow') { s.blendMode = ADD(); s.alpha = 0; }
      P.b = b;
    } else if (p.type === 'flow' && b) {   // the polygon is filled with a repeating water texture whose offset scrolls (no stencil mask)
      P.g = new PIXI.Graphics(); P.g.blendMode = ADD(); c.addChild(P.g); P.poly = b.pts.flatMap(([u, v]) => L2(u, v)); P.off = 0;
    } else if (p.type === 'sparkle') {
      P.stars = (p.pts || []).map(pt => { const s = new PIXI.Sprite(T.star); s.anchor.set(.5); s.blendMode = ADD(); s.position.set(...at(...pt)); s.alpha = 0; c.addChild(s); return s; });
    } else if (p.type === 'ripple') {
      P.g = new PIXI.Graphics(); c.addChild(P.g);
    } else if (p.type === 'rise') {
      P.dots = Array.from({ length: 4 }, () => { const s = new PIXI.Sprite(tex('bubble')); s.anchor.set(.5); c.addChild(s); return s; });
    } else if (p.type === 'petals') {
      P.dots = Array.from({ length: 6 }, () => { const s = new PIXI.Sprite(T.petal); s.anchor.set(.5); c.addChild(s); return s; });
    } else if (p.type === 'hue' && b && b.cv) {   // lights that cycle through colours: the region in 6 hue-shifted copies, cross-faded
      P.hs = hueFrames(key, i, b.cv, 6).map(t => { const s = new PIXI.Sprite(t); s.position.set(...L2(b.x0, b.y0)); s.alpha = 0; s.visible = false; c.addChild(s); return s; });
    } else if (p.type === 'bubbles') {   // small bubbles rising through a water column
      P.dots = Array.from({ length: p.n || 8 }, () => { const s = new PIXI.Sprite(tex('bubble')); s.anchor.set(.5); c.addChild(s); return s; });
    } else if (p.type === 'jet') {   // fountain: drops thrown up and falling back in arcs
      P.dots = Array.from({ length: p.n || 14 }, () => { const s = new PIXI.Sprite(T.dot); s.anchor.set(.5); s.tint = 0xe6f7ff; c.addChild(s); return s; });
    } else if (p.type === 'orbit') { P.g = new PIXI.Graphics(); P.g.blendMode = ADD(); c.addChild(P.g);
    } else if (p.type === 'globe' && IMG[key]) {   // hologram globe turning
      P.fr = globeFrames(key, i, IMG[key], W, H, p); P.s = new PIXI.Sprite(P.fr[0]); P.s.anchor.set(.5); P.s.position.set(...at(...p.c)); c.addChild(P.s);
    } else if (p.type === 'swim' && IMG[p.tex]) {   // a fish (its own picture) swimming back and forth inside the building
      const s = new PIXI.Sprite(tex(p.tex)); s.anchor.set(.5); P.s = s; P.k = (p.size || .3) * W / s.texture.width; s.scale.set(P.k); s.position.set(...at(...p.pt)); P.x0 = s.x; P.y0 = s.y; c.addChild(s);
    } else if (p.type === 'drive' && b) {   // a car cut out of the full picture, driving along the road and fading at the ends
      const s = new PIXI.Sprite(b.tex); P.s = s; s.position.set(...L2(b.x0, b.y0)); P.x0 = s.x; P.y0 = s.y; c.addChild(s);
    } else if (p.type === 'slide' && b) {   // a part (the train) running back and forth along a line; its picture is cut out of the building
      const s = new PIXI.Sprite(b.tex); P.s = s; s.position.set(...L2(b.x0, b.y0)); P.x0 = s.x; P.y0 = s.y; c.addChild(s);
    } else if (p.type === 'spin' && IMG[p.tex]) {
      const s = new PIXI.Sprite(tex(p.tex)); s.anchor.set(.5); s.position.set(...at(...p.pt)); s.scale.set((p.size || 1) * W / s.texture.width); c.addChild(s); P.s = s;
    }
    return P;
  });
  const glow = new PIXI.Sprite(base); glow.anchor.set(.5, 1); glow.blendMode = ADD(); glow.alpha = 0; c.addChild(glow);
  return { lv, key, c, glow, parts, W, H, ph: Math.random() * 10 };
}
/** Animate one building's parts. t = motion clock (frozen under Reduce Motion), s = on-screen scale (px per texture px). */
export function updateInst(I, t, dt, s, still) {
  const W = I.W, H = I.H, TAU = Math.PI * 2, L2 = (u, v) => [u - W / 2, v - H];
  for (const P of I.parts) {
    const p = P.p, ph = P.ph + I.ph, per = p.period || 3, wave = Math.sin(TAU * t / per + ph);
    if (!P.s && !P.g && !P.dots && !P.stars && !P.hs) continue;   // a part whose picture region is missing draws nothing instead of failing the frame
    switch (p.type) {
      case 'sway': P.s.rotation = (p.amp || 3) * Math.PI / 180 * wave; break;
      case 'bob': P.s.y = P.y0 + (p.amp || 3) / s * wave; break;
      case 'squish': { const k = (p.amp || .04) * wave; P.s.scale.set(1 - k * .5, 1 + k); break; }
      case 'glow': P.s.alpha = (p.alpha ?? .4) * (.5 + .5 * wave); if (p.hue) P.s.tint = hsl((t * 40 + ph * 50) % 360); break;
      case 'sweep': {
        const q = ((t + ph) % per) / per, b = P.b, g = P.g; g.clear();
        if (q >= .45) break;   // idle between sweeps: nothing to draw
        const run = q / .45, h = b.y1 - b.y0, bx = b.x0 - P.bw + run * (b.x1 - b.x0 + 2 * P.bw), [, y0] = L2(0, b.y0), x0 = bx - W / 2;
        const band = clipRect([[x0, y0], [x0 + P.bw, y0], [x0 + P.bw - h * .35, y0 + h], [x0 - h * .35, y0 + h]], ...L2(b.x0, b.y0), ...L2(b.x1, b.y1));
        if (band.length > 2) g.beginTextureFill({ texture: b.tex, matrix: P.m, alpha: p.alpha ?? .5, color: p.hue ? hsl((run * 300 + t * 20) % 360, .9, .72) : 0xffffff }).drawPolygon(band.flat()).endFill();
        break;
      }
      case 'flow': {
        if (!still) P.off += (p.speed || 60) / s * dt;
        const ft = waterTex('flow'), da = (p.dir ?? 90) * Math.PI / 180;   // dir: angle the water runs along (90 = down, 0 = right)
        P.g.clear().beginTextureFill({ texture: ft, alpha: p.alpha ?? .45, color: P.fc, matrix: new PIXI.Matrix().scale(.32, .32).translate((Math.cos(da) * P.off) % (ft.width * .32), (Math.sin(da) * P.off) % (ft.height * .32)) }).drawPolygon(P.poly).endFill();
        break;
      }
      case 'sparkle': P.stars.forEach((st, i) => { const a = Math.max(0, Math.sin(t * 1.9 + i * 2.1 + ph)) ** 6 * .9; st.alpha = still ? .35 : a; st.visible = st.alpha > .02; st.scale.set((.25 + .35 * st.alpha) / s * .7); st.rotation = t * .4; }); break;
      case 'ripple': {
        const g = P.g, [px, py] = [(p.pt[0] - .5) * W, (p.pt[1] - 1) * H]; g.clear();
        for (let i = 0; i < 2; i++) { const q = ((t / (p.period || 3.5)) + i / 2 + ph) % 1, rx = (p.rx || .3) * W * (.35 + .65 * q);
          g.lineStyle(2.5 / s, 0xffffff, still ? .3 : (1 - q) * .7).drawEllipse(px, py, rx, rx * .33); }
        break;
      }
      case 'rise': P.dots.forEach((d, i) => { const q = (t * .45 + i / 4 + ph) % 1; d.position.set((p.pt[0] - .5) * W + Math.sin(q * 7 + i) * 5 / s, (p.pt[1] - 1) * H - q * 70 / s); d.alpha = still ? 0 : (1 - q) * .85; d.scale.set((8 + i * 2) / s / d.texture.width * (0.6 + q)); }); break;
      case 'petals': { const [a, b2, c2, d2] = p.box; P.dots.forEach((d, i) => { const q = (t * .12 + i / 6 + ph) % 1; d.position.set(((a + (c2 - a) * ((i * .37 + .1) % 1)) - .5) * W + Math.sin(q * 9 + i) * 10 / s, (b2 + (d2 - b2) * q - 1) * H); d.alpha = still ? 0 : Math.sin(q * Math.PI) * .9; d.rotation = q * 7 + i; d.scale.set(1 / s * .8); }); break; }
      case 'hue': {   // colour wheel: lower copy opaque, the next one fades in over it
        const n = P.hs.length, pos = (t / (p.period || 12) + ph / TAU) % 1 * n, i0 = Math.floor(pos) % n, i1 = (i0 + 1) % n, f = pos - Math.floor(pos);
        P.hs.forEach(s => { s.visible = false; });
        const lo = Math.min(i0, i1), hi = Math.max(i0, i1), aHi = i0 < i1 ? f : 1 - f;
        P.hs[lo].visible = true; P.hs[lo].alpha = p.alpha ?? 1; P.hs[hi].visible = true; P.hs[hi].alpha = aHi * (p.alpha ?? 1);
        break;
      }
      case 'bubbles': { const [bx0, by0, bx1, by1] = p.box;
        P.dots.forEach((d, i) => { const q = (t * (p.speed || .25) + i / P.dots.length + ph * .1) % 1, k = i * .618 % 1;
          d.position.set((bx0 + (bx1 - bx0) * (.12 + .76 * k) - .5) * W + Math.sin(q * 7 + i * 2) * 3 / s, (by1 - (by1 - by0) * q - 1) * H);
          d.alpha = still ? 0 : Math.sin(q * Math.PI) * .85; d.scale.set((4 + (i % 3) * 2.5) / s / d.texture.width * 2); });
        break; }
      case 'jet': { const [jx, jy] = [(p.pt[0] - .5) * W, (p.pt[1] - 1) * H], jh = (p.h || .12) * H, sp = (p.spread || .05) * W;
        P.dots.forEach((d, i) => { const q = (t * (p.speed || .7) + i / P.dots.length + ph * .1) % 1, vx = ((i * .618) % 1 - .5) * 2 * sp;
          d.position.set(jx + vx * q, jy - jh * 4 * q * (1 - q)); d.alpha = still ? 0 : Math.sin(q * Math.PI) * .9; d.scale.set((5 + (i % 3) * 2) / s / d.texture.width * 2); });
        break; }
      case 'orbit': {   // a thin glowing ring with a bright dot running round it
        const g = P.g, cx = (p.pt[0] - .5) * W, cy = (p.pt[1] - 1) * H, rx = (p.rx || .2) * W, ry = (p.ry || .06) * W, rot = (p.rot || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
        const at2 = a => [cx + rx * Math.cos(a) * cr - ry * Math.sin(a) * sr, cy + rx * Math.cos(a) * sr + ry * Math.sin(a) * cr]; g.clear().lineStyle(1.5 / s, 0xc8f6ff, .4);
        for (let k = 0; k <= 40; k++) { const [x, y] = at2(k / 40 * TAU); k ? g.lineTo(x, y) : g.moveTo(x, y); }
        if (!still) { const [dx, dy] = at2(TAU * (t / (p.period || 5) + ph / TAU)); g.lineStyle(0).beginFill(0xffffff, .95).drawCircle(dx, dy, 2.6 / s).endFill(); }
        break; }
      case 'globe': if (P.s && !still) { const n = P.fr.length, k = Math.floor((t / (p.period || 8) + ph / TAU) % 1 * n) % n; if (k !== P.k) { P.k = k; P.s.texture = P.fr[k]; } } break;
      case 'swim': if (P.s) {   // swims to one side, turns, swims back; a gentle up-and-down on the way
        const q = (t / (p.period || 8) + ph / TAU) % 1, x = Math.sin(q * TAU), dir = Math.cos(q * TAU);
        P.s.x = P.x0 + (p.dx || .2) * W * (still ? 0 : x); P.s.y = P.y0 + (still ? 0 : Math.sin(q * TAU * 3) * (p.dy || .015) * H);
        P.s.scale.set(P.k * (still ? 1 : dir < 0 ? -1 : 1), P.k); P.s.rotation = still ? 0 : -.06 * Math.sin(q * TAU * 3);   // the picture faces left: flipped while it swims right
      } break;
      case 'drive': if (P.s) { const q = still ? .5 : (t / (p.period || 6) + ph / TAU) % 1; P.s.x = P.x0 + (p.dx || 0) * W * q; P.s.y = P.y0 + (p.dy || 0) * H * q; P.s.alpha = Math.min(1, Math.sin(q * Math.PI) * 3); } break;
      case 'slide': if (P.s) { const m = still ? 0 : Math.sin(TAU * t / (p.period || 8) + ph); P.s.x = P.x0 + (p.dx || 0) * W * m; P.s.y = P.y0 + (p.dy || 0) * H * m; } break;
      case 'spin': if (P.s && !still) P.s.rotation += (p.speed || .7) * dt; break;
    }
  }
}

/** Repeating copy of a water texture (POT, so it can wrap). */
const WT = {};
function waterTex(k) { if (!WT[k]) { WT[k] = tex(k); WT[k].baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT; } return WT[k]; }
/** Clip a convex polygon [[x,y]...] to a rectangle (Sutherland-Hodgman). */
function clipRect(poly, x0, y0, x1, y1) {
  const edges = [[p => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]], [p => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]], [p => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  for (const [inside, cut] of edges) {
    const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b)); }
    poly = out; if (!poly.length) break;
  }
  return poly;
}
/* Grout channels (§6.2, v0.4 §2.3): the seams are cut into short segments; each segment's water level follows the tilt,
   so water pools toward the low side (wide, deep blue), the high side runs dry, and the low edge overflows. */
const GROUT = [];
for (let i = 1; i <= 4; i++) GROUT.push([center(i - .5, -.5), center(i - .5, 3.5)], [center(-.5, i - .5), center(3.5, i - .5)]);
const GSEG = GROUT.flatMap(([a, b]) => Array.from({ length: 16 }, (_, k) => [[a[0] + (b[0] - a[0]) * k / 16, a[1] + (b[1] - a[1]) * k / 16], [a[0] + (b[0] - a[0]) * (k + 1) / 16, a[1] + (b[1] - a[1]) * (k + 1) / 16]]));
const RIM = [[540, 760], [1020, 1000], [540, 1240], [60, 1000]].flatMap((p, i, A) => { const q = A[(i + 1) % 4]; return Array.from({ length: 10 }, (_, k) => [p[0] + (q[0] - p[0]) * (k + .5) / 10, p[1] + (q[1] - p[1]) * (k + .5) / 10]); });
const WATER_SPEED = .6;   // board water and falls run at 60% of the old speed
export const WTL = { x: 0, y: 0, vx: 0, vy: 0 };   // water's own tilt: a damped spring behind the device tilt, so it sloshes
const level = (x, y) => Math.max(0, Math.min(1, .5 + .9 * ((x - CX) / 480 * WTL.x + (y - CY) / 240 * WTL.y)));
const WATER = { base: [0x3f76e4, 0x6f80e0, 0x4a74e8], deep: 0x2e5bc9, hi: 0x7db2ff };   // Minecraft-style water (#3F76E4)
function drawWater(g, k, sc, ox, oy, color, hi) {
  const t = waterTex(k), m = new PIXI.Matrix().scale(sc, sc).translate(ox % (t.width * sc), oy % (t.height * sc)); g.clear();
  for (const [a, b] of GSEG) {
    const L = level((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); if (hi && L < .35) continue;
    g.lineTextureStyle({ width: 3 + 13 * L, texture: t, matrix: m, color: hi ? WATER.hi : lerpColor(color, WATER.deep, Math.max(0, L - .5) * 2), alpha: hi ? (L - .35) * .9 : .35 + .6 * L, cap: PIXI.LINE_CAP.BUTT });   // butt caps: segments join without overlap (and ~35x fewer vertices)
    g.moveTo(...a).lineTo(...b);
  }
}

export let app = null, R = null;
export function initRenderer() {
  app = new PIXI.Application({ view: $('cv'), width: 1080, height: 1920, backgroundAlpha: 0, antialias: true, resolution: 1 });
  if (app.renderer.events) app.renderer.events.autoPreventDefault = false;
  const T = genTextures(), S = app.stage;
  const world = new PIXI.Container(); world.pivot.set(CX, CY); world.position.set(CX, CY); world.scale.set(WS); S.addChild(world);
  // sky: three time-of-day backgrounds cross-fade
  const bgs = ['bg', 'bg1', 'bg2'].map(k => { const s = new PIXI.Sprite(tex(k)); s.width = 1080; s.height = 1920; world.addChild(s); return s; });   // every sky is drawn on the board geometry (core.js ISLAND note)
  const lights = [[980, 40, 0xfff6d0, 520], [1010, 760, 0xffb070, 620], [960, 160, 0xcfe0ff, 360]].map(([x, y, tint, size]) => {
    const s = new PIXI.Sprite(T.glow); s.anchor.set(.5); s.position.set(x, y); s.width = s.height = size; s.tint = tint; s.blendMode = ADD(); world.addChild(s); return s; });
  // ambient sky objects (frozen by the 'Background Motion' setting): sun rays, aurora (two additive layers), stars; the clouds are below
  const rays = new PIXI.Sprite(T.rays); rays.anchor.set(.5); rays.position.set(980, 40); rays.width = rays.height = 2400; rays.blendMode = ADD(); rays.alpha = 0; world.addChild(rays);
  // aurora: three additive layers (soft veil, ray curtain, thin ribbons), each a 28x10 mesh whose vertices ripple (see updateSky), so the light unfurls and writhes instead of just fading
  const AU = [['auroraV', 1, 16, .22, 1], ['auroraC', 1.2, 30, .45, 1], ['auroraR', .9, 24, .4, 1], ['auroraC', 1.2, 26, .24, -.8]];   // texture, -, ripple amplitude (px), base alpha, time direction; the 2nd curtain copy waves the other way, so its ray streaks drift across the first one's and the rays shimmer
  const auroras = IMG.auroraV ? AU.map(([k, , amp, a, dir], i) => { const m = new PIXI.SimplePlane(tex(k), 28, 10); m.width = 1080; m.height = 1056; m.y = -50; m.blendMode = ADD(); m.alpha = 0; m.base = Float32Array.from(m.geometry.getBuffer('aVertexPosition').data); m.amp = amp; m.a0 = a; m.i = i; m.dir = dir; world.addChild(m); return m; }) : [];
  const stars = Array.from({ length: 28 }, (_, i) => { const s = new PIXI.Sprite(T.star); s.anchor.set(.5); s.blendMode = ADD(); s.alpha = 0; s.position.set(40 + Math.random() * 1000, 40 + Math.random() * 760); s.scale.set(.18 + Math.random() * .22); world.addChild(s); return { s, p: Math.random() * 6.28, f: .5 + Math.random() * 1.2 }; });
  const PT = [0, 1, 2, 3].map(petalTex);   // Blossom Island: petals drift down the sky, under the bubbles (bubbleLayer is added later, so a bubble in front of a petal can still be popped)
  const petals = Array.from({ length: 14 }, (_, i) => { const s = new PIXI.Sprite(PT[i % 4]); s.anchor.set(.5); s.alpha = 0; return { s, k: .55 + Math.random() * .4, ph: Math.random() * 6.28, w: .5 + Math.random() * .5, A: 38 + Math.random() * 40, v: 20 + Math.random() * 14, mode: i % 3, vx: 0, vxT: 0, t: Math.random() * 3, x: Math.random() * 1080, y: Math.random() * 1960 - 40 }; });
  petals.forEach(o => world.addChild(o.s));
  const cloud = (k, y, sc, alpha) => { const t = tex(k), s = new PIXI.TilingSprite(t, 1240, t.height * sc); s.tileScale.set(sc); s.y = y; s.alpha = alpha; world.addChild(s); return s; };
  const clouds = [];   // [0] = the foreground bank (pushed below)
  // sky clouds: single sprites from the atlas. Some hold still, the rest drift; size, height and speed follow a random depth (big = near = faster)
  const skyC = new PIXI.Container(); world.addChild(skyC);
  const at = tex('cloudAtlas'), fits = IMG.cloudAtlas && CLOUD_FRAMES.every(([x, y, w, h]) => x + w <= at.width && y + h <= at.height);   // a mismatched atlas must not take the whole renderer down
  const cloudTex = fits ? CLOUD_FRAMES.map(([x, y, w, h]) => new PIXI.Texture(at.baseTexture, new PIXI.Rectangle(x, y, w, h))) : [];
  const spawnCloud = (o, x) => {
    const d = Math.pow(Math.random(), 1.3), s = o.s;   // more distant (small, faint, slow) clouds than near ones
    s.texture = cloudTex[Math.floor(Math.random() * cloudTex.length)]; o.d = d; s.scale.set(.6 + d * 1.0); s.alpha = .6 + d * .35;
    o.v = 6 + d * 14; o.par = 6 + d * 24; o.y = 110 + Math.random() * 540; s.y = o.y; o.x = x;
  };
  const skyClouds = cloudTex.length ? [...STILL_CLOUDS.map(([x, y, d], i) => ({ x, y, d, v: 0, par: 0, still: true })), ...Array.from({ length: 8 }, () => ({ still: false }))].map((o, i) => {
    const s = new PIXI.Sprite(cloudTex[0]); s.anchor.set(0, .5); o.s = s; o.px = 0; skyC.addChild(s);
    if (o.still) { s.texture = cloudTex[Math.floor(Math.random() * cloudTex.length)]; s.scale.set(.6 + o.d * 1.0); s.alpha = .6 + o.d * .35; s.y = o.y; s.x = o.x; }
    else spawnCloud(o, -150 + Math.random() * 1300);   // drifting ones start spread across the sky, not in a row
    return o;
  }) : [];
  // bubbles live behind the island (hole mask) and behind every building
  const bubbleLayer = new PIXI.Container(), hole = new PIXI.Graphics();
  hole.beginFill(0xffffff).drawRect(-200, -200, 1480, 2320).beginHole().drawPolygon(ISLAND).endHole().endFill();
  if (IMG.skyMask) { const sm = new PIXI.Sprite(tex('skyMask')); sm.width = 1080; sm.height = 1920; world.addChild(bubbleLayer, sm); bubbleLayer.mask = sm; }   // exact island outline (alpha mask)
  else { world.addChild(bubbleLayer, hole); bubbleLayer.mask = hole; }
  // board water spilling over the front edges + mist
  const falls = new PIXI.Container(); world.addChild(falls);
  const fallStrips = FALLS.map(([x, y]) => [0, 1, 2].map(i => { const s = new PIXI.TilingSprite(tex('flow'), 26 - i * 4, 48); s.tileScale.set(.12); s.base = [x, y - 6 + i * 48, 26 - i * 4, [.95, .7, .35][i]]; falls.addChild(s); return s; }));
  const mist = new PIXI.ParticleContainer(80, { position: true, alpha: true, scale: true });
  mist.blendMode = ADD(); falls.addChild(mist);
  // board (colour graded by time of day)
  const boardF = new PIXI.Container(); world.addChild(boardF);
  const tw = TW * .95, tiles = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const [x, y] = center(r, c), s = new PIXI.Sprite(tex('tile')); s.width = tw; s.height = tex('tile').height * tw / tex('tile').width; s.position.set(x - tw / 2, y - TH * .95 / 2); boardF.addChild(s); tiles.push(s); }
  // grout = shallow water channels on the tile seams, running to the two front edges where they spill as falls (§6.2)
  const dry = new PIXI.Graphics(); dry.lineStyle({ width: 3, color: 0xc4d2e4, alpha: .9, cap: PIXI.LINE_CAP.ROUND });   // grout bed that shows where water runs dry
  for (const [a, b] of GROUT) dry.moveTo(...a).lineTo(...b);
  const water = new PIXI.Graphics(), waterHi = new PIXI.Graphics(); waterHi.blendMode = ADD(); boardF.addChild(dry, water, waterHi);
  const floorG = new PIXI.Graphics(); boardF.addChild(floorG);
  const pieces = new PIXI.Container(); pieces.sortableChildren = true; boardF.addChild(pieces);
  const CM = PIXI.ColorMatrixFilter || PIXI.filters.ColorMatrixFilter, cm = new CM();
  const spill = new PIXI.ParticleContainer(120, { position: true, alpha: true, scale: true }); world.addChild(spill);   // water tipping over the low edge
  const arrows = new PIXI.Graphics(), badges = new PIXI.Container(); world.addChild(arrows, badges);
  const badgePool = Array.from({ length: 16 }, () => { const s = new PIXI.Sprite(T.badge[1]); s.anchor.set(.5); s.width = s.height = 56; s.visible = false; badges.addChild(s); return s; });
  clouds.push(cloud('cloudNear', 1330, .9, .85));   // near clouds pass in front of the island's foot
  // night fireflies, effects, floating text
  const fireflies = Array.from({ length: 26 }, (_, i) => { const s = new PIXI.Sprite(T.dot); s.anchor.set(.5); s.tint = 0xfff3a0; s.blendMode = ADD(); s.alpha = 0; s.scale.set(.35 + (i % 3) * .1); world.addChild(s); return { s, a: Math.random() * 7, r: 220 + Math.random() * 430, y: 820 + Math.random() * 520 }; });
  const fxG = new PIXI.Graphics(), fxTop = new PIXI.Container(); world.addChild(fxG, fxTop);
  const edge = new PIXI.Sprite(T.edge); edge.width = 1080; edge.height = 1920; edge.blendMode = ADD(); edge.alpha = 0;
  const flash = new PIXI.Graphics(); flash.beginFill(0xffffff).drawRect(0, 0, 1080, 1920).endFill(); flash.alpha = 0; S.addChild(edge, flash);
  R = { world, bgs, lights, rays, auroras, stars, petals, pw: 0, aw: 0, clouds, skyClouds, spawnCloud, bubbleLayer, falls, fallStrips, mist, boardF, water, waterHi, tiles, floorG, pieces, cm, arrows, badgePool, fireflies, fxG, fxTop, edge, flash, spill, inst: new Map(), waterOff: [0, 0, 0, 0] };
  set_floatText((text, x, y, gold) => {
    const t = new PIXI.Text(text, { fontFamily: 'Nunito, Jua, ui-rounded, system-ui, sans-serif', fontWeight: '900', fontSize: 60, fill: gold ? '#ffe878' : '#ffffff', stroke: gold ? '#b8640a' : '#165aa6', strokeThickness: 12 });
    t.anchor.set(.5); t.position.set(x, y); fxTop.addChild(t); U.floats.push({ t, x, y, t0: performance.now() });
  });
  app.ticker.add(safeFrame);
  document.addEventListener('visibilitychange', () => document.hidden ? app.ticker.stop() : app.ticker.start());   // spec §8: pause when hidden
  /* The garden must never freeze while the buttons keep working:
     - a frame that throws is caught (safeFrame), so the PIXI ticker keeps asking for the next frame;
     - the WebGL context the phone takes away (memory, too many contexts) is asked back (preventDefault) and PIXI rebuilds on restore;
     - a watchdog restarts the ticker if no frame has been drawn for 1.5 s while the page is visible. */
  $('cv').addEventListener('webglcontextlost', e => e.preventDefault());
  setInterval(() => { if (!document.hidden && performance.now() - LASTF > 1500) { app.ticker.stop(); app.ticker.start(); } }, 1000);
}

/* ---------- per-frame ---------- */
let PETAL_GUST = 6, PETAL_WIND = 0, PETAL_DIR = 1;   // breeze timer for the sky petals
let TM = 0, TP = 0, AT = 0;   // AT: ambient-object clock, runs only while Background Motion is on
export function tickParts(dt) { TP += dt; return TP; }   // editor preview clock   // TM: ambient clock, TP: building-part clock (frozen under Reduce Motion)
const PHASE_M = [   // colour grading per time of day (ColorMatrix, offsets in 0-1)
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  [1.08, .04, 0, 0, .02, 0, .96, 0, 0, 0, 0, 0, .84, 0, 0, 0, 0, 0, 1, 0],
  [.82, 0, 0, 0, 0, 0, .86, .02, 0, .01, 0, .03, 1, 0, .04, 0, 0, 0, 1, 0]];   // v0.4: night board and buildings brighter (sky stays dark)
const FPS = (location.search.includes('fps') || location.hash.includes('fps')) ? { el: Object.assign(document.createElement('div'), { id: 'fps' }), ms: [], t: 0 } : null;   // ?fps: phone frame meter
if (FPS) document.body.append(FPS.el);
let LASTF = performance.now(), ERRN = 0;
function safeFrame() {
  LASTF = performance.now();
  try { frame(); } catch (e) { if (ERRN++ < 5) { console.error('frame', e); dispatchEvent(new ErrorEvent('error', { message: 'frame: ' + (e && e.message), error: e })); } }   // reported once in the play log (telemetry listens to 'error'), then quiet
}
function frame() {
  const dt = Math.min(app.ticker.deltaMS, 50) / 1000, now = performance.now(), still = reduce();
  if (FPS) { FPS.ms.push(app.ticker.deltaMS); if (now - FPS.t > 500) { const a = FPS.ms.slice().sort((x, y) => x - y), avg = a.reduce((x, y) => x + y, 0) / a.length;
    FPS.el.textContent = `${(1000 / avg).toFixed(0)} fps · p95 ${a[Math.floor(a.length * .95)].toFixed(1)} ms`; FPS.ms = []; FPS.t = now; } }
  TM += dt; if (!still) TP += dt; if (ambient()) AT += dt;
  perfGuard(app.ticker.deltaMS);
  if (U.screen === 'game' && G.meta && !G.meta.over && !paused()) { U.playMs += dt * 1000; tickSpeed(); }
  speedRing();
  updatePhase(dt); updateTilt(dt);
  updateSky(dt, still);
  updateBubbles(dt, now, still);
  updateBoard(dt, now, still);
  updateFx(dt, now);
}
function updatePhase(dt) {
  if (U.screen === 'game') U.phaseTop = Math.max(U.phaseTop, G.top);   // best building this game: Rewind does not undo a sunset
  const tgt = U.shopPhase ?? (U.screen === 'game' ? (U.phaseTop >= 15 ? 2 : U.phaseTop >= 12 ? 1 : 0) : 0);   // spec §6.5 + §11 #6 (menus stay Day)
  const w = U.phaseW, k = Math.min(1, dt / 3);   // 3 s cross-fade
  for (let i = 0; i < 3; i++) w[i] += ((i === tgt ? 1 : 0) - w[i]) * Math.min(1, k * 3);
  const sum = w[0] + w[1] + w[2]; for (let i = 0; i < 3; i++) w[i] /= sum;
}
function updateSky(dt, still) {
  const w = U.phaseW, T = U.tilt, calm = !ambient(), skin = U.skyShown ?? U.equip?.sky, aur = skin === 'aurora';
  R.bgs[0].alpha = 1; R.bgs[1].alpha = w[1] + w[2]; R.bgs[2].alpha = w[2] / Math.max(1e-6, w[1] + w[2]);
  const breathe = calm ? .8 : .8 + .2 * Math.sin(TM * Math.PI * 2 / 7);   // sun breathes, 7 s
  R.lights[0].tint = skin === 'blossom' ? 0xffd0e6 : aur ? 0x9fe8ff : 0xfff6d0;   // the sun glow follows the sky skin: pink for Blossom, a faint cool glow for Aurora
  R.lights[0].alpha = .55 * (aur ? .18 : 1) * w[0] * breathe; R.lights[1].alpha = .5 * w[1] * breathe; R.lights[2].alpha = .35 * w[2] * breathe;
  const tint = mix3(w, aur ? 0xe0f0ff : skin === 'blossom' ? 0xfff0f8 : 0xffffff, 0xffc4b0, 0x6878b0);   // clouds take the sky skin's colour (cool violet for Aurora Sky)
  const bank = R.clouds[0];   // the bottom cloud bank only drifts by itself: no tilt parallax, so it never reacts to motion
  if (!calm) bank.tilePosition.x -= 1080 / 60 * dt / bank.tileScale.x;
  bank.x = -80; bank.tint = tint;
  R.skyClouds.forEach(o => {   // held-still clouds never move; drifting ones wrap around with a new random shape, size and height
    const s = o.s; if (!o.still && !calm) { o.x -= o.v * dt; if (o.x < -s.width) R.spawnCloud(o, 1080 + 30 + Math.random() * 260); }
    if (!o.still && !calm) o.px = T.x * o.par;   // slight tilt parallax, held when the setting turns the motion off
    s.x = o.x - o.px; s.tint = tint;
  });
  // sun rays turn slowly and shimmer in the day; aurora fades in at night and with the Aurora Sky skin; stars twinkle at night
  R.rays.rotation = .35 + .12 * Math.sin(AT * Math.PI * 2 / 40); R.rays.alpha = (aur ? 0 : .2) * w[0] * (.75 + .25 * Math.sin(AT * Math.PI * 2 / 9)); R.rays.tint = skin === 'blossom' ? 0xffd2e8 : 0xffffff;
  R.aw += ((aur ? .15 * w[0] + .5 * w[1] + .8 * w[2] : 0) - R.aw) * Math.min(1, dt * 2);   // the animated aurora belongs to the Aurora Sky skin only (a faint one by day, stronger at dusk and night); the other skins' skies are painted calm
  R.auroras.forEach(m => {   // waves travel along the curtain (periods 5-11 s, wavelengths ~240 and ~450 px) and the rays sway sideways; the lower edge moves most; brightness breathes gently
    const b = m.base, d = m.geometry.getBuffer('aVertexPosition'), v = d.data, t = AT * m.dir, A = m.amp, i = m.i;
    for (let k = 0; k < v.length; k += 2) {
      const x = b[k], y = b[k + 1], low = .3 + .7 * (y / 1056);
      v[k] = x + A * .8 * Math.sin(t * .55 + y * .012 + i * 2.1) * low;
      v[k + 1] = y + A * low * (Math.sin(t * .8 + x * .014 + i * 1.7) + .7 * Math.sin(t * 1.25 - x * .026 + i * 3.1));
    }
    d.update();
    m.alpha = R.aw * m.a0 * (.85 + .15 * Math.sin(AT * .6 + i * 2.3));
  });
  R.stars.forEach(o => { o.s.alpha = w[2] * .9 * Math.max(0, .25 + .75 * Math.sin(AT * o.f + o.p)); });
  R.pw += ((skin === 'blossom' && !calm ? 1 : 0) - R.pw) * Math.min(1, dt * 2);   // petals fall and sway only on the Blossom Island skin while Background Motion is on
  PETAL_WIND = Math.max(0, PETAL_WIND - dt) || 0; if (!calm && R.pw > .5 && (PETAL_GUST -= dt) <= 0) { PETAL_GUST = 14 + Math.random() * 10; PETAL_WIND = 3.5; PETAL_DIR = Math.random() < .5 ? -1 : 1; }
  const gust = PETAL_DIR * 55 * Math.sin(Math.PI * Math.min(1, PETAL_WIND / 3.5));   // an occasional breeze (every 14-24 s, 3.5 s long) pushes every petal sideways
  R.petals.forEach(o => {   // slow and never straight: 0 = pendulum swing (a leaf rocking to and fro), 1 = glide (falls, slides sideways, turns back), 2 = drift (wide lazy S-curve); all fall 20-34 px/s
    const s = o.s;
    if (!calm) {
      let vy = o.v, tilt;
      if (o.mode === 0) { o.ph += o.w * dt; const c = Math.cos(o.ph); o.vx = o.A * o.w * c; vy *= 1 - .45 * Math.abs(c); tilt = -.5 * c; }
      else if (o.mode === 1) { if ((o.t -= dt) <= 0) { o.t = 2 + Math.random() * 2.5; o.vxT = (Math.random() < .5 ? -1 : 1) * (22 + Math.random() * 34); } o.vx += (o.vxT - o.vx) * Math.min(1, dt * 1.3); vy *= 1 - .55 * Math.abs(o.vx) / 56; tilt = o.vx / 90; o.ph += dt; }
      else { o.ph += o.w * .55 * dt; o.vx = o.A * 1.3 * o.w * .55 * Math.cos(o.ph) + 8 * Math.sin(o.ph * 2.3); vy *= .8 + .2 * Math.sin(o.ph * 2); tilt = o.vx / 70; }
      o.x += (o.vx + gust * (.6 + o.k)) * dt; o.y += vy * dt; s.rotation += ((tilt + gust / 260) - s.rotation) * Math.min(1, dt * 2.5);
      s.scale.set(o.k * (.45 + .55 * Math.abs(Math.cos(o.ph * 1.7 + o.w * 4))), o.k);   // a slow flip, like a petal turning over
      if (o.y > 1980) { o.y = -50; o.x = Math.random() * 1080; } if (o.x < -80) o.x += 1240; else if (o.x > 1160) o.x -= 1240;
    }
    s.position.set(o.x, o.y); s.alpha = R.pw * .85;
  });
  // fireflies at night
  R.fireflies.forEach((f, i) => { if (!calm) f.a += dt * (.15 + (i % 5) * .03); f.s.position.set(540 + Math.cos(f.a) * f.r, f.y + Math.sin(f.a * 1.7) * 30); f.s.alpha = w[2] * (.4 + .6 * Math.max(0, Math.sin(AT * 2 + i))); });
  // water sloshes after the tilt (spring), then flows toward the low side
  const tx = still ? 0 : T.x, ty = still ? 0 : T.y;
  WTL.vx += ((tx - WTL.x) * 36 - WTL.vx * 6) * dt; WTL.vy += ((ty - WTL.y) * 36 - WTL.vy * 6) * dt; WTL.x += WTL.vx * dt; WTL.y += WTL.vy * dt;
  const mag = Math.hypot(WTL.x, WTL.y), fx = WTL.x * 70, fy = 24 + WTL.y * 60, k = WATER_SPEED * (still ? .3 : 1) * (1 + mag * 1.5);
  const wo = R.waterOff; wo[0] += fx * dt * k; wo[1] += fy * dt * k; wo[2] += fx * 1.6 * dt * k; wo[3] += fy * 2.2 * dt * k;
  const wc = mix3(w, U.skinWater || WATER.base[0], WATER.base[1], WATER.base[2]);
  drawWater(R.water, 'caustic', .3, wo[0], wo[1], wc, false);
  drawWater(R.waterHi, 'flow', .2, wo[2], wo[3], wc, true); R.waterHi.alpha = .8 + .2 * w[2];
  // the six board falls: thick and fast on the low side, thin then dry on the high side
  const fallW = FALLS.map(([x, y]) => Math.min(1.8, level(x, y) / .5));
  R.fallStrips.forEach((strips, j) => strips.forEach(s => {
    const [x, y, wd, a] = s.base, st = fallW[j]; s.visible = st > .2; s.width = wd * Math.max(.3, st); s.position.set(x - s.width / 2, y);
    s.alpha = a * Math.min(1, st); s.tilePosition.y += (110 + 60 * st) * dt * k / .12; s.tint = mix3(w, 0x9cc2ff, 0xffd0b0, 0xa8c4ff);
  }));
  // overflow: droplets tip over whichever rim is lowest
  if (!still && mag > .2 && R.spill.children.length < 110) for (const [x, y] of RIM) {
    const L = level(x, y); if (L < .9 || Math.random() > dt * 14 * mag) continue;
    const d = new PIXI.Sprite(genTextures().dot); d.anchor.set(.5); d.tint = WATER.hi; d.position.set(x, y); d.scale.set(.25 + Math.random() * .3); d.alpha = .9;
    d.vx = WTL.x * 160 + (Math.random() - .5) * 60; d.vy = WTL.y * 80 - 60 - Math.random() * 60; R.spill.addChild(d);
  }
  for (const d of [...R.spill.children]) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 700 * dt; d.alpha -= dt * 1.1; if (d.alpha <= 0) { R.spill.removeChild(d); d.destroy(); } }
  if (!still && R.mist.children.length < 60 && Math.random() < dt * 30) {
    const j = Math.floor(Math.random() * FALLS.length); if (fallW[j] < .3) return finishSky(w);
    const [x, y] = FALLS[j], m = new PIXI.Sprite(genTextures().dot);
    m.anchor.set(.5); m.position.set(x + (Math.random() - .5) * 20, y + 140); m.scale.set(.6 + Math.random() * .6); m.alpha = .5; m.vy = -10 - Math.random() * 15; m.vx = (Math.random() - .5) * 16; R.mist.addChild(m);
  }
  finishSky(w, dt);
}
function finishSky(w, dt = 0) {
  for (const m of [...R.mist.children]) { m.x += m.vx * dt; m.y += m.vy * dt; m.alpha -= dt * .35; m.scale.x = m.scale.y += dt * .5; if (m.alpha <= 0) { R.mist.removeChild(m); m.destroy(); } }
  // board colour grading only while not plain Day (one filter pass)
  if (w[0] > .999) R.boardF.filters = null;
  else { R.cm.matrix = PHASE_M[0].map((_, i) => w[0] * PHASE_M[0][i] + w[1] * PHASE_M[1][i] + w[2] * PHASE_M[2][i]); R.boardF.filters = [R.cm]; }
}

export let drawn = [];   // buildings as drawn this frame (for taps): {r,c,lv,x,y,w,h}
export const ease = t => 1 - (1 - t) ** 3;
const overlap = (a, b) => a && b && a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
function diamond(g, x, y, k) { g.drawPolygon([x, y - TH / 2 * k, x + TW / 2 * k, y, x, y + TH / 2 * k, x - TW / 2 * k, y]); }
function gardenPulse(x, y, periodic = true) {   // spec §6.4: one diagonal shimmer crosses the whole board (three quick ones after a Lv15+ merge); every 6 s only on the menu board (in a game: D1 hint)
  if (reduce()) return 0;
  const s = x * .8 + y * .6, band = q => Math.max(0, 1 - Math.abs(s - (560 + q * 980)) / 150);
  const b = U.pulseBoost ? (performance.now() - U.pulseBoost) / 700 : 9;
  if (b < 3) return band(b % 1);
  if (!periodic) return 0;
  const q = TM % 6; return q > 1.6 ? 0 : band(q / 1.6);
}
/* 10-2 D1: every 8 s the buildings that can merge right now glow together (slow fade in place under Reduce Motion).
   No pair but a free tile: the Place button gets a light streak instead. Quiet while something is selected, dragged, animating or open. */
const HINT_EVERY = 8;   // seconds between hint glows (10-2b)
function hintStrength(inGame, A, still) {
  const q = TM % HINT_EVERY, on = inGame && !A && U.settings.hints && !U.sel && !U.target && !U.tut && !(U.drag && U.drag.active) && !busy();
  const cyc = Math.floor(TM / HINT_EVERY);
  if (cyc !== U.hintCyc) { U.hintCyc = cyc; if (on && !L.canMerge(G.board) && L.empties(G.board).length) shinePlace(still); }
  return on ? Math.sin(Math.min(1, q / (still ? 3 : 1.6)) * Math.PI) : 0;
}
function shinePlace(still) { const b = $('place'); b.classList.remove('sweep', 'sweep-r'); void b.offsetWidth; b.classList.add(still ? 'sweep-r' : 'sweep'); }
/* ---------- place drop (§7): fall, trail, shadow, squash, splash; Cloud Drop gathers a cloud first ---------- */
export function startDrop(r, c, lv, viaCloud) {
  endDrop();
  U.drop = { r, c, lv, t0: performance.now(), delay: viaCloud && !reduce() ? 420 : 0, fall: viaCloud ? 300 : 350, h: viaCloud ? 340 : 1000, trail: [] };
  if (viaCloud) { cloudFx(r, c); SFX.whoosh(.42); } else SFX.whoosh();
  if (reduce()) { SFX.land(); vib(10); }
}
function trail(D, I, x, y, sp, dy, t) {   // afterimages above the falling building
  if (!D.trail.length) for (let i = 0; i < 3; i++) { const g = new PIXI.Sprite(I.c.children[0].texture); g.anchor.set(.5, 1); R.pieces.addChild(g); D.trail.push(g); }
  D.trail.forEach((g, i) => { g.scale.set(sp.w / I.W); g.position.set(x + sp.ox, y + .4 * TH + sp.oy + dy - (i + 1) * 70 * (.3 + t)); g.alpha = (.32 - i * .09) * (1 - t * .3); g.zIndex = D.r + D.c - .01; });
}
function land(D, x, y) {
  D.landed = true; D.trail.forEach(g => g.destroy()); D.trail = [];
  const f = addFxXY('splash', x, y + 8);
  if (f) { parts(f, 16, 'spray', { flat: true, speed: 6, r: 7, lift: 3, g: .3, dy: -4 }); parts(f, 6, 'drop', { r: 8, speed: 3, dy: -10 }); }
  SFX.land(); vib(12);
}
function endDrop() { const D = U.drop; if (!D) return; D.trail.forEach(g => g.destroy()); U.drop = null; }
function cloudFx(r, c) {   // Cloud Drop: puffs gather above the tile, then a light column marks the landing
  const [x, y] = center(r, c), f = addFxXY('clouddrop', x, y); if (!f) return;
  for (let i = 0; i < 5; i++) { const p = new PIXI.Sprite(genTextures().puff); p.anchor.set(.5); p.from = [x + (i - 2) * 160 + (Math.random() - .5) * 60, y - 420 - Math.random() * 120]; p.to = [x + (i - 2) * 34, y - 340 + Math.abs(i - 2) * 10]; p.scale.set(.9 + Math.random() * .3); R.fxTop.addChild(p); f.spr.push(p); }
  f.col = new PIXI.Sprite(genTextures().pillar); R.fxTop.addChildAt(f.col, 0); f.spr.push(f.col); SFX.cloud();
}
export function ghostOf(lv, r, c) {   // plain sprite copy of a building, placed like the board does
  const sp = sprite(lv); if (!sp || !R) return null;
  const t = tex(bkey(lv)), g = new PIXI.Sprite(t), [x, y] = center(r, c); g.anchor.set(.5, 1); g.scale.set(sp.w / t.width); g.position.set(x + sp.ox, y + .4 * TH + sp.oy); return g;
}
function updateBoard(dt, now, still) {
  const inGame = U.screen === 'game', board = inGame ? G.board : SHOW, w = U.phaseW;
  let ox = 0, oy = 0;
  if (U.shake && now - U.shake < 300) { const t = (now - U.shake) / 300; ox = Math.sin(t * 40) * U.shakeAmp * (1 - t); oy = Math.cos(t * 33) * U.shakeAmp * .5 * (1 - t); }
  R.world.position.set(CX + ox, CY + oy);
  const pulse = .55 + .45 * Math.sin(now / 170), g = R.floorG; g.clear();
  if (inGame && U.target) for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (U.target === 'pop' ? !board[r][c] : board[r][c]) continue;
    const [x, y] = center(r, c);
    if (U.target === 'pop') { g.lineStyle(8, 0xff78c8, pulse); diamond(g, x, y, .9); }
    else { g.lineStyle(10, 0xff8a00, .55 + .45 * pulse).beginFill(0xffb000, .12 + .16 * pulse); diamond(g, x, y, .9); g.endFill(); }   // Cloud Drop: vivid orange, it reads on the pale and the coloured tiles
  }
  const sel = inGame && !U.anim ? (U.drag && U.drag.active ? U.drag.from : U.sel) : null;
  const tg = sel ? L.targets(board, sel[0], sel[1]) : [];
  const press = inGame && !U.anim && U.press && board[U.press[0]][U.press[1]] ? U.press : null;   // finger is down: show what it will pick
  if (press && !same(press, sel)) { const [x, y] = center(...press); g.lineStyle(7, 0xffffff, .95).beginFill(0xffffff, .18); diamond(g, x, y, .9); g.endFill(); }
  if (sel) {
    const [x, y] = center(...sel);
    g.lineStyle(9, 0xffffff, .7 + .3 * pulse).beginFill(0x78e6ff, .25 + .2 * pulse); diamond(g, x, y, .92); g.endFill();
    g.lineStyle(4, 0x28beff, .8); diamond(g, x, y, 1.02);
    for (const t of tg) { const [tx, ty] = center(...t); g.lineStyle(7, 0xffd640, .55 + .45 * pulse).beginFill(0xffec78, .18 + .22 * pulse); diamond(g, tx, ty, .9); g.endFill(); }
  }
  const D = U.drop;
  if (inGame && D && !D.landed && !still) {   // the landing shadow grows as the building nears the ground
    const el = now - D.t0 - D.delay, t = el < 0 ? .15 * (1 + el / D.delay) : .15 + .85 * Math.min(1, el / D.fall), [x, y] = center(D.r, D.c);
    g.lineStyle(0).beginFill(0x123c6e, .3 * t).drawEllipse(x, y + 6, 92 * (.35 + .65 * t), 38 * (.35 + .65 * t)).endFill();
  }
  // pieces this frame
  const pieces = [], A = U.anim;
  if (inGame && A) {
    const t = A.dur ? Math.min(1, (now - A.t0) / A.dur) : 1, e = ease(t);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {   // board already holds the result: show the old target until arrival
      if (same([r, c], A.e.to)) { pieces.push({ lv: A.e.from_lv, r, c, key: r + ',' + c }); continue; }
      if (board[r][c]) pieces.push({ lv: board[r][c], r, c, key: r + ',' + c });
    }
    const [fr, fc] = A.e.from, [tr, tc] = A.e.to;
    pieces.push({ lv: A.e.from_lv, r: fr + (tr - fr) * e, c: fc + (tc - fc) * e, lift: -12 * Math.sin(e * Math.PI), moving: true, key: 'mv' });
    if (t >= 1) { U.anim = null; finishMerge(A.e); }
  } else for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (board[r][c]) pieces.push({ lv: board[r][c], r, c, key: r + ',' + c });
  const draggingNow = inGame && U.drag && U.drag.active;
  if (draggingNow) { const [px, py] = U.drag.pt; pieces.push({ lv: board[U.drag.from[0]][U.drag.from[1]], x: px, y: py + 20, k: 1.06, alpha: .9, key: 'drag', z: 99 }); }
  const rectOf = p => { const sp = sprite(p.lv); if (!sp) return null; const [x, y] = center(p.r, p.c); return [x - sp.w / 2 + sp.ox, y + .4 * TH - sp.h + sp.oy, sp.w, sp.h]; };
  const focus = press || sel, selRect = focus ? rectOf({ lv: board[focus[0]][focus[1]], r: focus[0], c: focus[1] }) : null;
  const seen = new Set(); drawn = [];
  const hintK = hintStrength(inGame, A, still);
  for (const p of pieces) {
    const sp = sprite(p.lv); if (!sp) continue;
    let I = R.inst.get(p.key);
    if (!I || I.lv !== p.lv || I.key !== bkey(p.lv)) { if (I) I.c.destroy({ children: true }); I = makeInst(p.lv); R.inst.set(p.key, I); R.pieces.addChild(I.c); }
    seen.add(p.key);
    const [x, y] = p.x != null ? [p.x, p.y] : center(p.r, p.c);
    let k = p.k || 1, dy = p.lift || 0, alpha = p.alpha || 1, dx = 0, kx = 1, ky = 1;
    if (inGame && p.key !== 'mv' && p.key !== 'drag') {
      const pt = U.pops[p.key];   // appear bounce, stronger for higher grades
      if (pt) { const t = (now - pt.t0) / pt.dur; if (t < 1) k = 1 + pt.amp * Math.sin(t * Math.PI) * (1 - t * .3); else delete U.pops[p.key]; }
      if (U.boardBounce && now - U.boardBounce < 180 && !still) dy -= 4 * Math.sin((now - U.boardBounce) / 180 * Math.PI);  // everyone hops together (§6.4)
      const D = U.drop;
      if (D && D.r === p.r && D.c === p.c) {   // place: falls in from the sky, trail, squash on landing (§7)
        const el = now - D.t0 - D.delay;
        if (still) { alpha = Math.min(1, (now - D.t0) / 200); if (alpha >= 1) endDrop(); }
        else if (el < 0) { I.c.visible = false; continue; }                       // Cloud Drop: the cloud is still gathering
        else if (el < D.fall) { const t = el / D.fall; dy = -D.h * (1 - t * t); trail(D, I, x, y, sp, dy, t); }
        else { if (!D.landed) land(D, x, y); const t = (el - D.fall) / 240;
          if (t >= 1) endDrop(); else { const q = Math.sin(t * Math.PI) * (1 - t * .5); kx = 1 + .2 * q; ky = 1 - .22 * q; } }
      }
      if (U.nope && U.nope.r === p.r && U.nope.c === p.c) { const t = (now - U.nope.t0) / 300; if (t >= 1) U.nope = null; else if (!still) dx = Math.sin(t * 30) * 7 * (1 - t); }
      if (sel && same([p.r, p.c], sel)) { if (draggingNow) { I.c.visible = false; continue; } dy -= 8 + 3 * Math.sin(now / 220); }
      if (sel && tg.some(t => same(t, [p.r, p.c])) && U.settings.hints) dy -= 3 * (.5 + .5 * Math.sin(now / 140));
      if (selRect && (p.r + p.c) > (focus[0] + focus[1]) && overlap(rectOf(p), selRect)) alpha = Math.min(alpha, .35);
    }
    const s = sp.w / I.W;
    I.c.visible = true; I.c.alpha = alpha; I.c.zIndex = p.z ?? (p.r + p.c + (p.moving ? .5 : 0));
    I.c.scale.set(s * k * kx, s * k * ky); I.c.position.set(x + dx + sp.ox * k, y + .4 * TH + sp.oy * k + dy);
    I.glow.alpha = gardenPulse(x, y - 60, !inGame) * .38 + (hintK > 0 && p.key !== 'mv' && p.key !== 'drag' && L.targets(board, p.r, p.c).length ? hintK * .3 : 0) + w[2] * .14; I.glow.visible = I.glow.alpha > .01; I.glow.tint = w[2] > .5 ? 0xffd890 : 0xffffff;
    const sil = !inGame && sbLocked(p.lv); if (!!I.sil !== sil) { I.sil = sil; I.c.filters = sil ? [silFilter()] : null; } if (sil) I.glow.visible = false;
    updateInst(I, TP, dt, s * k, still);
    if (p.key !== 'mv' && p.key !== 'drag') drawn.push({ r: p.r, c: p.c, lv: p.lv, key: I.key, x: x + dx - sp.w * k / 2 + sp.ox * k, y: y + .4 * TH - sp.h * k + sp.oy * k + dy, w: sp.w * k, h: sp.h * k });
  }
  for (const [key, I] of R.inst) if (!seen.has(key)) { I.c.destroy({ children: true }); R.inst.delete(key); }
  // hint arrows and badges stay outside the colour grading so they always read clearly
  const a = R.arrows; a.clear();
  if (sel && tg.length && U.settings.hints) {
    const [sx, sy] = center(...sel);
    for (const t of tg) {
      const [tx, ty] = center(...t), ang = Math.atan2(ty - sy, tx - sx), m = .58 + .06 * Math.sin(now / 160), cx = sx + (tx - sx) * m, cy = sy + (ty - sy) * m;
      const P = [[22, 0], [-12, -16], [-4, 0], [-12, 16]].flatMap(([u, v]) => [cx + u * Math.cos(ang) - v * Math.sin(ang), cy + u * Math.sin(ang) + v * Math.cos(ang)]);
      a.lineStyle(5, 0xf2a91d).beginFill(0xffffff).drawPolygon(P).endFill();
    }
  }
  let bi = 0;
  if (inGame && !A) for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (board[r][c]) {
    if (draggingNow && same([r, c], U.drag.from)) continue;
    if (D && !D.landed && D.r === r && D.c === c) continue;   // badge appears when the building lands
    const b = R.badgePool[bi++]; b.texture = genTextures().badge[board[r][c]]; b.position.set(...badgePos(r, c, board[r][c])); b.visible = true;
  }
  for (; bi < 16; bi++) R.badgePool[bi].visible = false;
}


