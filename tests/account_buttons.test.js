const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTS } = require('./helpers');
function setup(hooks = {}) {
 const elements = new Map(), calls = [], documentListeners = {};
 function element(id) {
  if (!elements.has(id)) elements.set(id, { id, textContent: '', innerHTML: '', value: '', disabled: false, readOnly: false, dataset: {}, handlers: {},
   classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
   querySelector() { return null; }, setAttribute() {}, removeAttribute() {}, focus() {}, select() {},
   addEventListener(type, handler) { this.handlers[type] = handler; } });
  return elements.get(id);
 }
 const document = {
  getElementById: element, querySelector: () => null, querySelectorAll: () => [],
  addEventListener(type, handler) { documentListeners[type] = handler; }
 };
 // Run timers right away on a microtask so waits for account data resolve without real delays.
 const window = {
  atomAccount: { onAuthChange() {}, signInWithProvider: async provider => { calls.push(provider); if (hooks.onSignIn) await hooks.onSignIn(provider); } },
  setTimeout: fn => { queueMicrotask(fn); return 0; }, clearTimeout() {}
 };
 loadTS('src/ts/account.ts', { './account_store.js': {} }, { document, window });
 return { element, calls };
}
test('the account page offers Google and GitHub only, with no "coming soon" buttons', async () => {
 const html = fs.readFileSync('src/html/account.html', 'utf8');
 assert.match(html, /id="googleBtn"/);
 assert.match(html, /id="githubBtn"/);
 assert.doesNotMatch(html, /coming soon|microsoftBtn|appleBtn/i);
 assert.equal(fs.existsSync('src/html/microsoft-auth.html'), false);
});
test('GitHub invokes the GitHub sign-in flow', async () => {
 const ui = setup(); await ui.element('githubBtn').handlers.click();
 assert.deepEqual(ui.calls, ['github']);
 assert.equal(ui.element('githubBtn').disabled, false);
});
test('Google invokes the Google sign-in flow', async () => {
 const ui = setup(); await ui.element('googleBtn').handlers.click();
 assert.deepEqual(ui.calls, ['google']);
 assert.equal(ui.element('googleBtn').disabled, false);
});
test('Google and GitHub show our own waiting screen while their pop-up is open, then hide it', async () => {
 for (const [id, provider, label] of [['googleBtn', 'google', 'Google'], ['githubBtn', 'github', 'GitHub']]) {
  const seen = [];
  let ui;
  ui = setup({ onSignIn: async () => { seen.push(ui.element('authWait').shown); } });
  const wait = ui.element('authWait');
  wait.shown = false;
  wait.classList = { add(c) { if (c === 'hidden') wait.shown = false; }, remove(c) { if (c === 'hidden') wait.shown = true; }, toggle() {}, contains() { return false; } };
  await ui.element(id).handlers.click();
  assert.deepEqual(seen, [true], `${provider} waiting screen is up during sign-in`);
  assert.equal(wait.shown, false, `${provider} waiting screen is gone afterwards`);
  assert.equal(ui.element('authWaitTitle').textContent, `Continue with ${label}`);
 }
});
test('failing or cancelled sign-in also hides the waiting screen', async () => {
 const ui = setup({ onSignIn: async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }); } });
 const wait = ui.element('authWait');
 let shown = null;
 wait.classList = { add(c) { if (c === 'hidden') shown = false; }, remove(c) { if (c === 'hidden') shown = true; }, toggle() {}, contains() { return false; } };
 await ui.element('githubBtn').handlers.click();
 assert.equal(shown, false);
 assert.match(ui.element('authError').textContent, /closed before finishing/);
});
