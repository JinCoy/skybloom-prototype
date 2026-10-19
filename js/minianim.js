/* Skybloom module: minianim. A building with its motion (the same makeInst / updateInst the garden uses) drawn in a small 2D canvas:
   result screen, "New Building!", collection detail, the NEXT preview.
   All of them share ONE extra WebGL renderer (phones drop the oldest WebGL context when there are too many, and the oldest is the garden):
   each frame a mini building is drawn by the shared renderer and copied into its own 2D canvas. One loop, running only while one is on screen.
   If the shared renderer cannot be made, the plain picture stays (the <img> the host already holds). */
import { $, bkey, reduce } from './core.js?v=0.7.56';
import { makeInst, updateInst } from './renderer.js?v=0.7.56';

const MAXW = 520, MAXH = 560;   // the largest mini (New Building! is 500 x 540)
let SR = null, RES = 1, failed = false;
function shared() {
  if (SR || failed) return SR;
  try {
    RES = Math.min(2, (window.devicePixelRatio || 1) * ($('stage').getBoundingClientRect().width / 1080 || 1));
    SR = new PIXI.Renderer({ width: MAXW, height: MAXH, backgroundAlpha: 0, antialias: true, resolution: RES });
    SR.view.addEventListener('webglcontextlost', e => { e.preventDefault(); });   // PIXI restores it; until then the copies keep their last frame
  } catch { failed = true; SR = null; }
  return SR;
}
const MINIS = new Set(); let raf = 0, last = 0;
function loop(now) {
  raf = 0; let any = false; const dt = last ? Math.min(100, now - last) : 16; last = now;
  for (const m of MINIS) if (m.live()) { any = true; try { m.frame(dt); } catch { /* one bad frame never stops the loop */ } }
  if (any) raf = requestAnimationFrame(loop); else last = 0;
}
const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } };

/** How far a building and its moving parts reach (local px, origin = bottom centre), over ~2.5 s of its motion. Cached per picture. */
const REACH = {};
export function reach(I) {
  const id = I.key + ':' + I.parts.length; if (REACH[id]) return REACH[id];
  let x0 = -I.W / 2, y0 = -I.H, x1 = I.W / 2, y1 = 0;
  for (let k = 0; k < 24; k++) {
    updateInst(I, k * .11, .11, 1, false);
    const r = I.c.getLocalBounds(); x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.width); y1 = Math.max(y1, r.y + r.height);
  }
  return REACH[id] = { x0, y0, x1, y1 };
}
export class Mini {
  /** host: element holding the fallback <img>; w, h: size in stage px (at most MAXW x MAXH); fps: frame cap;
      clip: a scrolling box the host sits in (only drawn while it is scrolled into view). */
  constructor(host, w, h, fps = 30, clip = null) {
    this.host = host; this.clip = clip; this.w = w; this.h = h; this.step = 1000 / fps; this.t = 0; this.acc = 0; this.I = null; this.lv = 0;
    this.img = host.querySelector('img'); this.stage = new PIXI.Container();
    this.ok = !!shared();
    if (this.ok) {
      this.cv = document.createElement('canvas'); this.cv.width = Math.round(w * RES); this.cv.height = Math.round(h * RES);
      this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; this.ctx = this.cv.getContext('2d');
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';   // only a static host: an absolute one (Decorate card art) keeps its box
      host.appendChild(this.cv); MINIS.add(this);
    }
  }
  live() {
    if (!this.ok || !this.I || this.host.offsetParent === null) return false;
    if (!this.clip) return true;
    const a = this.host.getBoundingClientRect(), b = this.clip.getBoundingClientRect(); return a.right > b.left && a.left < b.right;   // a card scrolled out of the palette is not drawn
  }
  destroy() { MINIS.delete(this); this.stage.destroy({ children: true }); this.I = null; this.cv?.remove(); }
  /** Show building level lv of a building set (default: the equipped one; a SET_PRE key, null = Classic); returns false when only the plain picture can be used. */
  show(lv, set) {
    if (!this.ok) return false;
    this.set = set;
    if (lv === this.lv && this.I && this.I.key === bkey(lv, set)) { if (this.img) this.img.style.visibility = 'hidden'; wake(); return true; }   // same building of the same set: keep it (the host may have shown its <img> again meanwhile, e.g. a second tap)
    this.stage.removeChildren().forEach(c => c.destroy({ children: true })); this.I = null;
    try { this.I = makeInst(lv, bkey(lv, set)); } catch { this.I = null; }
    if (!this.I) { this.lv = 0; this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); if (this.img) this.img.style.visibility = ''; return false; }
    const I = this.I; I.glow.visible = false; this.lv = lv;
    const b = reach(I), half = Math.max(-b.x0, b.x1);   // fit everything that moves (sails, spray, sparkles), not only the picture; the building stays centred
    this.sc = Math.min(this.w / (2 * half), this.h / (b.y1 - b.y0)) * .97;
    I.c.scale.set(this.sc); I.c.position.set(this.w / 2, this.h - 2 - b.y1 * this.sc); this.stage.addChild(I.c);
    if (this.img) this.img.style.visibility = 'hidden';   // keeps the box size, the canvas draws over it
    this.draw(0); wake(); return true;
  }
  /** A picture that is not a building (a treasure): the plain <img> shows. */
  hide() { if (!this.ok) return; this.stage.removeChildren(); this.I = null; this.lv = 0; this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); if (this.img) this.img.style.visibility = ''; }
  draw(dt) {
    updateInst(this.I, this.t, dt, this.sc, reduce());
    SR.render(this.stage, { clear: true });
    const c = this.ctx; c.clearRect(0, 0, this.cv.width, this.cv.height); c.drawImage(SR.view, 0, 0, this.cv.width, this.cv.height, 0, 0, this.cv.width, this.cv.height);
  }
  frame(dt) {
    if (this.I.key !== bkey(this.lv, this.set)) { const lv = this.lv; this.lv = 0; this.show(lv, this.set); return; }   // the set's own picture finished loading (or the set changed): rebuild
    this.acc += dt;
    if (this.acc < this.step) return;
    const d = this.acc / 1000; this.acc = 0; if (!reduce()) this.t += d; this.draw(d);
  }
}
