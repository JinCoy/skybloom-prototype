/* Skybloom module: bubbles (split from index.html in step 12; code unchanged) */
import { $, G, ITEMS, L, TREASURES, U, WS, accSrc, islandAt, store, tl, toScreen, toWorld } from './core.js?v=0.7.31';
import { SFX, vib } from './audio.js?v=0.7.31';
import { bumpBadge, hud, itemXY, toast } from './ui.js?v=0.7.31';
import { addGold, gainTreasure, stamp, tutBubble, tutEnd } from './game.js?v=0.7.31';
import { addFxXY, floatText } from './fx.js?v=0.7.31';
import { ADD, R, genTextures, hsl, lerpColor, mix3, tex } from './renderer.js?v=0.7.31';
import * as TM from './telemetry.js?v=0.7.31';

/* ---------- bubbles (spec §4) ---------- */
const BC = L.CONFIG.bubbles;
export const inIsland = islandAt;   // alpha mask of the island (core.js)
// menus (10-2 A1): empty bubbles only, plus one gold bubble per hour (never two on screen); in a game the rules live in logic.js
export const rollFor = () => {
  if (U.screen === 'game') return L.rollBubble(Math.random, G);
  const m = L.menuBubble(Date.now(), U.menuGoldAt);
  return m.kind === 'gold' && U.bubbles.some(b => b.content && b.content.kind === 'gold') ? { kind: 'empty' } : m;
};
const BUBBLE_TINT = { item: 0x5fe08a, treasure: 0xffa3d6, gold: 0xffe07a };   // green / pink / yellow, clear = empty
export function spawnBubble(content = null, at = null) {
  const side = Math.random(), r = 58 + Math.random() * 10, b = { r, ph: Math.random() * 6, amp: 20 + Math.random() * 20, vy: -(40 + Math.random() * 30), t: 0 };
  const [x0, y0] = toWorld([0, 0]), [x1, y1] = toWorld([1080, 1920]);   // screen edges in world units
  if (side < .35) Object.assign(b, { x: x0 - r, y: 1000 + Math.random() * (y1 - 1000), vx: 30 + Math.random() * 30 });
  else if (side < .7) Object.assign(b, { x: x1 + r, y: 1000 + Math.random() * (y1 - 1000), vx: -(30 + Math.random() * 30) });
  else Object.assign(b, { x: x0 + 70 + Math.random() * (x1 - x0 - 140), y: y1 + r, vx: (Math.random() - .5) * 20 });
  if (at) Object.assign(b, { x: at[0], y: at[1], vx: (Math.random() - .5) * 30, vy: -(25 + Math.random() * 25) });   // shop preview: appears in view at once
  b.content = content || rollFor(b);
  if (U.screen === 'game' && !U.tut && G.log) { stamp(); L.record(G, { a: 'bspawn', kind: b.content.kind }); }
  const c = new PIXI.Container(), shell = new PIXI.Sprite(tex('bubble')), glow = new PIXI.Sprite(tex('bubble')), sk = new PIXI.Sprite(PIXI.Texture.EMPTY);
  shell.anchor.set(.5); glow.anchor.set(.5); sk.anchor.set(.5); sk.visible = false; glow.blendMode = ADD(); glow.alpha = 0; shell.width = shell.height = glow.width = glow.height = r * 2;
  const icon = new PIXI.Sprite(PIXI.Texture.EMPTY); icon.anchor.set(.5); c.addChild(icon, sk, shell, glow);   // skin first, the old bubble's rim (shell) on top of it
  Object.assign(b, { c, shell, glow, icon, sk }); setIcon(b);
  R.bubbleLayer.addChild(c); U.bubbles.push(b);
}
export function setIcon(b) {
  const k = b.content.kind, t = k === 'item' ? tex('item' + (ITEMS.findIndex(i => i[0] === b.content.item) + 1)) : k === 'treasure' ? tex('acc' + b.content.id) : k === 'gold' ? genTextures().coin : PIXI.Texture.EMPTY;
  b.color = BUBBLE_TINT[k] || null;
  b.icon.texture = t; if (t !== PIXI.Texture.EMPTY) b.icon.scale.set(b.r * 1.05 / Math.max(t.width, t.height));
  b.icon.tint = k === 'treasure' && !U.treasures[b.content.id] ? 0x2a4c80 : 0xffffff;    // unknown treasure shows as a silhouette
  b.icon.alpha = k === 'treasure' && !U.treasures[b.content.id] ? .55 : .95;
}
export function updateBubbles(dt, now, still) {
  if (U.tut === 3 && U.tutBubble && U.tutBubble.sx != null) {   // 10-2b: the guide box fades when the tutorial bubble drifts behind it
    const [bx, by] = toScreen([U.tutBubble.sx, U.tutBubble.y]), r = U.tutBubble.r * WS;
    $('coach').style.opacity = bx + r > 140 && bx - r < 940 && by + r > 410 && by - r < 530 ? .3 : '';
  } else if ($('coach').style.opacity) $('coach').style.opacity = '';
  const shopOpen = !$('ov-shop').hidden, k15 = shopOpen ? 1.5 : 1;   // shop open: 1.5x as many bubbles drift by, so a skin can be judged at a glance
  const max = Math.ceil((U.perf ? BC.max : still ? BC.maxReduced : BC.max) * k15);
  if (!U.nextBubble) U.nextBubble = now + 1500;
  if (U.tut && U.screen === 'game') { if (U.tut === 3 && !U.bubbles.includes(U.tutBubble)) tutBubble(); }   // tutorial: only its own bubble
  else if ((now >= U.nextBubble || U.perf) && U.bubbles.length < max) { spawnBubble(); U.nextBubble = now + (BC.everySec[0] + Math.random() * (BC.everySec[1] - BC.everySec[0])) * 1000 / k15; }
  const T = U.tilt, w = U.phaseW, tint = mix3(w, 0xffffff, 0xffd8bc, 0xc8d6ff);
  for (const b of [...U.bubbles]) {
    b.t += dt; b.x += (b.vx + T.x * 110) * dt; b.vx *= Math.pow(.92, dt); b.y += (b.vy + T.y * 45) * dt;   // v0.4: tilt pushes harder
    if (Math.hypot(T.x, T.y) > .35) for (const o of U.bubbles) if (o !== b) {   // jostle apart when the garden is tipped
      const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1, min = b.r + o.r; if (d < min) { b.x += dx / d * (min - d) * .5; b.y += dy / d * (min - d) * .5; } }
    const sway = still ? 0 : Math.sin(b.t * 1.3 + b.ph) * b.amp;
    b.sx = b.x + sway; b.c.position.set(b.sx, b.y);
    // skin art (empty AND coloured bubbles): the skin sprite `sk` sits on top; a coloured bubble (item / treasure / gold) also keeps its clear shell + glow underneath as the coloured aura
    const skinTex = U.skinBubbleArt ? tex(U.skinBubbleArt) : null, wob = still ? 0 : Math.sin(b.t * 2.2 + b.ph) * (U.skinWob ?? .025);
    const sx = b.r * 2 / b.shell.texture.width * (1 + wob), sy = b.r * 2 / b.shell.texture.width * (1 - wob), aura = skinTex && b.color;
    // skin art + coloured bubble (item / treasure / gold): same size; only the old bubble's RIM (bubble_rim) is laid over the skin in the item colour, half transparent
    const shellTex = skinTex ? (b.color ? tex('bubbleRim') : null) : tex('bubble'); b.shell.visible = !!shellTex; if (shellTex && b.shell.texture !== shellTex) b.shell.texture = shellTex;
    b.shell.scale.set(sx, sy); b.shell.alpha = skinTex ? .7 : 1;
    b.sk.visible = !!skinTex; if (skinTex) { if (b.sk.texture !== skinTex) b.sk.texture = skinTex; b.sk.scale.set(sx, sy); }
    const spin = U.skinCycle && !still ? hsl((now / 40 + b.ph * 60) % 360, .45, .88) : null;
    b.sk.tint = spin ? lerpColor(spin, tint, .25) : tint;
    b.shell.tint = b.color ? lerpColor(b.color, tint, .25) : U.skinBubble ? lerpColor(U.skinBubble, tint, .25) : tint;
    b.glow.scale.set(b.r * 2 / b.glow.texture.width);
    b.glow.tint = b.color || 0xffffff; b.glow.alpha = Math.max(w[2] * .5, b.color ? (aura ? .2 : .3) : 0);   // coloured bubbles glow a little so the colour reads
    if (b.y < toWorld([0, 0])[1] - 160 || b.sx < -260 || b.sx > 1340) removeBubble(b);
  }
}
function removeBubble(b) { U.bubbles = U.bubbles.filter(x => x !== b); b.c.destroy({ children: true }); }
export function bubbleAt(x, y) {
  const tb = U.tutBubble; if (tb && Math.hypot(x - tb.sx, y - tb.y) < tb.r) return tb;   // the tutorial bubble can be popped anywhere, even over the island
  // forgiving taps: the nearest bubble within 1.7 x its radius (at least 110) is popped, also next to the screen edge and behind the island or buildings (input.js already lets a building under the finger win)
  let best = null, bd = 1e9;
  for (const b of U.bubbles) { const d = Math.hypot(x - b.sx, y - b.y) / Math.max(b.r * 1.7, 110); if (d < 1 && d < bd) { best = b; bd = d; } }
  return best;
}
const SHOP_BTN = [215, 1425];   // centre of the Shop button on the main screen
export function popBubbleAt(b) {
  TM.bubbleTap(b);   // play log: tell the recorder this bubble was tapped, not missed
  const iconTex = b.icon.texture, iconScale = b.icon.scale.x;   // read before the bubble is destroyed
  removeBubble(b); addFxXY('bubble', b.sx, b.y + 30); SFX.bubble(); vib(10);
  const inGame = U.screen === 'game', c = b.content;
  const fly = (to, done) => { const s = new PIXI.Sprite(iconTex); s.anchor.set(.5); s.scale.set(iconScale); s.position.set(b.sx, b.y); R.fxTop.addChild(s); U.flies.push({ s, from: [b.sx, b.y], to: toWorld(to), t0: performance.now(), done }); };
  if (!inGame) {   // login / main: empty bubbles, and the hourly gold one (it flies to the Shop button on the main screen)
    if (c.kind === 'gold' && L.menuBubble(Date.now(), U.menuGoldAt).kind === 'gold') {
      U.menuGoldAt = Date.now(); store.set('menuGoldAt', U.menuGoldAt); floatText(`+${c.amount}`, b.sx, b.y - 20, true);
      if (U.screen === 'main') fly(SHOP_BTN, () => { addGold(c.amount, 'menu_gold'); const sb = $('main-shop'); sb.classList.remove('bump'); void sb.offsetWidth; sb.classList.add('bump'); });
      else addGold(c.amount, 'menu_gold');
    }
    return;
  }
  if (b === U.tutBubble) tutEnd(true);
  const dup = c.kind === 'treasure' ? gainTreasure(c.id) : false; stamp(); const e = L.popBubble(G, c, dup);
  if (e.kind === 'treasure') { toast(dup ? tl('t.dup', { n: e.gold }) : tl('t.newTreasure', { name: TREASURES[c.id - 1][0], rarity: tl('rarity.' + c.rarity) }), 2400, accSrc(c.id)); if (dup) addGold(e.gold, 'dup_treasure_gold'); else SFX.gift(); }
  else if (e.item) fly(itemXY(e.item), () => bumpBadge(e.item));                 // icon flies to its item button
  else if (e.kind === 'gold') { fly([936, 302], () => addGold(e.gold, 'bubble')); floatText(`+${e.gold}`, b.sx, b.y - 20, true); }
  hud();
}


