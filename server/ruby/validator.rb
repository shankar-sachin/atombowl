require "json"

def load_bank(root)
  sources = [
    { id: "data/set_A.json", label: "Bank A" },
    { id: "data/set_B.json", label: "Bank B" }
  ]

  out = []
  sources.each do |src|
    path = File.join(root, "docs", src[:id])
    raw = File.read(path)
    data = JSON.parse(raw)
    items = data.is_a?(Array) ? data : (data["questions"] || [])
    items.each_with_index do |q, i|
      q["bank_id"] = src[:id]
      q["bank_label"] = src[:label]
      q["_index"] = i
      out << q
    end
  end
  out
end

def norm(s)
  (s || "").to_s.strip
end

REQUIRED_FIELDS = %w[question_text category type level].freeze

VALID_CATEGORIES = %w[
  BIOLOGY CHEMISTRY PHYSICS MATH
  EARTH AND SPACE ENERGY
  COMPUTER SCIENCE TECHNOLOGY
].freeze

VALID_LEVELS = %w[MS HS].freeze
VALID_TYPES = %w[SA MC].freeze

def check_missing_fields(questions)
  issues = []
  questions.each do |q|
    missing = REQUIRED_FIELDS.select { |f| norm(q[f]).empty? }
    next if missing.empty?
    issues << {
      type: "missing_field",
      bank: q["bank_label"],
      index: q["_index"],
      set: norm(q["set_name"]),
      fields: missing,
      preview: norm(q["question_text"])[0, 80]
    }
  end
  issues
end

def check_duplicates(questions)
  issues = []
  seen = {}

  questions.each do |q|
    text = norm(q["question_text"]).downcase
    next if text.empty?

    if seen.key?(text)
      orig = seen[text]
      issues << {
        type: "duplicate",
        bank: q["bank_label"],
        index: q["_index"],
        set: norm(q["set_name"]),
        originalBank: orig["bank_label"],
        originalIndex: orig["_index"],
        originalSet: norm(orig["set_name"]),
        preview: norm(q["question_text"])[0, 80]
      }
    else
      seen[text] = q
    end
  end
  issues
end

def check_invalid_categories(questions)
  issues = []
  questions.each do |q|
    cat = norm(q["category"]).upcase
    next if cat.empty?

    unless VALID_CATEGORIES.include?(cat)
      issues << {
        type: "invalid_category",
        bank: q["bank_label"],
        index: q["_index"],
        set: norm(q["set_name"]),
        value: norm(q["category"]),
        preview: norm(q["question_text"])[0, 80]
      }
    end

    level = norm(q["level"]).upcase
    if !level.empty? && !VALID_LEVELS.include?(level)
      issues << {
        type: "invalid_level",
        bank: q["bank_label"],
        index: q["_index"],
        set: norm(q["set_name"]),
        value: norm(q["level"]),
        preview: norm(q["question_text"])[0, 80]
      }
    end

    qtype = norm(q["type"]).upcase
    if !qtype.empty? && !VALID_TYPES.include?(qtype)
      issues << {
        type: "invalid_type",
        bank: q["bank_label"],
        index: q["_index"],
        set: norm(q["set_name"]),
        value: norm(q["type"]),
        preview: norm(q["question_text"])[0, 80]
      }
    end
  end
  issues
end

def check_empty_answers(questions)
  issues = []
  questions.each do |q|
    answer = norm(q["parsed_answer"])
    answer_text = norm(q["answer_text"])

    if answer.empty? && answer_text.empty?
      issues << {
        type: "empty_answer",
        bank: q["bank_label"],
        index: q["_index"],
        set: norm(q["set_name"]),
        preview: norm(q["question_text"])[0, 80]
      }
    end
  end
  issues
end

CHECK_MAP = {
  "missing_fields" => method(:check_missing_fields),
  "duplicates" => method(:check_duplicates),
  "invalid_categories" => method(:check_invalid_categories),
  "empty_answers" => method(:check_empty_answers)
}.freeze

ALL_CHECKS = CHECK_MAP.keys.freeze

input = JSON.parse(STDIN.read || "{}")
root = File.expand_path("../..", __dir__)
bank_choice = input["bank"] || "ALL"
checks = input["checks"] || ALL_CHECKS
checks = ALL_CHECKS if checks.empty?

bank = load_bank(root)

questions = if bank_choice == "ALL"
  bank
else
  bank.select { |q| q["bank_id"] == bank_choice }
end

all_issues = []
checks.each do |check_name|
  fn = CHECK_MAP[check_name]
  next unless fn
  all_issues.concat(fn.call(questions))
end

summary = all_issues.group_by { |i| i[:type] }.transform_values(&:length)

result = {
  total: questions.length,
  issues: all_issues,
  summary: summary,
  checksRun: checks,
  valid: all_issues.empty?
}

STDOUT.write(JSON.generate(result))
