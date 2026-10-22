/* Skybloom sign-in interface (spec v0.4 §6.1, step 12). Callers see the same three calls as before:
   - signIn('guest' | 'google' | 'apple') -> Promise<{ id, provider, name?, local? }>
   - signOut(), currentUser()  (currentUser() is synchronous: the last session is kept in localStorage)
   Server mode (firebase-config.js present, an authorised domain, not the app build): Firebase Auth from the pinned CDN SDK.
     guest = anonymous sign-in; Google (and later Apple) is LINKED to the guest's uid, so the account keeps the same id and data.
     A Google account that already belongs to another uid asks "merge?" (SkyAuth.ask, set by the game UI) and then signs in to it.
     Popups first; when the browser blocks them it falls back to a redirect, finished on the next page load.
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
  let fbp = null;
  const fromUser = u => u && { id: u.uid, provider: u.isAnonymous ? 'guest' : ((u.providerData[0] || {}).providerId === 'apple.com' ? 'apple' : 'google'),
    name: u.displayName || null, email: u.email || null, since: (session && session.id === u.uid && session.since) || new Date().toISOString() };
  function fb() {
    if (!server) return Promise.reject(fail('not-configured'));
    return fbp || (fbp = Promise.all([import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js')]).then(([F, A]) => {
      const app = F.initializeApp(CFG.config), auth = A.getAuth(app);
      if (emu) A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      A.onAuthStateChanged(auth, u => { if (u) put(fromUser(u)); else if (session && !isLocal(session)) put(null); });
      A.getRedirectResult(auth).catch(e => linkClash(A, auth, e).catch(() => {}));   // a redirect sign-in / link finishing on this page load
      return { F, A, app, auth, CDN, emu };
    }).catch(e => { fbp = null; throw e; }));
  }
  /** Google (or Apple) already belongs to another account: ask, then switch to that account (sync.js offers to bring this device's progress). */
  async function linkClash(A, auth, e) {
    if (e.code !== 'auth/credential-already-in-use' && e.code !== 'auth/email-already-in-use') throw e;
    const cred = A.GoogleAuthProvider.credentialFromError(e) || A.OAuthProvider.credentialFromError(e);
    if (!cred || !await api.ask('merge')) throw fail('cancelled');
    return fromUser((await A.signInWithCredential(auth, cred)).user);
  }
  async function social(provider) {
    if (!server || (provider === 'apple' && !CFG.apple)) throw fail('not-configured', `${provider} sign-in is not available here`);
    const { A, auth } = await fb(), cur = auth.currentUser;
    if (cur && !cur.isAnonymous && fromUser(cur).provider === provider) return put(fromUser(cur));   // already signed in with it
    const prov = provider === 'google' ? new A.GoogleAuthProvider() : new A.OAuthProvider('apple.com');
    const link = cur && cur.isAnonymous;   // a guest keeps its uid (and its progress) by linking
    try { return put(fromUser((link ? await A.linkWithPopup(cur, prov) : await A.signInWithPopup(auth, prov)).user)); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-environment') {   // e.g. iPhone Safari blocking the popup
        link ? A.linkWithRedirect(cur, prov) : A.signInWithRedirect(auth, prov); return new Promise(() => {});   // the page leaves; it finishes on the next load
      }
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') throw fail('cancelled');
      return put(await linkClash(A, auth, e));
    }
  }

  const api = {
    providers: ['google', 'apple', 'guest'],
    get serverConnected() { return server; },
    /** @returns {Promise<{id:string, provider:string}>} */
    signIn(provider) {
      if (provider === 'guest') {
        if (!server) return Promise.resolve(localGuest());
        return fb().then(({ A, auth }) => auth.currentUser ? put(fromUser(auth.currentUser)) : A.signInAnonymously(auth).then(r => put(fromUser(r.user))))
          .catch(() => localGuest());   // offline or blocked: play on this device, as before
      }
      if (provider === 'google' || provider === 'apple') return social(provider);
      return Promise.reject(fail('unknown-provider'));
    },
    signOut() {   // this device's progress stays in localStorage either way
      const done = () => { put(null); };
      return server && fbp ? fbp.then(({ A, auth }) => A.signOut(auth)).then(done, done) : Promise.resolve(done());
    },
    currentUser() { return session; },
    onChange(fn) { subs.push(fn); },
    fb,
    /** The game replaces this with its own dialog; kind: 'merge'. */
    ask: () => Promise.resolve(false),
  };
  root.SkyAuth = api;
  if (server && session && !isLocal(session)) fb().catch(() => {});   // restore the signed-in user early, so sync can start
})(this);
