/* Skybloom module: drawfx (split from index.html in step 12; code unchanged) */
import { CX, CY, U, reduce } from './core.js?v=0.7.12';
import { SFX } from './audio.js?v=0.7.12';
import { freeParts, parts } from './fx.js?v=0.7.12';
import { ADD, R, ease, genTextures } from './renderer.js?v=0.7.12';

/* ---------- effects drawing ---------- */
const ring = (g, x, y, R0, w, col, a) => { if (a > .01 && R0 > 1) g.lineStyle(w, col, a).drawEllipse(x, y, R0, R0 * .5); };
const pillarSpr = (f, key = 'pillar') => f[key] || (f[key] = (() => { const p = new PIXI.Sprite(genTextures().pillar); p.blendMode = ADD(); R.fxTop.addChildAt(p, 0); f.spr.push(p); return p; })());
const FXDRAW = {
  merge(f, t, g) {   // grade 0: droplet ring · 1: two light rings, petals, short pillar · 2: three rings, big pillar, spray · 3: + light rising to the sky
    const T = f.tier, col = [0xa0ebff, 0xfff4fb, 0xffe678, 0xffe678][T];
    for (let i = 0; i < [1, 2, 3, 3][T]; i++) { const tt = Math.max(0, t - i * .12); ring(g, f.x, f.y, (110 + T * 70) * ease(tt), 8 + T * 2, col, .9 * (1 - tt)); }
    if (T >= 1) { const p = pillarSpr(f), h = [0, 300, 640, 1100][T], w = [0, 70, 100, 130][T]; p.position.set(f.x - w / 2, f.y - h); p.width = w; p.height = h; p.alpha = (1 - t) * .65; }
    if (T === 3) {   // a ball of light climbs out of the top of the screen
      if (!f.orb) { f.orb = new PIXI.Sprite(genTextures().glow); f.orb.anchor.set(.5); f.orb.blendMode = ADD(); f.orb.tint = 0xfff2b0; R.fxTop.addChild(f.orb); f.spr.push(f.orb); }
      const e = ease(Math.min(1, t * 1.4)); f.orb.position.set(f.x, f.y - 80 - e * (f.y + 120)); f.orb.width = f.orb.height = 200 * (1 - t * .4); f.orb.alpha = 1 - t * .6;
    }
  },
  bloom(f, t, g) {   // eight petals of light open outward, gold rings, a column to the sky
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + t * 1.3, d = 40 + 300 * ease(t), r = 70 * (1 - t) + 18;
      g.lineStyle(0).beginFill(k % 2 ? 0xffe3f2 : 0xfff6c8, .85 * (1 - t)).drawEllipse(f.x + Math.cos(a) * d, f.y - 60 + Math.sin(a) * d * .5, r, r * .55).endFill(); }
    for (let i = 0; i < 3; i++) { const tt = Math.max(0, t - i * .15); ring(g, f.x, f.y, 480 * ease(tt), 16 - i * 4, 0xffe678, 1 - tt); }
    const p = pillarSpr(f); p.position.set(f.x - 80, -50); p.width = 160; p.height = f.y + 50; p.alpha = Math.sin(Math.min(1, t * 1.3) * Math.PI) * .8;
  },
  rewind(f, t, g) {   // a clock face spins backwards around the board; the removed buildings fade back as afterimages
    const a = 1 - t, R0 = 470 * (1 - .12 * t);
    ring(g, CX, CY, R0 + 4, 16, 0xffffff, .7 * a); ring(g, CX, CY, R0, 10, 0x2f9fe8, .9 * a); ring(g, CX, CY, R0 - 26, 3, 0x2c74c4, .6 * a);
    for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6, c = Math.cos(an), s2 = Math.sin(an);
      g.lineStyle(k % 3 ? 4 : 8, 0x2c74c4, .85 * a).moveTo(CX + c * (R0 - 50), CY + s2 * (R0 - 50) * .5).lineTo(CX + c * (R0 - 20), CY + s2 * (R0 - 20) * .5); }
    const hand = (len, an, w) => g.lineStyle(w, 0x2c74c4, .9 * a).moveTo(CX, CY).lineTo(CX + Math.cos(an) * len, CY + Math.sin(an) * len * .5);
    hand(R0 * .78, -Math.PI / 2 - t * Math.PI * 4, 8); hand(R0 * .5, -Math.PI / 2 - t * Math.PI / 1.5, 12);
    const pts = []; for (let i = 0; i <= 48; i++) { const an = -Math.PI / 2 - Math.PI * 2 * ease(t) * i / 48, r = 560 * (1 - .35 * t); pts.push(CX + Math.cos(an) * r, CY + Math.sin(an) * r * .5); }
    g.lineStyle(18, 0x38b6ff, .75 * a).moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    for (const s2 of f.spr) { const sw = t * 1.6; s2.alpha = .6 * a; s2.position.set(s2.home[0] + Math.sin(sw * 4) * 18 * t, s2.home[1] - 40 * ease(t)); }
  },
  splash(f, t, g) { ring(g, f.x, f.y, 120 * ease(t), 7, 0xc8f2ff, 1 - t); ring(g, f.x, f.y, 70 * ease(Math.max(0, t - .15)), 4, 0xffffff, .8 * (1 - t)); },
  bubble(f, t, g) { ring(g, f.x, f.y, 90 * ease(t), 8, 0xa0ebff, 1 - t); },
  burst(f, t, g) { ring(g, f.x, f.y, 360 * ease(t), 16, 0xffe678, 1 - t); },
  clouddrop(f, t, g) {   // puffs drift together above the tile, a light column joins cloud and tile, then the cloud thins
    const gather = ease(Math.min(1, t / .45)), fade = t > .7 ? 1 - (t - .7) / .3 : 1;
    f.spr.forEach(p => { if (!p.from) return; p.position.set(p.from[0] + (p.to[0] - p.from[0]) * gather, p.from[1] + (p.to[1] - p.from[1]) * gather); p.alpha = .95 * fade * Math.min(1, t * 4); });
    const on = t > .3 ? Math.sin(Math.min(1, (t - .3) / .7) * Math.PI) : 0; f.col.position.set(f.x - 45, f.y - 330); f.col.width = 90; f.col.height = 330; f.col.alpha = .75 * on;
    ring(g, f.x, f.y, 100, 6, 0x9fe8ff, .7 * on);
  },
  wrap(f, t, g) {   // the bubble swells around the building (0-55%), then pops and both vanish
    const [gh, b] = f.spr.length > 1 ? f.spr : [null, f.spr[0]];
    if (t < .55) {
      const q = t / .55, wob = Math.sin(q * 18) * .04 * q, size = f.size * (.75 + .5 * ease(q));
      b.width = size * (1 + wob); b.height = size * (1 - wob); b.position.set(f.x, f.y - 20 * q);
      if (gh) { gh.position.set(gh.home[0], gh.home[1] - 40 * q); gh.alpha = 1 - q * .3; }
    } else {
      if (!f.popped) { f.popped = true; b.visible = false; if (gh) gh.visible = false; parts(f, 22, 'drop', { r: 13, speed: 6 }); parts(f, 12, 'spark', { r: 6, speed: 7 }); SFX.pop(); }
      const q = (t - .55) / .45; ring(g, f.x, f.y + 60, f.size * .9 * ease(q), 8, 0xffaae6, 1 - q);
    }
  },
};
export function updateFx(dt, now) {
  const g = R.fxG, f60 = dt * 60; g.clear();
  U.fx = U.fx.filter(f => { if (now - f.t0 < f.life) return true; freeParts(f.parts.length); f.spr.forEach(s2 => s2.destroy()); return false; });
  for (const f of U.fx) {
    const t = (now - f.t0) / f.life;
    FXDRAW[f.type]?.(f, t, g);
    for (const p of f.parts) {
      p.x += p.vx * f60; p.y += p.vy * f60; p.vy += p.g * f60; const a = 1 - t;
      if (p.kind === 'drop') g.lineStyle(3, 0xffffff, .95 * a).beginFill(0xaae6ff, .25 * a).drawCircle(p.x, p.y, p.r).endFill();
      else if (p.kind === 'petal') { p.spin += .08 * f60; p.vx *= .99; g.lineStyle(0).beginFill(0xffc6de, .9 * a).drawEllipse(p.x + Math.sin(p.spin) * 6, p.y, p.r * (.6 + .4 * Math.abs(Math.cos(p.spin))), p.r * .55).endFill(); }
      else if (p.kind === 'spray') g.lineStyle(0).beginFill(0xd8f6ff, .9 * a).drawCircle(p.x, p.y, p.r * .6).endFill();
      else g.lineStyle(0).beginFill(f.tier >= 2 || f.type === 'bloom' || f.type === 'burst' ? 0xfff3a0 : 0xffffff, a).drawCircle(p.x, p.y, p.r * .5).endFill();
    }
  }
  // screen-level light: warm edge glow (Lv10+) and a short white flash (Lv15+, never under Reduce Motion)
  const eT = U.edge ? (now - U.edge) / 900 : 9, fT = U.flash ? (now - U.flash) / 280 : 9;
  R.edge.alpha = eT < 1 ? .75 * Math.sin(Math.min(1, eT * 3) * Math.PI / 2) * (1 - eT) : 0; R.edge.visible = R.edge.alpha > 0;
  R.flash.alpha = !reduce() && fT < 1 ? .55 * (1 - fT) : 0; R.flash.visible = R.flash.alpha > 0;
  U.floats = U.floats.filter(f => {
    const t = (now - f.t0) / 950; if (t >= 1) { f.t.destroy(); return false; }
    const k = t < .15 ? .7 + 2 * t : 1; f.t.position.set(f.x, f.y - 70 * ease(t)); f.t.scale.set(k); f.t.alpha = t > .7 ? (1 - t) / .3 : 1; return true;
  });
  U.flies = U.flies.filter(f => {
    const t = Math.min(1, (now - f.t0) / 650), e = ease(t);
    f.s.position.set(f.from[0] + (f.to[0] - f.from[0]) * e, f.from[1] + (f.to[1] - f.from[1]) * e - Math.sin(e * Math.PI) * 140);
    if (t < 1) return true;
    f.s.destroy(); f.done?.(); SFX.gift(); return false;
  });
}


