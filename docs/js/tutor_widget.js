// @ts-nocheck
// Tutor chat. common.js mounts it with a floating button on every page except practice
// (focus chrome), where practice.js opens it from "Ask Tutor" with the missed question.
// /tutor mounts it inline. The chat lives in sessionStorage so it follows the tab across pages.
import "./account_store.js";
const STORE_KEY = "atom_tutor_v1";
const icon = (name) => { var _a; return ((_a = window.atomIcon) === null || _a === void 0 ? void 0 : _a.call(window, name)) || ""; };
const aiClient = () => import("./ai_client.js");
// Credits per message, matching TUTOR_COST and THINKING_COST in functions/lib/prompts.js.
const MESSAGE_COST = 1;
const THINKING_COST = 3;
const STARTERS = [
    "Explain the photoelectric effect",
    "How do I find oxidation numbers?",
    "Quiz me on cell organelles"
];
const CONTEXT_STARTERS = [
    "Why was my answer wrong?",
    "Explain the idea behind this question",
    "Give me a similar question to try"
];
let state = load();
let els = null;
let embedded = false;
let signedIn = false;
let authKnown = false;
let busy = false;
// An API-issue apology shown as a tutor bubble. It isn't saved or sent back to the model.
let notice = "";
let creditsRequested = false;
let returnFocus = null;
function load() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
        if (saved && Array.isArray(saved.messages)) {
            return { messages: saved.messages.slice(-30), context: saved.context || null, thinking: saved.thinking === true };
        }
    }
    catch { }
    return { messages: [], context: null, thinking: false };
}
function save() {
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    }
    catch { }
}
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inline(text) {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
}
// Model replies are plain text with light markdown (paragraphs, "- " or "1. " lists, **bold**,
// `code`) and LaTeX math in \( \), \[ \] or $$ $$, which KaTeX renders once it has loaded.
const LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+/;
const MATH = /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)/g;
const KATEX = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist";
let katex = null;
let katexLoading = null;
function loadKatex() {
    if (!katexLoading) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = `${KATEX}/katex.min.css`;
        document.head.appendChild(css);
        katexLoading = import(`${KATEX}/katex.mjs`)
            .then((mod) => { katex = mod.default || mod; if (els)
            renderLog(); })
            .catch(() => { });
    }
    return katexLoading;
}
function renderMath(tex, display) {
    if (!katex)
        return `<code>${escapeHtml(tex)}</code>`;
    try {
        return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html" });
    }
    catch {
        return `<code>${escapeHtml(tex)}</code>`;
    }
}
function richText(text) {
    // Pull math out first so markdown and escaping leave it alone; \u0001n\u0001 marks its place.
    const math = [];
    text = String(text).replace(MATH, (_, block, dollars, inlineTex) => {
        var _a;
        math.push({ tex: ((_a = block !== null && block !== void 0 ? block : dollars) !== null && _a !== void 0 ? _a : inlineTex).trim(), display: inlineTex == null });
        return `\u0001${math.length - 1}\u0001`;
    });
    if (math.length && !katex)
        loadKatex();
    const out = [];
    let para = [];
    let list = null;
    const flushPara = () => { if (para.length)
        out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    const flushList = () => {
        // Numbered steps split by paragraphs keep counting from where they left off.
        const start = list && list.start > 1 ? ` start="${list.start}"` : "";
        if (list)
            out.push(`<${list.tag}${start}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
        list = null;
    };
    for (const line of text.split("\n")) {
        if (!line.trim()) {
            flushPara();
            flushList();
            continue;
        }
        if (LIST_ITEM.test(line)) {
            flushPara();
            const tag = /^\s*\d/.test(line) ? "ol" : "ul";
            if (list && list.tag !== tag)
                flushList();
            if (!list)
                list = { tag, items: [], start: parseInt(line, 10) || 1 };
            list.items.push(line.replace(LIST_ITEM, ""));
        }
        else {
            flushList();
            para.push(line.replace(/[ \t]+$/, ""));
        }
    }
    flushPara();
    flushList();
    return out.join("").replace(/\u0001(\d+)\u0001/g, (_, i) => renderMath(math[+i].tex, math[+i].display));
}
function build(container) {
    var _a;
    const panel = document.createElement("section");
    panel.className = embedded ? "tutor-panel embedded" : "tutor-panel";
    panel.id = "tutorPanel";
    panel.setAttribute("aria-label", "Tutor");
    if (!embedded) {
        panel.setAttribute("role", "dialog");
        panel.hidden = true;
    }
    panel.innerHTML = `
    <header class="tutor-head">
      <span class="tutor-mark" aria-hidden="true">${icon("tutor")}</span>
      <div class="tutor-title">
        <h2>Tutor</h2>
        <p class="tutor-credits" data-credits></p>
      </div>
      <button class="icon-btn" type="button" data-new aria-label="Start a new chat" title="New chat">${icon("reset")}</button>
      ${embedded ? "" : `<button class="icon-btn" type="button" data-close aria-label="Close tutor">${icon("close")}</button>`}
    </header>
    <div class="tutor-context" data-context hidden></div>
    <div class="tutor-log" data-log aria-live="polite"></div>
    <div class="tutor-gate" data-gate hidden>
      <p><strong>Tutor is for signed-in players.</strong> Create a free account or sign in to ask questions. Every account gets free credits each day.</p>
      <a class="btn primary" href="/account">Sign in</a>
    </div>
    <form class="tutor-form" data-form>
      <label class="visually-hidden" for="tutorInput">Message the tutor</label>
      <textarea id="tutorInput" rows="1" maxlength="2000" placeholder="Ask about any science or math idea"></textarea>
      <button class="btn primary tutor-send" type="submit" aria-label="Send">${icon("send")}</button>
      <div class="tutor-think">
        <button class="toggle" type="button" role="switch" aria-checked="false" aria-labelledby="tutorThinkLabel" data-thinking><span class="knob"></span></button>
        <span id="tutorThinkLabel">Extra thinking</span>
        <span class="muted" data-think-cost></span>
      </div>
    </form>
    <p class="tutor-error error" data-error role="alert"></p>`;
    container.appendChild(panel);
    let fab = null;
    if (!embedded && container === document.body && launcherWanted) {
        fab = document.createElement("button");
        fab.type = "button";
        fab.className = "tutor-fab";
        fab.setAttribute("aria-controls", "tutorPanel");
        fab.setAttribute("aria-expanded", "false");
        fab.innerHTML = `${icon("tutor")}<span>Tutor</span>`;
        fab.addEventListener("click", () => (panel.hidden ? open() : close()));
        document.body.appendChild(fab);
    }
    els = {
        panel,
        fab,
        credits: panel.querySelector("[data-credits]"),
        context: panel.querySelector("[data-context]"),
        log: panel.querySelector("[data-log]"),
        gate: panel.querySelector("[data-gate]"),
        form: panel.querySelector("[data-form]"),
        input: panel.querySelector("textarea"),
        send: panel.querySelector(".tutor-send"),
        thinking: panel.querySelector("[data-thinking]"),
        thinkCost: panel.querySelector("[data-think-cost]"),
        error: panel.querySelector("[data-error]")
    };
    (_a = panel.querySelector("[data-close]")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", () => close());
    panel.querySelector("[data-new]").addEventListener("click", () => {
        state = { messages: [], context: null, thinking: state.thinking };
        save();
        render();
        els.input.focus();
    });
    els.form.addEventListener("submit", (event) => {
        event.preventDefault();
        send(els.input.value);
    });
    els.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            send(els.input.value);
        }
    });
    els.input.addEventListener("input", autosize);
    els.thinking.addEventListener("click", () => {
        state.thinking = !state.thinking;
        save();
        render();
    });
    // Keys typed in the chat must not reach page shortcuts (practice uses R, W, Space and Esc).
    panel.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !embedded)
            close();
    });
    els.log.addEventListener("click", (event) => {
        var _a, _b;
        const chip = (_b = (_a = event.target).closest) === null || _b === void 0 ? void 0 : _b.call(_a, "[data-starter]");
        if (chip)
            send(chip.dataset.starter);
    });
}
function autosize() {
    const input = els.input;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}
function renderContext() {
    const ctx = state.context;
    els.context.hidden = !ctx;
    if (!ctx)
        return;
    const question = ctx.question ? `<p class="tutor-q q-serif">${escapeHtml(ctx.question)}</p>` : `<p class="muted">Picture question</p>`;
    els.context.innerHTML = `
    <span class="tutor-context-label">About this question</span>
    ${question}
    <dl class="tutor-answers">
      <div><dt>Official answer</dt><dd>${escapeHtml(ctx.answerLabel || ctx.answer || "Not given")}</dd></div>
      <div><dt>You said</dt><dd>${escapeHtml(ctx.userAnswer || "No answer")}</dd></div>
    </dl>`;
}
function renderLog() {
    const parts = state.messages.map((m) => m.role === "user"
        ? `<div class="tutor-msg user">${escapeHtml(m.text).replace(/\n/g, "<br>")}</div>`
        : `<div class="tutor-msg bot">${richText(m.text)}</div>`);
    if (notice)
        parts.push(`<div class="tutor-msg bot notice" role="alert">${notice}</div>`);
    if (busy)
        parts.push(`<div class="tutor-msg bot typing" aria-label="Tutor is writing"><span></span><span></span><span></span></div>`);
    if (!state.messages.length && !busy && !notice) {
        const starters = state.context ? CONTEXT_STARTERS : STARTERS;
        const intro = state.context
            ? "Ask what went wrong, or about the idea behind it."
            : "Ask about a concept, a calculation or a question you missed.";
        parts.push(`<div class="tutor-empty">
      <p>${intro} Each message uses ${creditWord(messageCost())}.</p>
      <div class="tutor-starters">${starters.map((s) => `<button class="btn small" type="button" data-starter="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}</div>
    </div>`);
    }
    els.log.innerHTML = parts.join("");
    els.log.scrollTop = els.log.scrollHeight;
}
function messageCost() {
    return state.thinking ? THINKING_COST : MESSAGE_COST;
}
function creditWord(n) {
    return n === 1 ? "1 credit" : `${n} credits`;
}
function render() {
    if (!els)
        return;
    els.gate.hidden = signedIn || !authKnown;
    els.form.hidden = !signedIn && authKnown;
    els.log.hidden = authKnown && !signedIn;
    els.input.disabled = busy;
    els.send.disabled = busy;
    els.thinking.setAttribute("aria-checked", String(!!state.thinking));
    els.thinking.disabled = busy;
    els.thinkCost.textContent = state.thinking
        ? `Slower, more careful answers. ${creditWord(THINKING_COST)} a message.`
        : `${creditWord(THINKING_COST)} a message`;
    renderContext();
    renderLog();
}
function showCredits(credits) {
    if (!els)
        return;
    els.credits.textContent = credits ? `${credits.remaining} of ${credits.limit} credits left today` : "";
}
async function loadCredits() {
    if (!signedIn || creditsRequested)
        return;
    creditsRequested = true;
    try {
        const { aiClient: client } = await aiClient();
        client.onCredits(showCredits);
        if (!client.getCredits())
            await client.status();
    }
    catch (err) {
        creditsRequested = false;
        if (!els)
            return;
        if (err.apiIssue) {
            notice = (await aiClient()).apiIssueHtml();
            render();
        }
        else {
            els.error.textContent = err.message;
        }
    }
}
async function send(raw) {
    const text = String(raw || "").trim();
    if (!text || busy || !signedIn)
        return;
    els.error.textContent = "";
    notice = "";
    state.messages.push({ role: "user", text });
    els.input.value = "";
    autosize();
    busy = true;
    save();
    render();
    try {
        const { aiClient: client } = await aiClient();
        const result = await client.tutor(state.messages.slice(-12), state.context, !!state.thinking);
        state.messages.push({ role: "assistant", text: result.reply });
    }
    catch (err) {
        // Put the question back so it can be sent again.
        state.messages.pop();
        els.input.value = text;
        autosize();
        if (err.apiIssue)
            notice = (await aiClient()).apiIssueHtml();
        else
            els.error.textContent = err.message;
    }
    finally {
        busy = false;
        save();
        render();
        els.input.focus();
    }
}
function open(options = {}) {
    var _a, _b;
    if (!els)
        mount({ launcher: false });
    returnFocus = document.activeElement;
    if (options.context) {
        const same = JSON.stringify(options.context) === JSON.stringify(state.context);
        if (!same)
            state = { messages: [], context: options.context, thinking: state.thinking };
        save();
    }
    els.panel.hidden = false;
    (_a = els.fab) === null || _a === void 0 ? void 0 : _a.setAttribute("aria-expanded", "true");
    document.body.classList.add("tutor-open");
    render();
    loadCredits();
    (_b = (signedIn ? els.input : els.gate.querySelector("a"))) === null || _b === void 0 ? void 0 : _b.focus();
}
function close() {
    var _a, _b, _c;
    if (!els || embedded)
        return;
    els.panel.hidden = true;
    (_a = els.fab) === null || _a === void 0 ? void 0 : _a.setAttribute("aria-expanded", "false");
    document.body.classList.remove("tutor-open");
    (_c = (_b = (els.fab || returnFocus)) === null || _b === void 0 ? void 0 : _b.focus) === null || _c === void 0 ? void 0 : _c.call(_b);
}
let launcherWanted = true;
export function mount(options = {}) {
    var _a, _b;
    if (els)
        return;
    embedded = !!options.container;
    launcherWanted = options.launcher !== false;
    build(options.container || document.body);
    const account = window.atomAccount;
    if (!account)
        authKnown = true;
    (_a = account === null || account === void 0 ? void 0 : account.onAuthChange) === null || _a === void 0 ? void 0 : _a.call(account, (user) => {
        var _a;
        authKnown = !!((_a = account.isReady) === null || _a === void 0 ? void 0 : _a.call(account)) || !!user;
        signedIn = !!user;
        if (!signedIn)
            creditsRequested = false;
        render();
        if (signedIn && (embedded || !els.panel.hidden))
            loadCredits();
    });
    (_b = account === null || account === void 0 ? void 0 : account.whenReady) === null || _b === void 0 ? void 0 : _b.call(account).then(() => { authKnown = true; render(); });
    render();
}
export const openTutor = open;
window.atomTutor = { open, close, mount };
//# sourceMappingURL=tutor_widget.js.map