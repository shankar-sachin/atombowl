// @ts-nocheck
(function () {
  'use strict';

  const norm = (s) => String(s == null ? '' : s).trim();

  // ---- Stats (formerly server/ruby/stats.rb) ----
  function countBy(items, keyFn) {
    const out = {};
    for (const item of items) {
      const key = keyFn(item);
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  }

  function stats(questions) {
    const field = (name) => (q) => norm(q[name]) || 'Unknown';
    const byCategory = countBy(questions, field('category'));
    const byDetailedCategory = countBy(questions, field('detailed_category'));
    const bySet = countBy(questions, field('set_name'));
    return {
      total: questions.length,
      byCategory,
      byLevel: countBy(questions, field('level')),
      byType: countBy(questions, field('type')),
      byBonus: countBy(questions, (q) => (q.bonus ? 'Bonus' : 'Tossup')),
      byDetailedCategory,
      bySet,
      categories: Object.keys(byCategory).sort(),
      sets: Object.keys(bySet).sort(),
      detailedCategories: Object.keys(byDetailedCategory).sort()
    };
  }

  // ---- Validator (formerly server/ruby/validator.rb) ----
  // Questions need bank_label and _index set by the caller.
  const REQUIRED_FIELDS = ['question_text', 'category', 'type', 'level'];
  const VALID_CATEGORIES = ['BIOLOGY', 'CHEMISTRY', 'PHYSICS', 'MATH', 'EARTH AND SPACE', 'ENERGY', 'COMPUTER SCIENCE', 'TECHNOLOGY'];
  const VALID_LEVELS = ['MS', 'HS'];
  const VALID_TYPES = ['SA', 'MC'];

  function issue(type, q, extra = {}) {
    return { type, bank: q.bank_label, index: q._index, set: norm(q.set_name), ...extra, preview: norm(q.question_text).slice(0, 80) };
  }

  const CHECKS = {
    missing_fields(questions) {
      const out = [];
      for (const q of questions) {
        const fields = REQUIRED_FIELDS.filter((f) => !norm(q[f]));
        if (fields.length) out.push(issue('missing_field', q, { fields }));
      }
      return out;
    },
    duplicates(questions) {
      const out = [];
      const seen = new Map();
      for (const q of questions) {
        const text = norm(q.question_text).toLowerCase();
        if (!text) continue;
        const orig = seen.get(text);
        if (orig) {
          out.push(issue('duplicate', q, { originalBank: orig.bank_label, originalIndex: orig._index, originalSet: norm(orig.set_name) }));
        } else {
          seen.set(text, q);
        }
      }
      return out;
    },
    invalid_categories(questions) {
      const out = [];
      for (const q of questions) {
        if (!norm(q.category)) continue;
        if (!VALID_CATEGORIES.includes(norm(q.category).toUpperCase())) out.push(issue('invalid_category', q, { value: norm(q.category) }));
        const level = norm(q.level);
        if (level && !VALID_LEVELS.includes(level.toUpperCase())) out.push(issue('invalid_level', q, { value: level }));
        const type = norm(q.type);
        if (type && !VALID_TYPES.includes(type.toUpperCase())) out.push(issue('invalid_type', q, { value: type }));
      }
      return out;
    },
    empty_answers(questions) {
      return questions.filter((q) => !norm(q.parsed_answer) && !norm(q.answer_text)).map((q) => issue('empty_answer', q));
    }
  };

  function validate(questions, checks) {
    const run = checks && checks.length ? checks : Object.keys(CHECKS);
    const issues = [];
    for (const name of run) if (CHECKS[name]) issues.push(...CHECKS[name](questions));
    return { total: questions.length, issues, summary: countBy(issues, (i) => i.type), checksRun: run, valid: issues.length === 0 };
  }

  // ---- Difficulty (formerly server/python/difficulty.py) ----
  const CATEGORY_MULTIPLIERS = {
    PHYSICS: 1.15, MATH: 1.15, CHEMISTRY: 1.10, 'COMPUTER SCIENCE': 1.10,
    BIOLOGY: 1.00, 'EARTH AND SPACE': 1.00, ENERGY: 0.95, TECHNOLOGY: 0.95
  };
  const LEVEL_MULTIPLIERS = { HS: 1.10, MS: 0.90 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round = (v, d) => {
    const f = 10 ** d;
    return Math.round(v * f) / f;
  };
  const sum = (arr, fn) => arr.reduce((t, x) => t + fn(x), 0);
  const getWords = (text) => text.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const splitSentences = (text) => text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);

  function countSyllables(word) {
    let w = word.toLowerCase().trim();
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:es|ed|e)$/, '') || w;
    return Math.max((w.match(/[aeiouy]+/g) || []).length, 1);
  }

  function scoreReadability(text) {
    const words = getWords(text);
    if (!words.length) return 0;
    const sentences = Math.max(splitSentences(text).length, 1);
    const syllables = sum(words, countSyllables);
    const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
    return clamp(grade * 0.7, 0, 10);
  }

  function scoreVocabulary(text) {
    const words = getWords(text);
    if (!words.length) return 0;
    const avgLen = sum(words, (w) => w.length) / words.length;
    const longRatio = words.filter((w) => w.length >= 8).length / words.length;
    return clamp((avgLen - 3) * 2, 0, 10) * 0.6 + Math.min(10, longRatio * 25) * 0.4;
  }

  function scoreAnswerComplexity(answer, type) {
    if (!answer || type === 'MC') return 2;
    const words = getWords(answer);
    const avgLen = sum(words, (w) => w.length) / Math.max(words.length, 1);
    return Math.min(10, words.length * 1.5) * 0.5 + clamp((avgLen - 3) * 2.5, 0, 10) * 0.5;
  }

  function scoreSentenceComplexity(text) {
    const words = getWords(text);
    const sentences = splitSentences(text);
    if (!words.length || !sentences.length) return 0;
    const punct = (text.match(/[,;:\-()]/g) || []).length;
    return Math.min(10, (words.length / sentences.length) * 0.35) * 0.6 + Math.min(10, (punct / words.length) * 20) * 0.4;
  }

  function difficulty({ questionText, parsedAnswer, category, type, level }) {
    const text = String(questionText || '');
    const cat = String(category || '').toUpperCase();
    const words = getWords(text);
    const readability = scoreReadability(text);
    const vocabulary = scoreVocabulary(text);
    const answerComp = scoreAnswerComplexity(String(parsedAnswer || ''), String(type || '').toUpperCase());
    const sentenceComp = scoreSentenceComplexity(text);
    const catMult = CATEGORY_MULTIPLIERS[cat] ?? 1;
    const lvlMult = LEVEL_MULTIPLIERS[String(level || '').toUpperCase()] ?? 1;
    const raw = (readability * 0.30 + vocabulary * 0.25 + answerComp * 0.25 + sentenceComp * 0.20) * catMult * lvlMult;
    const score = round(clamp(raw, 1, 10), 1);
    return {
      difficulty: score,
      level: score <= 3 ? 'easy' : score <= 6 ? 'medium' : score <= 8 ? 'hard' : 'very hard',
      components: {
        readability: round(readability, 2),
        vocabulary: round(vocabulary, 2),
        answerComplexity: round(answerComp, 2),
        sentenceComplexity: round(sentenceComp, 2)
      },
      wordCount: words.length,
      avgWordLength: round(sum(words, (w) => w.length) / Math.max(words.length, 1), 2),
      syllableCount: sum(words, countSyllables),
      categoryMultiplier: catMult,
      levelMultiplier: lvlMult
    };
  }

  window.atomBankTools = { stats, validate, difficulty };
})();
