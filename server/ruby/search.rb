require "json"

def norm(s)
  (s || "").to_s.strip
end

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

def matches?(q, search, bank, level, category, bonus)
  return false if bank != "ALL" && q["bank_id"] != bank
  return false if level != "ANY" && q["level"] != level
  return false if category != "ANY" && norm(q["category"]) != category
  return false if bonus != "ANY" && (!!q["bonus"]).to_s != bonus.to_s

  return true if search.empty?
  s = search.downcase
  hay = [
    q["set_name"],
    q["round_name"],
    q["category"],
    q["type"],
    q["parsed_answer"],
    q["question_text"],
    q["answer_text"],
    q["page"],
    q["num"]
  ].map { |v| (v || "").to_s }.join(" | ").downcase
  hay.include?(s)
end

input = JSON.parse(STDIN.read || "{}")
root = File.expand_path("../..", __dir__)
bank_choice = input["bank"] || "ALL"
level = input["level"] || "ANY"
category = input["category"] || "ANY"
bonus = input["bonus"] || "ANY"
search = norm(input["search"])
page = (input["page"] || 1).to_i
page_size = (input["pageSize"] || 100).to_i
page = 1 if page < 1
page_size = 1 if page_size < 1
page_size = 200 if page_size > 200

bank = load_bank(root)
filtered = bank.select { |q| matches?(q, search, bank_choice, level, category, bonus) }
total = filtered.length

start = (page - 1) * page_size
slice = filtered.slice(start, page_size) || []

result = {
  total: total,
  page: page,
  pageSize: page_size,
  items: slice
}

STDOUT.write(JSON.generate(result))
