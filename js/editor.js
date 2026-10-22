/* Skybloom module: editor (split from index.html in step 12; code unchanged) */
import { $, IMG, MOTION, NAMES } from './core.js?v=0.7.67';
import { BAKE, makeInst, tickParts, updateInst } from './renderer.js?v=0.7.67';

/* ======================================================================
   ?editor — motion map editor (dev only). Reuses makeInst/updateInst for a live preview.
   ====================================================================== */
const PART_DEFAULTS = { sway: { amp: 3, period: 3 }, bob: { amp: 3, period: 3.5 }, squish: { amp: .04, period: 2.4 }, flow: { speed: 60, alpha: .45 },
  glow: { alpha: .4, period: 3, hue: false }, sweep: { period: 5, alpha: .5, hue: false }, sparkle: {}, ripple: { rx: .3, period: 3.5 }, rise: {}, petals: {}, spin: { tex: 'sails', size: 1, speed: .7 } };
export function startEditor() {
  $('wrap').hidden = true; $('editor').hidden = false; document.body.style.overflow = 'auto';
  const eapp = new PIXI.Application({ view: $('ed-cv'), width: 720, height: 720, backgroundColor: 0xffffff, antialias: true });
  const checker = new PIXI.Graphics(); for (let y = 0; y < 720; y += 24) for (let x = 0; x < 720; x += 24) checker.beginFill((x + y) / 24 % 2 ? 0xe7eef6 : 0xf7fafd).drawRect(x, y, 24, 24).endFill();
  const over = new PIXI.Graphics(); eapp.stage.addChild(checker);
  let lv = 1, cur = 0, inst = null, clicks = 0;
  const map = () => (MOTION[lv] = MOTION[lv] || []);
  const fitScale = () => Math.min(620 / IMG['b' + lv].height, 640 / IMG['b' + lv].width);
  function rebuild() {
    if (inst) inst.c.destroy({ children: true }); delete BAKE[lv];
    inst = makeInst(lv); inst.c.scale.set(fitScale()); inst.c.position.set(360, 690); eapp.stage.addChild(inst.c, over);
    $('ed-parts').innerHTML = map().map((p, i) => `<label><input type="radio" name="ed-part" value="${i}" ${i === cur ? 'checked' : ''}> ${i + 1}. ${p.type}</label>`).join('') || '<p class="ed-note">No parts yet.</p>';
    const p = map()[cur];
    $('ed-params').innerHTML = p ? Object.keys(PART_DEFAULTS[p.type]).map(k => typeof PART_DEFAULTS[p.type][k] === 'boolean'
      ? `<label><input type="checkbox" data-k="${k}" ${p[k] ? 'checked' : ''}> ${k}</label>`
      : `<label>${k} <input data-k="${k}" value="${p[k] ?? PART_DEFAULTS[p.type][k]}" size="6"></label>`).join('') : '';
  }
  const toLocal = (px, py) => { const s = fitScale(), W = inst.W, H = inst.H; return [+(((px - 360) / s + W / 2) / W).toFixed(3), +(((py - 690) / s + H) / H).toFixed(3)]; };
  const toPx = ([nx, ny]) => { const s = fitScale(); return [360 + (nx * inst.W - inst.W / 2) * s, 690 + (ny * inst.H - inst.H) * s]; };
  eapp.ticker.add(() => {
    const dt = eapp.ticker.deltaMS / 1000; updateInst(inst, tickParts(dt), dt, fitScale(), false);
    over.clear(); if (!$('ed-over').checked) return;
    map().forEach((p, i) => {
      const col = i === cur ? 0xff3366 : 0x3388ff;
      if (p.poly && p.poly.length) { over.lineStyle(2, col, .9).beginFill(col, .08).drawPolygon(p.poly.flatMap(toPx)).endFill(); }
      for (const q of [p.pivot, p.pt, ...(p.pts || [])].filter(Boolean)) { const [x, y] = toPx(q); over.lineStyle(2, col).beginFill(0xffffff).drawCircle(x, y, 6).endFill(); }
      if (p.box) { const [a, b] = toPx([p.box[0], p.box[1]]), [c, d] = toPx([p.box[2], p.box[3]]); over.lineStyle(2, col, .9).drawRect(a, b, c - a, d - b); }
    });
  });
  $('ed-lv').innerHTML = NAMES.slice(1).map((n, i) => `<option value="${i + 1}">${i + 1} · ${n}</option>`).join('');
  $('ed-type').innerHTML = Object.keys(PART_DEFAULTS).map(t => `<option>${t}</option>`).join('');
  $('ed-lv').onchange = () => { lv = +$('ed-lv').value; cur = 0; rebuild(); };
  $('ed-parts').onchange = e => { cur = +e.target.value; rebuild(); };
  $('ed-add').onclick = () => { const t = $('ed-type').value, p = { type: t, ...PART_DEFAULTS[t] }; if (['sway', 'bob', 'squish', 'flow', 'glow', 'sweep'].includes(t)) p.poly = [];
    if (t === 'sparkle') p.pts = []; if (['ripple', 'rise', 'spin'].includes(t)) p.pt = [.5, .5]; if (t === 'petals') p.box = [.2, .1, .8, .6]; map().push(p); cur = map().length - 1; rebuild(); };
  $('ed-del').onclick = () => { map().splice(cur, 1); cur = Math.max(0, cur - 1); rebuild(); };
  $('ed-clear').onclick = () => { const p = map()[cur]; if (!p) return; if (p.poly) p.poly = []; if (p.pts) p.pts = []; rebuild(); };
  $('ed-params').oninput = e => { const p = map()[cur], k = e.target.dataset.k; if (!p || !k) return; p[k] = e.target.type === 'checkbox' ? e.target.checked : (k === 'tex' ? e.target.value : +e.target.value); rebuild(); };
  $('ed-cv').addEventListener('pointerdown', e => {
    const p = map()[cur]; if (!p) { $('ed-status').textContent = 'Add a part first.'; return; }
    const r = $('ed-cv').getBoundingClientRect(), q = toLocal((e.clientX - r.left) * 720 / r.width, (e.clientY - r.top) * 720 / r.height);
    const mode = document.querySelector('[name=ed-mode]:checked').value;
    if (p.type === 'sparkle') p.pts.push(q);
    else if (p.type === 'petals') { if (clicks++ % 2 === 0) { p.box[0] = q[0]; p.box[1] = q[1]; } else { p.box[2] = q[0]; p.box[3] = q[1]; } }
    else if (mode === 'poly' && p.poly) p.poly.push(q);
    else if (['ripple', 'rise', 'spin'].includes(p.type)) p.pt = q;
    else p.pivot = q;
    rebuild();
  });
  const exportJson = () => {
    const doc = Object.assign({}, window.__motionDoc || { version: 1 }, { buildings: MOTION });
    const body = Object.keys(MOTION).sort((a, b) => a - b).map(k => `    "${k}": [\n${MOTION[k].map(p => '      ' + JSON.stringify(p)).join(',\n')}\n    ]`).join(',\n');
    return JSON.stringify(Object.assign({}, doc, { buildings: '§' }), null, 2).replace('"§"', `{\n${body}\n  }`);
  };
  $('ed-export').onclick = () => { $('ed-json').value = exportJson(); $('ed-status').textContent = 'Paste into motion_map.json.'; };
  $('ed-copy').onclick = () => { $('ed-json').value = exportJson(); navigator.clipboard?.writeText($('ed-json').value).then(() => $('ed-status').textContent = 'Copied.', () => $('ed-status').textContent = 'Select the text and copy it.'); };
  rebuild();
}


