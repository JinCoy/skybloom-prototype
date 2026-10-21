/* Skybloom module: rewarded ads, one entry point for every placement (stuck refill, result 2x gold).
   Web / prototype: the labelled placeholder countdown (#ov-ad), never a real or imitation ad.
   App (Capacitor step 3-5): AdMob replaces the body of showRewarded(); callers only see 'done' (reward it) or 'cancel'. */
import { $, tl } from './core.js?v=0.7.60';
import { overlay } from './ui.js?v=0.7.60';

let timer = 0, settle = null;
/** placement: 'stuck_window' | 'result_double'; reward: the line shown when the placeholder finishes. Resolves 'done' or 'cancel'. */
export function showRewarded(placement, reward) {
  if (settle) return Promise.resolve('cancel');   // one ad at a time
  return new Promise(res => {
    settle = r => { clearInterval(timer); settle = null; overlay('ad', false); res(r); };
    $('ad-refill').hidden = true; $('ad-done').textContent = reward; $('ad-done').hidden = true; overlay('ad');
    let n = 5; $('ad-count').textContent = n; clearInterval(timer);
    timer = setInterval(() => {
      n--; $('ad-count').textContent = Math.max(0, n); if (n > 0) return;
      clearInterval(timer); $('ad-done').hidden = false; setTimeout(() => settle && settle('done'), 700);   // reward only after the "ad" finished
    }, 1000);
  });
}
$('ad-cancel').onclick = () => settle && settle('cancel');
