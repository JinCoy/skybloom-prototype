/* Skybloom module: ui (split from index.html in step 12; code unchanged) */
import { $, G, ITEMS, L, U, artSrc, reduce, tl } from './core.js?v=0.7.43';
import { Mini } from './minianim.js?v=0.7.43';
import { bestNow, busy, tutStep } from './game.js?v=0.7.43';
import { rollFor, setIcon } from './bubbles.js?v=0.7.43';

/* ---------- layout fit ---------- */
export let scale = 1;
export function fit() {
  const w = $('wrap').clientWidth, h = $('wrap').clientHeight;
  scale = Math.min(w / 1080, h / 1920);
  $('stage').style.transform = `translate(-50%, -50%) scale(${scale})`;
}
addEventListener('resize', fit);

/* ---------- HUD ---------- */
$('items').innerHTML = ITEMS.map(([k, label, src], i) => {
  const x = 300 + i * 240;
  return `<button class="gel aqua item" data-item="${k}" aria-label="${label}" data-i18n-aria="item.${k}" style="left:${x - 72}px;top:1328px"><img src="${src}" alt=""><span class="badge" id="cnt-${k}">0</span></button>
          <div class="abs lbl itemlbl" style="left:${x - 110}px;top:1488px;font-size:28px" data-i18n="item.${k}">${label}</div>`;
}).join('');
export const itemXY = k => [300 + ITEMS.findIndex(i => i[0] === k) * 240, 1400];

export function fitText(el, max = 54, min = 28) {   // shrink digits until they fit their box
  let size = max; el.style.fontSize = size + 'px';
  while (el.scrollWidth > el.parentElement.clientWidth - 16 && size > min) { size -= 2; el.style.fontSize = size + 'px'; }
}
export function show(screen) {
  U.screen = screen;
  for (const s of ['login', 'main', 'game']) $('scr-' + s).hidden = s !== screen;
  if (screen !== 'game' && U.tut) tutStep(0);
  if (screen !== 'game') for (const b of U.bubbles) { b.content = { kind: 'empty' }; b.content = rollFor(); setIcon(b); }   // no items or treasures outside a game
  $('main-best').textContent = U.best.toLocaleString('en-US'); fitText($('main-best'), 54);
  $('main-speed-best').hidden = !U.bestSpeed; $('main-speed-best').textContent = tl('speed.best', { n: U.bestSpeed.toLocaleString('en-US') });
}
export function overlay(name, on = true) {   // 10-2 E: switching tabs re-opens the same overlay: no second fade-in
  const el = $('ov-' + name), wasOpen = !el.hidden; el.hidden = !on; if (name === 'settings') $('set-home').hidden = U.screen !== 'game';
  if (on && !wasOpen) { el.classList.remove('ov-in', 'ov-in-r'); void el.offsetWidth; el.classList.add(reduce() ? 'ov-in-r' : 'ov-in'); }
}
/* screen transitions (v0.4 §6.2): short, gentle, and a tap skips straight to the end */
const TRANS = {
  cloud: [450, [{ transform: 'translateY(2400px)' }, { transform: 'translateY(0)', offset: .5 }, { transform: 'translateY(-2400px)' }]],
  pass: [400, [{ transform: 'translateX(1480px)' }, { transform: 'translateX(0)', offset: .5 }, { transform: 'translateX(-1480px)' }]],
  bubble: [400, [{ transform: 'scale(.06)', opacity: 1 }, { transform: 'scale(5)', opacity: 1, offset: .5 }, { transform: 'scale(5.6)', opacity: 0 }]],
  fade: [150, [{ opacity: 0 }, { opacity: 1, offset: .5 }, { opacity: 0 }]],
};
let endTrans = null;
export function transition(kind, swap, at = null) {
  if (endTrans) endTrans();
  const k = reduce() ? 'fade' : kind, [dur, frames] = TRANS[k], el = $('trans');
  el.className = k; el.hidden = false;
  if (k === 'bubble') { const [x, y] = at || [540, 1000]; el.style.left = x - 400 + 'px'; el.style.top = y - 400 + 'px'; } else el.style.left = el.style.top = '';
  let swapped = false; const doSwap = () => { if (!swapped) { swapped = true; swap(); } };
  const anim = el.animate ? el.animate(frames, { duration: dur, easing: 'ease-in-out' }) : null, mid = setTimeout(doSwap, dur / 2);
  const end = () => { clearTimeout(mid); doSwap(); anim?.cancel(); el.hidden = true; el.onpointerdown = null; endTrans = null; };
  if (anim) anim.onfinish = end; else setTimeout(end, dur);
  el.onpointerdown = end; endTrans = end;
}
export function sheet(title, text) { $('sheet-title').textContent = title; $('sheet-text').textContent = text; overlay('sheet'); }
let toastT = 0;
export function toast(msg, ms = 1900, img = null) {
  if (U.tut && U.screen === 'game') return;   // 10-2 F1: the guide box sits where toasts go
  const t = $('toast'); t.textContent = '';
  if (img) { const i = new Image(); i.src = img; i.alt = ''; t.append(i); }
  const s = document.createElement('span'); s.textContent = msg; t.append(s);
  t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, ms);
}
export function bumpBadge(k) { const b = $('cnt-' + k); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }

let nextMini = null;
/** "Place" is grey while the guided tutorial steps do not need it and while the board is full. */
export function placeState() { $('place').classList.toggle('dis', U.tut === 2 || U.tut === 3 || !L.empties(G.board).length); }
/** After "Use an Item" in the stuck window: the usable items blink three times. */
export function blinkItems() {
  for (const b of document.querySelectorAll('#items .item:not(.dis)')) { b.classList.remove('blink'); void b.offsetWidth; b.classList.add('blink'); b.addEventListener('animationend', () => b.classList.remove('blink'), { once: true }); }
}
export function hud() {
  $('score').textContent = G.score.toLocaleString('en-US'); fitText($('score'));
  $('gold').textContent = U.gold.toLocaleString('en-US');
  const ad = L.canAdRefill(G) && !busy(); $('ad-refill').hidden = !ad;   // rewarded-ad refill (v0.4 §4.3)
  if (ad) $('ad-left').textContent = tl('ad.left', { n: L.CONFIG.ads.maxPerGame - G.adsUsed });
  $('best').textContent = Math.max(bestNow(), G.score).toLocaleString('en-US'); fitText($('best'));
  $('next-img').src = artSrc(G.next); $('next-lv').textContent = G.next; (nextMini || (nextMini = new Mini($('next-anim'), 130, 96, 24))).show(G.next);   // NEXT moves (24 fps)
  for (const [k] of ITEMS) {
    $('cnt-' + k).textContent = G.items[k];
    const usable = G.items[k] > 0 && (k !== 'rewind' || G.history.length > 0) && (k !== 'drop' || L.empties(G.board).length > 0), btn = document.querySelector(`[data-item="${k}"]`);
    btn.classList.toggle('dis', !usable);
    btn.classList.toggle('live', U.target === k || U.liveItem === k); btn.classList.toggle('still', reduce());   // the item being used wears the rainbow ring: Bubble Pop / Cloud Drop while picking, Rewind while it runs
  }
  placeState();
  const b = $('banner');
  if (U.target) {
    b.hidden = false;
    b.innerHTML = tl(U.target === 'pop' ? 'banner.pop' : 'banner.drop') + ` <button class="gel ghost" id="cancel-target">${tl('banner.cancel')}</button>`;
    $('cancel-target').onclick = () => { U.target = null; hud(); };
  } else b.hidden = true;
}


