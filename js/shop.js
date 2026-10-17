/* Skybloom module: shop (split from index.html in step 12; code unchanged) */
import { $, CX, CY, IMG, NAMES, NAMES_BASE, NAMES_BY, SET_PRE, TW, U, loadSkinArt, reduce, set_NAMES, store, tl } from './core.js?v=0.7.2';
import { SFX, vib } from './audio.js?v=0.7.2';
import { hud, overlay, sheet, toast } from './ui.js?v=0.7.2';
import { addGold } from './game.js?v=0.7.2';
import { addFxXY } from './fx.js?v=0.7.2';
import { R, tex } from './renderer.js?v=0.7.2';
import { down } from './input.js?v=0.7.2';
import * as TM from './telemetry.js?v=0.7.2';

/* ---------- shop (v0.4 §5.2): gold purchases work, cash items are a mock-up; skin art made in phase 8 ---------- */
const SKINS = {
  board: [{ id: 'frost', name: 'Frosted Glass', sub: 'Default', tile: 'tile' }, { id: 'petal', name: 'Petal Tiles', gold: 300, tile: 'tile_petal', water: 0x6f6fe6 },
          { id: 'star', name: 'Starlight Tiles', gold: 600, tile: 'tile_star', water: 0x4f5cd8 }],
  sky: [{ id: 'day', name: 'Sky Island', sub: 'Default', bg: 'bg' }, { id: 'blossom', name: 'Blossom Island', gold: 800, bg: 'bg_blossom' }, { id: 'aurora', name: 'Aurora Sky', cash: '$1.99', bg: 'bg_aurora' }],
  building: [{ id: 'classic', name: 'Classic Glass', sub: 'Default' }, { id: 'candy', name: 'Candy Glass', cash: '$2.99', set: 'candy' },
              { id: 'eco', name: 'Eco Campus', cash: '$2.99', set: 'eco' }, { id: 'aqua', name: 'Aqua Gadget', cash: '$2.99', set: 'aqua' }],
  bubble: [{ id: 'rainbow', name: 'Rainbow', sub: 'Default' }, { id: 'pearl', name: 'Pearl', gold: 200, tint: 0xfff0dc }, { id: 'mint', name: 'Mint', gold: 200, tint: 0xc6ffe4 }],
};
const SHOP_TABS = ['board', 'sky', 'building', 'bubble'];   // 10-2 B2: gold buys skins only; items come from bubbles and ads
U.owned = Object.assign({ board: ['frost'], sky: ['day'], building: ['classic'], bubble: ['rainbow'] }, store.get('owned', {}));
U.equip = Object.assign({ board: 'frost', sky: 'day', building: 'classic', bubble: 'rainbow' }, store.get('equip', {}));
let shopTab = 'board', preview = null, shopDown = false;
const skin = (cat, id) => SKINS[cat].find(k => k.id === id) || SKINS[cat][0];
const hex = n => '#' + n.toString(16).padStart(6, '0');
const SKIN_FILES = { tile_petal: 'tile_petal', tile_star: 'tile_star', bg_blossom: 'bg_blossom', bg_aurora: 'bg_aurora' };
export function applySkins(sel = U.equip) {
  if (!R) return;
  const b = skin('board', sel.board), sk = skin('sky', sel.sky), bu = skin('building', sel.building), bb = skin('bubble', sel.bubble);
  const need = [b.tile, sk.bg].filter(k => SKIN_FILES[k]).map(k => [k, `assets/${SKIN_FILES[k]}.webp`]);
  const sp = SET_PRE[bu.set]; if (sp) for (let lv = 1; lv <= 17; lv++) need.push([sp + lv, `assets/${sp}${String(lv).padStart(2, '0')}.webp`]);
  const missing = need.filter(([k]) => !IMG[k]);
  if (missing.length) loadSkinArt(missing).then(() => applySkins(preview || U.equip));   // apply again once the art is here
  const tt = tex(IMG[b.tile] ? b.tile : 'tile'), tw = TW * .95;
  R.tiles.forEach(t => { t.texture = tt; t.width = tw; t.height = tt.height * tw / tt.width; });
  U.skinWater = b.water || null;
  R.bgs[0].texture = tex(IMG[sk.bg] ? sk.bg : 'bg');
  const set = bu.set || null; set_NAMES(NAMES_BY[set] || NAMES_BASE);
  if (U.bset !== set) { U.bset = set; for (const I of R.inst.values()) I.c.destroy({ children: true }); R.inst.clear(); }
  U.skinBubble = bb.tint || null;
}
function skinArt(cat, k) {
  if (cat === 'board') return `<span class="art" style="background:#eef7ff"><img src="assets/${SKIN_FILES[k.tile] || 'tile'}.webp" alt=""></span>`;
  if (cat === 'sky') return `<span class="art"><img src="assets/${SKIN_FILES[k.bg] || 'bg'}.webp" alt="" style="width:230px;height:150px;object-fit:cover;max-width:none;max-height:none"></span>`;
  if (cat === 'building') return `<span class="art"><img src="assets/${SET_PRE[k.set] || 'b'}12.webp" alt=""></span>`;
  return `<span class="art"><span style="position:absolute;inset:18px;border-radius:50%;background:${k.tint ? hex(k.tint) : 'transparent'};opacity:.55"></span><img src="assets/bubble.webp" alt="" style="width:130px;position:relative"></span>`;
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
  if ($('ov-shop').hidden) setShopDown(false, false);   // a fresh open always starts with the panel up
  shopTab = tab; preview = preview || { ...U.equip };
  $('shop-gold').textContent = U.gold.toLocaleString('en-US');
  $('shop-tabs').innerHTML = SHOP_TABS.map(k => `<button class="tab" role="tab" data-shop-tab="${k}" aria-selected="${k === tab}">${tl('shop.tab.' + k)}</button>`).join('');
  const coin = '<i class="coin"></i>';
  $('shop-hint').textContent = tl('shop.hint');
  $('shop-cards').innerHTML = SKINS[tab].map(k => {
    const own = U.owned[tab].includes(k.id), eq = U.equip[tab] === k.id, on = preview[tab] === k.id;
    const act = eq ? `<span class="act done">${tl('shop.equipped')}</span>` : own ? `<span class="act eq" data-equip>${tl('shop.equip')}</span>` : k.cash ? `<span class="act cash" data-cash>${k.cash}</span>` : `<span class="act buy" data-buy>${coin}${k.gold}</span>`;
    return `<button class="sk ${on ? 'on' : ''}" data-skin="${k.id}" aria-pressed="${on}">${skinArt(tab, k)}<span class="nm">${k.name}</span><span class="sub">${k.sub ? tl('shop.default') : k.cash ? tl('shop.premium') : ''}</span>${act}</button>`;
  }).join('');
  applySkins(preview); overlay('shop'); shopFx();
  $('scr-' + U.screen).style.visibility = 'hidden';   // the garden stays visible for previews, the HUD steps aside
}
export function closeShop() { preview = null; applySkins(); overlay('shop', false); $('scr-' + U.screen).style.visibility = ''; hud(); }
$('ov-shop').addEventListener('click', e => {
  if (e.target.id === 'shop-dim') { setShopDown(!shopDown); return; }   // 10-2b: a background tap folds / unfolds the panel like the arrow; only ✕ closes the shop
  const tb = e.target.closest('[data-shop-tab]'); if (tb) { openShop(tb.dataset.shopTab); return; }
  const card = e.target.closest('[data-skin]'); if (!card) return;
  const k = skin(shopTab, card.dataset.skin);
  if (e.target.closest('[data-cash]')) { sheet(tl('shop.cashTitle'), tl('shop.cashBody', { name: k.name, price: k.cash })); return; }
  if (e.target.closest('[data-buy]')) {
    if (U.gold < k.gold) { toast(tl('shop.noGold')); SFX.bad(); denyShop(card); return; }
    addGold(-k.gold); U.owned[shopTab].push(k.id); store.set('owned', U.owned); SFX.gift(); U.shopFx = { id: k.id, kind: 'bought' };
  } else if (e.target.closest('[data-equip]')) U.shopFx = { id: k.id, kind: 'equip' };
  if (e.target.closest('[data-buy]') || e.target.closest('[data-equip]')) { TM.setting('skin_' + shopTab, U.equip[shopTab], k.id); U.equip[shopTab] = k.id; store.set('equip', U.equip); }
  preview[shopTab] = k.id; openShop(shopTab);
});


