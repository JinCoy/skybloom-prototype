/* Skybloom module: age (checklist 2-5 / 2-6) — the neutral age-group screen and the "child mode" switch.
   Asked once, before anything else (before the play-test consent). Three groups, none preselected; no birth date is asked or stored.
   Only the group is kept, on this device: 'u14' (under 14), 'm14' (14-17), 'a18' (18+); the rules are in agegroup.js (one strictest rule for
   every country: Korea / Quebec 14, India 18). Older answers: 'u13' -> 'u14'; 't13' / '13p' may be 13, so they are asked once more.
   Until it is answered, and for 'u14', the game runs in child mode. Under 18 there is no play-log recording, survey or tester consent
   (telemetry.js and screens.js check adult()), and ads.js asks only for under-age-of-consent ads (child-directed too for children). */
import { $, store, tl } from './core.js?v=0.7.68';
import { GROUPS, isAdult, isChild, normalize } from './agegroup.js?v=0.7.68';

const KEY = 'age', GATE_V = 'a3';
let mem = null;   // this page's answer too, so a browser that refuses storage still keeps it until reload
if (location.search.includes('debug')) { const m = /[?&]age=(u14|m14|a18|u13|t13|13p)/.exec(location.search); if (m) mem = m[1]; }   // local QA only

export const bracket = () => normalize(mem ?? store.get(KEY, null)?.v);   // null: not answered (or an older 13-17 answer: asked again)
export const asked = () => bracket() != null;
export const child = () => isChild(bracket());   // under 14, or not answered yet
export const adult = () => isAdult(bracket());   // 18 or older: play log, survey, consent and tracking prompts

export function ask(done) {
  if (asked()) { done(); return; }
  const p = $('ag-panel'); if (!p) { done(); return; }
  p.innerHTML = `<h2 style="font-size:60px">${tl('age.title')}</h2><div class="cap" style="letter-spacing:.02em;font-size:30px;line-height:1.42;color:var(--navy);text-align:left;white-space:pre-line">${tl('age.body')}</div>
    <div style="display:flex;flex-direction:column;gap:14px;width:100%">${GROUPS.map(g => `<button class="gel ghost" data-g="${g}" aria-pressed="false" style="position:relative;width:100%;height:104px;font-size:42px">${tl('age.g.' + g)}</button>`).join('')}</div>
    <div id="ag-err" role="alert" style="font:800 30px/1.3 var(--font);color:#b3261e;min-height:40px"></div>
    <button class="gel aqua" id="ag-ok" style="position:relative;width:420px;height:120px;font-size:44px">${tl('age.ok')}</button>`;
  $('ov-age').hidden = false;
  let pick = null; const btns = [...p.querySelectorAll('[data-g]')];
  btns.forEach(b => { b.onclick = () => { pick = b.dataset.g; $('ag-err').textContent = ''; btns.forEach(x => { x.classList.toggle('aqua', x === b); x.classList.toggle('ghost', x !== b); x.setAttribute('aria-pressed', x === b); }); }; });
  $('ag-ok').onclick = () => {
    if (!pick) { $('ag-err').textContent = tl('age.err'); return; }
    mem = pick; store.set(KEY, { v: pick, g: GATE_V });
    $('ov-age').hidden = true; p.innerHTML = ''; done();
  };
}
