/* Skybloom module: age (checklist 2-5 / 2-6) — the neutral age screen and the "child mode" switch.
   Asked once, before anything else (before the play-test consent). Month + year of birth, nothing preselected, any year allowed.
   Only the bracket is kept ('u13' or '13p', on this device); the birth date is never stored or sent.
   Until it is answered, and for 'u13', the game runs in child mode: no play-log recording, no survey, no tester consent
   (telemetry.js checks adult()); the ad step reads adult() too, to ask for child-directed ads. Imports only core.js. */
import { $, store, tl } from './core.js?v=0.7.18';

const KEY = 'age', GATE_V = 'a1';
let mem = null;   // this page's answer too, so a browser that refuses storage still keeps it until reload
if (location.search.includes('debug')) { const m = /[?&]age=(u13|13p)/.exec(location.search); if (m) mem = m[1]; }   // local QA only

export const bracket = () => { const v = mem ?? store.get(KEY, null)?.v; return v === 'u13' || v === '13p' ? v : null; };
export const asked = () => bracket() != null;
export const adult = () => bracket() === '13p';   // unknown counts as not adult

export function ask(done) {
  if (asked()) { done(); return; }
  const p = $('ag-panel'); if (!p) { done(); return; }
  const now = new Date(), y0 = now.getFullYear(), sel = 'width:100%;height:96px;font:800 40px var(--font);border-radius:24px;border:4px solid var(--rim);padding:0 14px;box-sizing:border-box;background:#fff;color:var(--navy)';
  const years = Array.from({ length: 101 }, (_, i) => y0 - i), months = Array.from({ length: 12 }, (_, i) => i + 1);
  const field = (id, label, list) => `<label for="${id}" style="flex:1;text-align:left;font:800 30px/1.2 var(--font);color:var(--navy)">${label}<select id="${id}" style="${sel};margin-top:8px"><option value="" selected>—</option>${list.map(n => `<option value="${n}">${n}</option>`).join('')}</select></label>`;
  p.innerHTML = `<h2 style="font-size:60px">${tl('age.title')}</h2><div class="cap" style="letter-spacing:.02em;font-size:30px;line-height:1.42;color:var(--navy);text-align:left;white-space:pre-line">${tl('age.body')}</div>
    <div style="display:flex;gap:20px;width:100%">${field('ag-m', tl('age.month'), months)}${field('ag-y', tl('age.year'), years)}</div>
    <div id="ag-err" role="alert" style="font:800 30px/1.3 var(--font);color:#b3261e;min-height:40px"></div>
    <button class="gel aqua" id="ag-ok" style="position:relative;width:420px;height:120px;font-size:44px">${tl('age.ok')}</button>`;
  $('ov-age').hidden = false;
  $('ag-ok').onclick = () => {
    const m = +$('ag-m').value, y = +$('ag-y').value, months13 = (y0 * 12 + now.getMonth() + 1) - (y * 12 + m);
    if (!m || !y || months13 < 0) { $('ag-err').textContent = tl('age.err'); return; }
    const v = months13 <= 156 ? 'u13' : '13p';   // 156 months = 13 years: the birthday month itself still counts as under 13 (month + year cannot tell the day)
    mem = v; store.set(KEY, { v, g: GATE_V });
    $('ov-age').hidden = true; p.innerHTML = ''; done();
  };
}
