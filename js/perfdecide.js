// Pure decision logic of the perf guard (no DOM, so node can test it): feed it frame times, it says when the game is too slow.
// After `warm` seconds it takes the median frame time of each `win`-second window; `need` slow windows in a row (median > maxMs) mean "slow".
export function createDecider({ warm = 6, win = 4, maxMs = 28, need = 2 } = {}) {
  let w = 0, t = 0, bad = 0, samples = [];
  const reset = () => { w = 0; t = 0; bad = 0; samples = []; };
  return {
    reset,
    step(ms, active = true) {
      if (!active) return reset(), false;
      w += ms / 1000; if (w < warm) return false;
      samples.push(ms); t += ms / 1000; if (t < win) return false;
      samples.sort((a, b) => a - b); const med = samples[samples.length >> 1]; samples = []; t = 0;   // median: one-off hitches (a merge, a screen change) do not count
      bad = med > maxMs ? bad + 1 : 0;
      return bad >= need && (reset(), true);
    },
  };
}
