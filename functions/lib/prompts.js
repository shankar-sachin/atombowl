// Turns a client request into a model job: what it costs, the prompt, and how to read the reply.
// Pure (no Firebase, no network) so tests can run it directly.

export class RequestError extends Error {
  constructor(message) {
    super(message);
    this.code = "invalid-argument";
  }
}

// Category values match the bank so generated questions work with practice's topic groups.
export const TOPICS = {
  BIOLOGY: "Biology",
  CHEMISTRY: "Chemistry",
  PHYSICS: "Physics",
  MATH: "Math",
  "EARTH AND SPACE": "Earth and space",
  ENERGY: "Energy",
  "GENERAL SCIENCE": "General science"
};

const LEVELS = { MS: "middle school", HS: "high school" };
const MC_LETTERS = ["W", "X", "Y", "Z"];
const MAX_QUESTIONS = 5;
const MAX_TURNS = 12;
const MAX_TEXT = 2000;

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanBlock = (value, max) => String(value ?? "").replace(/\r/g, "").trim().slice(0, max);

// ---------- Tutor ----------

const TUTOR_RULES = `You are the tutor on Atom Bowl, a practice site for the National Science Bowl (NSB). Your students are middle and high school players.

- Teach the idea behind the question, not just the answer. Show the key step or calculation when there is one.
- Keep replies under about 150 words unless the student asks for more. Use short paragraphs; **bold** and "- " lists are fine. No headings or tables.
- Write math in LaTeX: \\( ... \\) inline and \\[ ... \\] for an equation on its own line, for example \\(F = ma\\). Never use single dollar signs.
- Be accurate. If you are not sure, say so. If an official answer looks wrong or incomplete, say that carefully and explain why.
- NSB grades short answers strictly, but accepts clear equivalents (a synonym, a symbol for an element). When asked whether an answer should count, explain what a moderator would likely accept.
- Stay on science, math and NSB practice. Politely turn down anything else, and never write content that is not appropriate for students.`;

function tutorContext(context) {
  if (!context || typeof context !== "object") return "";
  const lines = [];
  const question = cleanBlock(context.question, 1500);
  if (question) lines.push(`Question: ${question}`);
  else if (context.hasImage) lines.push("Question: shown to the student as an image, so you cannot see its text.");
  const official = clean(context.answer, 300);
  if (official) lines.push(`Official answer: ${official}`);
  const given = clean(context.userAnswer, 300);
  lines.push(`Student's answer: ${given || "(none, the student did not answer)"}`);
  const extra = [clean(context.category, 40), context.bonus ? "bonus" : "toss-up", clean(context.level, 4)].filter(Boolean).join(", ");
  if (extra) lines.push(`Details: ${extra}`);
  return `\n\nThe student just missed this practice question and asked you about it:\n${lines.join("\n")}`;
}

function tutorMessages(raw) {
  if (!Array.isArray(raw)) throw new RequestError("Send the conversation as a list of messages.");
  const messages = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, text: cleanBlock(m.text, MAX_TEXT) }))
    .filter((m) => m.text)
    .slice(-MAX_TURNS);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    throw new RequestError("Type a question for the tutor first.");
  }
  return messages;
}

// Tutor's first answer in a chat uses the main model and follow-ups the cheaper follow-up model.
// Extra thinking always uses the main model with high reasoning effort, for more credits.
export const TUTOR_COST = 1;
export const THINKING_COST = 3;

function tutorJob(data) {
  const messages = tutorMessages(data?.messages);
  const thinking = data?.thinking === true;
  const followUp = messages.some((m) => m.role === "assistant");
  return {
    cost: thinking ? THINKING_COST : TUTOR_COST,
    tier: thinking || !followUp ? "main" : "followup",
    reasoning: thinking ? "high" : "low",
    system: TUTOR_RULES + tutorContext(data?.context),
    messages,
    json: false,
    // Reasoning tokens count against this limit on Groq, so high effort needs more room.
    maxTokens: thinking ? 6000 : 1200,
    temperature: 0.4,
    parse: (text) => {
      const reply = cleanBlock(text, 6000);
      if (!reply) throw new Error("empty reply");
      return { reply };
    }
  };
}

// ---------- Generate ----------

function generateOptions(data) {
  const topic = String(data?.topic || "").toUpperCase();
  if (!TOPICS[topic]) throw new RequestError("Pick a topic.");
  const level = data?.level === "HS" ? "HS" : "MS";
  const format = ["SA", "MC", "MIXED"].includes(data?.format) ? data.format : "MIXED";
  const kind = ["pair", "tossup", "bonus"].includes(data?.kind) ? data.kind : "pair";
  const count = Math.min(MAX_QUESTIONS, Math.max(1, parseInt(data?.count, 10) || 3));
  const focus = clean(data?.focus, 120);
  return { topic, level, format, kind, count, focus };
}

function generatePrompt(opts) {
  const total = opts.kind === "pair" ? opts.count * 2 : opts.count;
  const order = opts.kind === "pair"
    ? `Order them toss-up, bonus, toss-up, bonus, and so on: "bonus" is false for toss-ups and true for bonuses.`
    : `Every question has "bonus": ${opts.kind === "bonus"}.`;
  const what = opts.kind === "pair"
    ? `${opts.count} toss-up and bonus pairs (${opts.count * 2} questions). Each bonus follows its toss-up, is on a related idea and is harder`
    : `${opts.count} ${opts.kind === "tossup" ? "toss-ups" : "bonuses"}`;
  const format = opts.format === "SA" ? "short answer"
    : opts.format === "MC" ? "multiple choice"
    : "a mix of short answer and multiple choice";
  return `Write ${what} for National Science Bowl ${LEVELS[opts.level]} practice.
Topic: ${TOPICS[opts.topic]}${opts.focus ? `, focused on ${opts.focus}` : ""}.
Format: ${format}.

Follow the official NSB style:
- One clear question with exactly one correct answer, readable aloud in under 20 seconds. Toss-ups are answerable in seconds; bonuses may need a short calculation (no calculators at NSB, so keep numbers friendly).
- Multiple choice has exactly four choices, W to Z, all plausible and of similar length. Do not put the letters in the choice text.
- Short answers are a word, a short phrase or a number with units.
- Every fact must be correct for the ${LEVELS[opts.level]} level. Do not repeat a question.

Reply with JSON only, in this shape:
{"questions":[{"bonus":false,"type":"SA","question":"...","answer":"...","subtopic":"..."},{"bonus":true,"type":"MC","question":"...","choices":["...","...","...","..."],"answer":"X","subtopic":"..."}]}
The "questions" array must hold exactly ${total} questions. ${order}${opts.format === "MC" ? ' Every question has "type": "MC" and four choices.' : opts.format === "SA" ? ' Every question has "type": "SA" and no choices.' : ""}
For multiple choice, "answer" is the letter of the correct choice. "subtopic" is 2 to 4 words.`;
}

function extractJson(text) {
  const body = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(body); } catch {}
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(body.slice(start, end + 1)); } catch {}
  }
  return null;
}

// Converts the model's questions into the bank's record shape (see src/data/set_B.json).
export function toBankQuestions(text, opts) {
  const parsed = extractJson(text);
  const items = Array.isArray(parsed?.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : [];
  const out = [];
  let pair = 0;
  for (const item of items) {
    const stem = cleanBlock(item?.question, 900);
    if (!stem) continue;
    const bonus = opts.kind === "bonus" ? true : opts.kind === "tossup" ? false : !!item.bonus;
    const choices = Array.isArray(item.choices) ? item.choices.map((c) => clean(c, 200).replace(/^[A-DW-Z]\)\s*/i, "")).filter(Boolean) : [];
    const saidMc = String(item.type).toUpperCase() === "MC" || choices.length > 0;
    const isMc = opts.format === "MC" || (opts.format !== "SA" && saidMc);
    let questionText = stem;
    let answer = clean(item.answer, 200);
    if (isMc) {
      if (choices.length !== 4) continue;
      // Models often letter choices A to D instead of NSB's W to Z.
      // A full-text answer wins over a leading letter ("A car's wheels" is text, not choice A).
      const byText = choices.findIndex((c) => c.toLowerCase() === answer.replace(/^[A-DW-Z]\)\s*/i, "").toLowerCase());
      const given = answer.toUpperCase().match(/^([WXYZ]|[ABCD])(?:\)|\.|\s|$)/)?.[1];
      const letter = byText >= 0 ? MC_LETTERS[byText]
        : given ? (MC_LETTERS.includes(given) ? given : MC_LETTERS["ABCD".indexOf(given)]) : undefined;
      if (!letter) continue;
      questionText = `${stem}\n${choices.map((c, i) => `${MC_LETTERS[i]}) ${c}`).join("\n")}`;
      answer = `${letter}) ${choices[MC_LETTERS.indexOf(letter)]}`;
    }
    if (!answer) continue;
    if (!bonus) pair += 1;
    out.push({
      set_name: "Generated",
      round_name: "generated",
      num: Math.max(pair, 1),
      bonus,
      level: opts.level,
      category: opts.topic,
      type: isMc ? "MC" : "SA",
      question_text: questionText,
      parsed_answer: answer.toUpperCase(),
      detailed_category: clean(item.subtopic, 60),
      generated: true
    });
  }
  const limit = opts.kind === "pair" ? opts.count * 2 : opts.count;
  return out.slice(0, limit);
}

function generateJob(data) {
  const opts = generateOptions(data);
  const total = opts.kind === "pair" ? opts.count * 2 : opts.count;
  return {
    cost: total,
    // Answer keys need the main model: the smaller one wrote wrong keys in testing.
    tier: "main",
    reasoning: "low",
    system: "You write accurate, original practice questions for the National Science Bowl. You reply with JSON only.",
    messages: [{ role: "user", text: generatePrompt(opts) }],
    json: true,
    maxTokens: 4000,
    temperature: 0.8,
    options: opts,
    parse: (text) => {
      const questions = toBankQuestions(text, opts);
      if (!questions.length) throw new Error("no usable questions in the reply");
      return { questions };
    },
    // Only questions that came back usable are paid for.
    charged: (result) => result.questions.length
  };
}

export function buildJob(action, data) {
  if (action === "tutor") return tutorJob(data);
  if (action === "generate") return generateJob(data);
  throw new RequestError("Unknown action.");
}
