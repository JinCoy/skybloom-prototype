/* Canonical state hash (telemetry contract v2, definitions.state_hash). Same string + FNV-1a on every platform; Unity must build the same string.
   Loaded by index.html (window.SkyHash) and by node (analyze_playtests.js, make_sample_v2.js). */
(function (root) {
  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const stateString = s => `b:${s.board.flat().join(',')}|s:${s.score}|n:${s.next}|c:${s.combo}|t:${s.top}|i:${s.items.rewind},${s.items.pop},${s.items.drop}|r:${s.rs}|g:${s.got.join(',')}|q:${s.bandLeft.join(',')}|a:${s.adsUsed}`;
  const api = { fnv, stateString, stateHash: s => fnv(stateString(s)) };
  if (typeof module !== 'undefined') module.exports = api; else root.SkyHash = api;
})(this);
