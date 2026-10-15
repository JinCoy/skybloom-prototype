/* Skybloom rules v0.3 (spec 00_Spec/Skybloom_Spec_v0.3.md §1-2).
   Tap-merge: a building moves into an orthogonal neighbour of the same level and becomes Lv+1 there.
   Pure game state + actions, no DOM. Actions mutate the state and return an event for the UI. */
(function (root) {
  const CONFIG = {
    board: 4, maxLevel: 17,
    spawnLadder: { gap: 4, odds: [0.6, 0.3, 0.1] },     // next level = max(1, top - gap) + 0/1/2
    startItems: { rewind: 5, pop: 8, drop: 10 },
    // spec §4: bubbles float in from the left/right/bottom edges; contents are rolled when a bubble spawns
    // tuned with sim.js so start items 5/8/10 + bubbles give Lv12 reach 30-39% across play speeds (spec §1.1)
    bubbles: { everySec: [3, 8], max: 5, maxReduced: 2, odds: { item: 0.4, treasure: 0.2 }, maxItemsPerGame: 24,
               emptyScore: 50, dupScore: 200, rarity: { C: 0.7, R: 0.25, L: 0.05 } },
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
  function rollNext(top, rand = Math.random) {
    const [lo] = spawnRange(top), x = rand(); let acc = 0;
    for (let i = 0; i < CONFIG.spawnLadder.odds.length; i++) { acc += CONFIG.spawnLadder.odds[i]; if (x < acc) return Math.min(MAXL, lo + i); }
    return Math.min(MAXL, lo + CONFIG.spawnLadder.odds.length - 1);
  }
  const comboMult = combo => Math.min(CONFIG.combo.maxMult, 1 + CONFIG.combo.bonusPerStep * (combo - 1));
  const randItem = rand => ITEM_KEYS[Math.floor(rand() * ITEM_KEYS.length)];

  function newState(rand = Math.random, board = null) {
    const s = { board: board ? clone(board) : empty(), score: 0, items: { ...CONFIG.startItems }, combo: 0, top: 1, got: [], history: [], next: 1, bubbleItems: 0, stats: { merges: 0, places: 0 } };
    if (!board) for (let i = 0; i < 2; i++) { const e = empties(s.board); const [r, c] = e[Math.floor(rand() * e.length)]; s.board[r][c] = 1; }
    for (const row of s.board) for (const v of row) s.top = Math.max(s.top, v);
    s.next = rollNext(s.top, rand);
    return s;
  }
  const snap = s => ({ board: clone(s.board), score: s.score, items: { ...s.items }, combo: s.combo, top: s.top, got: s.got.slice(), next: s.next });
  function pushHistory(s) { s.history.push(snap(s)); if (s.history.length > CONFIG.historyLimit) s.history.shift(); }

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
    s.next = rollNext(s.top, rand);
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
    Object.assign(s, { board: h.board, score: h.score, items: { ...h.items, rewind: left }, combo: h.combo, top: h.top, got: h.got, next: h.next });
    return { ok: true, type: 'rewind' };
  }

  /** Contents of a new bubble. canItem=false outside a game (login/main) or once the per-game item cap is reached. */
  function rollBubble(rand = Math.random, canItem = true) {
    const o = CONFIG.bubbles.odds, x = rand();
    if (x < o.treasure) {
      const y = rand(), R = CONFIG.bubbles.rarity, tier = y < R.L ? 'L' : y < R.L + R.R ? 'R' : 'C';
      const ids = TREASURE_RARITY.map((t, i) => t === tier ? i + 1 : 0).filter(Boolean);
      return { kind: 'treasure', id: ids[Math.floor(rand() * ids.length)], rarity: tier };
    }
    if (x < o.treasure + o.item && canItem) return { kind: 'item', item: randItem(rand) };
    return { kind: 'empty' };
  }
  const bubbleCanItem = s => s.bubbleItems < CONFIG.bubbles.maxItemsPerGame;
  /** Apply a popped bubble to a game. Grants happen outside the action history, so Rewind never takes them back. */
  function popBubble(s, b, owned = false) {
    let item = null, gained = 0;
    if (b.kind === 'item' && bubbleCanItem(s)) item = b.item;
    else if (b.kind === 'treasure') gained = owned ? CONFIG.bubbles.dupScore : 0;
    else gained = CONFIG.bubbles.emptyScore;
    for (const t of [s, ...s.history]) { if (item) t.items[item]++; t.score += gained; }
    if (item) s.bubbleItems++;
    return { kind: item ? 'item' : b.kind === 'treasure' ? 'treasure' : 'empty', item, id: b.id, gained, dup: b.kind === 'treasure' && owned };
  }

  const api = { CONFIG, N, MAXL, ITEM_KEYS, TREASURE_RARITY, rollBubble, bubbleCanItem, popBubble, pts, empty, clone, empties, targets, canMerge, isStuck, spawnRange, rollNext, comboMult,
                newState, place, merge, pop, rewind };
  if (typeof module !== 'undefined') module.exports = api; else root.SkyLogic = api;
})(this);
