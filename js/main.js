/* Skybloom module: main (split from index.html in step 12; code unchanged) */
import { EDITOR, G, L, SHOW, U, applyI18n, loading, prepareImages, reduce, set_G, toScreen, toWorld } from './core.js?v=0.7.57';
import { SND } from './audio.js?v=0.7.57';
import { fit, hud, show, toast, transition } from './ui.js?v=0.7.57';
import { addGold, busy, openAd } from './game.js?v=0.7.57';
import { MAX_PARTS, addFxXY, partCount } from './fx.js?v=0.7.57';
import { R, WTL, app, initRenderer } from './renderer.js?v=0.7.57';
import { bubbleAt, inIsland, popBubbleAt, spawnBubble } from './bubbles.js?v=0.7.57';
import { badgePos, candidates, enableSensor } from './input.js?v=0.7.57';
import { applySkins } from './shop.js?v=0.7.57';
import { cardFile } from './screens.js?v=0.7.57';
import { startEditor } from './editor.js?v=0.7.57';
import { bind, boot, loaded } from './telemetry.js?v=0.7.57';
import { ask } from './age.js?v=0.7.57';

bind({ busy, candidates, bubbleAt, inIsland });   // the play-log recorder (telemetry.js) reads these but never changes them

// local QA only: ?debug exposes state, a merge log and a frame-time probe (query strings never reach the shared page)
if (location.search.includes('debug')) {
  window.__sky = { get G() { return G; }, get app() { return app; }, get R() { return R; }, hud, toScreen, toWorld, badgePos, WTL, openAd, addGold, transition, get cardFile() { return cardFile; }, get sounds() { return Object.keys(SND); }, U, log: [], candidates, spawnBubble, popBubbleAt, inIsland, SHOW,
    /** Show a stage region full-window (for screenshots); call again with no args to close. */
    peek(x, y, w, h) {
      document.getElementById('peek')?.remove(); if (x == null) return;
      const c = app.renderer.extract.canvas(app.stage, new PIXI.Rectangle(x, y, w, h)), i = new Image(); i.id = 'peek'; i.src = c.toDataURL();
      i.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#222;z-index:99'; document.body.append(i);
    },
    /** Hold 5 bubbles and a full particle budget for `sec` seconds and report frame times. */
    perf(sec = 4) {
      U.perf = true; const fr = []; let last = performance.now(); const end = last + sec * 1000;
      return new Promise(res => { const loop = t => {
        fr.push(t - last); last = t;
        if (partCount < MAX_PARTS - 40) addFxXY('burst', 200 + Math.random() * 680, 600 + Math.random() * 700, 3);
        if (t < end) requestAnimationFrame(loop);
        else { U.perf = false; fr.shift(); fr.sort((a, b) => a - b); const avg = fr.reduce((a, b) => a + b, 0) / fr.length;
          res({ frames: fr.length, avgFps: +(1000 / avg).toFixed(1), p95ms: +fr[Math.floor(fr.length * .95)].toFixed(1), worstMs: +fr[fr.length - 1].toFixed(1), bubbles: U.bubbles.length, particles: partCount }); } };
        requestAnimationFrame(loop); });
    } };
  const m = L.merge; L.merge = (...a) => { const e = m(...a); window.__sky.log.push(e); return e; };
}

/* ---------- boot (keeps a running game across live page updates) ---------- */
window.claude?.hot?.snapshot?.(() => ({ screen: U.screen, G, phaseTop: U.phaseTop }));
function start(data) {
  fit();
  if (!window.PIXI) { toast('The graphics library could not load. Check your connection and reload.', 60000); return; }
  Promise.all(loading).then(() => document.fonts && document.fonts.ready).then(() => {
    loaded(performance.now()); prepareImages(); applyI18n();
    if (EDITOR) { startEditor(); return; }
    initRenderer(); applySkins();
    if (U.settings.tilt && !reduce() && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') enableSensor();
    if (data && data.G && data.G.board) { set_G(data.G); U.phaseTop = data.phaseTop || 0; show(data.screen || 'game'); }
    else show('login');
    hud(); ask(boot);   // first the neutral age screen; recording starts only for 13+ who have agreed (a first-time tester is asked after it)
  });
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});

