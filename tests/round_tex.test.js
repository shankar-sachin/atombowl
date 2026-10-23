const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const window = {};
loadTS('src/ts/round_tex.ts', {}, { window });
const { asciiToTex, segments, categoryLabel, typeLabel, roundToTex } = window.atomRoundTex;

test('asciiToTex converts the bank\'s AsciiMath', () => {
  assert.equal(asciiToTex('(8 xx 10^7)/((4 xx 10^4)^(1/2))'), '\\frac{8 \\times {10}^{7}}{\\left( 4 \\times {10}^{4} \\right)^{\\frac{1}{2}}}');
  assert.equal(asciiToTex('y = -sqrt(25 - x^2)'), 'y = - \\sqrt{25 - x^{2}}');
  assert.equal(asciiToTex('lim_(x->oo) (1 + 3/n)^n'), '\\lim_{x \\to \\infty} \\left( 1 + \\frac{3}{n} \\right)^{n}');
  assert.equal(asciiToTex('log_2 x = 5'), '\\log_{2} x = 5');
  assert.equal(asciiToTex('sintheta'), '\\sin \\theta');
  assert.equal(asciiToTex('\\theta'), '\\theta');
});

test('asciiToTex reads all-caps answers', () => {
  assert.equal(asciiToTex('4 XX 10^5'), '4 \\times {10}^{5}');
  assert.equal(asciiToTex('1 XX 10^-18'), '1 \\times {10}^{-18}');
  assert.equal(asciiToTex('X = (1 + SQRT(5))/2'), 'X = \\frac{1 + \\sqrt{5}}{2}');
  assert.equal(asciiToTex('COSTHETA'), '\\cos \\theta');
  assert.equal(asciiToTex('A^(B^2+B)'), 'A^{B^{2} + B}');
});

test('asciiToTex keeps grouping, commas and stray brackets valid', () => {
  assert.equal(asciiToTex('20,000'), '20{,}000');
  assert.equal(asciiToTex('(-3,3)'), '\\left( - 3 , 3 \\right)');
  assert.equal(asciiToTex('lO^10^10'), 'l O^{{10}^{10}}');
  assert.equal(asciiToTex('(2x'), '\\left( 2 x \\right.');
  assert.equal(asciiToTex('x)'), 'x )');
  assert.equal(asciiToTex('x and y'), 'x \\text{ and } y');
});

test('segments splits text, backtick math, LaTeX and scientific notation', () => {
  const parts = segments('Has 6.0 x 10^22 ions and `x^2` or \\(\\frac{1}{2}\\)');
  assert.deepEqual(parts.map((p) => (p.math ? `[${p.tex}]` : p.text)), ['Has ', '[6.0 \\times {10}^{22}]', ' ions and ', '[x^{2}]', ' or ', '[\\frac{1}{2}]']);
  assert.equal(segments('(10^3)').map((p) => p.text || p.tex).join('|'), '(|{10}^{3}|)');
  assert.equal(segments('`x^2 - 5x + 6 = 0`')[0].tex, '\\displaystyle x^{2} - 5 x + 6 = 0');
  const chem = (s) => segments(s).map((p) => (p.math ? `[${p.tex}]` : p.text)).join('');
  assert.equal(chem('oxide, or Cu2O. Then C6H12O6'), 'oxide, or [\\mathrm{Cu_{2}O}]. Then [\\mathrm{C_{6}H_{12}O_{6}}]');
  assert.equal(chem('NaCl, H1N1, B12 and INTO'), 'NaCl, H1N1, B12 and INTO');
  // A sentence wrapped in backticks stays text.
  assert.equal(segments('`the fraction with numerator x squared`')[0].math, false);
});

test('labels avoid all caps', () => {
  assert.equal(categoryLabel('EARTH AND SPACE'), 'Earth and Space');
  assert.equal(categoryLabel('MATH'), 'Math');
  assert.equal(typeLabel('MC'), 'Multiple Choice');
  assert.equal(typeLabel('SA'), 'Short Answer');
});

test('roundToTex writes a complete, balanced document', () => {
  const tex = roundToTex({
    division: 'HS',
    createdAt: Date.UTC(2026, 9, 22, 12),
    questions: [
      { category: 'MATH', type: 'SA', question_text: 'Solve `x^2 = 4` for 50% & $5', parsed_answer: 'X = 2' },
      { category: 'PHYSICS', type: 'MC', question_text: 'Which is a vector?\nW) mass\nX) velocity', parsed_answer: 'X) VELOCITY\n[ACCEPT: V]', bonus: true },
    ],
  });
  assert.match(tex, /^% Atom Bowl practice round/);
  assert.match(tex, /\\begin\{document\}[\s\S]*\\end\{document\}\n$/);
  assert.match(tex, /Solve \\\( x\^\{2\} = 4 \\\) for 50\\% \\& \\\$5/);
  assert.match(tex, /Which is a vector\? \\\\\nW\) mass \\\\\nX\) velocity/);
  assert.match(tex, /\\textbf\{Answer:\} X\) VELOCITY \\\\\n\{\}\[ACCEPT: V\]/);
  let depth = 0;
  for (let i = 0; i < tex.length; i += 1) {
    if (tex[i - 1] === '\\') continue;
    if (tex[i] === '{') depth += 1;
    if (tex[i] === '}') depth -= 1;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0);
});
