/* Skybloom module: age (checklist 2-5 / 2-6) — the neutral age-group screen and the "child mode" switch.
   Asked once, before anything else (before the play-test consent). Three groups, none preselected; no birth date is asked or stored.
   Only the group is kept, on this device: 'u13' (under 13), 't13' (13-17), 'a18' (18+). An older build stored '13p' (13+): still read as 13+.
   Until it is answered, and for 'u13', the game runs in child mode: no play-log recording, no survey, no tester consent
   (telemetry.js checks age13()); the ad step reads bracket() to ask for child-directed ads (u13) and under-age-of-consent ads (t13). Imports only core.js. */
import { $, store, tl } from './core.js?v=0.7.32';

const KEY = 'age', GATE_V = 'a2', GROUPS = ['u13', 't13', 'a18'];
let mem = null;   // this page's answer too, so a browser that refuses storage still keeps it until reload
if (location.search.includes('debug')) { const m = /[?&]age=(u13|t13|a18|13p)/.exec(location.search); if (m) mem = m[1]; }   // local QA only

export const bracket = () => { const v = mem ?? store.get(KEY, null)?.v; return v === '13p' ? 't13' : GROUPS.includes(v) ? v : null; };   // legacy '13p' is treated as the 13-17 group (the stricter 13+ one)
export const asked = () => bracket() != null;
export const age13 = () => { const b = bracket(); return b === 't13' || b === 'a18'; };   // 13 or older; unknown counts as under 13

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
