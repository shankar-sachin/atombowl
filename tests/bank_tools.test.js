const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const window = {};
loadTS('src/ts/bank_tools.ts', {}, { window });
const { stats, validate, difficulty } = window.atomBankTools;

const questions = [
 { bank_label: 'Bank A', _index: 0, set_name: 'S1', category: 'PHYSICS', level: 'HS', type: 'SA', question_text: 'What is F?', parsed_answer: 'force' },
 { bank_label: 'Bank A', _index: 1, set_name: 'S1', category: 'PHYSICS', level: 'HS', type: 'SA', question_text: 'what is f?', parsed_answer: 'force' },
 { bank_label: 'Bank B', _index: 0, set_name: 'S2', category: 'ART', level: 'XX', type: 'SA', question_text: 'Q?', bonus: true }
];

test('stats counts categories and bonuses', () => {
 const s = stats(questions);
 assert.equal(s.total, 3);
 assert.equal(s.byCategory.PHYSICS, 2);
 assert.equal(s.byBonus.Bonus, 1);
 assert.deepEqual(s.sets, ['S1', 'S2']);
});

test('validate flags duplicates, bad categories/levels and empty answers', () => {
 const r = validate(questions);
 assert.equal(r.summary.duplicate, 1);
 assert.equal(r.summary.invalid_category, 1);
 assert.equal(r.summary.invalid_level, 1);
 assert.equal(r.summary.empty_answer, 1);
 assert.equal(r.valid, false);
 assert.equal(validate(questions, ['duplicates']).checksRun[0], 'duplicates');
});

test('difficulty is bounded and labelled', () => {
 const d = difficulty({ questionText: 'Identify the organelle responsible for oxidative phosphorylation, which occurs within eukaryotic cells.', parsedAnswer: 'mitochondria', category: 'BIOLOGY', type: 'SA', level: 'HS' });
 assert.ok(d.difficulty >= 1 && d.difficulty <= 10);
 assert.ok(['easy', 'medium', 'hard', 'very hard'].includes(d.level));
 assert.equal(difficulty({}).difficulty, 1);
});
