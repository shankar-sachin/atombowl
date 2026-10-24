// Questions a buzzer room can supply for the host to read (Scalazar, Set B: text only, no images).
// Pure helpers: no DOM, no Firebase, so they run in the browser and in node tests.

export type Question = { [key: string]: any };

export const QUESTION_LEVELS = ["HS", "MS"];

/** Room category (see CATEGORIES in room_state.ts) -> the Set B categories it covers. */
const CATEGORY_MAP: { [room: string]: string[] } = {
  Biology: ["BIOLOGY"],
  Chemistry: ["CHEMISTRY"],
  "Earth and space": ["EARTH SCIENCE", "EARTH AND SPACE", "ASTRONOMY"],
  Energy: ["ENERGY"],
  Math: ["MATH"],
  Physics: ["PHYSICS"],
  "Computer science": ["COMPUTER SCIENCE"]
};

export function normalizeLevel(value: any): string {
  return value === "MS" ? "MS" : "HS";
}

/** Whether a room category ("General" = anything) allows a bank question's category. */
export function categoryAllows(roomCategory: string, questionCategory: string): boolean {
  const allowed = CATEGORY_MAP[roomCategory];
  if (!allowed) return true;
  return allowed.includes(String(questionCategory || "").toUpperCase());
}

/**
 * Indexes into `bank` of readable questions: text only, the right division, toss-up or bonus,
 * and in the category. Falls back to every category when the chosen one has none left.
 */
export function questionPool(bank: Question[], opts: { level?: string; bonus?: boolean; category?: string }): number[] {
  const level = normalizeLevel(opts.level);
  const wantBonus = !!opts.bonus;
  const base: number[] = [];
  const inCategory: number[] = [];
  bank.forEach((q, i) => {
    if (!q || q.question_image || !String(q.question_text || "").trim()) return;
    if (q.level !== level || !!q.bonus !== wantBonus) return;
    base.push(i);
    if (categoryAllows(opts.category || "General", q.category)) inCategory.push(i);
  });
  return inCategory.length ? inCategory : base;
}

/** A random index from `pool` not in `used`; when all are used, the pool starts over. */
export function pickIndex(pool: number[], used: Set<number>, rng: () => number = Math.random): number | null {
  if (!pool.length) return null;
  let fresh = pool.filter(i => !used.has(i));
  if (!fresh.length) {
    pool.forEach(i => used.delete(i));
    fresh = pool;
  }
  const chosen = fresh[Math.min(fresh.length - 1, Math.floor(rng() * fresh.length))];
  used.add(chosen);
  return chosen;
}

/** Set B has a few mangled quote and dash bytes, like "Earth=92=s axis". */
export function cleanText(text: any): string {
  return String(text ?? "")
    .replace(/(\w)=9[1-4]=(?=\w)/g, "$1'")
    .replace(/(\w)=96=(?=\w)/g, "$1-");
}

/** What the voice says: choices on their own lines read as separate sentences. */
export function speechText(q: Question, kind: "tossup" | "bonus" = "tossup"): string {
  const body = cleanText(q?.question_text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => (/[.?!:]$/.test(line) ? line : `${line}.`))
    .join(" ");
  const type = q?.type === "MC" ? "Multiple choice. " : "Short answer. ";
  return `${kind === "bonus" ? "Bonus. " : "Toss-up. "}${type}${body}`;
}
