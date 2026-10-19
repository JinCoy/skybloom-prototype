/* Skybloom module: screens (split from index.html in step 12; code unchanged) */
import { $, APP_V, VER, G, IMG, L, NAMES, NAMES_BASE, NAMES_BY, SET_PRE, TREASURES, U, accSrc, applyI18n, artSrc, bkey, hasBuilt, lang, loadSkinArt, store, tl, trName } from './core.js?v=0.7.53';
import { SKINS, setArt } from './shop.js?v=0.7.53';
import { Mini } from './minianim.js?v=0.7.53';
import { music } from './audio.js?v=0.7.53';
import { fitText, hud, overlay, show, toast, transition } from './ui.js?v=0.7.53';
import { localDate, newGame, tutStep } from './game.js?v=0.7.53';
import { app } from './renderer.js?v=0.7.53';
import { enableSensor, sensorOn } from './input.js?v=0.7.53';
import * as TM from './telemetry.js?v=0.7.53';
import { age13 } from './age.js?v=0.7.53';

/* ---------- ranking (v0.4 §6.3): no server yet, so only this device's best and an honest empty state ---------- */
export const colScore = () => Object.values(U.discBy).reduce((n, s) => n + s.size, 0) + Object.keys(U.treasures).length;   // collection rank score: buildings found in every set + treasures
export function openRanking(tab = 'normal') {   // two boards: Normal and Collection (Speed is parked; its board was here)
  $('rk-normal').setAttribute('aria-selected', tab === 'normal'); $('rk-col').setAttribute('aria-selected', tab === 'col');
  const u = SkyAuth.currentUser(); $('rk-who').textContent = u ? (u.provider === 'guest' ? tl('rank.guest') : u.provider) : tl('rank.guest');
  $('rk-best').textContent = (tab === 'col' ? colScore() : U.best).toLocaleString('en-US');
  $('rk-note').textContent = tab === 'col' ? tl('rank.colNote', { n: SKINS.building.length * 17 + TREASURES.length }) : tl('rank.note');
  overlay('ranking'); fitText($('rk-best'), 54);   // after the window is shown: before that its width is 0 and the digits shrank to the minimum
}
$('rk-normal').onclick = () => openRanking('normal'); $('rk-col').onclick = () => openRanking('col');

/* ---------- result card (v0.4 §6.4): 1080x1350 image made when the result opens, so sharing starts straight from the tap ---------- */
export let cardFile = null;
function rrect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
export function buildCard() {
  cardFile = null; if (!app) return;
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const shot = app.renderer.extract.canvas(app.stage, new PIXI.Rectangle(0, 300, 1080, 1100));   // sky + island + final garden
  x.drawImage(shot, 0, 0, 1080, 1100);
  const g = x.createLinearGradient(0, 1000, 0, H); g.addColorStop(0, 'rgba(191,232,255,0)'); g.addColorStop(.3, '#cdebff'); g.addColorStop(1, '#a9dcff'); x.fillStyle = g; x.fillRect(0, 1000, W, H - 1000);
  if (IMG.logo) { const lw = 420, lh = IMG.logo.height * lw / IMG.logo.width; x.drawImage(IMG.logo, (W - lw) / 2, 20, lw, lh); }
  x.fillStyle = 'rgba(255,255,255,.82)'; rrect(x, 40, 1010, 1000, 300, 44); x.fill(); x.lineWidth = 6; x.strokeStyle = '#fff'; x.stroke();
  const top = IMG[bkey(G.top)]; if (top) { const s2 = Math.min(220 / top.width, 230 / top.height); x.drawImage(top, 70 + (220 - top.width * s2) / 2, 1045 + (230 - top.height * s2), top.width * s2, top.height * s2); }
  x.textAlign = 'left'; x.fillStyle = '#2c74c4'; x.font = '800 34px Nunito, Jua, system-ui, sans-serif'; x.fillText(tl('card.score'), 330, 1075);
  x.fillStyle = '#12326e'; x.font = '900 96px Nunito, Jua, system-ui, sans-serif'; x.fillText(G.score.toLocaleString('en-US'), 326, 1170);
  x.font = '900 44px Nunito, Jua, system-ui, sans-serif'; x.fillText(`${NAMES[G.top]} · Lv ${G.top}`, 330, 1235);
  x.fillStyle = '#2c74c4'; x.font = '800 28px Nunito, Jua, system-ui, sans-serif'; x.fillText(localDate(), 330, 1282);
  c.toBlob(b => { if (b) cardFile = new File([b], `skybloom-${localDate()}.jpg`, { type: 'image/jpeg' }); }, 'image/jpeg', .9);
}
const shareText = () => tl('share.text', { name: NAMES[G.top], lv: G.top, score: G.score.toLocaleString('en-US') });   // no link by default (§6.4)
// inside the claude.ai page, files go through the page's "downloads" capability (the viewer confirms); elsewhere a normal download
const DL = window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
const downloadCard = () => downloadFile(cardFile);
async function downloadFile(file) {
  const dl = await DL;
  if (dl) { try { await dl.save({ filename: file.name, data: file }); toast(tl('t.saved')); }
    catch (e) { if (e?.code !== 'declined') toast(tl('t.saveNA')); } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast(tl('t.saved'));
}
export function saveCard() {   // iPhone: the share sheet has "Save Image"; elsewhere a normal download
  if (!cardFile) { toast(tl('t.preparing')); return; }
  if (navigator.canShare?.({ files: [cardFile] })) navigator.share({ files: [cardFile] }).catch(() => {}); else downloadCard();
}
export function shareCard() {
  if (!cardFile) { toast(tl('t.preparing')); return; }
  const text = shareText();
  if (navigator.canShare?.({ files: [cardFile], text })) navigator.share({ files: [cardFile], text }).catch(() => {});
  else if (navigator.share) navigator.share({ text }).catch(() => {});
  else { downloadCard(); navigator.clipboard?.writeText(text).then(() => toast(tl('t.savedCopied')), () => {}); }
}

/* ---------- collection: Garden / Treasures ---------- */
let _tm = null; const tdMini = () => _tm || (_tm = new Mini($('td-anim'), 420, 420));
let colTab = 'garden';
const setOf = id => SKINS.building.find(k => k.id === id);
const setNames = k => NAMES_BY[k.set] || NAMES_BASE;
/* ponytail: TEST BUILD ONLY. Silhouettes button on the collection: off = every card counts as found (picture, name, moving detail). Not saved; remove the button and colAll before a public release. */
let colAll = false;
const found = (set, lv) => colAll || hasBuilt(set, lv);
$('col-sil').onclick = () => { colAll = !colAll; $('col-sil').setAttribute('aria-pressed', !colAll); $('col-sil').textContent = tl(colAll ? 'col.silOff' : 'col.silOn'); const y = $('col-grid').scrollTop; openCollection(); $('col-grid').scrollTop = y; };
export function openCollection(tab = colTab) {
  colTab = tab; $('col-grid').scrollTop = 0; $('col-sil').hidden = tab !== 'garden';
  $('tab-garden').setAttribute('aria-selected', tab === 'garden'); $('tab-treasures').setAttribute('aria-selected', tab === 'treasures');
  $('tr-detail').hidden = true;
  if (tab === 'garden') {
    // 10-18: one section of 17 per building set, in shop order, stacked in one scroll; a set not bought yet shows its silhouettes
    let n = 0, h = '';
    for (const k of SKINS.building) {
      const own = U.owned.building.includes(k.id), names = setNames(k); let m = 0, cards = '';
      for (let lv = 1; lv <= 17; lv++) {
        const got = found(k.id, lv); m += got;
        cards += `<button class="card ${got ? '' : 'locked'}" data-bd="${lv}" data-set="${k.id}"><span class="badge">${lv}</span><img src="${artSrc(lv, k.set || null)}" alt="${got ? names[lv] : tl('col.locked')}" loading="lazy"><div class="nm">${got ? names[lv] : '???'}</div></button>`;
      }
      n += m;
      h += `<section class="col-set${own ? '' : ' unowned'}"><h3><span>${(lang() === 'ko' && k.ko) || k.name}</span><b>${own || m ? `${m} / 17` : tl('col.inShop')}</b></h3><div class="grid">${cards}</div></section>`;
    }
    const total = SKINS.building.length * 17;
    $('col-count').textContent = `${n} / ${total}`; $('col-fill').style.width = (n / total * 100) + '%';
    $('col-grid').innerHTML = h;
  } else {
    const n = Object.keys(U.treasures).length;
    $('col-count').textContent = `${n} / ${TREASURES.length}`; $('col-fill').style.width = (n / TREASURES.length * 100) + '%';
    $('col-grid').innerHTML = '<div class="grid">' + TREASURES.map((_, i) => {
      const id = i + 1, nm = trName(id), got = U.treasures[id], rar = L.TREASURE_RARITY[i];
      return `<button class="card tr ${rar} ${got ? '' : 'locked'}" data-tr="${id}" aria-label="${got ? nm : tl('col.lockedTreasure')}, ${tl('rarity.' + rar)}">${got ? `<span class="cnt">×${got.n}</span>` : ''}<img src="${accSrc(id)}" alt=""><div class="nm">${got ? nm : '???'}</div></button>`;
    }).join('') + '</div>';
  }
  overlay('collection');
}
$('tab-garden').onclick = () => openCollection('garden');
$('tab-treasures').onclick = () => openCollection('treasures');
$('col-grid').addEventListener('click', e => {
  const bd = e.target.closest('[data-bd]');   // building detail: English name, description in the player's language (v0.5 §3.2)
  if (bd) { const lv = +bd.dataset.bd, k = setOf(bd.dataset.set); if (!k || !found(k.id, lv)) return;
    $('td-img').src = artSrc(lv, k.set || null); $('td-img').style.visibility = '';
    const set = k.set || null, art = setArt(set).filter(([key]) => !IMG[key]);   // another set's pictures load on first use (Classic's stand in until then)
    tdMini().show(lv, set);   // every set moves in the detail (its own motion map)
    if (art.length) loadSkinArt(art).then(() => { const m = tdMini(); if (m.lv === lv && m.set === set) { m.lv = 0; m.show(lv, set); } });   // rebuild once all of it is in (motion parts like rotors wait for their own art)
    const key = 'bd.' + (SET_PRE[k.set] || '') + lv;   // a set without its own descriptions (Classic, Candy Glass) uses the base ones
    $('td-name').textContent = setNames(k)[lv]; $('td-desc').textContent = tl(tl(key) === key ? 'bd.' + lv : key);
    $('td-rar').className = 'rar C'; $('td-rar').textContent = 'Lv ' + lv; $('td-meta').textContent = (lang() === 'ko' && k.ko) || k.name; $('tr-detail').hidden = false; return; }
  const b = e.target.closest('[data-tr]'); if (!b) return;
  const id = +b.dataset.tr, got = U.treasures[id], rar = L.TREASURE_RARITY[id - 1];
  if (!got) { toast(tl('col.findIt')); return; }
  tdMini().hide(); $('td-img').src = accSrc(id); $('td-name').textContent = trName(id); $('td-desc').textContent = tl('tr.' + id);
  $('td-rar').className = 'rar ' + rar; $('td-rar').textContent = tl('rarity.' + rar);
  $('td-meta').textContent = tl(got.n === 1 ? 'col.meta1' : 'col.meta', { date: got.first, n: got.n });
  $('tr-detail').hidden = false;
});
$('tr-detail').addEventListener('click', e => { if (e.target.closest('[data-detail-close]')) $('tr-detail').hidden = true; });

/* ---------- settings ---------- */
const TOGS = { music: 'set-music', sfx: 'set-sfx', vib: 'set-vib', hints: 'set-hints', cont: 'set-cont', tilt: 'set-tilt', ambient: 'set-ambient', reduce: 'set-reduce' };
function ambientTog() {   // Reduce Motion forces Background Motion off: show the switch off and dimmed (a disabled button takes no taps) while it is on; the saved choice returns when Reduce Motion is turned off
  const b = $('set-ambient'), on = U.settings.reduce; b.disabled = on; b.setAttribute('aria-checked', !on && U.settings.ambient);
}
function verNote() { $('app-ver').textContent = 'v' + VER; }   // the module version, small at the bottom left of the main screen: taken from the ?v= the game was loaded with, so it follows every release by itself
verNote();
function acctLabel() {   // 10-2 C1: "Guest · …a1b2" (last 4 of the guest id); Google / Apple show up with the server in step 12+
  const u = SkyAuth.currentUser(); return !u || u.provider === 'guest' ? tl('rank.guest') + (u ? ' · …' + u.id.slice(-4) : '') : u.provider;
}
export function openSettings() {
  for (const k in TOGS) $(TOGS[k]).setAttribute('aria-checked', U.settings[k]); ambientTog(); verNote();
  $('acct-who').textContent = acctLabel(); $('set-logout').hidden = U.screen === 'game';   // no log-out mid-game: the board would be lost
  overlay('settings');
}
$('set-logout').onclick = () => overlay('confirm');
$('cf-no').onclick = () => overlay('confirm', false);
$('cf-yes').onclick = () => SkyAuth.signOut().then(() => { overlay('confirm', false); overlay('settings', false); transition('cloud', () => show('login')); });
for (const k in TOGS) $(TOGS[k]).addEventListener('click', () => {
  const was = U.settings[k]; U.settings[k] = !was; $(TOGS[k]).setAttribute('aria-checked', U.settings[k]); store.set('settings', U.settings); TM.setting(k, was, U.settings[k]);
  if (k === 'music') music(U.settings.music);
  if (k === 'tilt' && U.settings.tilt) enableSensor();
  ambientTog(); verNote(); hud(); if (k === 'reduce' && U.tut === 1) tutStep(1);
});
$('set-lang').onclick = () => {   // English <-> 한국어; redraw whatever is on screen
  const was = lang(); U.settings.lang = was === 'ko' ? 'en' : 'ko'; store.set('settings', U.settings); TM.setting('lang', was, U.settings.lang);
  applyI18n(); verNote(); $('main-speed-best').textContent = tl('speed.best', { n: U.bestSpeed.toLocaleString('en-US') }); if (U.screen === 'game') hud(); if (U.tut) tutStep(U.tut);
};
/* 'Send Play Log': while recording (13-1) one zip with everything recorded on this device (telemetry.js); otherwise the old v1 file with the last 20 games */
let withdrawAsk = 0;
function renderLog() {
  const on = TM.active(), s = TM.summary(), n = store.get('games', []).length;
  if (!age13()) {   // child mode: no recording, no survey, no file to send
    $('log-text').textContent = tl('age.child.log'); $('log-send').classList.add('dis'); $('log-issue').hidden = $('log-withdraw').hidden = $('log-join').hidden = true; withdrawAsk = 0; return;
  }
  $('log-text').textContent = on ? tl(s.events ? 'tm.log.body' : 'tm.log.none', { n: s.runs, e: s.events.toLocaleString('en-US') }) : tl(n ? 'log.body' : 'log.none', { n }) + '\n\n' + tl('tm.log.off');
  $('log-send').classList.toggle('dis', on ? !s.events : !n);
  $('log-issue').hidden = $('log-withdraw').hidden = !on; $('log-join').hidden = on;
  $('log-withdraw').textContent = tl('tm.log.withdraw'); withdrawAsk = 0;
}
function openLog() { overlay('settings', false); renderLog(); overlay('export'); }
async function sendLog() {
  if (!age13()) return;
  let file;
  if (TM.active()) { const b = await TM.buildBundle(); if (!b || !b.events) return; file = b.file; }
  else { const games = store.get('games', []); if (!games.length) return;
    file = new File([JSON.stringify({ format: 'skybloom-playlog', version: 1, appVersion: APP_V, exportedAt: new Date().toISOString(), games })], `skybloom-playlog-${localDate()}.json`, { type: 'application/json' }); }
  if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file] }).catch(() => {}); else downloadFile(file);
}
$('set-log').onclick = openLog; $('log-close').onclick = () => overlay('export', false); $('log-send').onclick = sendLog;
$('log-issue').onclick = () => TM.openFeedback('issue');
$('log-join').onclick = () => { overlay('export', false); TM.openConsent(); };
$('log-withdraw').onclick = async () => {   // two taps within 6 s: delete the queue, the ids and the consent, and stop recording
  if (!withdrawAsk || Date.now() - withdrawAsk > 6000) { withdrawAsk = Date.now(); $('log-withdraw').textContent = tl('tm.log.withdrawQ'); return; }
  await TM.withdraw(); renderLog(); toast(tl('tm.log.withdrawn'), 3000);
};
$('set-tut').onclick = () => { overlay('settings', false); U.tut = 1; transition('bubble', () => newGame(true), [540, 1000]); };


