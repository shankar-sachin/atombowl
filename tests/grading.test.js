const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { loadTS } = require('./helpers');
const window = {};
loadTS('src/ts/autochecker.ts', {}, { window });
for (const [answer, expected, correct] of [['1', '-1', false], ['1', '1/2', false], ['0.5', '1/2', true], ['two', '2', true], ['1.01', '1.02', false], ['1e3', '1000', true], ['W', 'W) Water', true]]) {
 test(`browser and Python grading: ${answer} vs ${expected}`, () => {
  const input = { userAnswer: answer, correctAnswer: expected, questionType: answer === 'W' ? 'MC' : 'SA' };
  const result = spawnSync('python3', ['server/python/autochecker.py'], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).isCorrect, correct);
  assert.equal(window.autoChecker.grade(input).isCorrect, correct);
 });
}
