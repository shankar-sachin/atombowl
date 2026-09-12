const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const AUTH = 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
const FIRESTORE = 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
 const documents = new Map(), storage = new Map();
 let observer, creates = 0, resetEmail;
 let passwordStatus = { isValid: true };
 const auth = { currentUser: null, authStateReady: async () => {} };
 const snap = ref => ({ exists: () => documents.has(ref), data: () => documents.get(ref) });
 const set = (ref, value, options) => documents.set(ref, options?.merge ? { ...documents.get(ref), ...value } : value);
 const api = {
   validatePassword: async () => passwordStatus,
   onAuthStateChanged: (_, cb) => { observer = cb; },
   createUserWithEmailAndPassword: async (_, email) => {
     creates++; auth.currentUser = { uid: 'new', email, isAnonymous: false, providerData: [] };
     observer(auth.currentUser); return { user: auth.currentUser };
   },
   updateProfile: async (user, value) => Object.assign(user, value),
   sendPasswordResetEmail: async (_, email) => { resetEmail = email; },
   signOut: async () => { auth.currentUser = null; observer(null); }
 };
 const dbApi = {
   doc: (_, ...segments) => segments.join('/'), getDoc: async ref => snap(ref), setDoc: async (...args) => set(...args),
   runTransaction: async (_, callback) => {
     const pending = [];
     const result = await callback({ get: async ref => snap(ref), set: (...args) => pending.push(args) });
     pending.forEach(args => set(...args)); return result;
   },
   serverTimestamp: () => 12345, increment: n => n, arrayUnion: (...values) => values
 };
 const window = {}, localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
 loadTS('src/ts/account_store.ts', { './firebase.js': { auth, db: {} }, [AUTH]: api, [FIRESTORE]: dbApi }, { window, localStorage, document: { dispatchEvent() {} }, CustomEvent: class {} });
 return { setPasswordStatus: status => { passwordStatus = status; }, account: window.atomAccount, documents, storage, auth, get creates() { return creates; }, get resetEmail() { return resetEmail; }, async change(user) { auth.currentUser = user; observer(user); await flush(); } };
}
const details = { firstName: 'First', lastName: 'Last', email: 'test@example.com', username: 'player1', password: 'password', playerName: 'My Name' };
test('anonymous Firebase users remain guests and do not create account documents', async () => {
 const env = setup(); await env.change({ uid: 'anon', isAnonymous: true });
 assert.equal(env.account.getUser(), null); assert.equal(env.documents.size, 0);
});
test('duplicate username rejected before creating Firebase Auth user', async () => {
 const env = setup(); env.documents.set('usernames/player1', { uid: 'someone' });
 await assert.rejects(env.account.signUpWithDetails(details), /already taken/); assert.equal(env.creates, 0);
});
test('signup profile survives auth observer; public reservation has no email', async () => {
 const env = setup(); await env.account.signUpWithDetails(details);
 assert.equal(env.account.getProfile().firstName, 'First');
 assert.equal(env.account.getProfile().username, 'player1');
 assert.deepEqual(Object.keys(env.documents.get('usernames/player1')).sort(), ['uid', 'username']);
 assert.equal(env.account.getUser().uid, 'new');
});
test('returning login preserves creation time and clears previous account cache', async () => {
 const env = setup(); env.storage.set('atom_cache_owner', 'other');
 env.storage.set('atom_buzzer_profile', JSON.stringify({ name: 'Other user', team: 'B' }));
 env.documents.set('users/returning', { createdAt: 42, profile: { username: 'saved', firstName: 'Saved' } });
 await env.change({ uid: 'returning', email: 'x@example.com', providerData: [], isAnonymous: false });
 assert.equal(env.documents.get('users/returning').createdAt, 42);
 assert.equal(env.account.getProfile().firstName, 'Saved');
 assert.equal(env.documents.has('users/returning/buzzerProfile/current'), false);
});
test('username login does not expose email lookup; reset uses supplied email', async () => {
 const env = setup(); await assert.rejects(env.account.signInWithIdentifier('player1', 'password'), /email address/);
 await env.account.resetPassword(' test@example.com '); assert.equal(env.resetEmail, 'test@example.com');
});
test('invalid username is not silently normalized into another user name', async () => {
 const env = setup(); await assert.rejects(env.account.signUpWithDetails({ ...details, username: 'player-1' }));
 assert.equal(env.creates, 0);
});
test('provider users and partial signups can finish username setup in profile editor', async () => {
 const env = setup(); await env.change({ uid: 'oauth', email: 'x@example.com', providerData: [], isAnonymous: false });
 await env.account.updateAccountProfile({ username: 'finishme', playerName: 'Finished' });
 assert.equal(env.account.getProfile().username, 'finishme');
 assert.equal(env.documents.get('usernames/finishme').uid, 'oauth');
 await assert.rejects(env.account.updateAccountProfile({ username: 'rename' }), /cannot be changed/);
});

test('signup reports Firebase password requirements before creating an account', async () => {
 const env = setup();
 env.setPasswordStatus({ isValid: false, containsUppercaseLetter: false, containsNumericCharacter: false, containsNonAlphanumericCharacter: false, passwordPolicy: { customStrengthOptions: { minPasswordLength: 8 } } });
 await assert.rejects(env.account.signUpWithDetails(details), /uppercase letter, a number, a symbol/);
 assert.equal(env.creates, 0);
});
