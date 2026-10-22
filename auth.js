/* Skybloom sign-in interface (spec v0.4 §6.1, step 12). Callers see the same three calls as before:
   - signIn('guest' | 'google' | 'apple') -> Promise<{ id, provider, name?, local? }>
   - signOut(), currentUser()  (currentUser() is synchronous: the last session is kept in localStorage)
   Server mode (firebase-config.js present, an authorised domain, not the app build): Firebase Auth from the pinned CDN SDK.
     guest = anonymous sign-in; Google (and later Apple) is LINKED to the guest's uid, so the account keeps the same id and data.
     A Google account that already belongs to another uid asks "merge?" (SkyAuth.ask, set by the game UI) and then signs in to it.
     Popups only: the SDK is loaded as soon as the page opens, so the popup opens inside the tap (a popup opened after a download is blocked,
     Safari first). No redirect fallback: signInWithRedirect breaks on browsers that partition storage, because the sign-in helper is on
     firebaseapp.com, not our domain ("missing initial state"). A blocked popup rejects { code: 'popup-blocked' } and the game asks to allow it.
   Device mode (anywhere else, or offline): a random guest id kept on this device; Google / Apple reject with { code: 'not-configured' }.
   Extra hooks for the game: onChange(fn) (session changes), fb() (the loaded Firebase app, for sync.js), ask(title, body, yes) (UI). */
(function (root) {
  const KEY = 'skybloom.session', GID = 'skybloom.guestId', V = '13.0.0', CDN = `https://www.gstatic.com/firebasejs/${V}/`;
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: session lasts this page only */ } };
  const CFG = root.SKY_FIREBASE, host = location.hostname, inApp = document.documentElement.classList.contains('app');
  const server = !!(CFG && CFG.config && CFG.config.apiKey && (CFG.domains || []).includes(host) && !inApp);
  const emu = server && /[?&]emu\b/.test(location.search) && /[?&]debug\b/.test(location.search) && host !== 'jincoy.github.io';   // local QA: Firebase emulators
  let session = get(KEY);
  const subs = [], isLocal = s => !!s && (s.local || String(s.id).startsWith('guest-'));   // device guests (older builds saved them without the flag)
  const put = s => { session = s; set(KEY, s); subs.forEach(f => { try { f(s); } catch (e) { console.error(e); } }); return s; };
  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });

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
      const app = F.initializeApp(CFG.config), auth = A.getAuth(app);
      if (emu) A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      A.onAuthStateChanged(auth, u => { if (u) put(fromUser(u)); else if (session && !isLocal(session)) put(null); });
      try { auth._popupRedirectResolver?._initialize?.(auth)?.catch?.(() => {}); } catch { /* SDK internals changed: the popup still works, just loads its helper on the tap */ }
      // ^ load the popup helper (apis.google.com + the auth frame) now. Firebase does this itself only on phones and Safari; elsewhere it waited for the
      //   tap, and on a slow network the popup then opened too late and was blocked (checked with a 6 s network delay in headless Chrome).
      return fbv = { F, A, app, auth, CDN, emu };
    }).catch(e => { fbp = null; throw e; }));
  }
  /** Google (or Apple) already belongs to another account: ask, then switch to that account (sync.js offers to bring this device's progress). */
  async function linkClash(A, auth, e) {
    if (e.code !== 'auth/credential-already-in-use' && e.code !== 'auth/email-already-in-use') throw e;
    const cred = A.GoogleAuthProvider.credentialFromError(e) || A.OAuthProvider.credentialFromError(e);
    if (!cred || !await api.ask('merge')) throw fail('cancelled');
    return fromUser((await A.signInWithCredential(auth, cred)).user);
  }
  async function social(provider, fresh) {   // fresh: always a new sign-in (never link to a guest): delete-account.html
    if (!server || (provider === 'apple' && !CFG.apple)) throw fail('not-configured', `${provider} sign-in is not available here`);
    const { A, auth } = fbv || await fb(), cur = auth.currentUser;   // normally already loaded (preloaded below): no wait between the tap and the popup
    if (!fresh && cur && !cur.isAnonymous && fromUser(cur).provider === provider) return put(fromUser(cur));   // already signed in with it
    const prov = provider === 'google' ? new A.GoogleAuthProvider() : new A.OAuthProvider('apple.com');
    const link = !fresh && cur && cur.isAnonymous;   // a guest keeps its uid (and its progress) by linking
    try { return put(fromUser((link ? await A.linkWithPopup(cur, prov) : await A.signInWithPopup(auth, prov)).user)); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-environment') throw fail('popup-blocked');
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') throw fail('cancelled');
      return put(await linkClash(A, auth, e));
    }
  }

  const api = {
    providers: ['google', 'apple', 'guest'],
    get serverConnected() { return server; },
    /** @returns {Promise<{id:string, provider:string}>} */
    signIn(provider, { fresh = false } = {}) {
      if (provider === 'guest') {
        if (!server) return Promise.resolve(localGuest());
        return fb().then(({ A, auth }) => auth.currentUser ? put(fromUser(auth.currentUser)) : A.signInAnonymously(auth).then(r => put(fromUser(r.user))))
          .catch(() => localGuest());   // offline or blocked: play on this device, as before
      }
      if (provider === 'google' || provider === 'apple') return social(provider, fresh);
      return Promise.reject(fail('unknown-provider'));
    },
    signOut() {   // this device's progress stays in localStorage either way
      const done = () => { put(null); };
      return server && fbp ? fbp.then(({ A, auth }) => A.signOut(auth)).then(done, done) : Promise.resolve(done());
    },
    currentUser() { return session; },
    /** B7: delete the account and every copy of its data (Backend_Design §5.2). The server function deleteAccount (Blaze plan, firebase/functions)
        deletes users/{uid} with every subcollection and the Auth account with admin rights, so there is no Google re-sign-in: one "Delete?" is enough.
        Order: sync stops -> the server deletes -> this device forgets the user, every skybloom.* key and the play-log database.
        Device-only players (no server account) get the device part. Apple sign-in, when turned on, also needs its token revoked on the server (Apple key). */
    async deleteAccount() {
      if (server && session && !isLocal(session)) {
        const { A, auth, app } = await fb();
        if (auth.currentUser) {
          const Fn = await import(CDN + 'firebase-functions.js'), fns = Fn.getFunctions(app, 'asia-northeast3');
          if (emu && !fns._skyEmu) { Fn.connectFunctionsEmulator(fns, '127.0.0.1', 5001); fns._skyEmu = true; }
          put(null);   // sync.js stops first, so no late push brings the document back
          await Fn.httpsCallable(fns, 'deleteAccount')();   // fails (offline, server error) -> rejects; the game says "couldn't delete", nothing on the device is wiped
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
  if (server) fb().catch(() => {});   // load the SDK now: restores a signed-in user for sync, and lets a Google tap open its popup at once
})(this);
