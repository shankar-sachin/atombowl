import json
import re
import sys
import math

NUMBER_WORDS = {
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
    "thirteen": "13",
    "fourteen": "14",
    "fifteen": "15",
    "sixteen": "16",
    "seventeen": "17",
    "eighteen": "18",
    "nineteen": "19",
    "twenty": "20",
}

GREEK_MAP = {
    "\u03b1": "alpha",
    "\u03b2": "beta",
    "\u03b3": "gamma",
    "\u03b4": "delta",
    "\u03b5": "epsilon",
    "\u03b8": "theta",
    "\u03bb": "lambda",
    "\u03bc": "mu",
    "\u03c0": "pi",
    "\u03c1": "rho",
    "\u03c3": "sigma",
    "\u03c4": "tau",
    "\u03c6": "phi",
    "\u03c9": "omega",
}

def replace_greek(s: str) -> str:
    out = s
    for sym, name in GREEK_MAP.items():
        out = out.replace(sym, name)
    return out


def normalize(raw: str) -> str:
    s = str(raw or "")
    s = replace_greek(s)
    s = s.lower()
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    parts = [NUMBER_WORDS.get(p, p) for p in s.split(" ") if p]
    return " ".join(parts).strip()


def stem(token: str) -> str:
    if len(token) <= 3:
        return token
    if token.endswith("ies"):
        return token[:-3] + "y"
    if token.endswith("es"):
        return token[:-2]
    if token.endswith("s"):
        return token[:-1]
    if token.endswith("ing") and len(token) > 5:
        return token[:-3]
    if token.endswith("ed") and len(token) > 4:
        return token[:-2]
    return token


def tokenize(raw: str):
    normalized = normalize(raw)
    if not normalized:
        return []
    return [stem(p) for p in normalized.split(" ") if p]


def jaccard(a_tokens, b_tokens) -> float:
    if not a_tokens or not b_tokens:
        return 0.0
    a = set(a_tokens)
    b = set(b_tokens)
    inter = len(a.intersection(b))
    union = len(a) + len(b) - inter
    return inter / union if union else 0.0


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    m, n = len(a), len(b)
    if not m:
        return n
    if not n:
        return m
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
            prev = temp
    return dp[n]


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    dist = levenshtein(a, b)
    max_len = max(len(a), len(b))
    return 1 - (dist / max_len) if max_len else 0.0


def extract_choice_letter(raw: str) -> str:
    if not raw:
        return ""
    m = re.search(r"\b([WXYZ])\b\s*\)?", str(raw).upper())
    return m.group(1) if m else ""


def split_candidates(raw: str):
    normalized = str(raw or "")
    normalized = re.sub(r"\bor\b", "|", normalized, flags=re.I)
    normalized = re.sub(r"\baccept\b", "|", normalized, flags=re.I)
    normalized = re.sub(r"\bany of the following\b", "|", normalized, flags=re.I)
    normalized = re.sub(r"[\/;]", "|", normalized)
    return [s.strip() for s in normalized.split("|") if s.strip()]


def best_token_match_score(user_tokens, cand_tokens) -> float:
    if not user_tokens or not cand_tokens:
        return 0.0
    total = 0.0
    for ut in user_tokens:
        best = 0.0
        for ct in cand_tokens:
            best = max(best, similarity(ut, ct))
        total += best
    return total / len(user_tokens)


def autocorrect_tokens(user_tokens, cand_tokens):
    corrected = []
    for ut in user_tokens:
        best_tok = ut
        best_score = 0.0
        for ct in cand_tokens:
            score = similarity(ut, ct)
            if score > best_score:
                best_score = score
                best_tok = ct
        if best_score >= 0.82 and len(ut) >= 4:
            corrected.append(best_tok)
        else:
            corrected.append(ut)
    return corrected


def numeric_answer(raw):
    value = str(raw or "").strip().replace("−", "-")
    value = NUMBER_WORDS.get(value.lower(), value)
    atom = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"
    if not re.fullmatch(atom + r"(?:\s*/\s*" + atom + r")?", value):
        return None
    parts = value.split("/")
    try:
        number = float(parts[0]) / (float(parts[1]) if len(parts) == 2 else 1)
        return number if math.isfinite(number) else None
    except (ValueError, ZeroDivisionError):
        return None


def grade_short_answer(user_answer, correct_answer, threshold):
    numeric = numeric_answer(correct_answer)
    if numeric is not None:
        candidate = numeric_answer(user_answer)
        correct = candidate is not None and candidate == numeric
        return {"isCorrect": correct, "score": 1.0 if correct else 0.0, "matched": str(correct_answer)}
    user = normalize(user_answer)
    candidates = [normalize(c) for c in split_candidates(correct_answer)]
    candidates = [c for c in candidates if c]
    if not user or not candidates:
        return {"isCorrect": False, "score": 0.0, "matched": ""}

    user_tokens = tokenize(user)
    best_score = 0.0
    best_match = ""

    for candidate in candidates:
        cand_tokens = tokenize(candidate)
        corrected_user_tokens = autocorrect_tokens(user_tokens, cand_tokens)
        token_score = jaccard(corrected_user_tokens, cand_tokens)
        fuzzy_token_score = best_token_match_score(corrected_user_tokens, cand_tokens)
        edit_score = similarity(user, candidate)
        combined = (max(token_score, fuzzy_token_score) * 0.5) + (min(token_score, fuzzy_token_score) * 0.2) + (edit_score * 0.3)
        if combined > best_score:
            best_score = combined
            best_match = candidate

    min_val = 0.66 if len(candidates) > 1 else 0.7
    applied = max(min_val, float(threshold if threshold is not None else 0.72))
    return {
        "isCorrect": best_score >= applied,
        "score": best_score,
        "matched": best_match,
        "threshold": applied,
    }


def grade_mc(user_answer, correct_answer):
    user = extract_choice_letter(user_answer)
    correct = extract_choice_letter(correct_answer)
    if not user or not correct:
        return {"isCorrect": False, "score": 0.0}
    return {"isCorrect": user == correct, "score": 1.0 if user == correct else 0.0}


def grade(payload):
    qtype = str(payload.get("questionType") or "").upper()
    if qtype == "MC":
        res = grade_mc(payload.get("userAnswer"), payload.get("correctAnswer"))
        return {
            "isCorrect": res["isCorrect"],
            "score": res["score"],
            "confidence": res["score"],
            "matched": extract_choice_letter(payload.get("correctAnswer")),
        }
    res = grade_short_answer(payload.get("userAnswer"), payload.get("correctAnswer"), payload.get("threshold"))
    return {
        "isCorrect": res["isCorrect"],
        "score": res["score"],
        "confidence": res["score"],
        "matched": res.get("matched", ""),
        "threshold": res.get("threshold"),
    }


def main():
    raw = sys.stdin.read()
    payload = json.loads(raw or "{}")
    result = grade(payload)
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
