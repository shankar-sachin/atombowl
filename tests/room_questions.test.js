const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const { questionPool, pickIndex, speechText, cleanText, categoryAllows, normalizeLevel } = loadTS('src/ts/room_questions.ts');

const bank = [
  { level: 'HS', bonus: false, category: 'PHYSICS', type: 'SA', question_text: 'What is the SI unit of force?' },
  { level: 'HS', bonus: false, category: 'BIOLOGY', type: 'MC', question_text: 'Which organelle makes ATP?\nW) nucleus\nX) mitochondrion' },
  { level: 'HS', bonus: true, category: 'PHYSICS', type: 'SA', question_text: 'Name the force that opposes motion.' },
  { level: 'MS', bonus: false, category: 'PHYSICS', type: 'SA', question_text: 'What is mass measured in?' },
  { level: 'HS', bonus: false, category: 'PHYSICS', type: 'SA', question_text: '   ' },
  { level: 'HS', bonus: false, category: 'PHYSICS', type: 'SA', question_text: 'See the figure.', question_image: 'x.png' }
];

test('pool keeps the division, kind and category, and drops blank or image questions', () => {
  assert.deepEqual(questionPool(bank, { level: 'HS', bonus: false, category: 'Physics' }), [0]);
  assert.deepEqual(questionPool(bank, { level: 'HS', bonus: false, category: 'General' }), [0, 1]);
  assert.deepEqual(questionPool(bank, { level: 'HS', bonus: true, category: 'General' }), [2]);
  assert.deepEqual(questionPool(bank, { level: 'MS', bonus: false, category: 'General' }), [3]);
});

test('an empty category falls back to every category in the division', () => {
  assert.deepEqual(questionPool(bank, { level: 'HS', bonus: false, category: 'Math' }), [0, 1]);
});

test('unknown divisions read as high school', () => {
  assert.equal(normalizeLevel('x'), 'HS');
  assert.equal(normalizeLevel('MS'), 'MS');
});

test('earth and space covers its three Set B categories', () => {
  for (const c of ['EARTH SCIENCE', 'EARTH AND SPACE', 'ASTRONOMY']) assert.equal(categoryAllows('Earth and space', c), true);
  assert.equal(categoryAllows('Earth and space', 'PHYSICS'), false);
  assert.equal(categoryAllows('General', 'GENERAL SCIENCE'), true);
});

test('picking does not repeat until the pool is used up', () => {
  const used = new Set();
  const seen = [pickIndex([4, 5, 6], used, () => 0), pickIndex([4, 5, 6], used, () => 0), pickIndex([4, 5, 6], used, () => 0)];
  assert.deepEqual([...seen].sort(), [4, 5, 6]);
  assert.ok([4, 5, 6].includes(pickIndex([4, 5, 6], used, () => 0)));
  assert.equal(pickIndex([], used), null);
});

test('speech text announces the kind and splits choices into sentences', () => {
  assert.equal(speechText(bank[0]), 'Toss-up. Short answer. What is the SI unit of force?');
  assert.equal(speechText(bank[1]), 'Toss-up. Multiple choice. Which organelle makes ATP? W) nucleus. X) mitochondrion.');
  assert.match(speechText(bank[2], 'bonus'), /^Bonus\. Short answer\./);
});

test('mangled quote bytes between letters are repaired, equations are left alone', () => {
  assert.equal(cleanText("the Earth=92=s axis"), "the Earth's axis");
  assert.equal(cleanText("if x=92 then y=10"), "if x=92 then y=10");
});
