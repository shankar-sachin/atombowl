var _a, _b, _c;
// @ts-nocheck
// Generate: asks the `ai` function for new questions in the bank's format, shows them,
// and hands them to /practice?generated=1 through sessionStorage.
import "./account_store.js";
const RESULT_KEY = "atom_generated_set";
const $ = (id) => document.getElementById(id);
const els = {
    form: $("generateForm"),
    topic: $("genTopic"),
    focus: $("genFocus"),
    level: $("genLevel"),
    format: $("genFormat"),
    kind: $("genKind"),
    count: $("genCount"),
    countLabel: $("genCountLabel"),
    cost: $("genCost"),
    error: $("genError"),
    submit: $("genSubmit"),
    gate: $("genGate"),
    credits: $("generateCredits"),
    list: $("genList"),
    empty: $("genEmpty"),
    copy: $("genCopy"),
    practice: $("genPractice")
};
let questions = [];
let signedIn = false;
let authKnown = false;
let creditsLoaded = false;
const aiClient = () => import("./ai_client.js");
function safeParse(raw) {
    try {
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function sentenceCase(text) {
    const s = String(text || "").toLowerCase();
    return s.replace(/(^|[.!?]\s+|\)\s*)([a-z])/g, (m, a, b) => a + b.toUpperCase());
}
function questionTotal() {
    const n = parseInt(els.count.value, 10) || 1;
    return els.kind.value === "pair" ? n * 2 : n;
}
function updateCost() {
    els.countLabel.textContent = els.kind.value === "pair" ? "How many pairs" : "How many questions";
    const total = questionTotal();
    els.cost.textContent = `${total} question${total === 1 ? "" : "s"}, ${total} credit${total === 1 ? "" : "s"}.`;
}
function showCredits(credits) {
    els.credits.textContent = credits ? `${credits.remaining} of ${credits.limit} credits left today` : "";
    els.credits.classList.toggle("hidden", !credits);
}
function renderAuth() {
    els.gate.classList.toggle("hidden", signedIn || !authKnown);
    els.submit.classList.toggle("hidden", !signedIn);
    els.cost.classList.toggle("hidden", !signedIn);
    if (!signedIn)
        showCredits(null);
}
async function loadCredits() {
    if (creditsLoaded)
        return;
    creditsLoaded = true;
    try {
        const { aiClient: client } = await aiClient();
        client.onCredits(showCredits);
        if (!client.getCredits())
            await client.status();
    }
    catch (err) {
        creditsLoaded = false;
        if (err.apiIssue)
            els.error.innerHTML = (await aiClient()).apiIssueHtml();
        else
            els.error.textContent = err.message;
    }
}
function renderQuestions() {
    els.list.replaceChildren();
    els.empty.classList.toggle("hidden", questions.length > 0);
    els.copy.disabled = !questions.length;
    els.practice.disabled = !questions.length;
    questions.forEach((q) => {
        const item = document.createElement("li");
        item.className = "card generate-item";
        const meta = document.createElement("div");
        meta.className = "generate-meta";
        for (const label of [q.bonus ? "Bonus" : "Toss-up", q.type === "MC" ? "Multiple choice" : "Short answer", q.detailed_category].filter(Boolean)) {
            const tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = label;
            meta.appendChild(tag);
        }
        const text = document.createElement("p");
        text.className = "q-serif generate-q";
        text.textContent = q.question_text;
        const answer = document.createElement("details");
        answer.className = "generate-answer";
        const summary = document.createElement("summary");
        summary.textContent = "Show answer";
        const value = document.createElement("p");
        value.className = "q-serif";
        value.textContent = sentenceCase(q.parsed_answer);
        answer.append(summary, value);
        item.append(meta, text, answer);
        els.list.appendChild(item);
    });
}
function asText() {
    return questions.map((q, i) => {
        const kind = q.bonus ? "BONUS" : "TOSS-UP";
        const type = q.type === "MC" ? "Multiple Choice" : "Short Answer";
        return `${i + 1}. ${kind} (${q.category}, ${type})\n${q.question_text}\nANSWER: ${q.parsed_answer}`;
    }).join("\n\n");
}
async function generate(event) {
    event.preventDefault();
    if (!signedIn)
        return;
    els.error.textContent = "";
    els.submit.disabled = true;
    const label = els.submit.innerHTML;
    els.submit.textContent = "Writing questions…";
    try {
        const { aiClient: client } = await aiClient();
        const result = await client.generate({
            topic: els.topic.value,
            focus: els.focus.value.trim(),
            level: els.level.value,
            format: els.format.value,
            kind: els.kind.value,
            count: parseInt(els.count.value, 10) || 3
        });
        questions = Array.isArray(result === null || result === void 0 ? void 0 : result.questions) ? result.questions : [];
        try {
            sessionStorage.setItem(RESULT_KEY, JSON.stringify(questions));
        }
        catch { }
        renderQuestions();
        if (questions.length < questionTotal()) {
            els.error.textContent = `Only ${questions.length} of ${questionTotal()} came back in a usable format.`;
        }
    }
    catch (err) {
        if (err.apiIssue)
            els.error.innerHTML = (await aiClient()).apiIssueHtml();
        else
            els.error.textContent = err.message;
    }
    finally {
        els.submit.disabled = false;
        els.submit.innerHTML = label;
    }
}
els.form.addEventListener("submit", generate);
els.kind.addEventListener("change", updateCost);
els.count.addEventListener("change", updateCost);
els.copy.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(asText());
        els.copy.lastChild.textContent = "Copied";
        setTimeout(() => { els.copy.lastChild.textContent = "Copy"; }, 1600);
    }
    catch {
        els.error.textContent = "Couldn't copy. Select the questions and copy them by hand.";
    }
});
els.practice.addEventListener("click", () => {
    try {
        sessionStorage.setItem(RESULT_KEY, JSON.stringify(questions));
    }
    catch { }
    window.location.href = "/practice?generated=1";
});
// Start from the account's division, then restore the last set from this tab.
const division = String(((_a = window.atomSettings) === null || _a === void 0 ? void 0 : _a.div) || "MS").toUpperCase();
els.level.value = division === "HS" ? "HS" : "MS";
const previous = safeParse(sessionStorage.getItem(RESULT_KEY));
if (Array.isArray(previous))
    questions = previous;
updateCost();
renderQuestions();
renderAuth();
const account = window.atomAccount;
(_b = account === null || account === void 0 ? void 0 : account.onAuthChange) === null || _b === void 0 ? void 0 : _b.call(account, (user) => {
    var _a;
    if (!user && !((_a = account.isReady) === null || _a === void 0 ? void 0 : _a.call(account)))
        return;
    authKnown = true;
    signedIn = !!user;
    if (!signedIn)
        creditsLoaded = false;
    renderAuth();
    if (signedIn)
        loadCredits();
});
(_c = account === null || account === void 0 ? void 0 : account.whenReady) === null || _c === void 0 ? void 0 : _c.call(account).then(() => { var _a; authKnown = true; signedIn = !!((_a = account.getUser) === null || _a === void 0 ? void 0 : _a.call(account)); renderAuth(); if (signedIn)
    loadCredits(); });
if (!account) {
    authKnown = true;
    renderAuth();
}
//# sourceMappingURL=generate.js.map