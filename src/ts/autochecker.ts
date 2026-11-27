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
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // café -> cafe
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parts = s.split(' ').map(p => NUMBER_WORDS.get(p) || p);
    return parts.join(' ').trim();
  }

  // Singular and plural must land on the same stem: "images" and "image", "boxes" and "box".
  function stem(token) {
    if (token.length <= 3) return token;
    if (token.endsWith('ies')) return token.slice(0, -3) + 'y';
    if (/(ch|sh|ss|x|z)es$/.test(token)) return token.slice(0, -2);
    if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
    if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
    return token;
  }

  const STOPWORDS = new Set(['the', 'a', 'an', 'and']);

  function tokenize(raw) {
    const normalized = normalize(raw);
    if (!normalized) return [];
    const tokens = normalized.split(' ').filter(Boolean);
    // "the", "a" and "and" carry no meaning in an answer, unless they are all there is.
    const meaningful = tokens.filter(t => !STOPWORDS.has(t));
    return (meaningful.length ? meaningful : tokens).map(stem);
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

  // Notes that are not part of the answer: how to say it, or how strict to be.
  const NOTE = /^(read(?: as)?|pron(?:ounced|unciation)?|in any order|any order|must\b|either order|order does not matter|exact|units? required)/i;

  // Splits "A OR B", "A; B" style alternatives inside an ACCEPT or DO NOT ACCEPT note.
  function splitAlternatives(text) {
    return String(text || '').split(/\s+or\s+|;/i).map(s => s.trim()).filter(Boolean);
  }

  // Reads an answer key such as
  //   "NORTH STAR (ACCEPT: POLARIS OR ALPHA URSA MINORIS)"
  //   "120\n(SOLUTION: Y = KXZ; ...)"      "OSTEOBLASTS (DO NOT ACCEPT: OSTEOCYTE)"      "KILOGRAM (KG)"
  // into the answers to accept, the answers to refuse, and whether the main answer is a list.
  function parseKey(raw) {
    let text = String(raw || '').replace(/`/g, '').replace(/\s*\n\s*/g, ' ');
    // A worked solution is never part of the answer, and its closing bracket is often missing.
    text = text.replace(/\(?\s*solution\s*:[\s\S]*$/i, ' ');

    const accept = [];
    const reject = [];
    let main = '';        // the answer without optional bracketed words
    let full = '';        // the answer with them: "25 (CENTIMETERS)" -> "25 CENTIMETERS"
    let abbreviation = '';
    const note = (inner) => {
      let m;
      if ((m = inner.match(/^do not accept\s*:?\s*(.*)$/i))) reject.push(...splitAlternatives(m[1]).flatMap(r => r.split(',')).map(r => r.trim()).filter(Boolean));
      else if ((m = inner.match(/^(?:also\s+)?accept(?:\s+in any order)?\s*:?\s*(.*)$/i))) accept.push(...splitAlternatives(m[1]));
      else if ((m = inner.match(/^or\s+(.+)$/i))) accept.push(...splitAlternatives(m[1]));   // "GOLGI COMPLEX (OR GOLGI BODY)"
      else if (!NOTE.test(inner)) return false;
      return true;
    };
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '(') {
        if (depth === 0) start = i;
        depth += 1;
      } else if (ch === ')' && depth > 0) {
        depth -= 1;
        if (depth === 0) {
          const inner = text.slice(start + 1, i).trim();
          const standsAlone = start === 0 || /\s/.test(text[start - 1]);
          const optional = standsAlone && /^[a-z][a-z .'-]*$/i.test(inner) && !/^[ivx]+$/i.test(inner) && inner.split(/\s+/).length <= 3;
          if (note(inner)) { /* handled */ }
          else if (optional) {
            full += ` ${inner} `;                                        // "(SIR ISAAC) NEWTON", "250 (NEWTONS)"
            if (!/\s/.test(inner) && inner.length <= 4 && main.trim() && !text.slice(i + 1).trim().replace(/\(.*$/, '')) abbreviation = inner;   // "KILOGRAM (KG)"
          } else {
            main += text.slice(start, i + 1);                           // "IRON(II)", "(0, 5)", maths
            full += text.slice(start, i + 1);
          }
          start = -1;
        }
      } else if (depth === 0) {
        main += ch;
        full += ch;
      }
    }
    if (depth > 0 && start >= 0) {
      // Unclosed bracket: treat what follows by its label, as above.
      const inner = text.slice(start + 1).trim();
      if (!note(inner)) { main += text.slice(start); full += text.slice(start); }
    }

    const tidy = (t) => t.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
    // "4 OR -4" are alternatives. A ";" list is one answer with several parts.
    const alternatives = (t) => tidy(t).split(/\s+or\s+/i).map(x => x.trim()).filter(Boolean);
    const mains = alternatives(main);
    const fulls = alternatives(full).filter(x => !mains.includes(x));
    // `derived` marks the shortened forms, which a DO NOT ACCEPT note can still overrule.
    const shortened = fulls.length > 0;
    const list = [
      ...fulls.map(text => ({ text, derived: false })),
      ...mains.map(text => ({ text, derived: shortened })),
      ...accept.map(text => ({ text, derived: false })),
      ...(abbreviation ? [{ text: abbreviation, derived: false }] : [])
    ];
    return { accept: list, reject };
  }

  const isList = (text) => /;|,|\band\b/i.test(String(text || ''));

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

  const NUMBER = '[+-]?(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d*)?|\\d+(?:\\.\\d*)?|\\.\\d+)';
  const NOT_A_UNIT = new Set(['pi', 'sqrt', 'root', 'and', 'or', 'to', 'of', 'i', 'e', 'x', 'y', 'n', 'times', 'over', 'factorial', 'half', 'halves', 'third', 'thirds', 'quarter', 'quarters', 'hundred', 'thousand', 'million', 'billion', 'trillion', 'only']);

  // A number at the start of the text: "1,000", "0.5", "1/2", "6 X 10^22", "6e22", "three".
  // Returns the value and whatever follows it ("49 METERS/SECOND" -> 49 and "meters/second").
  function leadingNumber(raw) {
    let text = String(raw ?? '').trim().replace(/[\u2212\u2013]/g, '-').replace(/\u00d7/g, 'x');
    const word = text.match(/^([a-z]+)\b(.*)$/i);
    if (word && NUMBER_WORDS.has(word[1].toLowerCase())) text = NUMBER_WORDS.get(word[1].toLowerCase()) + word[2];
    const sci = text.match(new RegExp('^(' + NUMBER + ')\\s*(?:x|\\*)\\s*10\\s*\\^\\s*\\(?\\s*([+-]?\\d+)\\s*\\)?(.*)$', 'i'));
    const exp = !sci && text.match(new RegExp('^(' + NUMBER + ')[eE]([+-]?\\d+)(?![a-z])(.*)$', 'i'));
    const frac = !sci && !exp && text.match(new RegExp('^(' + NUMBER + ')\\s*/\\s*(' + NUMBER + ')(.*)$'));
    const plain = !sci && !exp && !frac && text.match(new RegExp('^(' + NUMBER + ')(.*)$'));
    const num = (t) => Number(String(t).replace(/,/g, ''));
    let value;
    let rest;
    if (sci) { value = num(sci[1]) * Math.pow(10, Number(sci[2])); rest = sci[3]; }
    else if (exp) { value = num(exp[1]) * Math.pow(10, Number(exp[2])); rest = exp[3]; }
    else if (frac) { value = num(frac[1]) / num(frac[2]); rest = frac[3]; }
    else if (plain) { value = num(plain[1]); rest = plain[2]; }
    else return null;
    if (!Number.isFinite(value)) return null;
    const spaced = /^[\s%\u00b0(]/.test(rest) || !rest.trim();
    rest = rest.replace(/[()]/g, ' ').trim().replace(/[.\s]+$/, '').toLowerCase();
    return { value, rest, spaced };
  }

  // What may follow a number and still leave it a plain measurement: "meters/second", "kg", "%".
  function isUnit(rest) {
    if (!rest) return true;
    if (!/^[a-z%\u00b0][a-z%\u00b0 ./-]*$/.test(rest)) return false;
    return !rest.split(/[ ./-]+/).some(w => NOT_A_UNIT.has(w));
  }

  const sameNumber = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

  // true or false when both sides are numbers (with or without units), null when the key is not one.
  function gradeNumber(userAnswer, candidate) {
    const key = leadingNumber(candidate);
    // "4A" and "2D" are not measurements: a unit in the key is set apart by a space.
    if (!key || !isUnit(key.rest) || (key.rest && !key.spaced)) return null;
    const user = leadingNumber(userAnswer);
    if (!user || !isUnit(user.rest)) return false;
    if (user.rest && !key.rest && !user.spaced) return false;
    if (!sameNumber(user.value, key.value)) return false;
    // Units are not checked letter by letter ("m/s" for "meters/second"), only that they start alike.
    return !user.rest || !key.rest || user.rest[0] === key.rest[0];
  }

  // "4, 1, 3, 2" and "B, A, C" are orderings: the same items in another order are a different answer.
  function orderedItems(text) {
    const items = normalize(String(text).replace(/\band\b/gi, ' ').replace(/[-\u2212](?=\s*\d)/g, ' neg')).split(' ').filter(Boolean);
    return items.length > 1 && items.every(t => /^(neg)?\d+$/.test(t) || t.length === 1) ? items : null;
  }

  function textScore(user, userTokens, candidate) {
    const candTokens = tokenize(candidate);
    if (!candTokens.length) return 0;
    // "xray" for "X-ray", "nonmetal" for "non-metal".
    if (user.replace(/ /g, '') === candidate.replace(/ /g, '')) return 1;
    const correctedUserTokens = autocorrectTokens(userTokens, candTokens);
    const tokenScore = jaccard(correctedUserTokens, candTokens);
    const fuzzyTokenScore = bestTokenMatchScore(correctedUserTokens, candTokens);
    const editScore = similarity(user, candidate);
    return (Math.max(tokenScore, fuzzyTokenScore) * 0.5) +
           (Math.min(tokenScore, fuzzyTokenScore) * 0.2) +
           (editScore * 0.3);
  }

  function gradeShortAnswer(userAnswer, correctAnswer, threshold) {
    const key = parseKey(correctAnswer);
    const user = normalize(userAnswer);
    if (!user || !key.accept.length) return { isCorrect: false, score: 0, matched: '' };

    const squash = (t) => String(t || '').toLowerCase().replace(/\s+/g, '');
    const typed = squash(userAnswer);
    // An answer the key rules out is wrong, unless the key also lists it as written ("+5", not "5").
    const ruledOut = key.reject.some(r => squash(r) === typed) && !key.accept.some(c => !c.derived && squash(c.text) === typed);
    if (ruledOut) return { isCorrect: false, score: 0, matched: '' };

    // Numbers are compared as numbers, never by how alike they look ("1.01" is not "1.02").
    let numericKeys = 0;
    for (const candidate of key.accept) {
      const verdict = gradeNumber(userAnswer, candidate.text);
      if (verdict === null) continue;
      numericKeys += 1;
      if (verdict) return { isCorrect: true, score: 1, matched: String(candidate.text) };
    }
    if (numericKeys === key.accept.length) return { isCorrect: false, score: 0, matched: String(key.accept[0].text) };

    const userTokens = tokenize(user);
    let best = { score: 0, matched: '', derived: false };
    for (const entry of key.accept) {
      if (gradeNumber(userAnswer, entry.text) !== null) continue;
      const candidate = normalize(entry.text);
      if (!candidate) continue;
      let score = textScore(user, userTokens, candidate);
      const ordered = orderedItems(entry.text);
      if (ordered) {
        const mine = orderedItems(userAnswer) || [];
        score = mine.length === ordered.length && mine.every((t, i) => t === ordered[i]) ? 1 : 0;
      } else if (isList(entry.text) && score < 1) {
        // A list ("MERCURY; VENUS; MARS") needs every part, in any order: part of it is not enough.
        const candTokens = tokenize(candidate);
        const covered = bestTokenMatchScore(candTokens, autocorrectTokens(userTokens, candTokens));
        if (covered < 0.8) score = Math.min(score, covered * 0.7);
      }
      if (score > best.score) best = { score, matched: candidate, derived: entry.derived };
    }

    const min = key.accept.length > 1 ? 0.66 : 0.7;
    const applied = Math.max(min, Number(threshold ?? 0.72));
    let isCorrect = best.score >= applied;

    // A near match to a refused answer stays wrong unless it is, word for word, a listed one.
    if (isCorrect && (best.score < 1 || best.derived)) {
      for (const raw of key.reject) {
        const refused = normalize(raw);
        if (refused && textScore(user, userTokens, refused) >= 0.9) { isCorrect = false; break; }
      }
    }
    return { isCorrect, score: best.score, matched: best.matched, threshold: applied };
  }

  // A letter is compared as a letter. On an interrupt the choices may not have been read yet, so
  // the answer itself ("basic" for "W) BASIC") counts too.
  function gradeMC(userAnswer, correctAnswer) {
    const correct = extractChoiceLetter(correctAnswer);
    const typed = String(userAnswer || '').trim();
    const letterOnly = typed.toUpperCase().match(/^([WXYZ])\s*[).:]?$/);
    const lettered = typed.toUpperCase().match(/^([WXYZ])\s*[).:]\s*\S/);
    if (letterOnly || lettered) {
      const user = (letterOnly || lettered)[1];
      return { isCorrect: !!correct && user === correct, score: correct && user === correct ? 1 : 0 };
    }
    const text = String(correctAnswer || '').replace(/^\s*[WXYZ]\s*[).:]\s*/i, '');
    if (!typed || !text || text === String(correctAnswer || '')) return { isCorrect: false, score: 0 };
    const res = gradeShortAnswer(typed, text, 0.8);
    return { isCorrect: res.isCorrect, score: res.score };
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



