// @ts-nocheck
(function () {
  'use strict';

  const NUMBER_WORDS = new Map([
    ['zero', '0'], ['one', '1'], ['two', '2'], ['three', '3'], ['four', '4'],
    ['five', '5'], ['six', '6'], ['seven', '7'], ['eight', '8'], ['nine', '9'],
    ['ten', '10'], ['eleven', '11'], ['twelve', '12'], ['thirteen', '13'],
    ['fourteen', '14'], ['fifteen', '15'], ['sixteen', '16'], ['seventeen', '17'],
    ['eighteen', '18'], ['nineteen', '19'], ['twenty', '20']
  ]);

    const GREEK_MAP = new Map([
    ['\u03b1', 'alpha'], ['\u03b2', 'beta'], ['\u03b3', 'gamma'], ['\u03b4', 'delta'], ['\u03b5', 'epsilon'],
    ['\u03b8', 'theta'], ['\u03bb', 'lambda'], ['\u03bc', 'mu'], ['\u03c0', 'pi'], ['\u03c1', 'rho'],
    ['\u03c3', 'sigma'], ['\u03c4', 'tau'], ['\u03c6', 'phi'], ['\u03c9', 'omega']
  ]);

  function replaceGreek(s) {
    let out = s;
    for (const [sym, name] of GREEK_MAP.entries()) {
      out = out.replaceAll(sym, name);
    }
    return out;
  }

  function normalize(raw) {
    let s = String(raw || '');
    s = replaceGreek(s);
    s = s
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parts = s.split(' ').map(p => NUMBER_WORDS.get(p) || p);
    return parts.join(' ').trim();
  }

  function stem(token) {
    if (token.length <= 3) return token;
    if (token.endsWith('ies')) return token.slice(0, -3) + 'y';
    if (token.endsWith('es')) return token.slice(0, -2);
    if (token.endsWith('s')) return token.slice(0, -1);
    if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
    if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
    return token;
  }

  function tokenize(raw) {
    const normalized = normalize(raw);
    if (!normalized) return [];
    return normalized.split(' ').filter(Boolean).map(stem);
  }

  function jaccard(aTokens, bTokens) {
    if (!aTokens.length || !bTokens.length) return 0;
    const a = new Set(aTokens);
    const b = new Set(bTokens);
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    const union = a.size + b.size - inter;
    return union ? inter / union : 0;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j += 1) dp[j] = j;
    for (let i = 1; i <= m; i += 1) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j += 1) {
        const temp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(
          dp[j] + 1,
          dp[j - 1] + 1,
          prev + cost
        );
        prev = temp;
      }
    }
    return dp[n];
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen ? 1 - dist / maxLen : 0;
  }

  function extractChoiceLetter(raw) {
    if (!raw) return '';
    const match = String(raw).toUpperCase().match(/\b([WXYZ])\b\s*\)?/);
    return match ? match[1] : '';
  }

  function splitCandidates(raw) {
    const normalized = String(raw || '')
      .replace(/\bor\b/gi, '|')
      .replace(/\baccept\b/gi, '|')
      .replace(/\bany of the following\b/gi, '|')
      .replace(/[\/;]/g, '|');
    return normalized
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);
  }

  function bestTokenMatchScore(userTokens, candTokens) {
    if (!userTokens.length || !candTokens.length) return 0;
    let total = 0;
    for (const ut of userTokens) {
      let best = 0;
      for (const ct of candTokens) {
        best = Math.max(best, similarity(ut, ct));
      }
      total += best;
    }
    return total / userTokens.length;
  }

  function autocorrectTokens(userTokens, candTokens) {
    return userTokens.map(ut => {
      let best = { tok: ut, score: 0 };
      for (const ct of candTokens) {
        const score = similarity(ut, ct);
        if (score > best.score) best = { tok: ct, score };
      }
      if (best.score >= 0.82 && ut.length >= 4) return best.tok;
      return ut;
    });
  }

  function numericAnswer(raw) {
    let value = String(raw ?? '').trim().replace(/−/g, '-');
    value = NUMBER_WORDS.get(value.toLowerCase()) || value;
    const atom = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
    if (!new RegExp('^' + atom + '(?:\\s*/\\s*' + atom + ')?$').test(value)) return null;
    const parts = value.split('/');
    const number = Number(parts[0]) / (parts.length === 2 ? Number(parts[1]) : 1);
    return Number.isFinite(number) ? number : null;
  }

  function gradeShortAnswer(userAnswer, correctAnswer, threshold) {
    const numeric = numericAnswer(correctAnswer);
    if (numeric !== null) {
      const candidate = numericAnswer(userAnswer);
      const correct = candidate !== null && candidate === numeric;
      return { isCorrect: correct, score: correct ? 1 : 0, matched: String(correctAnswer) };
    }
    const user = normalize(userAnswer);
    const candidates = splitCandidates(correctAnswer).map(normalize).filter(Boolean);
    if (!user || !candidates.length) return { isCorrect: false, score: 0, matched: '' };

    const userTokens = tokenize(user);
    let best = { score: 0, matched: '' };

    for (const candidate of candidates) {
      const candTokens = tokenize(candidate);
      const correctedUserTokens = autocorrectTokens(userTokens, candTokens);
      const tokenScore = jaccard(correctedUserTokens, candTokens);
      const fuzzyTokenScore = bestTokenMatchScore(correctedUserTokens, candTokens);
      const editScore = similarity(user, candidate);
      const combined = (Math.max(tokenScore, fuzzyTokenScore) * 0.5) +
                       (Math.min(tokenScore, fuzzyTokenScore) * 0.2) +
                       (editScore * 0.3);
      if (combined > best.score) best = { score: combined, matched: candidate };
    }

    const min = candidates.length > 1 ? 0.66 : 0.7;
    const applied = Math.max(min, Number(threshold ?? 0.72));
    return { isCorrect: best.score >= applied, score: best.score, matched: best.matched, threshold: applied };
  }

  function gradeMC(userAnswer, correctAnswer) {
    const user = extractChoiceLetter(userAnswer);
    const correct = extractChoiceLetter(correctAnswer);
    if (!user || !correct) return { isCorrect: false, score: 0 };
    return { isCorrect: user === correct, score: user === correct ? 1 : 0 };
  }

  function grade({ userAnswer, correctAnswer, questionType, threshold }) {
    if (String(questionType || '').toUpperCase() === 'MC') {
      const res = gradeMC(userAnswer, correctAnswer);
      return { ...res, confidence: res.score, matched: extractChoiceLetter(correctAnswer) };
    }
    const res = gradeShortAnswer(userAnswer, correctAnswer, threshold);
    return { ...res, confidence: res.score };
  }

  window.autoChecker = { grade };
})();



