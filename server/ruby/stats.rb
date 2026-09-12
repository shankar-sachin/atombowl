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
    items.each do |q|
      q["bank_id"] = src[:id]
      q["bank_label"] = src[:label]
      out << q
    end
  end
  out
end

def norm(s)
  (s || "").to_s.strip
end

input = JSON.parse(STDIN.read || "{}")
root = File.expand_path("../..", __dir__)
bank_choice = input["bank"] || "ALL"

bank = load_bank(root)

# Filter by bank if not ALL
questions = if bank_choice == "ALL"
  bank
else
  bank.select { |q| q["bank_id"] == bank_choice }
end

total = questions.length

by_category = questions.group_by { |q| norm(q["category"]).empty? ? "Unknown" : norm(q["category"]) }
  .transform_values(&:length)

by_level = questions.group_by { |q| norm(q["level"]).empty? ? "Unknown" : norm(q["level"]) }
  .transform_values(&:length)

by_type = questions.group_by { |q| norm(q["type"]).empty? ? "Unknown" : norm(q["type"]) }
  .transform_values(&:length)

by_bonus = questions.group_by { |q| q["bonus"] ? "Bonus" : "Tossup" }
  .transform_values(&:length)

by_detailed_category = questions.group_by { |q| norm(q["detailed_category"]).empty? ? "Unknown" : norm(q["detailed_category"]) }
  .transform_values(&:length)

by_set = questions.group_by { |q| norm(q["set_name"]).empty? ? "Unknown" : norm(q["set_name"]) }
  .transform_values(&:length)

categories = by_category.keys.sort
sets = by_set.keys.sort
detailed_categories = by_detailed_category.keys.sort

result = {
  total: total,
  byCategory: by_category,
  byLevel: by_level,
  byType: by_type,
  byBonus: by_bonus,
  byDetailedCategory: by_detailed_category,
  bySet: by_set,
  categories: categories,
  sets: sets,
  detailedCategories: detailed_categories
}

STDOUT.write(JSON.generate(result))
