/* Skybloom module: minianim. A building with its motion (the same makeInst / updateInst the garden uses) drawn in a small canvas of its own:
   result screen, "New Building!", collection detail, the NEXT preview. One renderer per place; one shared loop that runs only while a canvas is on screen.
   If a WebGL renderer cannot be made, the plain picture stays (the <img> the host already holds). */
import { $, reduce } from './core.js?v=0.7.37';
import { makeInst, updateInst } from './renderer.js?v=0.7.37';

const MINIS = new Set(); let raf = 0, last = 0;
function loop(now) {
  raf = 0; let any = false; const dt = last ? Math.min(100, now - last) : 16; last = now;
  for (const m of MINIS) if (m.live()) { any = true; m.frame(dt); }
  if (any) raf = requestAnimationFrame(loop); else last = 0;
}
const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } };

export class Mini {
  /** host: element holding the fallback <img> (and, once it works, the canvas); w, h: canvas size in stage px; fps: frame cap. */
  constructor(host, w, h, fps = 30) {
    this.host = host; this.w = w; this.h = h; this.step = 1000 / fps; this.t = 0; this.acc = 0; this.I = null; this.lv = 0; this.ok = false;
    this.img = host.querySelector('img');
    try {
      const k = $('stage').getBoundingClientRect().width / 1080 || 1;
      this.r = new PIXI.Renderer({ width: w, height: h, backgroundAlpha: 0, antialias: true, resolution: Math.min(3, (window.devicePixelRatio || 1) * k), autoDensity: true });
      this.stage = new PIXI.Container(); this.r.view.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      host.style.position = host.style.position || 'relative'; host.appendChild(this.r.view); this.ok = true; MINIS.add(this);
      this.r.view.addEventListener('webglcontextlost', () => { this.ok = false; if (this.img) this.img.style.visibility = ''; this.r.view.style.display = 'none'; });
    } catch { this.ok = false; }
  }
  live() { return this.ok && this.I && this.host.offsetParent !== null; }
  /** Show building level lv (the picture of the equipped set); returns false when only the plain picture can be used. */
  show(lv) {
    if (!this.ok) return false;
    if (lv === this.lv && this.I) { wake(); return true; }
    this.stage.removeChildren().forEach(c => c.destroy({ children: true })); this.I = null;
    try { this.I = makeInst(lv); } catch { this.I = null; }
    if (!this.I) { if (this.img) this.img.style.visibility = ''; return false; }
    const I = this.I; this.sc = Math.min(this.w / I.W, this.h / I.H) * .97; this.lv = lv;
    I.c.scale.set(this.sc); I.c.position.set(this.w / 2, this.h - 2); I.glow.visible = false; this.stage.addChild(I.c);
    if (this.img) this.img.style.visibility = 'hidden';   // keeps the box size, the canvas draws over it
    this.draw(0); wake(); return true;
  }
  hide() { if (!this.ok) return; this.stage.removeChildren(); this.I = null; this.lv = 0; this.r.clear(); if (this.img) this.img.style.visibility = ''; }   // a picture that is not a building (a treasure): the plain <img> shows
  draw(dt) { updateInst(this.I, this.t, dt, this.sc, reduce()); this.r.render(this.stage); }
  frame(dt) {
    this.acc += dt;
    if (this.acc < this.step) return;
    const d = this.acc / 1000; this.acc = 0; if (!reduce()) this.t += d; this.draw(d);
  }
}
