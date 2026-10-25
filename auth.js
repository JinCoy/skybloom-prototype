/* Skybloom sign-in interface (spec v0.4 §6.1, step 12). Callers see the same three calls as before:
   - signIn('guest' | 'google' | 'apple') -> Promise<{ id, provider, name?, local? }>
   - signOut(), currentUser()  (currentUser() is synchronous: the last session is kept in localStorage)
   Server mode (firebase-config.js present, an authorised domain, not the app build): Firebase Auth from the pinned CDN SDK.
     guest = anonymous sign-in; Google (and later Apple) is LINKED to the guest's uid, so the account keeps the same id and data.
     A Google account that already belongs to another uid asks "merge?" (SkyAuth.ask, set by the game UI) and then signs in to it.
     Popups only: the SDK is loaded as soon as the page opens, so the popup opens inside the tap (a popup opened after a download is blocked,
     Safari first). No redirect fallback: signInWithRedirect breaks on browsers that partition storage, because the sign-in helper is on
     firebaseapp.com, not our domain ("missing initial state"). A blocked popup rejects { code: 'popup-blocked' } and the game asks to allow it.
   In the app (Capacitor) Google uses the NATIVE sign-in sheet (@capacitor-firebase/authentication, skipNativeAuth): its Google ID token
     goes into the same Firebase JS SDK flow (link to the guest / switch on clash), because Google blocks its sign-in pages inside app WebViews.
   Device mode (anywhere else, or offline): a random guest id kept on this device; Google / Apple reject with { code: 'not-configured' }.
   Extra hooks for the game: onChange(fn) (session changes), fb() (the loaded Firebase app, for sync.js), ask(title, body, yes) (UI). */
(function (root) {
  const KEY = 'skybloom.session', GID = 'skybloom.guestId', V = '13.0.0', CDN = `https://www.gstatic.com/firebasejs/${V}/`;
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: session lasts this page only */ } };
  const CFG = root.SKY_FIREBASE, host = location.hostname;
  const server = !!(CFG && CFG.config && CFG.config.apiKey && (CFG.domains || []).includes(host));   // the app's WebView host is 'localhost' (capacitor://localhost, https://localhost)
  const cap = root.Capacitor, NA = cap && cap.isNativePlatform && cap.isNativePlatform() ? (cap.Plugins && cap.Plugins.FirebaseAuthentication) || (cap.registerPlugin && cap.registerPlugin('FirebaseAuthentication')) : null;   // native sign-in (app only)
  const emu = server && /[?&]emu\b/.test(location.search) && /[?&]debug\b/.test(location.search) && host !== 'jincoy.github.io';   // local QA: Firebase emulators
  /* Under 14, or age not answered yet: this device only. No Firebase (not even loaded, so no anonymous account or restored session),
     no ranking, no sync, no Google / Apple (Legal_Review_Codex_v1 G02 / KR02). Same rule as js/agegroup.js isChild, read from the
     same stored answer (js/age.js; ?debug&age= for local QA). The deletion paths (fresh sign-in, deleteAccount) stay open to anyone,
     so an account made before this rule can still be removed. */
  const child = () => { const q = /[?&]debug\b/.test(location.search) && /[?&]age=(\w+)/.exec(location.search), v = q ? q[1] : (get('skybloom.age') || {}).v; return v !== 'm14' && v !== 'a18'; };
  const on = () => server && !child();
  const mark = () => { document.documentElement.classList.toggle('age-child', child()); document.documentElement.classList.toggle('no-apple', noApple); };   // index.html hides the Google / Apple buttons
  let session = get(KEY);
  const subs = [], isLocal = s => !!s && (s.local || String(s.id).startsWith('guest-'));   // device guests (older builds saved them without the flag)
  const put = s => { session = s; set(KEY, s); subs.forEach(f => { try { f(s); } catch (e) { console.error(e); } }); return s; };
  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
  const appleProvider = A => { const p = new A.OAuthProvider('apple.com'); p.addScope('email'); p.addScope('name'); return p; };
  let appleCode = null;   // Apple's authorization code from the latest Apple sign-in (valid ~5 min): deleting the account revokes the Apple token with it
  const noApple = !!(NA && cap.getPlatform && cap.getPlatform() === 'android');   // Apple's rule 4.8 is iOS; the Android app offers Google only

  function guestId() {
    let id = get(GID);
    if (!id) { id = 'guest-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); set(GID, id); }
    return id;
  }
  const localGuest = () => put({ id: guestId(), provider: 'guest', local: true, since: new Date().toISOString() });

  /* ---------- Firebase (server mode only) ---------- */
  let fbp = null, fbv = null;   // fbv: the loaded SDK, so a tap can open the popup without waiting
  const fromUser = u => u && { id: u.uid, provider: u.isAnonymous ? 'guest' : ((u.providerData[0] || {}).providerId === 'apple.com' ? 'apple' : 'google'),
    name: u.displayName || null, email: u.email || null, since: (session && session.id === u.uid && session.since) || new Date().toISOString() };
  function fb() {
    if (!server) return Promise.reject(fail('not-configured'));
    return fbp || (fbp = Promise.all([import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js')]).then(([F, A]) => {
      const app = F.initializeApp(CFG.config), auth = NA ? A.initializeAuth(app, { persistence: A.indexedDBLocalPersistence }) : A.getAuth(app);   // app: getAuth() waits forever in the iOS WebView (it loads the web popup helper); no popup there anyway
      if (emu) A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      A.onAuthStateChanged(auth, u => { if (u) put(fromUser(u)); else if (session && !isLocal(session)) put(null); });
      if (!NA) try { auth._popupRedirectResolver?._initialize?.(auth)?.catch?.(() => {}); } catch { /* SDK internals changed: the popup still works, just loads its helper on the tap */ }   // the app never uses the web popup
      // ^ load the popup helper (apis.google.com + the auth frame) now. Firebase does this itself only on phones and Safari; elsewhere it waited for the
      //   tap, and on a slow network the popup then opened too late and was blocked (checked with a 6 s network delay in headless Chrome).
      return fbv = { F, A, app, auth, CDN, emu };
    }).catch(e => { fbp = null; throw e; }));
  }
  /** Google (or Apple) already belongs to another account: ask, then switch to that account (sync.js offers to bring this device's progress). */
  async function linkClash(A, auth, e, known) {   // known: the credential we linked with (the app's native sheet), the error may not carry it
    if (e.code !== 'auth/credential-already-in-use' && e.code !== 'auth/email-already-in-use') throw e;
    const cred = known || A.GoogleAuthProvider.credentialFromError(e) || A.OAuthProvider.credentialFromError(e);
    if (!cred || !await api.ask('merge')) throw fail('cancelled');
    return fromUser((await A.signInWithCredential(auth, cred)).user);
  }
  async function social(provider, fresh) {   // fresh: always a new sign-in (never link to a guest): delete-account.html
    if (!fresh && child()) throw fail('child', 'device only under 14');
    if (!server || (provider === 'apple' && !CFG.apple)) throw fail('not-configured', `${provider} sign-in is not available here`);
    const { A, auth } = fbv || await fb(), cur = auth.currentUser;   // normally already loaded (preloaded below): no wait between the tap and the popup
    if (!fresh && cur && !cur.isAnonymous && fromUser(cur).provider === provider) return put(fromUser(cur));   // already signed in with it
    const link = !fresh && cur && cur.isAnonymous;   // a guest keeps its uid (and its progress) by linking
    if (NA) {   // app: the native Google / Apple sheet gives an ID token; Firebase JS signs in / links with it (Apple: the nonce goes along as rawNonce)
      let r; try { r = await NA[provider === 'apple' ? 'signInWithApple' : 'signInWithGoogle'](); } catch (e) { throw /cancel/i.test(String((e && (e.code || e.message)) || '')) ? fail('cancelled') : e; }
      const c = (r && r.credential) || {}, cred = provider === 'apple' ? new A.OAuthProvider('apple.com').credential({ idToken: c.idToken, rawNonce: c.nonce })
        : A.GoogleAuthProvider.credential(c.idToken || null, c.accessToken || null);
      if (provider === 'apple') appleCode = { code: c.authorizationCode, at: Date.now() };
      try { return put(fromUser((link ? await A.linkWithCredential(cur, cred) : await A.signInWithCredential(auth, cred)).user)); }
      catch (e) { return put(await linkClash(A, auth, e, cred)); }
    }
    const prov = provider === 'google' ? new A.GoogleAuthProvider() : appleProvider(A);
    try { const res = link ? await A.linkWithPopup(cur, prov) : await A.signInWithPopup(auth, prov); if (provider === 'apple') appleCode = { code: res._tokenResponse && res._tokenResponse.oauthAuthorizationCode, at: Date.now() }; return put(fromUser(res.user)); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-environment') throw fail('popup-blocked');
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') throw fail('cancelled');
      return put(await linkClash(A, auth, e));
    }
  }

  /** Apple wants the token revoked when the account is deleted. Needs a fresh authorization code: the one from a sign-in under 4 minutes ago, else
      Apple asks again (cancel = the player stops, nothing is deleted). Any other failure never blocks the deletion itself. */
  async function revokeApple(A, auth) {
    let code = appleCode && Date.now() - appleCode.at < 4 * 6e4 ? appleCode.code : null;
    if (!code) try {
      if (NA) code = ((await NA.signInWithApple()).credential || {}).authorizationCode;
      else { const res = await A.reauthenticateWithPopup(auth.currentUser, appleProvider(A)); code = res._tokenResponse && res._tokenResponse.oauthAuthorizationCode; }   // ponytail: _tokenResponse is SDK-internal, check on SDK upgrades
    } catch (e) {
      const c = String((e && (e.code || e.message)) || ''); if (/cancel|closed-by-user/i.test(c)) throw fail('cancelled');
      if (/popup-blocked/.test(c)) throw fail('popup-blocked');
    }
    appleCode = null;
    if (code) try { await A.revokeAccessToken(auth, code); } catch (e) { console.warn('apple revoke failed', e); }
  }

  const api = {
    providers: ['google', 'apple', 'guest'],
    get serverConnected() { return on(); },   // false for a child too: rank.js and sync.js stay device-only
    get serverConfigured() { return server; },   // delete-account.html: open whatever the age
    /** The age screen was answered (js/age.js): show / hide the sign-in buttons, and load the SDK now if this player may use it (popup in the tap). */
    ageChanged() { mark(); if (on()) fb().catch(() => {}); },
    /** @returns {Promise<{id:string, provider:string}>} */
    signIn(provider, { fresh = false } = {}) {
      if (provider === 'guest') {
        if (!on()) return Promise.resolve(localGuest());
        return fb().then(({ A, auth }) => auth.currentUser ? put(fromUser(auth.currentUser)) : A.signInAnonymously(auth).then(r => put(fromUser(r.user))))
          .catch(() => localGuest());   // offline or blocked: play on this device, as before
      }
      if (provider === 'google' || provider === 'apple') return social(provider, fresh);
      return Promise.reject(fail('unknown-provider'));
    },
    signOut() {   // this device's progress stays in localStorage either way
      const done = () => { put(null); if (NA && NA.signOut) NA.signOut().catch(() => {}); };   // app: also forget the native Google session (the account chooser shows next time)
      return server && fbp ? fbp.then(({ A, auth }) => A.signOut(auth)).then(done, done) : Promise.resolve(done());
    },
    currentUser() { return session; },
    /** B7: delete the account and every copy of its data (Backend_Design §5.2). The server function deleteAccount (Blaze plan, firebase/functions)
        deletes users/{uid} with every subcollection and the Auth account with admin rights, so there is no Google re-sign-in: one "Delete?" is enough.
        Order: sync stops -> the server deletes -> this device forgets the user, every skybloom.* key and the play-log database.
        Device-only players (no server account) get the device part. Apple accounts also revoke their Apple token first (revokeApple). */
    async deleteAccount() {
      if (server && session && !isLocal(session)) {
        const { A, auth, app } = await fb();
        await auth.authStateReady();   // a cold load (a child's device never preloads Firebase) has not restored the saved user yet: currentUser would be null
        if (auth.currentUser) {
          const Fn = await import(CDN + 'firebase-functions.js'), fns = Fn.getFunctions(app, 'asia-northeast3');
          if (emu && !fns._skyEmu) { Fn.connectFunctionsEmulator(fns, '127.0.0.1', 5001); fns._skyEmu = true; }
          if (session.provider === 'apple') await revokeApple(A, auth);   // App Store 5.1.1(v): deleting the account also revokes the Apple token (before the account is gone)
          const prev = session;
          put(null);   // sync.js stops first, so no late push brings the document back
          try { await Fn.httpsCallable(fns, 'deleteAccount')(); }   // fails (offline, server error) -> rejects; the game says "couldn't delete", nothing on the device is wiped
          catch (e) { put(prev); throw e; }   // keep the session: pressing Delete again on the same screen calls the server again (not a device-only wipe)
          await A.signOut(auth).catch(() => {});   // the account no longer exists; drop its cached session
        }
      }
      put(null);
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('skybloom.')) localStorage.removeItem(k); } catch { /* storage blocked: nothing kept */ }
      await new Promise(res => { try { const r = indexedDB.deleteDatabase('skybloom-telemetry'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
    },
    onChange(fn) { subs.push(fn); },
    fb,
    /** The game replaces this with its own dialog; kind: 'merge'. */
    ask: () => Promise.resolve(false),
  };
  root.SkyAuth = api;
  mark();
  if (on()) fb().catch(() => {});   // load the SDK now: restores a signed-in user for sync, and lets a Google tap open its popup at once
})(this);
