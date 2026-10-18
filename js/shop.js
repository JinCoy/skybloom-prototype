/* Skybloom module: shop (split from index.html in step 12; code unchanged) */
import { $, av, CX, CY, IMG, ITEMS, NAMES, NAMES_BASE, NAMES_BY, SET_PRE, TW, U, loadSkinArt, reduce, set_NAMES, store, tl, toWorld } from './core.js?v=0.7.26';
import { SFX, vib } from './audio.js?v=0.7.26';
import { hud, overlay, sheet, toast } from './ui.js?v=0.7.26';
import { addGold } from './game.js?v=0.7.26';
import { addFxXY } from './fx.js?v=0.7.26';
import { spawnBubble } from './bubbles.js?v=0.7.26';
import { R, tex } from './renderer.js?v=0.7.26';
import { down } from './input.js?v=0.7.26';
import * as TM from './telemetry.js?v=0.7.26';

/* ---------- shop (v0.4 §5.2): gold purchases work, cash items are a mock-up; skin art made in phase 8 ---------- */
const SKINS = {
  board: [{ id: 'frost', name: 'Frosted Glass', sub: 'Default', tile: 'tile' }, { id: 'petal', name: 'Petal Tiles', gold: 300, tile: 'tile_petal', water: 0x6f6fe6 },
          { id: 'star', name: 'Starlight Tiles', gold: 600, tile: 'tile_star', water: 0x4f5cd8 },
          { id: 'lime', name: 'Lime Jelly', gold: 300, tile: 'tile_lime', water: 0x6fd33a }, { id: 'tangerine', name: 'Tangerine Gel', gold: 300, tile: 'tile_tangerine', water: 0xff8f3a },
          { id: 'grape', name: 'Grape Console', gold: 600, tile: 'tile_grape', water: 0x7a4fd0 }, { id: 'luna', name: 'Luna Blue', gold: 600, tile: 'tile_luna', water: 0x2f6fe0 },
          { id: 'opal', name: 'Opal Mystic', gold: 900, tile: 'tile_opal', water: 0xb8a8ff }],
  sky: [{ id: 'day', name: 'Sky Island', sub: 'Default' }, { id: 'blossom', name: 'Blossom Island', gold: 800 }, { id: 'aurora', name: 'Aurora Sky', gold: 1000, thumb: 2 }],   // each sky skin has 3 paintings: assets/sky_<id>_0|1|2.webp = Day / Sunset / Night; thumb = which one the shop card shows (Aurora: the night one)
  building: [{ id: 'classic', name: 'Classic Glass', sub: 'Default' }, { id: 'candy', name: 'Candy Glass', gold: 1000, set: 'candy' },
              { id: 'eco', name: 'Eco Campus', gold: 1000, set: 'eco' }, { id: 'aqua', name: 'Aqua Gadget', gold: 1000, set: 'aqua' }],
  bubble: [{ id: 'rainbow', name: 'Rainbow', sub: 'Default' }, { id: 'pearl', name: 'Pearl', gold: 200, tint: 0xfff0dc }, { id: 'mint', name: 'Mint', gold: 200, tint: 0xc6ffe4 },
            // art = own bubble picture (empty bubbles only; item / treasure / gold bubbles keep the clear one so their colour still reads); pop = pop-ring colour; wob = squash amplitude (default .025); cycle = colour drifts slowly
            { id: 'lime', name: 'Lime Slime', gold: 300, art: 'bubble_lime', pop: 0xa6e84a, wob: .07 }, { id: 'tangerine', name: 'Tangerine Gel', gold: 300, art: 'bubble_tangerine', pop: 0xffa040, wob: .03 },
            { id: 'grape', name: 'Grape Console', gold: 300, art: 'bubble_grape', pop: 0xa070e0, wob: .012 }, { id: 'luna', name: 'Luna Blue', gold: 300, art: 'bubble_luna', pop: 0x5a90f0 },
            { id: 'opal', name: 'Opal Mystic', gold: 300, art: 'bubble_opal', pop: 0xe0c8ff, cycle: true }],
};
const SHOP_TABS = ['board', 'sky', 'building', 'bubble'];   // 10-2 B2: gold buys skins only; items come from bubbles and ads
U.owned = Object.assign({ board: ['frost'], sky: ['day'], building: ['classic'], bubble: ['rainbow'] }, store.get('owned', {}));
U.equip = Object.assign({ board: 'frost', sky: 'day', building: 'classic', bubble: 'rainbow' }, store.get('equip', {}));
let shopTab = 'board', preview = null, shopDown = false, phaseTimer = 0;
function cyclePhase(on) {   // Sky tab: the preview garden steps Day -> Sunset -> Night every 5 s; other tabs / closed shop follow the real game phase
  if (!on) { clearInterval(phaseTimer); phaseTimer = 0; U.shopPhase = null; return; }
  if (phaseTimer) return;
  U.shopPhase = 0; phaseTimer = setInterval(() => { U.shopPhase = (U.shopPhase + 1) % 3; }, 5000);
}
const skin = (cat, id) => SKINS[cat].find(k => k.id === id) || SKINS[cat][0];
const hex = n => '#' + n.toString(16).padStart(6, '0');
const SKIN_FILES = { tile_petal: 'tile_petal', tile_star: 'tile_star', tile_lime: 'tile_lime', tile_tangerine: 'tile_tangerine', tile_grape: 'tile_grape', tile_luna: 'tile_luna', tile_opal: 'tile_opal', bubble_lime: 'bubble_lime', bubble_tangerine: 'bubble_tangerine', bubble_grape: 'bubble_grape', bubble_luna: 'bubble_luna', bubble_opal: 'bubble_opal' };
const skyKeys = id => [0, 1, 2].map(n => `sky_${id}_${n}`);
export function applySkins(sel = U.equip) {
  if (!R) return;
  const b = skin('board', sel.board), sk = skin('sky', sel.sky), bu = skin('building', sel.building), bb = skin('bubble', sel.bubble);
  U.skyShown = sk.id;   // the sky on screen (a shop preview too): the sky objects in renderer.js follow it, not only the equipped skin
  const need = [b.tile, bb.art].filter(k => SKIN_FILES[k]).map(k => [k, `assets/${SKIN_FILES[k]}.webp`]).concat(skyKeys(sk.id).map(k => [k, `assets/${k}.webp`]));
  const sp = SET_PRE[bu.set]; if (sp) for (let lv = 1; lv <= 17; lv++) need.push([sp + lv, `assets/${sp}${String(lv).padStart(2, '0')}.webp`]);
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
  if (cat === 'building') return `<span class="art"><img src="${av(`assets/${SET_PRE[k.set] || 'b'}12.webp`)}" alt=""></span>`;
  if (k.art) return `<span class="art"><img src="${av(`assets/${SKIN_FILES[k.art]}.webp`)}" alt="" style="width:130px;position:relative"></span>`;
  return `<span class="art"><span style="position:absolute;inset:18px;border-radius:50%;background:${k.tint ? hex(k.tint) : 'transparent'};opacity:.55"></span><img src="${av('assets/bubble.webp')}" alt="" style="width:130px;position:relative"></span>`;
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
  cyclePhase(tab === 'sky'); applySkins(preview); overlay('shop'); shopFx();
  $('scr-' + U.screen).style.visibility = 'hidden';   // the garden stays visible for previews, the HUD steps aside
}
export function closeShop() { cyclePhase(false); preview = null; applySkins(); overlay('shop', false); $('scr-' + U.screen).style.visibility = ''; hud(); }
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
  if (shopTab === 'bubble') {   // a bubble appears at once in the sky above the garden (clear -> item -> treasure -> ...), so the chosen skin is seen floating, aura included
    const kinds = [null, { kind: 'item', item: ITEMS[0][0] }, { kind: 'treasure', id: 1, rarity: 'common' }];
    spawnBubble(kinds[U.shopSpawn = ((U.shopSpawn ?? -1) + 1) % 3] || { kind: 'empty' }, toWorld([140 + Math.random() * 800, 380 + Math.random() * 330]));
  }
});


