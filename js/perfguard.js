import { $, U, ambient, store, tl } from './core.js?v=0.7.27';
import { toast } from './ui.js?v=0.7.27';
import * as TM from './telemetry.js?v=0.7.27';
import { createDecider } from './perfdecide.js?v=0.7.27';

/* ======================================================================
   PERF GUARD: background motion is the first thing to go on a slow phone. When perfdecide says the game is too slow,
   the "Background Motion" setting is turned off and saved, and the player is told how to turn it back on.
   Hidden tabs reset the measurement; ?noperf disables the guard (QA, headless browsers).
   ====================================================================== */
const QA = location.search.includes('noperf'), D = createDecider();
export function perfGuard(ms) {
  if (QA || !D.step(ms, ambient() && document.visibilityState === 'visible')) return;
  const was = U.settings.ambient; U.settings.ambient = false; store.set('settings', U.settings); TM.setting('ambient', was, false);
  $('set-ambient')?.setAttribute('aria-checked', 'false');
  toast(tl('perf.calm'), 4200);
}
