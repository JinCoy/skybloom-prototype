/* Skybloom module: core (split from index.html in step 12; code unchanged) */

export const VER = new URL(import.meta.url).searchParams.get('v') || '0';   // the module version from the ?v= this file was imported with: every asset URL carries it, so a new version never pairs old cached art with new code
export const av = s => s.includes('?') ? s : `${s}?v=${VER}`;
export const L = window.SkyLogic;
export const $ = id => document.getElementById(id);
export const EDITOR = location.search.includes('editor') || location.hash === '#editor';
export const NAMES_BASE = ['', 'Dew Drop', 'Sprout', 'Lily Bloom', 'Glass Planter', 'Bubble Fountain', 'Breeze Windmill', 'Glass Greenhouse', 'Aqua Pavilion',
  'Solar Dome', 'Waterfall Garden', 'Crystal Tower', 'Sky Dome', 'Rainbow Bridge', 'Cloud Harbor', 'Star Observatory', 'Aurora Palace', 'Skybloom Tree'];
// each equipped building set names its own 17 buildings (Classic and Candy Glass keep the base names); applySkins() switches NAMES
export const NAMES_BY = { poolhouse: ['', 'Tile Lamp', 'Mushroom Shower', 'Wave Bench', 'Pink Payphone', 'Tide Jukebox', 'Cloud Stair', 'Poolside Booth', 'Arch Poolhouse', 'Mushroom Bathhouse', 'Water Diner', 'Pearl Shell Baths', 'Water Hourglass', 'Mobius Aqueduct', 'Jellyfish Sky Spa', 'Celestial Tide Observatory', 'Antigravity Bath Palace', 'Ocean Dream Sphere'],
  reverie: ['', 'Dream Mailbox', 'Gabled Birdhouse', 'Porch Planter', 'Solitary Door', 'Bay Window Cottage', 'Twin Porch House', 'Balcony House', 'Cloud Carousel Station', 'Attic Stair House', 'House Bridge', 'Bay Window Tower', 'Courtyard Manor', 'Inverted Dream Library', 'Balcony Cluster', 'Endless Stair House', 'Lunar Arboretum', 'Folded Village'],
  eco: ['', 'Eco Pod', 'Solar Lamp', 'Topiary Planter', 'Rain Tank', 'Helix Turbine', 'Fountain Pool', 'Holo Kiosk', 'Pod House', 'Glass Pavilion', 'Hydro Garden', 'Atrium Hall', 'Monorail Station', 'Turbine Tower', 'Tube Plaza', 'Sky Lab', 'Aqua Arcology', 'Biosphere Hill'],
  aqua: ['', 'Fish Bowl', 'Gacha Capsule', 'Lava Lamp', 'Jelly Tank', 'Clear Radio Hut', 'Disc Fountain', 'Pixel Pet House', 'Aquarium Cottage', 'Teardrop Dome', 'Reef Arcade', 'Dolphin Spire', 'Tube Slide Park', 'Glass Lift Tower', 'Ocean Drive Mall', 'Wave Station', 'Server Palace', 'Dream Globe'] };
export let NAMES = NAMES_BASE;
export const HR = [0, .3, .45, .55, .7, .85, 1.1, 1.2, 1.35, 1.5, 1.7, 1.9, 2.2, 2.25, 2.3, 2.35, 2.4, 2.45];
export const CAL = [0, 1.35, 1.25, 1.15, 1.15, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
export const TW = 240, TH = 120, CX = 540, CY = 1000;
export const POWER = { low: document.documentElement.classList.contains('app'), hot: 0 };   // app build: idle frames are capped (renderer.js); hot = last touch (performance.now)
export const BLEED = { t: 0, b: 0 };   // <html class="bleed"> (the app build): stage px of sky drawn above / below the 1080x1920 stage to reach the screen edges; set by ui.js fit()
export const ITEMS = [['rewind', 'Rewind', av('assets/item1.webp')], ['pop', 'Bubble Pop', av('assets/item2.webp')], ['drop', 'Cloud Drop', av('assets/item3.webp')]];
export const TREASURES = [   // spec §4.3, ids 1-22 (rarity lives in logic.js)
  ['Glass Marble', 'A glass marble holding a little piece of sky.'], ['Paper Boat', 'A paper boat that drifted down the water paths.'],
  ['Dandelion Puff', 'A dandelion puff, ready for a wish.'], ['Seashell Charm', 'A tiny seashell charm from a faraway shore.'],
  ['Cloud Pillow', 'A palm-sized pillow made of cloud.'], ['Raindrop Pendant', 'A pendant shaped like a single raindrop.'],
  ['Glass Butterfly', 'A glass butterfly that catches the light.'], ['Sun Catcher', 'A sun catcher that scatters little rainbows.'],
  ['Bubble Wand', 'A rainbow wand for blowing bubbles.'], ['Mini Balloon', 'A tiny hot-air balloon.'],
  ['Rainbow Feather', 'A feather painted in every colour of the rainbow.'], ['Crystal Koi', 'A crystal koi that swims through the sky.'],
  // 13-22 (collection expansion: Y2K room / music / games / PC / future, same glass look)
  ['Glass Duckie', 'A glass duck that floated from the bathtub up to the sky.'], ['Clear Cassette', 'A cassette with a favourite song still wound inside.'],
  ['Lava Lamp', 'A little lamp where blobs drift slowly upward.'], ['Jelly Mouse', 'A clear mouse with water sloshing inside.'],
  ['Clear Flip Phone', 'A flip phone waiting for a message from the sky.'], ['Pocket Console', 'A game console with a tiny garden floating on its screen.'],
  ['Glass Music Box', 'Open the lid and the clouds go round and round.'], ['Aqua Bot', 'A little helper robot that looks after the garden.'],
  ['Bubble Computer', 'A computer that always shows a clear blue sky.'], ['Holo Garden Cube', 'A tiny sky island that floats above your palm.']];
export const trName = id => { const k = 'trn.' + id, v = tl(k); return v === k ? TREASURES[id - 1][0] : v; };   // treasure name in the current language (i18n trn.<id>, English list as fallback)
export const accSrc = id => av(`assets/acc${String(id).padStart(2, '0')}.webp`);
/* Main-screen garden (10-3, style "Maximum" chosen): 13 buildings, a random showcase every visit. Slots are [row, col, minLv, maxLv]; the picks must be distinct,
   descend toward the front along each diagonal (tall buildings behind, small in front: nothing hides anything), and include at least 3 clearly moving buildings.
   The back corner (0,0) never gets a tall one (the logo). The left-corner slot (3,0) and the upper slot (0,2) swapped their level ranges after the first review. */
const MAIN_SLOTS = [[0,0,7,9],[0,1,5,8],[0,2,9,12],[0,3,15,17],[1,0,6,9],[1,2,3,5],[1,3,4,6],[2,0,12,15],[2,2,2,4],[2,3,1,3],[3,0,12,14],[3,1,4,7],[3,2,1,2]];
const MAIN_FALLBACK = [[9,7,11,17],[8,0,4,5],[15,0,3,2],[13,6,1,0]];
const MOVERS = new Set([2, 3, 4, 5, 6, 8, 10, 12, 14]);   // spin, sway, bob and flowing-water buildings
export const SHOW = MAIN_FALLBACK.map(r => r.slice());
export function genShow() {
  const slots = MAIN_SLOTS, pick = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  let g = null;
  for (let tries = 0; tries < 6000 && !g; tries++) {
    const b = Array.from({ length: 4 }, () => Array(4).fill(0)), used = new Set(); let ok = true;
    for (const [r, c, lo, hi] of slots) { const lv = pick(lo, hi); if (used.has(lv)) { ok = false; break; } used.add(lv); b[r][c] = lv; }
    if (!ok || [...used].filter(v => MOVERS.has(v)).length < 3) continue;
    for (let d = -3; d <= 3 && ok; d++) {   // along a diagonal the levels must fall toward the front
      const line = []; for (let r = 0; r < 4; r++) { const c = r + d; if (c >= 0 && c < 4 && b[r][c]) line.push(b[r][c]); }
      for (let i = 1; i < line.length; i++) if (line[i] >= line[i - 1]) ok = false;
    }
    if (ok) g = b;
  }
  g = g || MAIN_FALLBACK.map(r => r.slice());
  const flip = Math.random() < .5;   // mirror left/right so the tall one is not always on the same side
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) SHOW[r][c] = flip ? g[c][r] : g[r][c];
}
genShow();
export const DEMO = {   // demo links start a game from a fixed board: #combo #lv17 #stuck, #sunset (merge the Lv11 pair), #night (merge the Lv14 pair)
  combo: [[1, 1, 2, 2], [3, 3, 4, 4], [1, 1, 2, 2], [3, 3, 0, 0]],
  lv17: [[16, 16, 0, 2], [3, 0, 1, 0], [0, 2, 0, 1], [1, 0, 3, 0]],
  stuck: [[1, 2, 1, 2], [2, 1, 2, 3], [1, 2, 3, 2], [2, 3, 2, 1]],
  sunset: [[11, 11, 0, 2], [3, 0, 1, 0], [0, 2, 0, 1], [1, 0, 3, 0]],
  night: [[14, 14, 0, 12], [3, 0, 1, 0], [0, 2, 0, 1], [1, 0, 3, 0]],
};
export const center = (r, c) => [CX + (c - r) * TW / 2, CY + (c + r - 3) * TH / 2];
// v0.4 §2.1: island, board, buildings, bubbles and effects are one "world" drawn 1.1x around the board centre; the HUD is not scaled
export const WS = 1.1, toWorld = ([x, y]) => [CX + (x - CX) / WS, CY + (y - CY) / WS], toScreen = ([x, y]) => [CX + (x - CX) * WS, CY + (y - CY) * WS];
export const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
export const SET_PRE = { candy: 'c', eco: 'e', aqua: 'g', poolhouse: 'p', reverie: 'r' };   // building set -> image key / file prefix; Classic is 'b'
export const artSrc = (lv, set = U.bset) => av(`assets/${SET_PRE[set] || 'b'}${String(lv).padStart(2, '0')}.webp`);   // set = SET_PRE key (null = Classic); default: the equipped set
// building image key for the active set; the other sets fall back to Classic until its image has loaded
export const bkey = (lv, set = U.bset) => { const p = SET_PRE[set]; return p && IMG[p + lv] ? p + lv : 'b' + lv; };   // set: another set's key (collection detail)
// Lv13-17 content boxes on the 1024 generation canvas (export_assets.py): placed by the guide (diamond 640px, centre 512,820)
export const GUIDE = { b13: [220, 0, 828, 996], b14: [85, 28, 957, 992], b15: [110, 119, 937, 945], b16: [87, 24, 938, 991], b17: [99, 73, 929, 977],
  c13: [223, 16, 829, 978], c14: [92, 29, 958, 991], c15: [81, 98, 945, 957], c16: [101, 25, 925, 962], c17: [111, 49, 913, 967],
  e13: [244, 19, 792, 996], e14: [33, 69, 1001, 977], e15: [116, 55, 915, 958], e16: [202, 23, 836, 1006], e17: [62, 35, 962, 984],
  g13: [241, 35, 783, 992], g14: [131, 92, 910, 989], g15: [111, 64, 915, 984], g16: [113, 122, 913, 947], g17: [67, 138, 962, 956],
  // Dreamcore (export_dreamcore.py): 1254px art scaled by 1024/1254, bottom centre at (512, 970)
  p13: [119, 2, 905, 970], p14: [82, 20, 942, 970], p15: [128, 28, 896, 970], p16: [100, 14, 924, 970], p17: [72, 32, 952, 970],
  r13: [101, 12, 923, 970], r14: [129, 28, 895, 970], r15: [212, 26, 812, 970], r16: [68, 17, 956, 970], r17: [119, 46, 905, 970] };
// opaque share (alpha mean) of every Lv13-17 picture, for size rule v1.3 in renderer.js sprite(); recompute: python3 03_Sprites/_guides/building_size_table.py --fill (b/c/e/g only: the p/r rows are the solid body before the glass finish, printed by export_dreamcore.py)
export const FILL = { b13: 0.479, b14: 0.516, b15: 0.602, b16: 0.509, b17: 0.637,
  c13: 0.466, c14: 0.51, c15: 0.624, c16: 0.516, c17: 0.633,
  e13: 0.475, e14: 0.451, e15: 0.392, e16: 0.488, e17: 0.54,
  g13: 0.551, g14: 0.534, g15: 0.539, g16: 0.572, g17: 0.671,
  p13: 0.618, p14: 0.68, p15: 0.639, p16: 0.58, p17: 0.67,
  r13: 0.68, r14: 0.598, r15: 0.675, r16: 0.531, r17: 0.664 };
// island silhouette in the backgrounds (flat top + rock underside): bubbles pass behind it and cannot be tapped there
// all five skies are drawn on the exact board geometry (03_Sprites/_guides/guide_BG_island_v2.png: diamond 60..1020 x 760..1240), so no offset is needed
// silhouette traced from the day sky (rim + rock underside incl. the waterfall mist), world units
export const ISLAND = [540, 754, 1000, 956, 1056, 990, 1061, 1008, 1000, 1200, 900, 1330, 700, 1450, 548, 1495, 400, 1440, 190, 1330, 80, 1180, 14, 1010, 23, 981, 63, 952];
// island test for bubbles (hidden and untappable behind the island): reads assets/sky_mask.webp (alpha 0 = island, 540x960 for the 1080x1920 world),
// built by 03_Sprites/_guides/make_sky_mask.py; falls back to the coarse ISLAND polygon until the mask has loaded
let MASK_A = null;
function skyMaskData() {
  if (MASK_A || !IMG.skyMask) return MASK_A;
  const c = document.createElement('canvas'); c.width = IMG.skyMask.width; c.height = IMG.skyMask.height; const x = c.getContext('2d'); x.drawImage(IMG.skyMask, 0, 0);
  return MASK_A = { w: c.width, h: c.height, a: x.getImageData(0, 0, c.width, c.height).data };
}
export function islandAt(x, y) {
  const m = skyMaskData();
  if (m) { const i = Math.floor(x * m.w / 1080), j = Math.floor(y * m.h / 1920); return i < 0 || j < 0 || i >= m.w || j >= m.h ? false : m.a[(j * m.w + i) * 4 + 3] < 128; }
  let inside = false; for (let i = 0, j = ISLAND.length - 2; i < ISLAND.length; j = i, i += 2) { const xi = ISLAND[i], yi = ISLAND[i + 1], xj = ISLAND[j], yj = ISLAND[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside;
}
// board outline (outer tile corners) and the grout outlets where board water falls over the front edges
const BOARD = [540, 760, 1020, 1000, 540, 1240, 60, 1000];
export const FALLS = [[152, 1060], [284, 1120], [420, 1180], [660, 1180], [804, 1120], [928, 1060]];   // x of the 4 outer falls follows the painted waterfalls of the sky art (they sat 17-28 px inside before)

/* ---------- storage (optional) ---------- */
export const store = {
  get(k, d) { try { const v = localStorage.getItem('skybloom.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('skybloom.' + k, JSON.stringify(v)); } catch {} store.onSet?.(k); },   // onSet: sync.js listens for progress changes
  onSet: null,
};

/* ---------- state: G = rules (logic.js), U = view-only ---------- */
export let G = L.newState();
export const APP_V = '0.5.4';
/* ponytail: TEST BUILD ONLY. Once per device the wallet is raised to 100,000 gold so the shop can be tried; gold earned or spent afterwards counts as usual. Remove this (and use store.get('gold', 0)) before a public release. */
const testGold = () => { if (store.get('testGold1', false)) return store.get('gold', 0); const g = Math.max(100000, store.get('gold', 0)); store.set('testGold1', true); store.set('gold', g); return g; };
export const U = {
  gameT0: performance.now(), playMs: 0, mode: 'normal', screen: 'login', best: store.get('best', 0), bestSpeed: store.get('bestSpeed', 0),
  discovered: new Set(store.get('discovered', [])),
  treasures: store.get('treasures', {}),          // id -> { n, first }
  gold: testGold(),    // v0.4 §5.1 wallet (this device)
  menuGoldAt: store.get('menuGoldAt', null),   // 10-2 A1: when the last menu gold bubble was popped (first run: the hour counts from now)
  // iOS only grants motion access from a tap, so there Tilt starts off and the first switch-on asks for permission
  settings: Object.assign({ music: false, sfx: true, vib: true, hints: true, tilt: typeof window.DeviceOrientationEvent?.requestPermission !== 'function', reduce: false, ambient: true, cont: false }, store.get('settings', {})),
  sel: null, drag: null, target: null, anim: null, drop: null, pops: {}, fx: [], floats: [], flies: [], shake: 0, shakeAmp: 0, nope: null,
  celebQueue: [], toldNoPair: false, phaseTop: 0, phaseW: [1, 0, 0], bubbles: [], nextBubble: 0, tilt: { x: 0, y: 0, tx: 0, ty: 0, src: 'none', at: 0 },
};
// per-skin collection (10-18): building set id (shop ids: classic, candy, ...) -> levels first built while that set was equipped.
// U.discovered stays the levels built in any set (first-build gold is paid once per level). Before 10-18 unlocks were shared by level: those move to Classic.
U.discBy = Object.fromEntries(Object.entries(store.get('discoveredBy', null) || { classic: [...U.discovered] }).map(([k, v]) => [k, new Set(v)]));
export const saveDiscBy = () => store.set('discoveredBy', Object.fromEntries(Object.entries(U.discBy).map(([k, v]) => [k, [...v]])));
if (store.get('discoveredBy', null) == null) saveDiscBy();
export const bsetId = () => U.bset || 'classic';
export const hasBuilt = (set, lv) => !!U.discBy[set || 'classic']?.has(lv);
if (U.menuGoldAt == null) { U.menuGoldAt = Date.now(); store.set('menuGoldAt', U.menuGoldAt); }
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && store.get('settings', null) == null) U.settings.reduce = true;
export const reduce = () => U.settings.reduce;
export const ambient = () => U.settings.ambient && !U.settings.reduce;   // background objects (clouds, aurora, sun rays, stars, fireflies) move only while this is true; Reduce Motion forces it off

/* ---------- words (v0.5 §3.2): i18n/en.json, i18n/ko.json; building and treasure names stay English ---------- */
const I18N = { en: {}, ko: {} };
export const lang = () => U.settings.lang || ((navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en');
export const tl = (k, v = {}) => String(I18N[lang()][k] ?? I18N.en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
export const itemName = k => tl('item.' + k);
export function applyI18n() {
  document.documentElement.lang = lang();
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tl(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', tl(el.dataset.i18nAria)));
}

/* ---------- images ---------- */
export const IMG = {}, MASK = {};
const load = (k, src) => new Promise(res => { const i = new Image(); i.onload = () => { IMG[k] = i; res(); }; i.onerror = () => { window.__tmAsset?.(src); res(); }; i.src = av(src); });
const ASSETS = { logo: 'logo', bg: 'sky_day_0', bg1: 'sky_day_1', bg2: 'sky_day_2',   // the default skin's Day / Sunset / Night skies (the other skins load theirs in shop.js applySkins)
  tile: 'tile', skyMask: 'sky_mask', cloudAtlas: 'cloud_atlas2',   // the file name changes with every new atlas layout: a phone with the old atlas cached must never pair it with new frame coordinates
  cloudNear: 'cloud_near', auroraV: 'aurora_veil', auroraC: 'aurora_curtain', auroraR: 'aurora_ribbon',
  caustic: 'water_caustic', flow: 'water_flow', bubble: 'bubble', bubbleRim: 'bubble_rim', body: 'windmill_body', sails: 'windmill_sails', item1: 'item1', item2: 'item2', item3: 'item3' };
export const loading = Object.entries(ASSETS).map(([k, f]) => load(k, `assets/${f}.webp`));
for (let lv = 1; lv <= 17; lv++) loading.push(load('b' + lv, artSrc(lv)));
for (let i = 1; i <= TREASURES.length; i++) loading.push(load('acc' + i, accSrc(i)));
export let MOTION = {}, MOTION_E = {}, MOTION_A = {}, MOTION_P = {}, MOTION_R = {};   // + Pastel Poolhouse / Reverie Village maps (00_Spec/Dreamcore_Motion_Plan_v1.md)   // Classic / Candy map, and the Eco Campus map (its art has other shapes, so it has its own coordinates)
for (const lg of ['en', 'ko']) loading.push(fetch(`i18n/${lg}.json?v=0.7.65`).then(r => r.json()).then(j => { I18N[lg] = j; }).catch(() => {}));
loading.push(fetch('motion_map.json').then(r => r.json()).then(j => { MOTION = j.buildings || {}; window.__motionDoc = j; }).catch(() => { /* no building motion */ }));
loading.push(fetch(av('motion_map_eco.json')).then(r => r.json()).then(j => { MOTION_E = j.buildings || {}; }).catch(() => { /* Eco keeps only its overlay effects */ }));
loading.push(fetch(av('motion_map_aqua.json')).then(r => r.json()).then(j => { MOTION_A = j.buildings || {}; }).catch(() => { /* Aqua keeps only its overlay effects */ }));
loading.push(fetch(av('motion_map_poolhouse.json')).then(r => r.json()).then(j => { MOTION_P = j.buildings || {}; }).catch(() => { /* no map: still pictures */ }));
loading.push(fetch(av('motion_map_reverie.json')).then(r => r.json()).then(j => { MOTION_R = j.buildings || {}; }).catch(() => { /* no map: still pictures */ }));

function trimCanvas(im) {   // crop transparent margins (windmill body is exported on its full canvas)
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const a = x.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (a[(y * c.width + xx) * 4 + 3] > 40) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, -x0, -y0); return o;
}
export function prepareImages() {
  if (IMG.body && IMG.sails) IMG.b6 = trimCanvas(IMG.body);   // Lv6 = sail-less body + a spinning sails layer
  for (let lv = 1; lv <= 17; lv++) maskOf('b' + lv);
}
function maskOf(k) {   // alpha mask so taps hit what is actually drawn, not the transparent box
  const im = IMG[k]; if (!im || MASK[k]) return;
  try { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    MASK[k] = { w: im.width, h: im.height, a: x.getImageData(0, 0, im.width, im.height).data }; } catch { /* box hit fallback */ }
}
const loadSet = {};   // skins load the first time they are previewed or equipped
export function loadSkinArt(keys) {
  return Promise.all(keys.map(([k, src]) => IMG[k] ? null : loadSet[k] || (loadSet[k] = load(k, src).then(() => maskOf(k))))).then(() => {
    if (IMG.body_c && !IMG.c6) { IMG.c6 = IMG.body_c; maskOf('c6'); }   // Candy Lv6 = sail-less body + the spinning sails (like Classic): c6 only exists once the body is here, so it is never drawn half-built
    for (const k of ['e12', 'e13', 'g1', 'g14']) if (IMG[k + '_body'] && IMG[k] && !IMG[k + '_full']) { IMG[k + '_full'] = IMG[k]; IMG[k] = IMG[k + '_body']; }   // the building without its moving part (train, rotors, fish, cars) replaces the full picture; the full one stays as the source to cut parts from   // Eco Lv12 / Lv13: the building without its train / rotors replaces the full picture; the full one stays as the source to cut the train from
  });
}


/* setters for state that other modules assign */
export function set_G(v) { G = v; }
export function set_NAMES(v) { NAMES = v; }

