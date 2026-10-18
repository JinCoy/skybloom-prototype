/* Skybloom module: minianim. A building with its motion (the same makeInst / updateInst the garden uses) drawn in a small 2D canvas:
   result screen, "New Building!", collection detail, the NEXT preview.
   All of them share ONE extra WebGL renderer (phones drop the oldest WebGL context when there are too many, and the oldest is the garden):
   each frame a mini building is drawn by the shared renderer and copied into its own 2D canvas. One loop, running only while one is on screen.
   If the shared renderer cannot be made, the plain picture stays (the <img> the host already holds). */
import { $, reduce } from './core.js?v=0.7.38';
import { makeInst, updateInst } from './renderer.js?v=0.7.38';

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

export class Mini {
  /** host: element holding the fallback <img>; w, h: size in stage px (at most MAXW x MAXH); fps: frame cap. */
  constructor(host, w, h, fps = 30) {
    this.host = host; this.w = w; this.h = h; this.step = 1000 / fps; this.t = 0; this.acc = 0; this.I = null; this.lv = 0;
    this.img = host.querySelector('img'); this.stage = new PIXI.Container();
    this.ok = !!shared();
    if (this.ok) {
      this.cv = document.createElement('canvas'); this.cv.width = Math.round(w * RES); this.cv.height = Math.round(h * RES);
      this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; this.ctx = this.cv.getContext('2d');
      host.style.position = host.style.position || 'relative'; host.appendChild(this.cv); MINIS.add(this);
    }
  }
  live() { return this.ok && this.I && this.host.offsetParent !== null; }
  /** Show building level lv (the picture of the equipped set); returns false when only the plain picture can be used. */
  show(lv) {
    if (!this.ok) return false;
    if (lv === this.lv && this.I) { wake(); return true; }
    this.stage.removeChildren().forEach(c => c.destroy({ children: true })); this.I = null;
    try { this.I = makeInst(lv); } catch { this.I = null; }
    if (!this.I) { this.lv = 0; this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); if (this.img) this.img.style.visibility = ''; return false; }
    const I = this.I; this.sc = Math.min(this.w / I.W, this.h / I.H) * .97; this.lv = lv;
    I.c.scale.set(this.sc); I.c.position.set(this.w / 2, this.h - 2); I.glow.visible = false; this.stage.addChild(I.c);
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
    this.acc += dt;
    if (this.acc < this.step) return;
    const d = this.acc / 1000; this.acc = 0; if (!reduce()) this.t += d; this.draw(d);
  }
}
