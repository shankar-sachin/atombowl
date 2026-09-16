const fs = require("fs");
const path = require("path");

function norm(value) {
  return String(value || "").trim();
}

function loadBank(root) {
  const sources = [
    { id: "data/set_A.json", label: "Bank A" },
    { id: "data/set_B.json", label: "Bank B" }
  ];

  const out = [];
  for (const source of sources) {
    const filePath = path.join(root, "docs", source.id);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    for (const item of items) {
      out.push({
        ...item,
        bank_id: source.id,
        bank_label: source.label
      });
    }
  }
  return out;
}

function matches(question, search, bank, level, category, bonus) {
  if (bank !== "ALL" && question.bank_id !== bank) return false;
  if (level !== "ANY" && question.level !== level) return false;
  if (category !== "ANY" && norm(question.category) !== category) return false;
  if (bonus !== "ANY" && String(Boolean(question.bonus)) !== String(bonus)) return false;

  if (!search) return true;
  const s = search.toLowerCase();
  const haystack = [
    question.set_name,
    question.round_name,
    question.category,
    question.type,
    question.parsed_answer,
    question.question_text,
    question.answer_text,
    question.page,
    question.num
  ].map((v) => String(v || "")).join(" | ").toLowerCase();

  return haystack.includes(s);
}

function searchLocal(root, payload) {
  const search = norm(payload.search);
  const bankChoice = payload.bank || "ALL";
  const level = payload.level || "ANY";
  const category = payload.category || "ANY";
  const bonus = payload.bonus || "ANY";
  let page = Number(payload.page || 1);
  let pageSize = Number(payload.pageSize || 100);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 1;
  if (pageSize > 200) pageSize = 200;

  page = Math.floor(page);
  pageSize = Math.floor(pageSize);
  const bank = loadBank(root);
  const filtered = bank.filter((q) => matches(q, search, bankChoice, level, category, bonus));
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    total,
    page,
    pageSize,
    items
  };
}

module.exports = { searchLocal };
