const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { searchLocal } = require('../server/search_fallback');
const { runScript } = require('../server');
const root = path.join(__dirname, '..');
for (const script of ['search', 'stats', 'validator']) {
 test(`Ruby ${script} loads repository question banks`, () => {
   const result = spawnSync('ruby', [`server/ruby/${script}.rb`], { input: JSON.stringify({ pageSize: 1, checks: ['duplicates'] }), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
   assert.equal(result.status, 0, result.stderr);
   const parsed = JSON.parse(result.stdout);
   if (script !== 'validator') assert.ok(parsed.total > 0);
 });
}
test('fallback truncates fractional pagination consistently with Ruby', () => {
 const result = searchLocal(root, { page: 1.9, pageSize: 2.9 });
 assert.equal(result.page, 1); assert.equal(result.pageSize, 2); assert.equal(result.items.length, 2);
});
test('missing subprocess rejects without crashing the server', async () => {
 await assert.rejects(runScript('/nonexistent/atom-test-command', [], { value: 'x'.repeat(100000) }));
});
