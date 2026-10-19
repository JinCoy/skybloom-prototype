/* Skybloom module: shop (split from index.html in step 12; code unchanged) */
import { $, av, CX, CY, IMG, ITEMS, lang, NAMES, NAMES_BASE, NAMES_BY, SET_PRE, TW, U, loadSkinArt, reduce, set_NAMES, store, tl, toWorld } from './core.js?v=0.7.51';
import { SFX, vib } from './audio.js?v=0.7.51';
import { hud, overlay, sheet, toast } from './ui.js?v=0.7.51';
import { addGold } from './game.js?v=0.7.51';
import { addFxXY } from './fx.js?v=0.7.51';
import { spawnBubble } from './bubbles.js?v=0.7.51';
import { renderPalette, sbBegin, sbClick, sbDirty, sbOff, sbRefresh, sbRevert, sbSave, sbShotOff, sbTap } from './sandbox.js?v=0.7.51';
import { R, tex } from './renderer.js?v=0.7.51';
import { down } from './input.js?v=0.7.51';
import * as TM from './telemetry.js?v=0.7.51';

/* ---------- shop (v0.4 §5.2): gold purchases work, cash items are a mock-up; skin art made in phase 8 ---------- */
export const SKINS = {
  board: [{ id: 'frost', name: 'Frosted Glass', sub: 'Default', tile: 'tile' }, { id: 'petal', name: 'Petal Tiles', gold: 300, tile: 'tile_petal', water: 0x6f6fe6 },
          { id: 'star', name: 'Starlight Tiles', gold: 600, tile: 'tile_star', water: 0x4f5cd8 },
          { id: 'lime', name: 'Lime Jelly', gold: 300, tile: 'tile_lime', water: 0x6fd33a }, { id: 'tangerine', name: 'Tangerine Gel', gold: 300, tile: 'tile_tangerine', water: 0xff8f3a },
          { id: 'grape', name: 'Grape Console', gold: 600, tile: 'tile_grape', water: 0x7a4fd0 }, { id: 'luna', name: 'Luna Blue', gold: 600, tile: 'tile_luna', water: 0x2f6fe0 },
          { id: 'opal', name: 'Opal Mystic', gold: 900, tile: 'tile_opal', water: 0xb8a8ff },
          // Dreamcore v1 (Codex tiles T01-T03): quiet neutrals under the Poolhouse / Reverie buildings; water = Codex's proposal; ko = Korean shop name
          { id: 'oyster', name: 'Oyster Porcelain', ko: '오이스터 포슬린', gold: 300, tile: 'tile_oyster', water: 0x94a8ab },
          { id: 'fog', name: 'Fog Limestone', ko: '포그 라임스톤', gold: 300, tile: 'tile_fog', water: 0x83989c },
          { id: 'smoke', name: 'Smoke Glass', ko: '스모크 글라스', gold: 300, tile: 'tile_smoke', water: 0x90adb6 }],
  sky: [{ id: 'day', name: 'Sky Island', sub: 'Default' }, { id: 'blossom', name: 'Blossom Island', gold: 800 }, { id: 'aurora', name: 'Aurora Sky', gold: 1000, thumb: 2 }],   // each sky skin has 3 paintings: assets/sky_<id>_0|1|2.webp = Day / Sunset / Night; thumb = which one the shop card shows (Aurora: the night one)
  // thumb = the level its shop card shows. Card rule (Eco Campus look, measured): the whole picture, centred, contain-fit in the 230x150 art box;
  // per set the Lv8-17 picture closest to Eco Lv12 in shape (1.26:1) and ink coverage (56% of the box): score |aspect-1.26|/1.26 + |cover-.56|/.56
  building: [{ id: 'classic', name: 'Classic Glass', sub: 'Default', thumb: 9 }, { id: 'candy', name: 'Candy Glass', gold: 1000, set: 'candy', thumb: 9 },
              { id: 'eco', name: 'Eco Campus', gold: 1000, set: 'eco', thumb: 12 }, { id: 'aqua', name: 'Aqua Gadget', gold: 1000, set: 'aqua', thumb: 17 },
              { id: 'poolhouse', name: 'Pastel Poolhouse', ko: '파스텔 풀하우스', gold: 1000, set: 'poolhouse', thumb: 11 }, { id: 'reverie', name: 'Reverie Village', ko: '몽상 마을', gold: 1000, set: 'reverie', thumb: 10 }],
  bubble: [{ id: 'rainbow', name: 'Rainbow', sub: 'Default' }, { id: 'pearl', name: 'Pearl', gold: 200, tint: 0xfff0dc }, { id: 'mint', name: 'Mint', gold: 200, tint: 0xc6ffe4 },
            // art = own bubble picture (empty bubbles only; item / treasure / gold bubbles keep the clear one so their colour still reads); pop = pop-ring colour; wob = squash amplitude (default .025); cycle = colour drifts slowly
            { id: 'lime', name: 'Lime Slime', gold: 300, art: 'bubble_lime', pop: 0xa6e84a, wob: .07 }, { id: 'tangerine', name: 'Tangerine Gel', gold: 300, art: 'bubble_tangerine', pop: 0xffa040, wob: .03 },
            { id: 'grape', name: 'Grape Console', gold: 300, art: 'bubble_grape', pop: 0xa070e0, wob: .012 }, { id: 'luna', name: 'Luna Blue', gold: 300, art: 'bubble_luna', pop: 0x5a90f0 },
            { id: 'opal', name: 'Opal Mystic', gold: 300, art: 'bubble_opal', pop: 0xe0c8ff, cycle: true }],
};
const SHOP_TABS = ['building', 'sky', 'board', 'bubble', 'garden'];   // 10-2 B2: gold buys skins only; items come from bubbles and ads
U.owned = Object.assign({ board: ['frost'], sky: ['day'], building: ['classic'], bubble: ['rainbow'] }, store.get('owned', {}));
U.equip = Object.assign({ board: 'frost', sky: 'day', building: 'classic', bubble: 'rainbow' }, store.get('equip', {}));
let shopTab = 'building', preview = null, shopDown = false, phaseTimer = 0;
function cyclePhase(on) {   // Sky tab: the preview garden steps Day -> Sunset -> Night every 5 s; other tabs / closed shop follow the real game phase
  if (!on) { clearInterval(phaseTimer); phaseTimer = 0; U.shopPhase = null; return; }
  if (phaseTimer) return;
  U.shopPhase = 0; phaseTimer = setInterval(() => { U.shopPhase = (U.shopPhase + 1) % 3; }, 5000);
}
const skin = (cat, id) => SKINS[cat].find(k => k.id === id) || SKINS[cat][0];
const nm = k => (lang() === 'ko' && k.ko) || k.name;   // a skin's own Korean name when it has one
const hex = n => '#' + n.toString(16).padStart(6, '0');
const SKIN_FILES = { tile_petal: 'tile_petal', tile_star: 'tile_star', tile_lime: 'tile_lime', tile_tangerine: 'tile_tangerine', tile_grape: 'tile_grape', tile_luna: 'tile_luna', tile_opal: 'tile_opal', tile_oyster: 'tile_oyster', tile_fog: 'tile_fog', tile_smoke: 'tile_smoke', bubble_lime: 'bubble_lime', bubble_tangerine: 'bubble_tangerine', bubble_grape: 'bubble_grape', bubble_luna: 'bubble_luna', bubble_opal: 'bubble_opal' };
const skyKeys = id => [0, 1, 2].map(n => `sky_${id}_${n}`);
/** [key, file] of every picture a building set needs (pictures + motion parts); Classic (no set) is always loaded. */
export function setArt(set) {
  const sp = SET_PRE[set], need = []; if (!sp) return need;
  for (let lv = 1; lv <= 17; lv++) if (!(sp === 'c' && lv === 6)) need.push([sp + lv, `assets/${sp}${String(lv).padStart(2, '0')}.webp`]);   // Candy Lv6 is built from its own body + sails (core.js loadSkinArt)
  if (sp === 'c') need.push(['body_c', 'assets/windmill_body_c.webp'], ['sails_c', 'assets/windmill_sails_c.webp']);
  if (sp === 'e') need.push(['e12_body', 'assets/e12_body.webp'], ['e13_body', 'assets/e13_body.webp'], ['e13_rotor', 'assets/e13_rotor.webp']);
  if (sp === 'g') need.push(['g1_body', 'assets/g01_body.webp'], ['g14_body', 'assets/g14_body.webp'], ['g1_fish', 'assets/g01_fish.webp']);
  return need;
}
export function applySkins(sel = U.equip) {
  if (!R) return;
  const b = skin('board', sel.board), sk = skin('sky', sel.sky), bu = skin('building', sel.building), bb = skin('bubble', sel.bubble);
  U.skyShown = sk.id;   // the sky on screen (a shop preview too): the sky objects in renderer.js follow it, not only the equipped skin
  const need = [b.tile, bb.art].filter(k => SKIN_FILES[k]).map(k => [k, `assets/${SKIN_FILES[k]}.webp`]).concat(skyKeys(sk.id).map(k => [k, `assets/${k}.webp`]));
  need.push(...setArt(bu.set));
  const missing = need.filter(([k]) => !IMG[k]);
  if (missing.length) loadSkinArt(missing).then(() => applySkins(preview || U.equip));   // apply again once the art is here
  const tt = tex(IMG[b.tile] ? b.tile : 'tile'), tw = TW * .95;
  R.tiles.forEach(t => { t.texture = tt; t.width = tw; t.height = tt.height * tw / tt.width; });
  U.skinWater = b.water || null;
  skyKeys(sk.id).forEach((k, n) => { R.bgs[n].texture = tex(IMG[k] ? k : ['bg', 'bg1', 'bg2'][n]); });   // until a skin's skies are loaded the default ones stay
  const set = bu.set || null; set_NAMES(NAMES_BY[set] || NAMES_BASE);
  if (U.bset !== set) { U.bset = set; for (const I of R.inst.values()) I.c.destroy({ children: true }); R.inst.clear(); }
  U.skinBubble = bb.tint || null; U.skinBubbleArt = IMG[bb.art] ? bb.art : null; U.skinPop = bb.pop || null; U.skinWob = bb.wob ?? .025; U.skinCycle = !!bb.cycle;
}
function skinArt(cat, k) {
  if (cat === 'board') return `<span class="art" style="background:#eef7ff"><img src="${av(`assets/${SKIN_FILES[k.tile] || 'tile'}.webp`)}" alt=""></span>`;
  if (cat === 'sky') return `<span class="art"><img src="${av(`assets/sky_${k.id}_${k.thumb ?? 0}.webp`)}" alt="" style="width:230px;height:150px;object-fit:cover;max-width:none;max-height:none"></span>`;
  if (cat === 'building') return `<span class="art"><img src="${av(`assets/${SET_PRE[k.set] || 'b'}${String(k.thumb).padStart(2, '0')}.webp`)}" alt=""></span>`;
  if (k.art) return `<span class="art"><img src="${av(`assets/${SKIN_FILES[k.art]}.webp`)}" alt="" style="width:130px;position:relative"></span>`;
  return `<span class="art"><span style="position:relative;display:block;width:130px;height:130px">${k.tint ? `<span style="position:absolute;inset:14px;border-radius:50%;background:${hex(k.tint)};opacity:.55"></span>` : ''}<img src="${av('assets/bubble.webp')}" alt="" style="width:130px;position:relative"></span></span>`;   // the tint disc = the bubble's circle (bubble.webp: 27..228 of 256 -> 14px in at 130px)
}
function setShopDown(down, animate = true) {
  shopDown = down; const p = $('shop-panel'); p.style.transition = animate && !reduce() ? '' : 'none';   // Reduce Motion: change at once
  p.classList.toggle('down', down); $('shop-dim').classList.toggle('off', down); $('shop-dim').style.transition = p.style.transition;
  $('shop-fold').classList.toggle('up', down); $('shop-fold').setAttribute('aria-label', tl(down ? 'shop.unfold' : 'shop.fold'));
  void p.offsetWidth; if (!animate) p.style.transition = '';
}
$('shop-fold').onclick = () => setShopDown(!shopDown);
function denyShop(card) {   // not enough gold: the card shakes, the phone buzzes, the gold count turns red for a moment
  vib([30, 40, 30]); const pill = $('shop-gold').parentElement;
  if (!reduce()) { card.classList.remove('deny'); void card.offsetWidth; card.classList.add('deny'); }
  pill.classList.remove('poor'); void pill.offsetWidth; pill.classList.add('poor'); clearTimeout(denyShop.t); denyShop.t = setTimeout(() => pill.classList.remove('poor'), 1500);
}
function shopFx() {   // after a purchase / equip: card glow + a burst over the garden preview
  const f = U.shopFx; U.shopFx = null; if (!f) return;
  const card = document.querySelector(`#shop-cards [data-skin="${f.id}"]`);
  if (card && !reduce()) card.classList.add(f.kind === 'bought' ? 'bought' : 'equipflash');
  if (f.kind === 'bought') { addFxXY('burst', CX, CY - 80); SFX.fanfare(); vib([20, 30, 20]); } else { addFxXY('merge', CX, CY - 60, 1); SFX.shimmer(); vib(12); }
}
export function openShop(tab = shopTab) {
  if ($('ov-shop').hidden) { setShopDown(false, false); sbBegin(); }   // a fresh open always starts with the panel up; the sandbox remembers the garden as it was
  shopTab = tab; preview = preview || { ...U.equip };
  $('shop-gold').textContent = U.gold.toLocaleString('en-US');
  $('shop-tabs').innerHTML = SHOP_TABS.map(k => `<button class="tab" role="tab" data-shop-tab="${k}" aria-selected="${k === tab}">${tl('shop.tab.' + k)}</button>`).join('');
  const coin = '<i class="coin"></i>';
  $('shop-hint').textContent = tl(tab === 'garden' ? 'shop.hint.garden' : 'shop.hint'); U.sbOn = tab === 'garden';
  if (tab === 'garden') renderPalette($('shop-cards')); else { $('shop-cards').className = 'shop-cards'; $('shop-cards').innerHTML = SKINS[tab].map(k => {
    const own = U.owned[tab].includes(k.id), eq = U.equip[tab] === k.id, on = preview[tab] === k.id;
    const act = eq ? `<span class="act done">${tl('shop.equipped')}</span>` : own ? `<span class="act eq" data-equip>${tl('shop.equip')}</span>` : k.cash ? `<span class="act cash" data-cash>${k.cash}</span>` : `<span class="act buy" data-buy>${coin}${k.gold}</span>`;
    return `<button class="sk ${on ? 'on' : ''}" data-skin="${k.id}" aria-pressed="${on}">${skinArt(tab, k)}<span class="nm">${nm(k)}</span><span class="sub">${k.sub ? tl('shop.default') : k.cash ? tl('shop.premium') : ''}</span>${act}</button>`;
  }).join(''); }
  if (tab === 'garden') { clearInterval(phaseTimer); phaseTimer = 0; } else cyclePhase(tab === 'sky');   // Decorate: the phase chips set U.shopPhase by hand
  applySkins(preview); overlay('shop'); shopFx();
  $('scr-' + U.screen).style.visibility = 'hidden';   // the garden stays visible for previews, the HUD steps aside
  sbRefresh();
}
export function requestCloseShop() {   // X: with unsaved decorating the player is asked first
  if (sbDirty()) { overlay('sbsave'); $('sb-ui').hidden = true; } else closeShop();   // the tool buttons step aside while the question is open
}
$('sv-yes').onclick = () => { sbSave(); overlay('sbsave', false); closeShop(); };
$('sv-no').onclick = () => { sbRevert(); overlay('sbsave', false); closeShop(); };
$('sv-cancel').onclick = () => { overlay('sbsave', false); sbRefresh(); };
(() => {   // swipe the panel down to fold it, up to bring it back (horizontal swipes still scroll the cards)
  const p = $('shop-panel'); let s = null;
  p.addEventListener('pointerdown', e => { s = [e.clientX, e.clientY]; });
  p.addEventListener('pointercancel', () => { s = null; });
  p.addEventListener('pointerup', e => {
    if (!s) return; const dx = e.clientX - s[0], dy = e.clientY - s[1], k = $('stage').getBoundingClientRect().width / 1080; s = null;
    if (Math.abs(dy) > 70 * k && Math.abs(dy) > 1.5 * Math.abs(dx)) setShopDown(dy > 0);
  });
})();
export function closeShop() { shopTab = 'building'; sbOff(); cyclePhase(false);   // the next visit always starts on the Building tab
  preview = null; applySkins(); overlay('shop', false); $('scr-' + U.screen).style.visibility = ''; hud(); }
$('ov-shop').addEventListener('click', e => {
  if (U.sbOn && e.target.id === 'shop-dim') {   // Decorate: a tap on a tile / building places or erases, a tap on the empty background folds the panel; in the screenshot view any tap goes back
    if (sbShotOff()) return;
    const r = $('stage').getBoundingClientRect(), k = r.width / 1080; if (!sbTap(toWorld([(e.clientX - r.left) / k, (e.clientY - r.top) / k]))) setShopDown(!shopDown); return;
  }
  if (e.target.id === 'shop-dim') { setShopDown(!shopDown); return; }   // 10-2b: a background tap folds / unfolds the panel like the arrow; only ✕ closes the shop
  const tb = e.target.closest('[data-shop-tab]'); if (tb) { openShop(tb.dataset.shopTab); return; }
  if (U.sbOn && sbClick(e.target, { palette: () => renderPalette($('shop-cards')), toast, fold: d => setShopDown(d) })) return;
  const card = e.target.closest('[data-skin]'); if (!card) return;
  const k = skin(shopTab, card.dataset.skin);
  if (e.target.closest('[data-cash]')) { sheet(tl('shop.cashTitle'), tl('shop.cashBody', { name: nm(k), price: k.cash })); return; }
  if (e.target.closest('[data-buy]')) {
    if (U.gold < k.gold) { toast(tl('shop.noGold')); SFX.bad(); denyShop(card); return; }
    addGold(-k.gold); U.owned[shopTab].push(k.id); store.set('owned', U.owned); SFX.gift(); U.shopFx = { id: k.id, kind: 'bought' };
  } else if (e.target.closest('[data-equip]')) U.shopFx = { id: k.id, kind: 'equip' };
  if (e.target.closest('[data-buy]') || e.target.closest('[data-equip]')) { TM.setting('skin_' + shopTab, U.equip[shopTab], k.id); U.equip[shopTab] = k.id; store.set('equip', U.equip); }
  preview[shopTab] = k.id; openShop(shopTab);
  if (shopTab === 'bubble') {   // a bubble appears at once in the sky above the garden (clear -> item -> treasure -> ...), so the chosen skin is seen floating, aura included
    const kinds = [null, { kind: 'item', item: ITEMS[0][0] }, { kind: 'treasure', id: 1, rarity: 'common' }];
    spawnBubble(kinds[U.shopSpawn = ((U.shopSpawn ?? -1) + 1) % 3] || { kind: 'empty' }, toWorld([140 + Math.random() * 800, 380 + Math.random() * 330]));
  }
});


