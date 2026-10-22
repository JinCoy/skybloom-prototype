/* Skybloom module: rewarded ads, one entry point for every placement (stuck refill, result 2x gold).
   Web / prototype: the labelled placeholder countdown (#ov-ad), never a real or imitation ad.
   App (Capacitor, step 3-5): Google AdMob through @capacitor-community/admob (native plugin, reached via the Capacitor bridge: no bundler here).
   Callers only see 'done' (give the reward) or 'cancel' (no reward: closed early, no fill or an error). */
import { $, tl } from './core.js?v=0.7.67';
import { overlay, toast } from './ui.js?v=0.7.67';
import { AC } from './audio.js?v=0.7.67';
import { adult, bracket } from './age.js?v=0.7.67';
import { adTags } from './agegroup.js?v=0.7.67';

const cap = window.Capacitor, AdMob = cap?.isNativePlatform?.() ? (cap.Plugins?.AdMob || cap.registerPlugin?.('AdMob')) : null;
/* Rewarded ad units. These are Google's public TEST units (always fill, never pay): replace with the real units from the AdMob console before release. */
const REWARDED = { ios: 'ca-app-pub-3940256099942544/1712485313', android: 'ca-app-pub-3940256099942544/5224354917' };

let started = null;
function startAdMob() {   // once per launch. 18+: privacy consent (UMP) -> iOS tracking prompt -> SDK. Under 18 or unanswered: no consent / tracking message at all
  return started || (started = (async () => {   // (UMP still showed its tracking explainer with tagForUnderAgeOfConsent on the iOS simulator), only child / under-age tagged, non-personalised requests
    const b = bracket();   // unanswered counts as a child (agegroup.js)
    if (adult()) {
      let c = await AdMob.requestConsentInfo();
      if (c.isConsentFormAvailable && c.status === 'REQUIRED') c = await AdMob.showConsentForm();
      if (!c.canRequestAds) return false;
      if (cap.getPlatform() === 'ios') try { await AdMob.requestTrackingAuthorization(); } catch {}
    }
    await AdMob.initialize(adTags(b));   // under 14: child-directed + General; 14-17: under age of consent + ParentalGuidance; 18+: Teen
    return true;
  })().catch(() => { started = null; return false; }));
}
function nativeRewarded() {
  return new Promise(async res => {
    const hs = [], end = async r => { hs.forEach(h => h.remove()); AC?.resume?.(); if (r === 'fail') toast(tl('ad.unavailable'), 2400); res(r === 'done' ? 'done' : 'cancel'); };
    let earned = false, over = false; const fin = r => { if (!over) { over = true; end(r); } };
    try {
      if (!await startAdMob()) return fin('fail');
      hs.push(await AdMob.addListener('onRewardedVideoAdReward', () => { earned = true; }),
        await AdMob.addListener('onRewardedVideoAdDismissed', () => fin(earned ? 'done' : 'cancel')),
        await AdMob.addListener('onRewardedVideoAdFailedToShow', () => fin('fail')));
      AC?.suspend?.();   // the game's sound pauses under the ad
      await AdMob.prepareRewardVideoAd({ adId: REWARDED[cap.getPlatform()] || REWARDED.android });
      await AdMob.showRewardVideoAd();
    } catch { fin('fail'); }
  });
}

let timer = 0, settle = null;
/** placement: 'stuck_window' | 'result_double'; reward: the line the web placeholder shows when it finishes. Resolves 'done' or 'cancel'. */
export function showRewarded(placement, reward) {
  if (settle) return Promise.resolve('cancel');   // one ad at a time
  if (AdMob) { settle = () => {}; return nativeRewarded().finally(() => { settle = null; }); }
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
