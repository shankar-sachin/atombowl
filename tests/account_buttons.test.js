const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
function setup() {
 const elements = new Map(), calls = [];
 function element(id) {
  if (!elements.has(id)) elements.set(id, { textContent: '', value: '', disabled: false, handlers: {}, classList: { add() {}, remove() {}, toggle() {} },
   querySelector() { return null; }, addEventListener(type, handler) { this.handlers[type] = handler; } });
  return elements.get(id);
 }
 const document = { getElementById: element, querySelector: () => null, querySelectorAll: () => [] };
 const window = { atomAccount: { onAuthChange() {}, signInWithProvider: async provider => calls.push(provider) } };
 loadTS('src/ts/account.ts', { './account_store.js': {} }, { document, window });
 return { element, calls };
}
test('Apple and Microsoft announce Coming soon without OAuth', async () => {
 const ui = setup();
 for (const id of ['appleBtn', 'microsoftBtn']) {
  await ui.element(id).handlers.click();
  assert.equal(ui.element('authError').textContent, 'Coming soon');
 }
 assert.deepEqual(ui.calls, []);
});
test('Google invokes the Google sign-in flow', async () => {
 const ui = setup(); await ui.element('googleBtn').handlers.click();
 assert.deepEqual(ui.calls, ['google']);
});
