const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const window = {};
loadTS('src/ts/autochecker.ts', {}, { window });
for (const [answer, expected, correct] of [['1', '-1', false], ['1', '1/2', false], ['0.5', '1/2', true], ['two', '2', true], ['1.01', '1.02', false], ['1e3', '1000', true], ['W', 'W) Water', true]]) {
 test(`grading: ${answer} vs ${expected}`, () => {
  const input = { userAnswer: answer, correctAnswer: expected, questionType: answer === 'W' ? 'MC' : 'SA' };
  assert.equal(window.autoChecker.grade(input).isCorrect, correct);
 });
}
