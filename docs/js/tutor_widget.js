// @ts-nocheck
// Tutor chat. common.js mounts it with a floating button on every page except practice
// (focus chrome), where practice.js opens it from "Ask Tutor" with the missed question.
// /tutor mounts it inline with a list of saved chats. The current chat lives in sessionStorage so it
// follows the tab across pages; every chat is also cached in localStorage and synced to the account
// (users/{uid}/tutorChats in Firestore) so it shows up on other devices.
import "./account_store.js";
import { cleanChat, mergeRemote, MAX_CHATS } from "./tutor_history.js";
const STORE_KEY = "atom_tutor_v1";
const icon = (name) => { var _a; return ((_a = window.atomIcon) === null || _a === void 0 ? void 0 : _a.call(window, name)) || ""; };
const aiClient = () => import("./ai_client.js");
// Credits per message, matching TUTOR_COST and THINKING_COST in functions/lib/prompts.js.
const MESSAGE_COST = 1;
const THINKING_COST = 5;
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
const HISTORY_KEY = "atom_tutor_history_v1";
const SYNCED_KEY = "atom_tutor_synced_v1";
const syncModule = () => import("./tutor_sync.js");
let state = load();
let uid = "";
let history = [];
let syncUnsub = null;
let syncUid = "";
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
            return { id: saved.id || null, messages: saved.messages.slice(-30), context: saved.context || null, thinking: saved.thinking === true };
        }
    }
    catch { }
    return { id: null, messages: [], context: null, thinking: false };
}
function save() {
    recordChat();
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    }
    catch { }
}
// ---------- Saved chats ----------
function newId() {
    var _a, _b;
    return ((_b = (_a = window.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID) === null || _b === void 0 ? void 0 : _b.call(_a)) || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function loadHistory() {
    history = [];
    if (!uid)
        return;
    try {
        const raw = JSON.parse(localStorage.getItem(`${HISTORY_KEY}:${uid}`) || "[]");
        if (Array.isArray(raw))
            history = raw.map(cleanChat).filter(Boolean);
    }
    catch { }
}
function saveHistory() {
    if (!uid)
        return;
    try {
        localStorage.setItem(`${HISTORY_KEY}:${uid}`, JSON.stringify(history));
    }
    catch { }
}
function chatTitle(messages) {
    var _a;
    const first = ((_a = messages.find((m) => m.role === "user")) === null || _a === void 0 ? void 0 : _a.text) || "New chat";
    const flat = first.replace(/\s+/g, " ").trim();
    return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}
// Keeps the saved copy of the current chat in step with it. A chat that has no messages left
// (the first question failed) is removed again.
function recordChat() {
    if (!uid)
        return;
    if (!state.messages.length) {
        if (state.id && history.some((c) => c.id === state.id)) {
            history = history.filter((c) => c.id !== state.id);
            saveHistory();
            renderHistory();
        }
        return;
    }
    if (!state.id)
        state.id = newId();
    const existing = history.find((c) => c.id === state.id);
    const messages = state.messages.slice(-30);
    if (existing && existing.messages.length === messages.length && existing.messages[messages.length - 1].text === messages[messages.length - 1].text)
        return;
    const entry = { id: state.id, title: (existing === null || existing === void 0 ? void 0 : existing.title) || chatTitle(messages), updated: Date.now(), messages, context: state.context };
    const all = [entry, ...history.filter((c) => c.id !== entry.id)];
    history = all.slice(0, MAX_CHATS);
    all.slice(MAX_CHATS).forEach((c) => removeRemote(c.id));
    saveHistory();
    renderHistory();
    pushRemote(entry);
}
// ---------- Sync with the account (users/{uid}/tutorChats) ----------
// Every chat is written to the account when it changes. Only the Tutor page listens for chats
// from other devices, so the floating Tutor on other pages costs no reads.
function loadSynced() {
    try {
        const raw = JSON.parse(localStorage.getItem(`${SYNCED_KEY}:${uid}`) || "[]");
        return Array.isArray(raw) ? raw : [];
    }
    catch {
        return [];
    }
}
function saveSynced(ids) {
    if (!uid)
        return;
    try {
        localStorage.setItem(`${SYNCED_KEY}:${uid}`, JSON.stringify(ids));
    }
    catch { }
}
function markSynced(id, on = true) {
    const ids = new Set(loadSynced());
    if (on)
        ids.add(id);
    else
        ids.delete(id);
    saveSynced([...ids]);
}
async function pushRemote(chat) {
    const forUid = uid;
    if (!forUid)
        return;
    try {
        await (await syncModule()).pushChat(forUid, chat);
        if (uid === forUid)
            markSynced(chat.id);
    }
    catch { }
}
async function removeRemote(id) {
    const forUid = uid;
    if (!forUid)
        return;
    markSynced(id, false);
    try {
        await (await syncModule()).removeChat(forUid, id);
    }
    catch { }
}
function setSyncNote(on) {
    if (els === null || els === void 0 ? void 0 : els.hnote)
        els.hnote.textContent = on ? "Chats sync with your account." : "Chats are saved on this device.";
}
function applyRemote(docs) {
    var _a, _b;
    const result = mergeRemote(history, docs.map(cleanChat).filter(Boolean), loadSynced());
    history = result.history;
    saveHistory();
    saveSynced(result.synced);
    result.upload.forEach(pushRemote);
    result.prune.forEach(removeRemote);
    // Show new messages added to the open chat from another device, unless a reply is on its way.
    const open = state.id && history.find((c) => c.id === state.id);
    if (open && !busy) {
        const mine = state.messages;
        const same = open.messages.length === mine.length && ((_a = open.messages[open.messages.length - 1]) === null || _a === void 0 ? void 0 : _a.text) === ((_b = mine[mine.length - 1]) === null || _b === void 0 ? void 0 : _b.text);
        if (!same && open.messages.length >= mine.length) {
            state = { ...state, messages: open.messages.slice(), context: open.context || state.context };
            save();
            renderContext();
            renderLog();
        }
    }
    setSyncNote(true);
    renderHistory();
}
async function startSync() {
    if (!embedded || !uid || (syncUid === uid && syncUnsub))
        return;
    stopSync();
    const forUid = uid;
    syncUid = forUid;
    try {
        const mod = await syncModule();
        if (uid !== forUid)
            return;
        syncUnsub = mod.subscribe(forUid, (docs) => { if (uid === forUid)
            applyRemote(docs); }, () => setSyncNote(false));
    }
    catch {
        setSyncNote(false);
    }
}
function stopSync() {
    syncUnsub === null || syncUnsub === void 0 ? void 0 : syncUnsub();
    syncUnsub = null;
    syncUid = "";
    setSyncNote(false);
}
function whenText(ms) {
    const d = new Date(ms);
    const today = new Date();
    return d.toDateString() === today.toDateString()
        ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function renderHistory() {
    if (!(els === null || els === void 0 ? void 0 : els.history))
        return;
    els.history.hidden = !signedIn;
    if (els.htoggle)
        els.htoggle.hidden = !signedIn;
    els.mountEl.classList.toggle("has-history", signedIn);
    els.hlist.innerHTML = history.length
        ? history.map((c) => `<li class="tutor-chat-row">
        <button type="button" class="tutor-chat" data-open="${escapeHtml(c.id)}"${c.id === state.id ? ' aria-current="true"' : ""}>
          <span class="tutor-chat-title">${escapeHtml(c.title)}</span>
          <span class="tutor-chat-when">${escapeHtml(whenText(c.updated))}</span>
        </button>
        <button type="button" class="icon-btn" data-del="${escapeHtml(c.id)}" aria-label="Delete chat: ${escapeHtml(c.title)}">${icon("x")}</button>
      </li>`).join("")
        : `<li class="tutor-history-empty">No saved chats yet.</li>`;
    els.hclear.hidden = !history.length;
}
function setHistoryOpen(open) {
    var _a, _b;
    (_a = els === null || els === void 0 ? void 0 : els.history) === null || _a === void 0 ? void 0 : _a.classList.toggle("open", open);
    (_b = els === null || els === void 0 ? void 0 : els.htoggle) === null || _b === void 0 ? void 0 : _b.setAttribute("aria-expanded", String(open));
}
function startNewChat() {
    state = { id: null, messages: [], context: null, thinking: state.thinking };
    notice = "";
    save();
    setHistoryOpen(false);
    render();
    els.input.focus();
}
function openChat(id) {
    const chat = history.find((c) => c.id === id);
    if (!chat)
        return;
    state = { id: chat.id, messages: chat.messages.slice(), context: chat.context || null, thinking: state.thinking };
    notice = "";
    els.error.textContent = "";
    save();
    setHistoryOpen(false);
    render();
}
function deleteChat(id) {
    const chat = history.find((c) => c.id === id);
    if (!chat || !window.confirm(`Delete this chat? It will be removed from all your devices.\n\n${chat.title}`))
        return;
    history = history.filter((c) => c.id !== id);
    saveHistory();
    removeRemote(id);
    if (state.id === id)
        startNewChat();
    else
        renderHistory();
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
    var _a, _b;
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
      ${embedded ? `<button class="icon-btn tutor-history-toggle" type="button" data-htoggle aria-expanded="false" aria-label="Chat history" title="Chat history">${icon("menu")}</button>` : ""}
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
      <textarea id="tutorInput" rows="1" maxlength="2000" enterkeyhint="send" placeholder="Ask Tutor a question"></textarea>
      <button class="btn primary tutor-send" type="submit" aria-label="Send">${icon("send")}</button>
      <div class="tutor-think">
        <button class="toggle" type="button" role="switch" aria-checked="false" aria-labelledby="tutorThinkLabel" data-thinking><span class="knob"></span></button>
        <span id="tutorThinkLabel">Extra thinking</span>
        <span class="muted" data-think-cost></span>
      </div>
    </form>
    <p class="tutor-error error" data-error role="alert"></p>`;
    let aside = null;
    if (embedded) {
        container.classList.add("tutor-layout");
        aside = document.createElement("aside");
        aside.className = "tutor-history";
        aside.setAttribute("aria-label", "Chat history");
        aside.hidden = true;
        aside.innerHTML = `
      <div class="tutor-history-head">
        <h2>Chats</h2>
        <button class="btn small" type="button" data-hnew>${icon("plus")}<span>New chat</span></button>
        <button class="icon-btn tutor-history-close" type="button" data-hclose aria-label="Close chat history">${icon("close")}</button>
      </div>
      <ul class="tutor-history-list" data-hlist></ul>
      <div class="tutor-history-foot">
        <p class="muted" data-hnote>Chats are saved on this device.</p>
        <button class="btn small" type="button" data-hclear hidden>Clear all</button>
      </div>`;
        container.appendChild(aside);
    }
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
        mountEl: container,
        history: aside,
        hlist: aside === null || aside === void 0 ? void 0 : aside.querySelector("[data-hlist]"),
        hclear: aside === null || aside === void 0 ? void 0 : aside.querySelector("[data-hclear]"),
        hnote: aside === null || aside === void 0 ? void 0 : aside.querySelector("[data-hnote]"),
        htoggle: panel.querySelector("[data-htoggle]"),
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
    panel.querySelector("[data-new]").addEventListener("click", startNewChat);
    (_b = els.htoggle) === null || _b === void 0 ? void 0 : _b.addEventListener("click", () => setHistoryOpen(!els.history.classList.contains("open")));
    if (aside) {
        aside.querySelector("[data-hnew]").addEventListener("click", startNewChat);
        aside.querySelector("[data-hclose]").addEventListener("click", () => setHistoryOpen(false));
        els.hclear.addEventListener("click", () => {
            if (!window.confirm("Delete all saved chats? They will be removed from all your devices."))
                return;
            history.forEach((c) => removeRemote(c.id));
            history = [];
            saveHistory();
            startNewChat();
        });
        els.hlist.addEventListener("click", (event) => {
            var _a, _b, _c, _d;
            const open = (_b = (_a = event.target).closest) === null || _b === void 0 ? void 0 : _b.call(_a, "[data-open]");
            const del = (_d = (_c = event.target).closest) === null || _d === void 0 ? void 0 : _d.call(_c, "[data-del]");
            if (open)
                openChat(open.dataset.open);
            else if (del)
                deleteChat(del.dataset.del);
        });
        aside.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Escape")
                setHistoryOpen(false);
        });
    }
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
    // On phones the keyboard hides the newest messages; bring them back into view once it is up.
    els.input.addEventListener("focus", () => setTimeout(() => { els.log.scrollTop = els.log.scrollHeight; }, 300));
    // Tapping Send must not take focus from the box, or the keyboard closes and then can't reopen on its own.
    els.send.addEventListener("pointerdown", (event) => event.preventDefault());
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
      <p>${intro} Each message uses ${creditWord(messageCost())}. Tutor can make mistakes, so check important facts.</p>
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
    // readOnly, not disabled: disabling the focused box would close the phone keyboard mid-reply.
    els.input.readOnly = busy;
    els.send.disabled = busy;
    els.thinking.setAttribute("aria-checked", String(!!state.thinking));
    els.thinking.disabled = busy;
    els.thinkCost.textContent = state.thinking
        ? `Slower, more careful answers. ${creditWord(THINKING_COST)} a message.`
        : `${creditWord(THINKING_COST)} a message`;
    renderContext();
    renderLog();
    renderHistory();
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
            state = { id: null, messages: [], context: options.context, thinking: state.thinking };
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
        uid = (user === null || user === void 0 ? void 0 : user.uid) || "";
        loadHistory();
        if (embedded) {
            if (uid)
                startSync();
            else
                stopSync();
        }
        if (signedIn)
            recordChat();
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