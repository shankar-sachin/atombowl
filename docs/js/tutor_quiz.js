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
export const MAX_QUIZ_QUESTIONS = 8;
const splitList = (raw) => raw.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
function finish(d) {
    const q = d.q.trim();
    if (!q)
        return null;
    if (d.kind === "mc") {
        const seen = new Set();
        const choices = d.choices.filter((c) => c.text.trim() && !seen.has(c.letter) && seen.add(c.letter)).map((c) => ({ letter: c.letter, text: c.text.trim() }));
        const letter = (d.answer.toUpperCase().match(/[A-D]/) || [""])[0];
        if (choices.length < 2 || !choices.some((c) => c.letter === letter))
            return null;
        return { kind: "mc", q, choices, answer: letter, accept: [], why: d.why.trim() };
    }
    const answer = d.answer.trim();
    if (!answer)
        return null;
    return { kind: "sa", q, choices: [], answer, accept: d.accept, why: d.why.trim() };
}
export function parseQuiz(title, lines) {
    const questions = [];
    let cur = null;
    let field = "";
    const push = () => {
        const done = cur && finish(cur);
        if (done)
            questions.push(done);
        cur = null;
        field = "";
    };
    for (const raw of lines) {
        const t = raw.trim();
        const head = t.match(/^Q\s*\d+\s*[(\[]\s*(mc|sa)\s*[)\]]\s*[:.\-]?\s*(.*)$/i);
        if (head) {
            push();
            cur = { kind: head[1].toLowerCase(), q: head[2], choices: [], answer: "", accept: [], why: "" };
            field = "q";
            continue;
        }
        if (!cur || !t)
            continue;
        const d = cur;
        let m;
        if (d.kind === "mc" && (m = t.match(/^([A-D])[).:]\s+(.*)$/))) {
            d.choices.push({ letter: m[1], text: m[2] });
            field = "choice";
        }
        else if ((m = t.match(/^Answer\s*:\s*(.*)$/i))) {
            d.answer = m[1];
            field = "answer";
        }
        else if ((m = t.match(/^Accept\s*:\s*(.*)$/i))) {
            d.accept = splitList(m[1]);
            field = "accept";
        }
        else if ((m = t.match(/^(?:Why|Explanation)\s*:\s*(.*)$/i))) {
            d.why = m[1];
            field = "why";
        }
        else if (field === "q")
            d.q += `\n${t}`;
        else if (field === "why")
            d.why += ` ${t}`;
        else if (field === "choice")
            d.choices[d.choices.length - 1].text += ` ${t}`;
    }
    push();
    const kept = questions.slice(0, MAX_QUIZ_QUESTIONS);
    return kept.length ? { title: title.trim() || "Quick quiz", questions: kept } : null;
}
// Splits a reply into prose and quizzes. A quiz that cannot be parsed is shown as plain text,
// and one with no closing ":::" ends with the message.
export function splitQuiz(text) {
    const segments = [];
    let buf = [];
    let quizLines = null;
    let title = "";
    const flushText = () => {
        const t = buf.join("\n").trim();
        if (t)
            segments.push({ type: "text", text: t });
        buf = [];
    };
    const flushQuiz = () => {
        const quiz = parseQuiz(title, quizLines || []);
        if (quiz)
            segments.push({ type: "quiz", quiz });
        else
            buf.push(...(quizLines || []));
        quizLines = null;
    };
    for (const line of String(text).replace(/\r/g, "").split("\n")) {
        if (quizLines === null) {
            const open = line.match(/^\s*:::\s*quiz\b\s*(.*)$/i);
            if (open) {
                flushText();
                quizLines = [];
                title = open[1];
            }
            else
                buf.push(line);
        }
        else if (/^\s*:::\s*$/.test(line)) {
            flushQuiz();
        }
        else {
            quizLines.push(line);
        }
    }
    if (quizLines !== null)
        flushQuiz();
    flushText();
    return segments;
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// Multiple choice compares letters. Short answers go through the site's answer checker when it is
// loaded (the same strict-but-fair grading as Practice) and fall back to a plain comparison.
export function gradeQuestion(q, value, grader) {
    const v = String(value || "").trim();
    if (!v)
        return false;
    if (q.kind === "mc")
        return v.toUpperCase() === q.answer;
    const targets = [q.answer, ...q.accept];
    if (grader)
        return !!grader({ userAnswer: v, correctAnswer: targets.join("; "), questionType: "SA" }).isCorrect;
    return targets.some((t) => norm(t) === norm(v));
}
export function quizScore(quiz, index, state) {
    let done = 0;
    let correct = 0;
    quiz.questions.forEach((_, i) => {
        var _a;
        const ok = (_a = state === null || state === void 0 ? void 0 : state.ok) === null || _a === void 0 ? void 0 : _a[`${index}.${i}`];
        if (ok !== undefined) {
            done += 1;
            if (ok)
                correct += 1;
        }
    });
    return { done, correct, total: quiz.questions.length };
}
export function answerText(q) {
    var _a;
    if (q.kind === "mc")
        return `${q.answer}) ${((_a = q.choices.find((c) => c.letter === q.answer)) === null || _a === void 0 ? void 0 : _a.text) || ""}`;
    return q.answer;
}
// The message sent to Tutor when the student asks about the questions they missed.
export function missedMessage(quiz, index, state) {
    const { correct, total } = quizScore(quiz, index, state);
    const lines = [`I finished the quiz "${quiz.title}" and got ${correct} of ${total}. Please explain what I missed.`];
    quiz.questions.forEach((q, i) => {
        var _a, _b;
        if (((_a = state === null || state === void 0 ? void 0 : state.ok) === null || _a === void 0 ? void 0 : _a[`${index}.${i}`]) !== false)
            return;
        const mine = ((_b = state === null || state === void 0 ? void 0 : state.a) === null || _b === void 0 ? void 0 : _b[`${index}.${i}`]) || "(blank)";
        lines.push(`- ${q.q.replace(/\s+/g, " ")} I answered: ${mine}. Correct: ${answerText(q)}.`);
    });
    return lines.join("\n").slice(0, 1900);
}
//# sourceMappingURL=tutor_quiz.js.map