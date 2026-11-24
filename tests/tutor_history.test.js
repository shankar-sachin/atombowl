const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const { cleanChat, mergeRemote, MAX_CHATS } = loadTS('src/ts/tutor_history.ts');

const chat = (id, updated, extra = {}) => ({ id, title: `chat ${id}`, updated, messages: [{ role: 'user', text: 'hi' }], context: null, ...extra });

test('cleanChat keeps usable chats and drops junk', () => {
  assert.equal(cleanChat(null), null);
  assert.equal(cleanChat({ id: 'a', messages: [] }), null);
  assert.equal(cleanChat({ id: 'a', messages: [{ role: 'system', text: 'x' }] }), null);
  const c = cleanChat({ id: 'a', title: 'T', updated: 5, messages: [{ role: 'user', text: 'q' }, { role: 'assistant', text: 'a', extra: 1 }, { role: 'user', text: '' }], context: { question: 'Q' } });
  assert.deepEqual(c, { id: 'a', title: 'T', updated: 5, messages: [{ role: 'user', text: 'q' }, { role: 'assistant', text: 'a' }], context: { question: 'Q' } });
  assert.equal(cleanChat({ id: 'a', messages: [{ role: 'user', text: 'q' }] }).title, 'New chat');
  const long = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: String(i) }));
  assert.equal(cleanChat({ id: 'a', messages: long }).messages.length, 30);
});

test('a new device receives the account chats, newest first', () => {
  const r = mergeRemote([], [chat('a', 1), chat('b', 3), chat('c', 2)], []);
  assert.deepEqual(r.history.map((c) => c.id), ['b', 'c', 'a']);
  assert.deepEqual(r.synced.sort(), ['a', 'b', 'c']);
  assert.deepEqual([r.upload, r.prune], [[], []]);
});

test('chats made offline or before syncing existed are uploaded', () => {
  const r = mergeRemote([chat('local', 5)], [chat('a', 1)], []);
  assert.deepEqual(r.history.map((c) => c.id), ['local', 'a']);
  assert.deepEqual(r.upload.map((c) => c.id), ['local']);
  assert.deepEqual(r.synced, ['a']);
});

test('a chat deleted on another device is removed here, not uploaded again', () => {
  const r = mergeRemote([chat('gone', 5), chat('a', 1)], [chat('a', 1)], ['gone', 'a']);
  assert.deepEqual(r.history.map((c) => c.id), ['a']);
  assert.deepEqual(r.upload, []);
});

test('the newer copy of a chat wins, and a newer local copy is uploaded', () => {
  const remoteNewer = mergeRemote([chat('a', 1, { title: 'old' })], [chat('a', 9, { title: 'new' })], ['a']);
  assert.equal(remoteNewer.history[0].title, 'new');
  assert.deepEqual(remoteNewer.upload, []);
  const localNewer = mergeRemote([chat('a', 9, { title: 'mine' })], [chat('a', 1, { title: 'theirs' })], ['a']);
  assert.equal(localNewer.history[0].title, 'mine');
  assert.deepEqual(localNewer.upload.map((c) => c.title), ['mine']);
});

test('only the newest chats are kept and the rest are pruned from the account', () => {
  const remote = Array.from({ length: MAX_CHATS + 3 }, (_, i) => chat(`c${i}`, i));
  const r = mergeRemote([], remote, []);
  assert.equal(r.history.length, MAX_CHATS);
  assert.deepEqual(r.prune.sort(), ['c0', 'c1', 'c2']);
  assert.equal(r.history[0].id, `c${MAX_CHATS + 2}`);
});

test('quiz progress survives cleaning and junk in it does not', () => {
  const quiz = { a: { '0.0': 'B', bad: 'x' }, ok: { '0.0': true, '0.1': 'yes' } };
  const c = cleanChat({ id: 'a', messages: [{ role: 'assistant', text: 'q', quiz }, { role: 'user', text: 'hi', quiz: { a: {}, ok: {} } }] });
  assert.deepEqual(c.messages[0].quiz, { a: { '0.0': 'B' }, ok: { '0.0': true } });
  assert.equal('quiz' in c.messages[1], false);
});

test('a copy that continues the other one wins even when its device clock is behind', () => {
  const short = chat('a', 9, { messages: [{ role: 'user', text: 'q' }, { role: 'assistant', text: 'a' }] });
  const longer = chat('a', 1, { messages: [...short.messages, { role: 'user', text: 'q2' }, { role: 'assistant', text: 'a2' }] });
  const localAhead = mergeRemote([longer], [short], ['a']);
  assert.equal(localAhead.history[0].messages.length, 4);
  assert.equal(localAhead.upload.length, 1);
  const remoteAhead = mergeRemote([short], [longer], ['a']);
  assert.equal(remoteAhead.history[0].messages.length, 4);
  assert.deepEqual(remoteAhead.upload, []);
});
