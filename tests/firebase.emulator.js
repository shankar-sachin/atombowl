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
const roomRef = db => sdk.doc(db, 'rooms', 'ABCDE');
const memberRef = (db, uid) => sdk.doc(db, 'rooms', 'ABCDE', 'players', uid);
async function createRoom() {
 const db = dbFor('host');
 const room = { roomCode: 'ABCDE', hostUid: 'host', roomName: 'Test', status: 'lobby', currentBuzz: null,
  scores: { A: 0, B: 0 }, bonusTeam: 'A', lockoutTeam: null, lockoutTeams: [], timers: null,
  settings: { teamCount: 2, tuTime: 300, bonusTime: 20, nsbRules: false } };
 const batch = sdk.writeBatch(db);
 batch.set(roomRef(db), room);
 batch.set(memberRef(db, 'host'), { name: 'Host', team: 'A', joinedAt: sdk.serverTimestamp(), isHost: true });
 await assertSucceeds(batch.commit());
 return db;
}
async function join(uid, team) {
 const db = dbFor(uid);
 await assertSucceeds(sdk.setDoc(memberRef(db, uid), { name: uid, team, joinedAt: sdk.serverTimestamp(), isHost: false }));
 return db;
}
function store(db, uid) {
 return loadTS('src/ts/room_store.ts', {
  './firebase.js': { db, auth: { currentUser: { uid } }, ensureAnonAuth: async () => ({ uid }) },
  './room_state.js': state,
  'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js': sdk
 });
}
test('atomic room creation, code lookup, joining and reload membership work with deployed rules', async () => {
 const db = await createRoom();
 const playerDB = await join('p1', 'B');
 const query = sdk.query(sdk.collection(playerDB, 'rooms'), sdk.where('roomCode', '==', 'ABCDE'));
 const results = await assertSucceeds(sdk.getDocs(query)); assert.equal(results.size, 1);
 const member = await store(playerDB, 'p1').loadMembership('ABCDE', 'p1'); assert.equal(member.team, 'B');
 await assertFails(sdk.updateDoc(memberRef(playerDB, 'host'), { name: 'spoofed' }));
 await assertFails(sdk.updateDoc(roomRef(playerDB), { scores: { A: 999, B: 0 } }));
 await assertFails(sdk.updateDoc(roomRef(db), { hostUid: 'p1' }));
});
test('simultaneous buzz transactions accept one winner and grading cannot be applied twice', async () => {
 const host = await createRoom(); const a = await join('p1', 'A'); const b = await join('p2', 'B');
 const hostStore = store(host, 'host');
 await hostStore.sendHostAction('ABCDE', 'tossup_start');
 const results = await Promise.allSettled([store(a, 'p1').sendBuzz('ABCDE'), store(b, 'p2').sendBuzz('ABCDE')]);
 assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
 const locked = (await sdk.getDoc(roomRef(host))).data(); assert.equal(locked.status, 'tossup_locked');
 await hostStore.sendHostAction('ABCDE', 'tossup_grade_correct');
 await assert.rejects(hostStore.sendHostAction('ABCDE', 'tossup_grade_correct'));
 const graded = (await sdk.getDoc(roomRef(host))).data();
 assert.equal(graded.scores[locked.currentBuzz.team], 4);
});
test('forged identity, late buzz, nonmember buzz and midgame team switching are denied', async () => {
 const host = await createRoom(); const a = await join('p1', 'A');
 await store(host, 'host').sendHostAction('ABCDE', 'tossup_start');
 let room = (await sdk.getDoc(roomRef(a))).data();
 await assertFails(sdk.updateDoc(roomRef(a), state.buzzPatch(room, { uid: 'p1', name: 'p1', team: 'B' })));
 await assertFails(sdk.updateDoc(memberRef(a, 'p1'), { team: 'B' }));
 const outsider = dbFor('outsider');
 await assertFails(sdk.updateDoc(roomRef(outsider), state.buzzPatch(room, { uid: 'outsider', name: 'outsider', team: 'A' })));
 await sdk.updateDoc(roomRef(host), { timers: { phaseEndAt: Date.now() - 10000 } });
 await assertFails(sdk.updateDoc(roomRef(a), { currentBuzz: { uid: 'p1', name: 'p1', team: 'A', at: Date.now() }, status: 'tossup_locked', timers: null }));
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
test('HTTP server serves the site, validates malformed queries, and runs repaired APIs', async () => {
 const { app } = require('../server');
 const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
 const base = `http://127.0.0.1:${server.address().port}`;
 try {
  const page = await fetch(base + '/account.html'); assert.equal(page.status, 200); assert.match(await page.text(), /resetPasswordBtn/);
  const health = await fetch(base + '/api/health'); assert.equal((await health.json()).ok, true);
  const invalid = await fetch(base + '/api/validate?checks[x]=bad'); assert.equal(invalid.status, 400);
  const search = await fetch(base + '/api/search?pageSize=1'); const result = await search.json();
  assert.equal(search.status, 200); assert.equal(result.engine, 'ruby'); assert.equal(result.items.length, 1);
  const stats = await fetch(base + '/api/stats'); assert.equal(stats.status, 200); assert.ok((await stats.json()).total > 0);
  const grade = await fetch(base + '/api/grade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correctAnswer: '-1', userAnswer: '1', questionType: 'SA' }) });
  assert.equal(grade.status, 200); assert.equal((await grade.json()).isCorrect, false);
 } finally { await new Promise(resolve => server.close(resolve)); }
});
