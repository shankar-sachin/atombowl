const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
const { loadTS } = require('./helpers');
const state = loadTS('src/ts/room_state.ts');
let env;
before(async () => {
 env = await initializeTestEnvironment({ projectId: 'demo-atombowl', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const dbFor = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const roomRef = (db, code = 'ABCDE') => sdk.doc(db, 'rooms', code);
const memberRef = (db, uid, code = 'ABCDE') => sdk.doc(db, 'rooms', code, 'players', uid);
const settings = { teamCount: 2, tuTime: 5, bonusTime: 20, nsbRules: true, halfMinutes: 8 };
async function createRoom(code = 'ABCDE', extra = {}) {
 const db = dbFor('host');
 const room = { roomCode: code, hostUid: 'host', roomName: 'Test', status: 'lobby', currentBuzz: null,
  scores: { A: 0, B: 0 }, bonusTeam: 'A', lockoutTeam: null, lockoutTeams: [], timers: null, settings: { ...settings }, ...extra };
 const batch = sdk.writeBatch(db);
 batch.set(roomRef(db, code), room);
 batch.set(memberRef(db, 'host', code), { name: 'Host', team: 'A', joinedAt: sdk.serverTimestamp(), isHost: true });
 await assertSucceeds(batch.commit());
 return db;
}
async function join(uid, team, code = 'ABCDE') {
 const db = dbFor(uid);
 await assertSucceeds(sdk.setDoc(memberRef(db, uid, code), { name: uid, team, joinedAt: sdk.serverTimestamp(), isHost: false }));
 return db;
}
function store(db, uid) {
 return loadTS('src/ts/room_store.ts', {
  './firebase.js': { db, auth: { currentUser: { uid } }, ensureAnonAuth: async () => ({ uid }) },
  './room_state.js': state,
  'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js': sdk
 });
}
const read = async (db, code = 'ABCDE') => (await sdk.getDoc(roomRef(db, code))).data();
// Raw buzz as a client could send it, bypassing the client-side checks in room_state.ts.
const rawBuzz = (db, uid, { team = 'A', name = uid, status = 'tossup_locked', interrupt = false, at = Date.now() } = {}) =>
 sdk.updateDoc(roomRef(db), { currentBuzz: { uid, name, team, at, interrupt }, status, timers: null });

test('rooms are readable by code but cannot be listed', async () => {
 await createRoom();
 const playerDB = await join('p1', 'B');
 const room = await assertSucceeds(sdk.getDoc(roomRef(playerDB)));
 assert.equal(room.data().roomCode, 'ABCDE');
 await assertFails(sdk.getDocs(sdk.query(sdk.collection(playerDB, 'rooms'), sdk.where('roomCode', '==', 'ABCDE'))));
 await assertFails(sdk.getDocs(sdk.collection(playerDB, 'rooms')));
 await assertFails(sdk.getDoc(roomRef(env.unauthenticatedContext().firestore())));
});

test('atomic room creation, joining and reload membership work; players cannot edit scores or ownership', async () => {
 const db = await createRoom();
 const playerDB = await join('p1', 'B');
 const member = await store(playerDB, 'p1').loadMembership('ABCDE', 'p1'); assert.equal(member.team, 'B');
 await assertFails(sdk.updateDoc(memberRef(playerDB, 'host'), { name: 'spoofed' }));
 await assertFails(sdk.updateDoc(roomRef(playerDB), { scores: { A: 999, B: 0 } }));
 await assertFails(sdk.updateDoc(roomRef(db), { hostUid: 'p1' }));
 await assertSucceeds(sdk.updateDoc(roomRef(db), { scores: { A: 1, B: 0 } }));
});

test('room creation validates team count, timers and half length', async () => {
 const db = dbFor('host');
 const base = { roomCode: 'ZZZZ9', hostUid: 'host', roomName: 'Test', status: 'lobby', currentBuzz: null, scores: { A: 0, B: 0 } };
 await assertFails(sdk.setDoc(roomRef(db, 'ZZZZ9'), { ...base, settings: { ...settings, halfMinutes: 0 } }));
 await assertFails(sdk.setDoc(roomRef(db, 'ZZZZ9'), { ...base, settings: { ...settings, halfMinutes: 90 } }));
 await assertFails(sdk.setDoc(roomRef(db, 'ZZZZ9'), { ...base, settings: { ...settings, teamCount: 5 } }));
 await assertSucceeds(sdk.setDoc(roomRef(db, 'ZZZZ9'), { ...base, settings: { ...settings, halfMinutes: 8 } }));
});

test('first buzz wins: one of two simultaneous plain updates is accepted, the other is denied', async () => {
 const host = await createRoom(); const a = await join('p1', 'A'); const b = await join('p2', 'B');
 await store(host, 'host').sendHostAction('ABCDE', 'tossup_start');
 const room = await read(a);
 const results = await Promise.allSettled([
  store(a, 'p1').sendBuzz('ABCDE', room, { name: 'p1', team: 'A' }),
  store(b, 'p2').sendBuzz('ABCDE', room, { name: 'p2', team: 'B' })
 ]);
 assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
 const rejected = results.find(result => result.status === 'rejected');
 assert.equal(rejected.reason.code, 'permission-denied');
 const locked = await read(host);
 assert.equal(locked.status, 'tossup_locked');
 assert.equal(locked.currentBuzz.interrupt, true);
 await assertFails(rawBuzz(b, 'p2', { team: 'B', name: 'p2', status: 'tossup_locked', interrupt: true }));
 await store(host, 'host').sendHostAction('ABCDE', 'tossup_grade_correct');
 assert.equal((await read(host)).scores[locked.currentBuzz.team], 4);
 await assert.rejects(store(host, 'host').sendHostAction('ABCDE', 'tossup_grade_correct'), /no toss-up buzz/);
});

test('buzzing during reading is an interrupt; a forged interrupt flag is denied', async () => {
 const host = await createRoom(); const a = await join('p1', 'A');
 await store(host, 'host').sendHostAction('ABCDE', 'tossup_start');
 await assertFails(rawBuzz(a, 'p1', { team: 'A', name: 'p1', interrupt: false }));
 await assertSucceeds(rawBuzz(a, 'p1', { team: 'A', name: 'p1', interrupt: true }));
 assert.equal((await read(host)).currentBuzz.interrupt, true);
});

test('a buzz after the server-anchored 5 s has passed is refused', async () => {
 const host = await createRoom(); const a = await join('p1', 'A');
 await store(host, 'host').sendHostAction('ABCDE', 'tossup_start');
 await store(host, 'host').sendHostAction('ABCDE', 'done_reading');
 const open = await read(host);
 assert.equal(open.status, 'tossup_open');
 assert.ok(open.timers.phaseStartedAt, 'the store writes a server timestamp');
 await sdk.updateDoc(roomRef(host), { 'timers.phaseStartedAt': sdk.Timestamp.fromMillis(Date.now() - 60000) });
 await assertFails(rawBuzz(a, 'p1', { team: 'A', name: 'p1' }));
});

test('a buzz inside the server-anchored window is accepted and recorded as not an interrupt', async () => {
 const host = await createRoom(); const a = await join('p1', 'A');
 await store(host, 'host').sendHostAction('ABCDE', 'tossup_start');
 await store(host, 'host').sendHostAction('ABCDE', 'done_reading');
 await assertSucceeds(rawBuzz(a, 'p1', { team: 'A', name: 'p1', interrupt: false }));
 assert.equal((await read(host)).currentBuzz.interrupt, false);
});

test('a team locked out by an incorrect answer cannot buzz again; the others can', async () => {
 const host = await createRoom(); const a = await join('p1', 'A'); const b = await join('p2', 'B');
 const hostStore = store(host, 'host');
 await hostStore.sendHostAction('ABCDE', 'tossup_start');
 await hostStore.sendHostAction('ABCDE', 'done_reading');
 await assertSucceeds(rawBuzz(a, 'p1', { team: 'A', name: 'p1' }));
 await hostStore.sendHostAction('ABCDE', 'tossup_grade_incorrect');
 const after = await read(host);
 assert.deepEqual(after.lockoutTeams, ['A']);
 assert.equal(after.status, 'tossup_open');
 await assertFails(rawBuzz(a, 'p1', { team: 'A', name: 'p1' }));
 await assertSucceeds(rawBuzz(b, 'p2', { team: 'B', name: 'p2' }));
});

test('forged identity, outsiders, and mid-game team switching are denied', async () => {
 const host = await createRoom(); const a = await join('p1', 'A');
 await store(host, 'host').sendHostAction('ABCDE', 'tossup_start');
 await assertFails(rawBuzz(a, 'p1', { team: 'B', name: 'p1' }));
 await assertFails(rawBuzz(a, 'p1', { team: 'A', name: 'someone else' }));
 await assertFails(rawBuzz(dbFor('outsider'), 'outsider', { team: 'A', name: 'outsider' }));
 await assertFails(sdk.updateDoc(memberRef(a, 'p1'), { team: 'B' }));
});

test('joining an ended game is refused, and the host can end the game', async () => {
 const host = await createRoom(); const a = await join('p1', 'A');
 await store(host, 'host').sendHostAction('ABCDE', 'end_game');
 assert.equal((await read(host)).status, 'ended');
 await assertFails(sdk.setDoc(memberRef(dbFor('late'), 'late'), { name: 'late', team: 'A', joinedAt: sdk.serverTimestamp(), isHost: false }));
 await assertFails(rawBuzz(a, 'p1', { team: 'A', name: 'p1' }));
});

test('private accounts are owner-only and username reservation atomically creates a public non-email record', async () => {
 const db = env.authenticatedContext('account', { email: 'test@example.com', firebase: { sign_in_provider: 'password' } }).firestore();
 const user = sdk.doc(db, 'users', 'account'), name = sdk.doc(db, 'usernames', 'player1');
 await assertSucceeds(sdk.getDoc(name));
 const batch = sdk.writeBatch(db);
 batch.set(user, { profile: { username: 'player1', email: 'test@example.com' } });
 batch.set(name, { uid: 'account', username: 'player1' });
 await assertSucceeds(batch.commit());
 const publicDB = env.unauthenticatedContext().firestore();
 await assertSucceeds(sdk.getDoc(sdk.doc(publicDB, 'usernames', 'player1')));
 await assertFails(sdk.getDoc(sdk.doc(publicDB, 'users', 'account')));
 await assertFails(sdk.getDoc(sdk.doc(dbFor('other'), 'users', 'account')));
 await assertFails(sdk.setDoc(name, { uid: 'account', username: 'player1', email: 'test@example.com' }));
 await env.withSecurityRulesDisabled(async context => {
  await sdk.setDoc(sdk.doc(context.firestore(), 'usernames', 'legacy'), { uid: 'account', username: 'legacy', email: 'private@example.com' });
 });
 await assertFails(sdk.getDoc(sdk.doc(publicDB, 'usernames', 'legacy')));
});

test('AI credit docs are readable by their owner only and never writable by clients', async () => {
 await env.withSecurityRulesDisabled(async (ctx) => {
  await sdk.setDoc(sdk.doc(ctx.firestore(), 'aiUsage', 'alice'), { day: '2026-10-22', used: 3 });
 });
 const alice = env.authenticatedContext('alice', { firebase: { sign_in_provider: 'password' } }).firestore();
 const bob = env.authenticatedContext('bob', { firebase: { sign_in_provider: 'password' } }).firestore();
 await assertSucceeds(sdk.getDoc(sdk.doc(alice, 'aiUsage', 'alice')));
 await assertFails(sdk.getDoc(sdk.doc(bob, 'aiUsage', 'alice')));
 await assertFails(sdk.setDoc(sdk.doc(alice, 'aiUsage', 'alice'), { day: '2026-10-22', used: 0 }));
 await assertFails(sdk.getDocs(sdk.collection(alice, 'aiUsage')));
});
