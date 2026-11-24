// Quizzes inside Tutor chats. The model writes a plain-text block, which the widget shows as an
// interactive quiz:
//
//   :::quiz Photoelectric effect
//   Q1 (mc): Which quantity sets the maximum kinetic energy of an emitted electron?
//   A) Light intensity
//   B) Light frequency
//   Answer: B
//   Why: Photon energy is E = hf.
//
//   Q2 (sa): What is the SI unit of force?
//   Answer: newton
//   Accept: newtons; N
//   Why: F = ma gives kg m/s^2, named the newton.
//   :::
//
// Plain text instead of JSON, so LaTeX backslashes never need escaping.

export type Choice = { letter: string; text: string };
export type QuizQuestion = { kind: "mc" | "sa"; q: string; choices: Choice[]; answer: string; accept: string[]; why: string };
export type Quiz = { title: string; questions: QuizQuestion[] };
export type Segment = { type: "text"; text: string } | { type: "quiz"; quiz: Quiz };
// Progress saved on the message: a[key] is what was answered, ok[key] whether it was right.
// A question is finished once ok[key] exists. key is `${quizIndex}.${questionIndex}`.
export type QuizState = { a: Record<string, string>; ok: Record<string, boolean> };

export const MAX_QUIZ_QUESTIONS = 8;

const splitList = (raw: string) => raw.split(/[;|]/).map((s) => s.trim()).filter(Boolean);

type Draft = { kind: "mc" | "sa"; q: string; choices: Choice[]; answer: string; accept: string[]; why: string };

function finish(d: Draft): QuizQuestion | null {
  const q = d.q.trim();
  if (!q) return null;
  if (d.kind === "mc") {
    const seen = new Set<string>();
    const choices = d.choices.filter((c) => c.text.trim() && !seen.has(c.letter) && seen.add(c.letter)).map((c) => ({ letter: c.letter, text: c.text.trim() }));
    // The key is a letter on its own ("B", "B)", "(B) Bromine"), never the first A-D inside a word.
    // An answer written out in words is matched to the choice with that text.
    const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const written = d.answer.trim().toUpperCase().match(/^\(?([A-D])(?:[).:]|\s|$)/);
    const letter = written ? written[1] : (choices.find((c) => plain(c.text) && plain(c.text) === plain(d.answer))?.letter || "");
    if (choices.length < 2 || !choices.some((c) => c.letter === letter)) return null;
    return { kind: "mc", q, choices, answer: letter, accept: [], why: d.why.trim() };
  }
  const answer = d.answer.trim();
  if (!answer) return null;
  return { kind: "sa", q, choices: [], answer, accept: d.accept, why: d.why.trim() };
}

export function parseQuiz(title: string, lines: string[]): Quiz | null {
  const questions: QuizQuestion[] = [];
  let cur: Draft | null = null;
  let field = "";
  const push = () => {
    const done = cur && finish(cur);
    if (done) questions.push(done);
    cur = null;
    field = "";
  };
  for (const raw of lines) {
    const t = raw.trim();
    const head = t.match(/^Q\s*\d+\s*[(\[]\s*(mc|sa)\s*[)\]]\s*[:.\-]?\s*(.*)$/i);
    if (head) {
      push();
      cur = { kind: head[1].toLowerCase() as "mc" | "sa", q: head[2], choices: [], answer: "", accept: [], why: "" };
      field = "q";
      continue;
    }
    if (!cur || !t) continue;
    const d: Draft = cur;
    let m: RegExpMatchArray | null;
    if (d.kind === "mc" && (m = t.match(/^([A-D])[).:]\s+(.*)$/))) { d.choices.push({ letter: m[1], text: m[2] }); field = "choice"; }
    else if ((m = t.match(/^Answer\s*:\s*(.*)$/i))) { d.answer = m[1]; field = "answer"; }
    else if ((m = t.match(/^Accept\s*:\s*(.*)$/i))) { d.accept = splitList(m[1]); field = "accept"; }
    else if ((m = t.match(/^(?:Why|Explanation)\s*:\s*(.*)$/i))) { d.why = m[1]; field = "why"; }
    else if (field === "q") d.q += `\n${t}`;
    else if (field === "why") d.why += ` ${t}`;
    else if (field === "choice") d.choices[d.choices.length - 1].text += ` ${t}`;
  }
  push();
  const kept = questions.slice(0, MAX_QUIZ_QUESTIONS);
  return kept.length ? { title: title.trim() || "Quick quiz", questions: kept } : null;
}

// Splits a reply into prose and quizzes. A quiz that cannot be parsed is shown as plain text,
// and one with no closing ":::" ends with the message.
export function splitQuiz(text: string): Segment[] {
  const segments: Segment[] = [];
  let buf: string[] = [];
  let quizLines: string[] | null = null;
  let title = "";
  const flushText = () => {
    const t = buf.join("\n").trim();
    if (t) segments.push({ type: "text", text: t });
    buf = [];
  };
  const flushQuiz = () => {
    const quiz = parseQuiz(title, quizLines || []);
    if (quiz) segments.push({ type: "quiz", quiz });
    else buf.push(...(quizLines || []));
    quizLines = null;
  };
  for (const line of String(text).replace(/\r/g, "").split("\n")) {
    if (quizLines === null) {
      const open = line.match(/^\s*:::\s*quiz\b\s*(.*)$/i);
      if (open) { flushText(); quizLines = []; title = open[1]; }
      else buf.push(line);
    } else if (/:::\s*$/.test(line)) {
      // The closing marker usually has its own line, but the model sometimes ends a line with it.
      const rest = line.replace(/\s*:::\s*$/, "");
      if (rest.trim()) quizLines.push(rest);
      flushQuiz();
    } else {
      quizLines.push(line);
    }
  }
  if (quizLines !== null) flushQuiz();
  flushText();
  return segments;
}

type Grader = (input: { userAnswer: string; correctAnswer: string; questionType: string }) => { isCorrect?: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Multiple choice compares letters. Short answers go through the site's answer checker when it is
// loaded (the same strict-but-fair grading as Practice) and fall back to a plain comparison.
export function gradeQuestion(q: QuizQuestion, value: string, grader?: Grader): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  if (q.kind === "mc") return v.toUpperCase() === q.answer;
  const targets = [q.answer, ...q.accept];
  if (grader) return !!grader({ userAnswer: v, correctAnswer: targets.join("; "), questionType: "SA" }).isCorrect;
  // Symbols such as π all normalise to nothing, so those are compared as typed.
  return targets.some((t) => (norm(t) && norm(v) ? norm(t) === norm(v) : t.trim().toLowerCase() === v.toLowerCase()));
}

export function quizScore(quiz: Quiz, index: number, state: QuizState | undefined) {
  let done = 0;
  let correct = 0;
  quiz.questions.forEach((_, i) => {
    const ok = state?.ok?.[`${index}.${i}`];
    if (ok !== undefined) { done += 1; if (ok) correct += 1; }
  });
  return { done, correct, total: quiz.questions.length };
}

export function answerText(q: QuizQuestion): string {
  if (q.kind === "mc") return `${q.answer}) ${q.choices.find((c) => c.letter === q.answer)?.text || ""}`;
  return q.answer;
}

// The message sent to Tutor when the student asks about the questions they missed.
export function missedMessage(quiz: Quiz, index: number, state: QuizState | undefined): string {
  const { correct, total } = quizScore(quiz, index, state);
  const lines = [`I finished the quiz "${quiz.title}" and got ${correct} of ${total}. Please explain what I missed.`];
  quiz.questions.forEach((q, i) => {
    if (state?.ok?.[`${index}.${i}`] !== false) return;
    const mine = state?.a?.[`${index}.${i}`] || "(blank)";
    lines.push(`- ${q.q.replace(/\s+/g, " ")} I answered: ${mine}. Correct: ${answerText(q)}.`);
  });
  return lines.join("\n").slice(0, 1900);
}
