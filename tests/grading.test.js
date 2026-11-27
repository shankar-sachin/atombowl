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

// Answer keys as they are written in the bank: notes, alternatives, lists and units.
const sa = (userAnswer, correctAnswer) => window.autoChecker.grade({ userAnswer, correctAnswer, questionType: 'SA', threshold: 0.72 }).isCorrect;
for (const [answer, key, correct] of [
 ['120', '120\n(SOLUTION: Y= KXZ; 12 = K(4)(5); K = 3/5; Y = 3/5(10)(20) = 120)', true],
 ['121', '120\n(SOLUTION: Y= KXZ; 12 = K(4)(5); K = 3/5; Y = 3/5(10)(20) = 120)', false],
 ['9pi', '`9PI`\n(SOLUTION: `C = PID; 1/2(18PI) = 9PI`', true],
 ['polaris', 'NORTH STAR (ACCEPT: POLARIS OR ALPHA URSA MINORIS)', true],
 ['north star', 'NORTH STAR (ACCEPT: POLARIS OR ALPHA URSA MINORIS)', true],
 ['osteocyte', 'OSTEOBLASTS (DO NOT ACCEPT: OSTEOCYTE)', false],
 ['osteoblast', 'OSTEOBLASTS (DO NOT ACCEPT: OSTEOCYTE)', true],
 ['lead carbonate', 'LEAD (II) CARBONATE (DO NOT ACCEPT: PLUMBOUS CARBONATE, LEAD CARBONATE)', false],
 ['5', '+5 (DO NOT ACCEPT: 5)', false],
 ['evaporation; water melts', 'EVAPORATION; WATER MELTS', true],
 ['water melts and evaporation', 'EVAPORATION; WATER MELTS', true],
 ['evaporation', 'EVAPORATION; WATER MELTS', false],
 ['jupiter and mars', 'MARS AND JUPITER (IN ANY ORDER)', true],
 ['1, 2, 3', '1, 3, 2', false],
 ['1, 3, 2', '1, 3, 2', true],
 ['4', '4 OR -4', true],
 ['images', 'image', true], ['cases', 'case', true], ['xray', 'X-ray', true], ['nonmetal', 'non-metal', true],
 ['1000', '1,000', true], ['6e22', '6 X 10^22', true], ['6 x 10^22', '6 X 10^22', true], ['6 x 10^21', '6 X 10^22', false],
 ['kg', 'KILOGRAM (KG)', true], ['kilogram', 'KILOGRAM (KG)', true], ['kilogram (kg)', 'KILOGRAM (KG)', true],
 ['25', '25 (CENTIMETERS)', true], ['25 cm', '25 (CENTIMETERS)', true], ['24 cm', '25 (CENTIMETERS)', false],
 ['49 m/s', '49 METERS/SECOND', true], ['49', '49 METERS/SECOND', true], ['49 kg', '49 METERS/SECOND', false],
 ['golgi body', 'GOLGI COMPLEX (OR GOLGI BODY)', true],
 ['4', '4A', false], ['2D', '2', false], ['one million', '1', false],
 ['cafe', 'CAFÉ', true],
 ['mitochondria', 'chloroplast', false]
]) {
 test(`grading key: ${JSON.stringify(answer)} vs ${JSON.stringify(key.slice(0, 40))}`, () => assert.equal(sa(answer, key), correct));
}
