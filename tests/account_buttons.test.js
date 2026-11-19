const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTS } = require('./helpers');
function setup() {
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
  atomAccount: { onAuthChange() {}, signInWithProvider: async provider => calls.push(provider) },
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
