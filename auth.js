/* Skybloom sign-in interface (spec v0.4 §6.1). Front end only: there is no game server yet.
   - signIn('guest')            -> resolves a device-local guest account (random id kept in localStorage)
   - signIn('google' | 'apple') -> rejects { code: 'not-configured' } until a backend (Firebase Auth, v0.4 §9) is connected
   - signOut(), currentUser()
   When the server exists, replace the two provider branches below; callers do not change.
   Nothing here pretends to be signed in with Google or Apple. */
(function (root) {
  const KEY = 'skybloom.session', GID = 'skybloom.guestId';
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: session lasts this page only */ } };
  let session = get(KEY);

  function guestId() {
    let id = get(GID);
    if (!id) { id = 'guest-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); set(GID, id); }
    return id;
  }
  const notConfigured = provider => Promise.reject(Object.assign(new Error(`${provider} sign-in needs the game server`), { code: 'not-configured', provider }));

  const api = {
    providers: ['google', 'apple', 'guest'],
    serverConnected: false,
    /** @returns {Promise<{id:string, provider:string}>} */
    signIn(provider) {
      if (provider === 'guest') { session = { id: guestId(), provider: 'guest', since: new Date().toISOString() }; set(KEY, session); return Promise.resolve(session); }
      if (provider === 'google' || provider === 'apple') return notConfigured(provider);
      return Promise.reject(Object.assign(new Error('unknown provider'), { code: 'unknown-provider' }));
    },
    signOut() { session = null; set(KEY, null); return Promise.resolve(); },   // the guest id stays, so progress on this device is kept
    currentUser() { return session; },
  };
  root.SkyAuth = api;
})(this);
