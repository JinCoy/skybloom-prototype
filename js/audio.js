/* Skybloom module: audio (split from index.html in step 12; code unchanged) */
import { U } from './core.js?v=0.7.52';

/* ---------- audio ---------- */
export let AC = null, musicNodes = null;
export function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); loadAudio(AC); } catch { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, d = .12, type = 'sine', g = .08, f2 = null, delay = 0) {
  if (!U.settings.sfx) return; const a = ac(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), gn = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(gn).connect(a.destination); o.start(t); o.stop(t + d + .02);
}
let NOISE = null;   // 2 s of white noise, shared by whooshes, pops and the water ambience
function noiseBuf(a) { if (!NOISE) { NOISE = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return NOISE; }
function noise(d, g, f0, f1, q = 1, delay = 0) {   // filtered noise burst: whoosh, splash, pop
  if (!U.settings.sfx) return; const a = ac(); if (!a) return;
  const t = a.currentTime + delay, src = a.createBufferSource(), bp = a.createBiquadFilter(), gn = a.createGain();
  src.buffer = noiseBuf(a); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + d);
  gn.gain.setValueAtTime(.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + d * .25); gn.gain.exponentialRampToValueAtTime(.0001, t + d);
  src.connect(bp).connect(gn).connect(a.destination); src.start(t, Math.random()); src.stop(t + d + .02);
}
const SYN = {   // synthesized fallbacks; a recorded file with the same key replaces each one (AUDIO_KEYS.md)
  whoosh: (delay = 0) => noise(.34, .07, 3200, 380, .9, delay),
  land: () => { tone(190, .14, 'sine', .09, 85); noise(.16, .05, 1900, 700, 1.4); },
  cloud: () => { noise(.5, .03, 600, 1400, .6); [1047, 1319, 1568].forEach((f, i) => tone(f, .3, 'sine', .03, null, .1 + i * .06)); },
  inflate: () => tone(260, .4, 'sine', .045, 820),
  select: () => tone(880, .06, 'sine', .04),
  merge: combo => { const base = 392 * 2 ** (Math.min(combo - 1, 24) / 12); tone(base, .22, 'sine', .08); tone(base * 1.5, .3, 'sine', .05, null, .06); },
  bad: () => tone(170, .14, 'square', .03, 140),
  pop: () => { noise(.09, .09, 2600, 1200, 1.6); tone(900, .08, 'sine', .06, 1700); tone(1300, .1, 'sine', .035, 600, .05); },
  bubble: () => { noise(.06, .07, 3400, 1800, 2); tone(1250, .05, 'sine', .05, 2500); },   // a light "pop!"
  rewind: () => { tone(900, .45, 'triangle', .05, 220); [1568, 1319, 1047, 880].forEach((f, i) => tone(f, .1, 'sine', .025, null, i * .08)); },
  shimmer: () => [784, 1175, 1568, 2093].forEach((f, i) => tone(f, .5, 'sine', .03, null, i * .05)),
  grand: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .55, 'triangle', .06, null, i * .1)); tone(131, 1.2, 'sine', .07); tone(196, 1.2, 'sine', .04, null, .1); },
  bloom: () => { SYN.grand(); [2093, 2637, 3136].forEach((f, i) => tone(f, .7, 'sine', .025, null, .55 + i * .08)); noise(1.2, .04, 800, 3000, .5, .3); },
  gift: () => [784, 988, 1175].forEach((f, i) => tone(f, .18, 'sine', .05, null, i * .07)),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .35, 'triangle', .06, null, i * .09))
};
/* Recorded sounds: list the keys you provide in assets/audio/manifest.json (e.g. ["merge","bubble","music_loop"]),
   and put assets/audio/<key>.mp3 next to it. Missing keys keep the synthesized sound. */
export const SND = {};
let audioLoaded = false;
function loadAudio(a) {
  if (audioLoaded) return; audioLoaded = true;
  fetch('assets/audio/manifest.json').then(r => r.ok ? r.json() : []).then(keys => keys.forEach(k =>
    fetch(`assets/audio/${k}.mp3`).then(r => r.arrayBuffer()).then(b => a.decodeAudioData(b)).then(buf => { SND[k] = buf; if (k === 'music_loop' || k === 'ambience_water') { if (musicNodes) { music(false); setTimeout(() => U.settings.music && music(true), 800); } } }).catch(() => {}))).catch(() => {});
}
function sample(key, rate = 1, delay = 0, gain = .9) {   // true when a recorded file handled the sound
  const buf = SND[key]; if (!buf) return false; if (!U.settings.sfx) return true;
  const a = ac(); if (!a) return true; const src = a.createBufferSource(), g = a.createGain();
  src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain; src.connect(g).connect(a.destination); src.start(a.currentTime + delay); return true;
}
export const SFX = Object.fromEntries(Object.keys(SYN).map(k => [k, (...a) =>
  sample(k, k === 'merge' ? 2 ** (Math.min((a[0] || 1) - 1, 24) / 12) : 1, k === 'whoosh' ? a[0] || 0 : 0) || SYN[k](...a)]));   // merge rises a semitone per combo
export function vib(ms) {
  if (!U.settings.vib || !navigator.vibrate || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return;
  try { navigator.vibrate(ms); } catch {}
}
export function music(on) {
  const a = ac(); if (!a) return;
  if (on && !musicNodes) {
    const g = a.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(.025, a.currentTime + 2); g.connect(a.destination);
    const loop = (k, vol) => { const src = a.createBufferSource(), lg = a.createGain(); src.buffer = SND[k]; src.loop = true; lg.gain.value = vol; src.connect(lg).connect(a.destination); src.start(); return [src]; };
    if (SND.music_loop || SND.ambience_water) {   // recorded music / ambience replace the synthesized ones
      const os = [SND.music_loop && loop('music_loop', .5), SND.ambience_water && loop('ambience_water', .4)].filter(Boolean);
      musicNodes = { g, os }; return;
    }
    const os = [261.6, 329.6, 392, 493.9].map((f, i) => { const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = .07 + i * .03; lg.gain.value = 2; lfo.connect(lg).connect(o.frequency); lfo.start();
      o.connect(g); o.start(); return [o, lfo]; });
    // flowing-water ambience (spec §6.2: part of "Music"): looped noise through two slowly wobbling band filters
    const water = [[700, .7, .16], [2300, 1.4, .37]].map(([f, q, rate]) => {
      const src = a.createBufferSource(), bp = a.createBiquadFilter(), wg = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
      src.buffer = noiseBuf(a); src.loop = true; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; wg.gain.value = f < 1000 ? .5 : .22;
      lfo.frequency.value = rate; lg.gain.value = f * .25; lfo.connect(lg).connect(bp.frequency); lfo.start();
      src.connect(bp).connect(wg).connect(g); src.start(); return [src, lfo];
    });
    musicNodes = { g, os: [...os, ...water] };
  } else if (!on && musicNodes) { const m = musicNodes; musicNodes = null; m.g.gain.linearRampToValueAtTime(0, a.currentTime + .6); setTimeout(() => m.os.forEach(p => p.forEach(o => o.stop())), 700); }
}


