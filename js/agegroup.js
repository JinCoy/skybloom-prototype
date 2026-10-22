/* Skybloom module: agegroup — the pure age-group rules (no DOM, so node can test them: agegroup.test.js). Imports nothing.
   Groups: 'u14' (under 14), 'm14' (14-17), 'a18' (18+). One rule for every store country, the strictest common one
   (00_Spec/Global_Rollout_Plan_v1.md §0, Age_Gate_14_18_Design_v1.md): under 14 = child mode (Korea, Quebec);
   under 18 = no personalised ads, no consent / tracking prompt, no play log or survey (India counts everyone under 18 as a child). */
export const GROUPS = ['u14', 'm14', 'a18'];

/** A stored answer -> its group now, or null = ask (again). Older builds stored 'u13' (under 13: still a child, so under 14),
    't13' (13-17) and '13p' (13+): those may be 13, so they are asked once more. */
export const normalize = v => GROUPS.includes(v) ? v : v === 'u13' ? 'u14' : null;

export const isChild = g => g !== 'm14' && g !== 'a18';   // not answered yet counts as a child
export const isAdult = g => g === 'a18';

/** AdMob request settings for a group: child-directed for children, under-age-of-consent for everyone under 18. */
export const adTags = g => ({
  tagForChildDirectedTreatment: isChild(g),
  tagForUnderAgeOfConsent: !isAdult(g),
  maxAdContentRating: isChild(g) ? 'General' : isAdult(g) ? 'Teen' : 'ParentalGuidance',
});
