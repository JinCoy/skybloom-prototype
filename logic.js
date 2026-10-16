/* Skybloom rules v0.4 (00_Spec/Skybloom_Spec_v0.3.md §1-2, Skybloom_Spec_v0.4.md §3-5).
   Tap-merge: a building moves into an orthogonal neighbour of the same level and becomes Lv+1 there.
   Pure game state + actions, no DOM. Actions mutate the state and return an event for the UI. */
(function (root) {
  const CONFIG = {
    board: 4, maxLevel: 17,
    spawnLadder: { gap: 4, odds: [0.6, 0.3, 0.1] },     // next level = max(1, top - gap) + 0/1/2
    // v0.4 §4.2 spawn helpers (0 = off). pairAware: boost levels already on the board (little effect, off).
    // mercy: when 2 or fewer tiles are empty, boost levels that sit next to an empty tile (an instant merge is possible).
    // mercy 3 is on (spec v0.4 §4.1.1): Lv12 reach 42% -> 67% with ads, 6% -> 16% without.
    spawn: { pairAware: 0, mercy: 3 },
    startItems: { rewind: 3, pop: 5, drop: 6 },          // v0.4 §4.1: fewer, refilled by bubbles, ads and gold
    // v0.4 §3: bubbles every 5-10 s. Green item bubbles have a quota per level band of this game's best building,
    // and appear more often early in each band. Bubbles never give score; yellow ones give gold.
    bubbles: { everySec: [5, 10], max: 5, maxReduced: 2,
               bands: [[5, 5], [8, 4], [12, 3], [15, 2], [17, 1]],   // [highest level in band, item quota] = 15 per game
               odds: { item: 0.6, treasure: 0.2, gold: 0.15 },        // while the band still has items (item odds x share left)
               oddsNoItem: { treasure: 0.25, gold: 0.2 },             // once the band's items are gone
               goldAmount: [5, 15], menuGold: { everyMin: 60, amount: 10 }, goldCapPerGame: 100, dupTreasureGold: 10,
               rarity: { C: 0.7, R: 0.25, L: 0.05 } },
    ads: { refillPerItem: 2, maxPerGame: 5 },              // v0.4 §4.3: rewarded ad when no item can help any more
    gold: { endBase: 10, endPerLevel: 5, firstBuildPerLevel: 10 },
    combo: { bonusPerStep: 0.1, maxMult: 2.0, itemEvery: 5 },
    milestoneLevels: [5, 7, 9, 10, 12],
    phases: { sunsetAt: 12, nightAt: 15 },
    historyLimit: 30,
  };
  const N = CONFIG.board, MAXL = CONFIG.maxLevel;
  const ITEM_KEYS = ['rewind', 'pop', 'drop'];
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // spec §4.3 treasure ids 1-12 -> rarity
  const TREASURE_RARITY = ['C', 'C', 'C', 'C', 'C', 'C', 'R', 'R', 'R', 'R', 'L', 'L'];

  const pts = lv => 100 * 2 ** lv;
  const empty = () => Array.from({ length: N }, () => Array(N).fill(0));
  const clone = b => b.map(r => r.slice());
  const empties = b => { const e = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!b[r][c]) e.push([r, c]); return e; };
  const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  /** Orthogonal neighbours holding the same level as (r,c). */
  function targets(b, r, c) {
    const lv = b[r][c]; if (!lv) return [];
    return D4.map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => inside(rr, cc) && b[rr][cc] === lv);
  }
  function canMerge(b) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (targets(b, r, c).length) return true;
    return false;
  }
  const isStuck = b => empties(b).length === 0 && !canMerge(b);

  /** Spawn ladder: lowest spawn follows the highest level reached this game. */
  function spawnRange(top) {
    const lo = Math.max(1, top - CONFIG.spawnLadder.gap);
    return [lo, Math.min(MAXL, lo + CONFIG.spawnLadder.odds.length - 1)];
  }
  /** Next building. With a board, the optional pair-aware / mercy helpers re-weight the ladder's choices. */
  function rollNext(top, rand = Math.random, board = null) {
    const [lo] = spawnRange(top), sp = CONFIG.spawn;
    const lvs = CONFIG.spawnLadder.odds.map((_, i) => Math.min(MAXL, lo + i));
    const w = CONFIG.spawnLadder.odds.slice();
    if (board && (sp.pairAware || sp.mercy)) {
      const on = new Set(board.flat()), e = empties(board), nearEmpty = new Set();
      if (sp.mercy && e.length <= 2) for (const [r, c] of e) for (const [dr, dc] of D4) if (inside(r + dr, c + dc) && board[r + dr][c + dc]) nearEmpty.add(board[r + dr][c + dc]);
      lvs.forEach((lv, i) => { if (on.has(lv)) w[i] *= 1 + sp.pairAware; if (nearEmpty.has(lv)) w[i] *= 1 + sp.mercy; });
    }
    let x = rand() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return lvs[i]; }
    return lvs[lvs.length - 1];
  }
  const comboMult = combo => Math.min(CONFIG.combo.maxMult, 1 + CONFIG.combo.bonusPerStep * (combo - 1));
  const randItem = rand => ITEM_KEYS[Math.floor(rand() * ITEM_KEYS.length)];
  const bandOf = top => { const i = CONFIG.bubbles.bands.findIndex(([hi]) => top <= hi); return i < 0 ? CONFIG.bubbles.bands.length - 1 : i; };

  function newState(rand = Math.random, board = null) {
    const s = { board: board ? clone(board) : empty(), score: 0, items: { ...CONFIG.startItems }, combo: 0, top: 1, got: [], history: [], next: 1,
                bandLeft: CONFIG.bubbles.bands.map(b => b[1]), bubbleItems: 0, goldBubbles: 0, gold: 0, adsUsed: 0, acted: false,
                stats: { merges: 0, places: 0 } };
    if (!board) for (let i = 0; i < 2; i++) { const e = empties(s.board); const [r, c] = e[Math.floor(rand() * e.length)]; s.board[r][c] = 1; }
    for (const row of s.board) for (const v of row) s.top = Math.max(s.top, v);
    s.next = rollNext(s.top, rand, s.board);
    return s;
  }
  const snap = s => ({ board: clone(s.board), score: s.score, items: { ...s.items }, combo: s.combo, top: s.top, got: s.got.slice(), next: s.next });
  function pushHistory(s) { s.history.push(snap(s)); if (s.history.length > CONFIG.historyLimit) s.history.shift(); s.acted = true; }

  /** Place the next building: random empty tile, or `at` when using Cloud Drop. */
  function place(s, rand = Math.random, at = null) {
    const e = empties(s.board);
    if (!e.length) return { ok: false, reason: 'full' };
    if (at) {
      if (s.items.drop <= 0) return { ok: false, reason: 'no-item' };
      if (s.board[at[0]][at[1]]) return { ok: false, reason: 'occupied' };
    }
    pushHistory(s);
    const [r, c] = at || e[Math.floor(rand() * e.length)];
    if (at) s.items.drop--;
    const lv = s.next;
    s.board[r][c] = lv; s.score += pts(lv); s.combo = 0; s.top = Math.max(s.top, lv); s.stats.places++;
    s.next = rollNext(s.top, rand, s.board);
    return { ok: true, type: 'place', at: [r, c], lv, viaDrop: !!at };
  }

  /** Move `from` into orthogonal neighbour `to` of the same level; result appears at `to`. */
  function merge(s, from, to, rand = Math.random) {
    const [fr, fc] = from, [tr, tc] = to, b = s.board, lv = b[fr][fc];
    if (!lv || !targets(b, fr, fc).some(([r, c]) => r === tr && c === tc)) return { ok: false, reason: 'not-adjacent-same' };
    pushHistory(s);
    s.combo++; s.stats.merges++;
    const mult = comboMult(s.combo), grants = [];
    const bloom = lv === MAXL;
    const result = bloom ? 0 : lv + 1;
    b[fr][fc] = 0; b[tr][tc] = result;
    const gained = Math.round(pts(bloom ? MAXL + 1 : result) * mult);
    s.score += gained;
    if (bloom) grants.push({ item: randItem(rand), why: 'bloom' });
    else {
      s.top = Math.max(s.top, result);
      if (CONFIG.milestoneLevels.includes(result) && !s.got.includes(result)) { s.got.push(result); grants.push({ item: randItem(rand), why: 'milestone', level: result }); }
    }
    if (s.combo % CONFIG.combo.itemEvery === 0) grants.push({ item: randItem(rand), why: 'combo', combo: s.combo });
    for (const g of grants) s.items[g.item]++;
    return { ok: true, type: 'merge', from, to, lv: result, from_lv: lv, bloom, gained, combo: s.combo, mult, grants };
  }

  function pop(s, at) {
    const [r, c] = at;
    if (s.items.pop <= 0) return { ok: false, reason: 'no-item' };
    if (!s.board[r][c]) return { ok: false, reason: 'empty' };
    pushHistory(s);
    const lv = s.board[r][c]; s.board[r][c] = 0; s.items.pop--;
    return { ok: true, type: 'pop', at, lv };
  }

  /** Undo the last action. Everything returns to the snapshot except the Rewind count, which drops by one. */
  function rewind(s) {
    if (s.items.rewind <= 0) return { ok: false, reason: 'no-item' };
    if (!s.history.length) return { ok: false, reason: 'nothing' };
    const left = s.items.rewind - 1, h = s.history.pop();
    Object.assign(s, { board: h.board, score: h.score, items: { ...h.items, rewind: left }, combo: h.combo, top: h.top, got: h.got, next: h.next, acted: true });
    return { ok: true, type: 'rewind' };
  }

  /* ---------- bubbles (v0.4 §3) ---------- */
  function rollTreasure(rand) {
    const y = rand(), R = CONFIG.bubbles.rarity, tier = y < R.L ? 'L' : y < R.L + R.R ? 'R' : 'C';
    const ids = TREASURE_RARITY.map((t, i) => t === tier ? i + 1 : 0).filter(Boolean);
    return { kind: 'treasure', id: ids[Math.floor(rand() * ids.length)], rarity: tier };
  }
  /** Contents of a new bubble: item (green) / treasure (pink) / gold (yellow) / empty (clear).
      s = the running game, or null on the login/main screens (no items there).
      acted = the player did something since the last reward bubble; otherwise only empty bubbles appear (no idle farming). */
  function rollBubble(rand = Math.random, s = null, acted = s ? s.acted : true) {
    if (!acted) return { kind: 'empty' };
    const B = CONFIG.bubbles, band = s ? bandOf(s.top) : -1, left = s ? s.bandLeft[band] : 0;
    const pItem = left > 0 ? B.odds.item * left / B.bands[band][1] : 0;
    const o = left > 0 ? B.odds : B.oddsNoItem, x = rand();
    if (x < pItem) return { kind: 'item', item: randItem(rand) };
    if (x < pItem + o.treasure) return rollTreasure(rand);
    if (x < pItem + o.treasure + o.gold && (!s || s.goldBubbles < B.goldCapPerGame)) {
      const [a, b] = B.goldAmount; return { kind: 'gold', amount: a + Math.floor(rand() * (b - a + 1)) };
    }
    return { kind: 'empty' };
  }
  /** Login/main screens (10-2 A1): only empty bubbles, except one gold bubble once 60+ minutes passed since the last menu gold.
      No stacking: it is a yes/no on the elapsed time. lastGoldAt = ms timestamp, or null before the first run (caller sets it to now). */
  function menuBubble(now, lastGoldAt) {
    const M = CONFIG.bubbles.menuGold;
    return lastGoldAt != null && now - lastGoldAt >= M.everyMin * 60000 ? { kind: 'gold', amount: M.amount } : { kind: 'empty' };
  }
  const isReward = b => b.kind !== 'empty';
  /** Apply a popped bubble to a game. Grants happen outside the action history, so Rewind never takes them back.
      An item bubble whose band quota was used up meanwhile turns empty; gold stops at the per-game cap. */
  function popBubble(s, b, owned = false) {
    const B = CONFIG.bubbles; let item = null, gold = 0, kind = b.kind;
    if (kind === 'item') { const band = bandOf(s.top); if (s.bandLeft[band] > 0) { s.bandLeft[band]--; item = b.item; } else kind = 'empty'; }
    else if (kind === 'treasure') gold = owned ? B.dupTreasureGold : 0;
    else if (kind === 'gold') { gold = Math.max(0, Math.min(b.amount, B.goldCapPerGame - s.goldBubbles)); s.goldBubbles += gold; if (!gold) kind = 'empty'; }
    if (item) { for (const t of [s, ...s.history]) t.items[item]++; s.bubbleItems++; }
    s.gold += gold;
    if (kind !== 'empty') s.acted = false;   // the next reward waits for another board action
    return { kind, item, id: b.id, rarity: b.rarity, gold, dup: kind === 'treasure' && owned };
  }
  const bubbleCanItem = s => s.bandLeft[bandOf(s.top)] > 0;

  /* ---------- rewarded-ad refill (v0.4 §4.3) and gold (§5.1) ---------- */
  /** No item can help any more: none left, or the only ones left are useless now (Cloud Drop on a full board, Rewind with nothing to undo). */
  const outOfItems = s => !(s.items.pop > 0 || (s.items.rewind > 0 && s.history.length > 0) || (s.items.drop > 0 && empties(s.board).length > 0));
  const canAdRefill = s => outOfItems(s) && s.adsUsed < CONFIG.ads.maxPerGame;
  /** Call only after the ad finished. Like bubble grants, the refill survives Rewind. */
  function adRefill(s) {
    if (!outOfItems(s)) return { ok: false, reason: 'has-items' };
    if (s.adsUsed >= CONFIG.ads.maxPerGame) return { ok: false, reason: 'limit' };
    for (const t of [s, ...s.history]) for (const k of ITEM_KEYS) t.items[k] += CONFIG.ads.refillPerItem;
    s.adsUsed++;
    return { ok: true, each: CONFIG.ads.refillPerItem, left: CONFIG.ads.maxPerGame - s.adsUsed };
  }
  const endGold = s => CONFIG.gold.endBase + s.top * CONFIG.gold.endPerLevel;
  const firstBuildGold = lv => lv * CONFIG.gold.firstBuildPerLevel;

  const api = { CONFIG, N, MAXL, ITEM_KEYS, TREASURE_RARITY, rollBubble, isReward, bubbleCanItem, popBubble, bandOf,
                outOfItems, canAdRefill, adRefill, menuBubble, endGold, firstBuildGold, pts, empty, clone, empties, targets, canMerge, isStuck,
                spawnRange, rollNext, comboMult, newState, place, merge, pop, rewind };
  if (typeof module !== 'undefined') module.exports = api; else root.SkyLogic = api;
})(this);
