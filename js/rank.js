/* Skybloom module: ranking (B4). Finished games go to the submitGame function, which replays them with the real rules and ranks only
   verified scores; the boards are read straight from Firestore (leaderboards/{all|wYYYY-WW|col}/entries, signed-in players may read).
   Games wait in a small queue (localStorage rankQueue, newest 10) when offline and are sent on the next sign-in or game.
   Device-only mode (no server) does nothing here: the ranking window shows this device's best, as before. */
import { store } from './core.js?v=0.7.67';

const A = window.SkyAuth || { serverConnected: false, currentUser: () => null, onChange() {} }, Q = 'rankQueue';
let S = null;
async function sdk() {   // Firestore + Functions, from the same pinned CDN as auth.js
  if (S) return S;
  const { app, CDN, emu } = await A.fb(), F = await import(CDN + 'firebase-firestore.js'), Fn = await import(CDN + 'firebase-functions.js');
  const db = F.getFirestore(app), fns = Fn.getFunctions(app, 'asia-northeast3');
  if (emu && !db._skyEmu) { F.connectFirestoreEmulator(db, '127.0.0.1', 8080); db._skyEmu = true; }
  if (emu && !fns._skyEmu) { Fn.connectFunctionsEmulator(fns, '127.0.0.1', 5001); fns._skyEmu = true; }
  return S = { F, Fn, db, fns };
}
export const online = () => { const u = A.currentUser(); return A.serverConnected && u && !u.local ? u : null; };

/** ISO week id in UTC, e.g. 'w2026-43' (the same rule as functions/index.js weekId). */
export function weekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `w${y}-${String(w).padStart(2, '0')}`;
}

/** A finished game (game.js saveGame record): queue it and try to send. Tutorial and speed games are never ranked. */
export function submitGame(rec) {
  if (!A.serverConnected || rec.tutorial || rec.mode === 'speed') return;
  store.set(Q, [...store.get(Q, []).filter(x => x.gameId !== rec.gameId), rec].slice(-10)); flush();
}
let flushing = null;
export function flush() {
  if (!online()) return Promise.resolve();
  return flushing || (flushing = (async () => {
    const { Fn, fns } = await sdk(), call = Fn.httpsCallable(fns, 'submitGame');
    for (const rec of store.get(Q, [])) {
      try { await call(rec); }
      catch (e) { if (['functions/unavailable', 'functions/internal', 'functions/deadline-exceeded', 'functions/unauthenticated'].includes(e.code)) break; }   // retry later; a rejected record (invalid-argument) is dropped
      store.set(Q, store.get(Q, []).filter(x => x.gameId !== rec.gameId));
    }
  })().catch(e => console.warn('[rank] submit later:', e?.code || e?.message || e)).finally(() => { flushing = null; }));
}
A.onChange(u => { if (u && !u.local) flush(); });
flush();

/** Top 100 of a board and my own entry with its rank (ties share a rank). */
export async function board(period) {
  const { F, db } = await sdk(), u = online(), col = F.collection(db, 'leaderboards', period, 'entries');
  const rows = (await F.getDocs(F.query(col, F.orderBy('score', 'desc'), F.limit(100)))).docs.map(d => ({ uid: d.id, ...d.data() }));
  let mine = null;
  if (u) { const m = await F.getDoc(F.doc(col, u.id)); if (m.exists()) mine = { uid: u.id, ...m.data(), rank: (await F.getCountFromServer(F.query(col, F.where('score', '>', m.data().score)))).data().count + 1 }; }
  return { rows, mine };
}
export async function nickname() { const { F, db } = await sdk(), u = online(); if (!u) return null; const p = await F.getDoc(F.doc(db, 'users', u.id)); return p.exists() ? p.data().nickname || null : null; }
/** Rejects { code: 'functions/invalid-argument', message: 'length' | 'word' } for a name the server refuses. */
export async function setNickname(name) { const { Fn, fns } = await sdk(); return (await Fn.httpsCallable(fns, 'setNickname')({ nickname: name })).data.nickname; }
