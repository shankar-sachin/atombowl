const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const { fixMath } = loadTS('src/ts/tutor_math.ts');
const { splitQuiz, parseQuiz, gradeQuestion, quizScore, missedMessage, answerText } = loadTS('src/ts/tutor_quiz.ts');

const REPLY = `Here is a quick one.

:::quiz Photoelectric effect
Q1 (mc): Which quantity sets the maximum kinetic energy of an emitted electron?
A) Light intensity
B) Light frequency
C) Exposure time
D) Metal thickness
Answer: B
Why: Photon energy is \\(E = hf\\).

Q2 (sa): What is the SI unit of force?
Answer: newton
Accept: newtons; N
Why: F = ma gives kg m/s^2.
:::

Tell me how it goes.`;

test('fixMath moves operators out of \\text and maps unknown macros', () => {
  assert.equal(fixMath('\\text{eV\\cdotp nm}'), '\\text{eV}\\cdot\\text{nm}');
  assert.equal(fixMath('\\frac{1240\\ \\text{eV\\cdotp nm}}{400\\ \\text{nm}}'), '\\frac{1240\\ \\text{eV}\\cdot\\text{nm}}{400\\ \\text{nm}}');
  assert.equal(fixMath('\\text{kg \\times m}'), '\\text{kg}\\times\\text{m}');
  assert.equal(fixMath('3\\cdotp 10^8'), '3\\cdot 10^8');
  assert.equal(fixMath('\\ce{H2O}'), '\\mathrm{H2O}');
  assert.equal(fixMath('\\SI{3}{nm}'), '3\\,\\mathrm{nm}');
  assert.equal(fixMath('\\text{plain words}'), '\\text{plain words}');
  assert.equal(fixMath('E = \\frac{hc}{\\lambda}'), 'E = \\frac{hc}{\\lambda}');
});

test('a reply splits into prose and a parsed quiz', () => {
  const parts = splitQuiz(REPLY);
  assert.deepEqual(parts.map((p) => p.type), ['text', 'quiz', 'text']);
  assert.equal(parts[0].text, 'Here is a quick one.');
  const quiz = parts[1].quiz;
  assert.equal(quiz.title, 'Photoelectric effect');
  assert.equal(quiz.questions.length, 2);
  const [mc, sa] = quiz.questions;
  assert.deepEqual([mc.kind, mc.answer, mc.choices.length], ['mc', 'B', 4]);
  assert.equal(mc.why, 'Photon energy is \\(E = hf\\).');
  assert.deepEqual([sa.kind, sa.answer, sa.accept], ['sa', 'newton', ['newtons', 'N']]);
});

test('replies without a quiz, or with a broken one, stay plain text', () => {
  assert.deepEqual(splitQuiz('Just an explanation.'), [{ type: 'text', text: 'Just an explanation.' }]);
  const broken = splitQuiz(':::quiz Oops\nQ1 (mc): Only one choice\nA) lonely\nAnswer: A\n:::');
  assert.deepEqual(broken.map((p) => p.type), ['text']);
  assert.match(broken[0].text, /Only one choice/);
  // A quiz with no closing line ends with the message.
  const open = splitQuiz('Try this:\n:::quiz Open\nQ1 (sa): Symbol for gold?\nAnswer: Au');
  assert.deepEqual(open.map((p) => p.type), ['text', 'quiz']);
});

test('questions with a bad answer letter or no answer are dropped', () => {
  const quiz = parseQuiz('T', [
    'Q1 (mc): Bad letter', 'A) one', 'B) two', 'Answer: C',
    'Q2 (sa): No answer',
    'Q3 (mc): Fine', 'A) one', 'B) two', 'Answer: a', 'Why: because', 'it continues',
    'Q4 (sa): Fine too', 'Answer: Au'
  ]);
  assert.deepEqual(quiz.questions.map((q) => q.q), ['Fine', 'Fine too']);
  assert.equal(quiz.questions[0].answer, 'A');
  assert.equal(quiz.questions[0].why, 'because it continues');
  assert.equal(parseQuiz('T', ['nothing here']), null);
  const many = parseQuiz('T', Array.from({ length: 12 }, (_, i) => [`Q${i + 1} (sa): q${i}`, 'Answer: a']).flat());
  assert.equal(many.questions.length, 8);
});

test('grading: multiple choice by letter, short answers by the site checker or a plain match', () => {
  const [mc, sa] = splitQuiz(REPLY)[1].quiz.questions;
  assert.equal(gradeQuestion(mc, 'b'), true);
  assert.equal(gradeQuestion(mc, 'A'), false);
  assert.equal(gradeQuestion(mc, ''), false);
  assert.equal(gradeQuestion(sa, 'Newton'), true);
  assert.equal(gradeQuestion(sa, ' N '), true);
  assert.equal(gradeQuestion(sa, 'joule'), false);
  const seen = [];
  const grader = (input) => { seen.push(input); return { isCorrect: true }; };
  assert.equal(gradeQuestion(sa, 'nwton', grader), true);
  assert.deepEqual(seen[0], { userAnswer: 'nwton', correctAnswer: 'newton; newtons; N', questionType: 'SA' });
});

test('score and the follow-up message list only the missed questions', () => {
  const quiz = splitQuiz(REPLY)[1].quiz;
  const state = { a: { '0.0': 'A', '0.1': 'newton' }, ok: { '0.0': false, '0.1': true } };
  assert.deepEqual(quizScore(quiz, 0, state), { done: 2, correct: 1, total: 2 });
  assert.deepEqual(quizScore(quiz, 0, undefined), { done: 0, correct: 0, total: 2 });
  assert.deepEqual(quizScore(quiz, 1, state), { done: 0, correct: 0, total: 2 });
  assert.equal(answerText(quiz.questions[0]), 'B) Light frequency');
  const msg = missedMessage(quiz, 0, state);
  assert.match(msg, /got 1 of 2/);
  assert.match(msg, /I answered: A\. Correct: B\) Light frequency/);
  assert.doesNotMatch(msg, /newton/);
});

test('the answer key is a letter on its own or the text of a choice, and a trailing ::: closes the quiz', () => {
  const quiz = parseQuiz('T', [
    'Q1 (mc): Which halogen is a liquid?', 'A) Chlorine', 'B) Bromine', 'C) Iodine', 'Answer: Bromine',
    'Q2 (mc): Which is a noble gas?', 'A) Argon', 'B) Boron', 'Answer: (A) Argon',
    'Q3 (mc): No such choice', 'A) Carbon', 'B) Boron', 'Answer: Dark energy'
  ]);
  assert.deepEqual(quiz.questions.map((q) => q.answer), ['B', 'A']);
  const parts = splitQuiz('Intro\n:::quiz Light\nQ1 (sa): Symbol for the photon energy constant?\nAnswer: h\nWhy: E = hf. :::\nAfter the quiz.');
  assert.deepEqual(parts.map((p) => p.type), ['text', 'quiz', 'text']);
  assert.equal(parts[1].quiz.questions[0].why, 'E = hf.');
  assert.equal(parts[2].text.trim(), 'After the quiz.');
});

test('without the site checker, symbol answers are compared as typed', () => {
  const pi = { kind: 'sa', q: 'q', choices: [], answer: 'π', accept: [], why: '' };
  assert.equal(gradeQuestion(pi, 'π'), true);
  assert.equal(gradeQuestion(pi, 'μ'), false);
  assert.equal(gradeQuestion(pi, '%'), false);
});
