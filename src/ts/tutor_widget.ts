// @ts-nocheck
// Tutor chat. common.js mounts it with a floating button on every page except practice
// (focus chrome), where practice.js opens it from "Ask Tutor" with the missed question.
// /tutor mounts it inline with a list of saved chats. The current chat lives in sessionStorage so it
// follows the tab across pages; every chat is also cached in localStorage and synced to the account
// (users/{uid}/tutorChats in Firestore) so it shows up on other devices.
import "./account_store.js";
import { cleanChat, mergeRemote, MAX_CHATS } from "./tutor_history.js";
import { fixMath } from "./tutor_math.js";
import { splitQuiz, gradeQuestion, quizScore, answerText, missedMessage } from "./tutor_quiz.js";

const STORE_KEY = "atom_tutor_v1";
const icon = (name) => window.atomIcon?.(name) || "";
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
  } catch {}
  return { id: null, messages: [], context: null, thinking: false };
}

function save() {
  recordChat();
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

// ---------- Saved chats ----------

function newId() {
  return window.crypto?.randomUUID?.() || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function loadHistory() {
  history = [];
  if (!uid) return;
  try {
    const raw = JSON.parse(localStorage.getItem(`${HISTORY_KEY}:${uid}`) || "[]");
    if (Array.isArray(raw)) history = raw.map(cleanChat).filter(Boolean);
  } catch {}
}

function saveHistory() {
  if (!uid) return;
  try { localStorage.setItem(`${HISTORY_KEY}:${uid}`, JSON.stringify(history)); } catch {}
}

function chatTitle(messages) {
  const first = messages.find((m) => m.role === "user")?.text || "New chat";
  const flat = first.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}

// Keeps the saved copy of the current chat in step with it. A chat that has no messages left
// (the first question failed) is removed again.
function recordChat() {
  if (!uid) return;
  if (!state.messages.length) {
    if (state.id && history.some((c) => c.id === state.id)) {
      history = history.filter((c) => c.id !== state.id);
      saveHistory();
      renderHistory();
    }
    return;
  }
  if (!state.id) state.id = newId();
  const existing = history.find((c) => c.id === state.id);
  const messages = cleanChat({ id: state.id, messages: state.messages })?.messages || [];
  if (existing && JSON.stringify(existing.messages) === JSON.stringify(messages)) return;
  const entry = { id: state.id, title: existing?.title || chatTitle(messages), updated: Date.now(), messages, context: state.context };
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
  } catch { return []; }
}

function saveSynced(ids) {
  if (!uid) return;
  try { localStorage.setItem(`${SYNCED_KEY}:${uid}`, JSON.stringify(ids)); } catch {}
}

function markSynced(id, on = true) {
  const ids = new Set(loadSynced());
  if (on) ids.add(id); else ids.delete(id);
  saveSynced([...ids]);
}

async function pushRemote(chat) {
  const forUid = uid;
  if (!forUid) return;
  try {
    await (await syncModule()).pushChat(forUid, chat);
    if (uid === forUid) markSynced(chat.id);
  } catch {}
}

async function removeRemote(id) {
  const forUid = uid;
  if (!forUid) return;
  markSynced(id, false);
  try { await (await syncModule()).removeChat(forUid, id); } catch {}
}

function setSyncNote(on) {
  if (els?.hnote) els.hnote.textContent = on ? "Chats sync with your account." : "Chats are saved on this device.";
}

function applyRemote(docs) {
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
    const same = JSON.stringify(open.messages) === JSON.stringify(mine);
    if (!same && open.messages.length >= mine.length) {
      state = { ...state, messages: JSON.parse(JSON.stringify(open.messages)), context: open.context || state.context };
      save();
      renderContext();
      renderLog();
    }
  }
  setSyncNote(true);
  renderHistory();
}

async function startSync() {
  if (!embedded || !uid || (syncUid === uid && syncUnsub)) return;
  stopSync();
  const forUid = uid;
  syncUid = forUid;
  try {
    const mod = await syncModule();
    if (uid !== forUid) return;
    syncUnsub = mod.subscribe(forUid, (docs) => { if (uid === forUid) applyRemote(docs); }, () => setSyncNote(false));
  } catch {
    setSyncNote(false);
  }
}

function stopSync() {
  syncUnsub?.();
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
  if (!els?.history) return;
  els.history.hidden = !signedIn;
  if (els.htoggle) els.htoggle.hidden = !signedIn;
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
  els?.history?.classList.toggle("open", open);
  els?.htoggle?.setAttribute("aria-expanded", String(open));
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
  if (!chat) return;
  state = { id: chat.id, messages: JSON.parse(JSON.stringify(chat.messages)), context: chat.context || null, thinking: state.thinking };
  notice = "";
  els.error.textContent = "";
  save();
  setHistoryOpen(false);
  render();
}

function deleteChat(id) {
  const chat = history.find((c) => c.id === id);
  if (!chat || !window.confirm(`Delete this chat? It will be removed from all your devices.\n\n${chat.title}`)) return;
  history = history.filter((c) => c.id !== id);
  saveHistory();
  removeRemote(id);
  if (state.id === id) startNewChat();
  else renderHistory();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g, "$1<em>$2</em>")
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
      .then((mod) => { katex = mod.default || mod; if (els) renderLog(); })
      .catch(() => {});
  }
  return katexLoading;
}

function renderMath(tex, display) {
  if (!katex) return `<code>${escapeHtml(tex)}</code>`;
  // Try the formula as written, then with common model slips repaired (commands inside \text{},
  // packages KaTeX lacks). If it still fails show it as plain code, never as red error text.
  for (const source of [tex, fixMath(tex)]) {
    try {
      return katex.renderToString(source, { displayMode: display, throwOnError: true, output: "html" });
    } catch {}
  }
  return `<code>${escapeHtml(tex)}</code>`;
}

// One line of rich text without the paragraph wrapper, for quiz choices and headings.
function richInline(text) {
  return richText(text).replace(/^<p>/, "").replace(/<\/p>$/, "");
}

function richText(text) {
  // Pull math out first so markdown and escaping leave it alone; \u0001n\u0001 marks its place.
  const math = [];
  text = String(text).replace(MATH, (_, block, dollars, inlineTex) => {
    math.push({ tex: (block ?? dollars ?? inlineTex).trim(), display: inlineTex == null });
    return `\u0001${math.length - 1}\u0001`;
  });
  if (math.length && !katex) loadKatex();
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
  const flushList = () => {
    // Numbered steps split by paragraphs keep counting from where they left off.
    const start = list && list.start > 1 ? ` start="${list.start}"` : "";
    if (list) out.push(`<${list.tag}${start}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (const line of text.split("\n")) {
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (LIST_ITEM.test(line)) {
      flushPara();
      const tag = /^\s*\d/.test(line) ? "ol" : "ul";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [], start: parseInt(line, 10) || 1 };
      list.items.push(line.replace(LIST_ITEM, ""));
    } else {
      flushList();
      para.push(line.replace(/[ \t]+$/, ""));
    }
  }
  flushPara();
  flushList();
  return out.join("").replace(/\u0001(\d+)\u0001/g, (_, i) => renderMath(math[+i].tex, math[+i].display));
}

function build(container) {
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
    hlist: aside?.querySelector("[data-hlist]"),
    hclear: aside?.querySelector("[data-hclear]"),
    hnote: aside?.querySelector("[data-hnote]"),
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

  panel.querySelector("[data-close]")?.addEventListener("click", () => close());
  panel.querySelector("[data-new]").addEventListener("click", startNewChat);
  els.htoggle?.addEventListener("click", () => setHistoryOpen(!els.history.classList.contains("open")));
  if (aside) {
    aside.querySelector("[data-hnew]").addEventListener("click", startNewChat);
    aside.querySelector("[data-hclose]").addEventListener("click", () => setHistoryOpen(false));
    els.hclear.addEventListener("click", () => {
      if (!window.confirm("Delete all saved chats? They will be removed from all your devices.")) return;
      history.forEach((c) => removeRemote(c.id));
      history = [];
      saveHistory();
      startNewChat();
    });
    els.hlist.addEventListener("click", (event) => {
      const open = event.target.closest?.("[data-open]");
      const del = event.target.closest?.("[data-del]");
      if (open) openChat(open.dataset.open);
      else if (del) deleteChat(del.dataset.del);
    });
    aside.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") setHistoryOpen(false);
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
    if (event.key === "Escape" && !embedded) close();
  });
  els.log.addEventListener("click", (event) => {
    const chip = event.target.closest?.("[data-starter]");
    if (chip) { send(chip.dataset.starter); return; }
    const pick = event.target.closest?.("[data-pick]");
    if (pick) { answerQuiz(pick.closest("[data-ref]").dataset.ref, pick.dataset.pick); return; }
    const retry = event.target.closest?.("[data-retry]");
    if (retry) { retryQuiz(retry.dataset.retry); return; }
    const ask = event.target.closest?.("[data-send]");
    if (ask) send(ask.dataset.send);
  });
  els.log.addEventListener("submit", (event) => {
    const form = event.target.closest?.("[data-sa]");
    if (!form) return;
    event.preventDefault();
    answerQuiz(form.closest("[data-ref]").dataset.ref, form.querySelector("input").value);
  });
  // Keep a half-typed short answer if the chat redraws, and keep keys out of page shortcuts.
  els.log.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-sa] input");
    const target = input && quizTarget(input.closest("[data-ref]").dataset.ref);
    if (!target) return;
    target.message.quiz = target.message.quiz || { a: {}, ok: {} };
    target.message.quiz.a[target.key] = input.value.slice(0, 300);
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
  if (!ctx) return;
  const q = ctx.question ? escapeHtml(ctx.question) : "Picture question";
  els.context.innerHTML = `
    <details class="tutor-ctx">
      <summary><span class="tutor-context-label">About this question</span><span class="tutor-ctx-peek">${q}</span></summary>
      <p class="tutor-q q-serif">${q}</p>
      <dl class="tutor-answers">
        <div><dt>Official answer</dt><dd>${escapeHtml(ctx.answerLabel || ctx.answer || "Not given")}</dd></div>
        <div><dt>You said</dt><dd>${escapeHtml(ctx.userAnswer || "No answer")}</dd></div>
      </dl>
    </details>`;
}

// ---------- Quizzes ----------

let graderLoading = null;
function loadGrader() {
  if (window.autoChecker) return Promise.resolve();
  if (!graderLoading) {
    graderLoading = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "/js/autochecker.js";
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }
  return graderLoading;
}

function quizHtml(quiz, mi, qi, progress) {
  const { done, correct, total } = quizScore(quiz, qi, progress);
  const finished = done === total;
  const questions = quiz.questions.map((q, i) => {
    const key = `${qi}.${i}`;
    const ref = `${mi}.${qi}.${i}`;
    const ok = progress?.ok?.[key];
    const answered = ok !== undefined;
    const mine = progress?.a?.[key] ?? "";
    let input;
    if (q.kind === "mc") {
      input = `<div class="tq-choices" role="radiogroup" aria-label="Answer choices">${q.choices.map((c) => {
        const state = !answered ? "" : c.letter === q.answer ? " right" : c.letter === mine ? " wrong" : "";
        return `<button type="button" role="radio" class="tq-choice${state}" data-pick="${c.letter}" aria-checked="${c.letter === mine}"${answered ? " disabled" : ""}><span class="tq-letter">${c.letter}</span><span>${richInline(c.text)}</span></button>`;
      }).join("")}</div>`;
    } else {
      input = `<form class="tq-sa" data-sa><input type="text" class="tq-input${answered ? (ok ? " right" : " wrong") : ""}" value="${escapeHtml(mine)}" placeholder="Your answer" aria-label="Your answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"${answered ? " readonly" : ""}>${answered ? "" : `<button class="btn small primary" type="submit">Check</button>`}</form>`;
    }
    const result = !answered ? "" : `<div class="tq-result ${ok ? "right" : "wrong"}" role="status">
        <strong>${ok ? "Correct." : "Not quite."}</strong>${ok && q.kind === "mc" ? "" : ` Answer: ${richInline(answerText(q))}`}
        ${q.why ? `<div class="tq-why">${richInline(q.why)}</div>` : ""}
      </div>`;
    return `<div class="tq" data-ref="${ref}"><div class="tq-q"><span class="tq-n">${i + 1}</span><div>${richText(q.q)}</div></div>${input}${result}</div>`;
  }).join("");
  const footer = !finished ? "" : (() => {
    const missed = correct < total;
    const chips = [
      missed ? `<button class="btn small" type="button" data-send="${escapeHtml(missedMessage(quiz, qi, progress))}">Explain what I missed</button>` : "",
      `<button class="btn small" type="button" data-send="${escapeHtml(missed ? `Give me another quiz on "${quiz.title}".` : `Give me a harder quiz on "${quiz.title}".`)}">${missed ? "Another quiz" : "Harder quiz"}</button>`,
      `<button class="btn small" type="button" data-retry="${mi}.${qi}">Retry</button>`
    ].join("");
    return `<div class="tq-done"><p><strong>${correct} of ${total} correct.</strong></p><div class="tq-actions">${chips}</div></div>`;
  })();
  return `<section class="tutor-quiz" aria-label="Quiz: ${escapeHtml(quiz.title)}">
    <header class="tq-head"><strong>${escapeHtml(quiz.title)}</strong><span class="tq-score">${done} of ${total} answered</span></header>
    ${questions}${footer}
  </section>`;
}

function botHtml(m, mi) {
  const segments = splitQuiz(m.text);
  if (!segments.some((s) => s.type === "quiz")) return `<div class="tutor-msg bot">${richText(m.text)}</div>`;
  let qi = -1;
  const body = segments.map((s) => {
    if (s.type === "text") return richText(s.text);
    qi += 1;
    return quizHtml(s.quiz, mi, qi, m.quiz);
  }).join("");
  return `<div class="tutor-msg bot has-quiz">${body}</div>`;
}

// Finds the quiz a rendered question belongs to: ref is "message.quiz.question".
function quizTarget(ref) {
  const [mi, qi, i] = String(ref).split(".").map(Number);
  const message = state.messages[mi];
  if (!message || message.role !== "assistant") return null;
  const quiz = splitQuiz(message.text).filter((s) => s.type === "quiz")[qi]?.quiz;
  const question = quiz?.questions[i];
  return question ? { message, quiz, question, qi, i, key: `${qi}.${i}` } : null;
}

async function answerQuiz(ref, value) {
  const target = quizTarget(ref);
  if (!target || target.message.quiz?.ok?.[target.key] !== undefined) return;
  const v = String(value || "").trim();
  if (!v) return;
  if (target.question.kind === "sa") await loadGrader();
  const progress = target.message.quiz || { a: {}, ok: {} };
  progress.a[target.key] = v.slice(0, 300);
  progress.ok[target.key] = gradeQuestion(target.question, v, window.autoChecker?.grade);
  target.message.quiz = progress;
  save();
  renderLog(true);
}

function retryQuiz(ref) {
  const [mi, qi] = String(ref).split(".").map(Number);
  const progress = state.messages[mi]?.quiz;
  if (!progress) return;
  for (const key of Object.keys({ ...progress.a, ...progress.ok })) {
    if (key.startsWith(`${qi}.`)) { delete progress.a[key]; delete progress.ok[key]; }
  }
  save();
  renderLog(true);
}

// keepScroll: quiz taps redraw the log in place instead of jumping to the newest message.
function renderLog(keepScroll = false) {
  const scrollTop = els.log.scrollTop;
  const parts = state.messages.map((m, mi) => m.role === "user"
    ? `<div class="tutor-msg user">${escapeHtml(m.text).replace(/\n/g, "<br>")}</div>`
    : botHtml(m, mi));
  if (notice) parts.push(`<div class="tutor-msg bot notice" role="alert">${notice}</div>`);
  if (busy) parts.push(`<div class="tutor-msg bot typing" aria-label="Tutor is writing"><span></span><span></span><span></span></div>`);
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
  els.log.scrollTop = keepScroll ? scrollTop : els.log.scrollHeight;
}

function messageCost() {
  return state.thinking ? THINKING_COST : MESSAGE_COST;
}

function creditWord(n) {
  return n === 1 ? "1 credit" : `${n} credits`;
}

function render() {
  if (!els) return;
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
  if (!els) return;
  els.credits.textContent = credits ? `${credits.remaining} of ${credits.limit} credits left today` : "";
}

async function loadCredits() {
  if (!signedIn || creditsRequested) return;
  creditsRequested = true;
  try {
    const { aiClient: client } = await aiClient();
    client.onCredits(showCredits);
    if (!client.getCredits()) await client.status();
  } catch (err) {
    creditsRequested = false;
    if (!els) return;
    if (err.html) {
      notice = err.html;
      render();
    } else {
      els.error.textContent = err.message;
    }
  }
}

async function send(raw) {
  const text = String(raw || "").trim();
  if (!text || busy || !signedIn) return;
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
  } catch (err) {
    // Put the question back so it can be sent again.
    state.messages.pop();
    els.input.value = text;
    autosize();
    if (err.html) notice = err.html;
    else els.error.textContent = err.message;
  } finally {
    busy = false;
    save();
    render();
    els.input.focus();
  }
}

function open(options = {}) {
  if (!els) mount({ launcher: false });
  returnFocus = document.activeElement;
  if (options.context) {
    const same = JSON.stringify(options.context) === JSON.stringify(state.context);
    if (!same) state = { id: null, messages: [], context: options.context, thinking: state.thinking };
    save();
  }
  els.panel.hidden = false;
  els.fab?.setAttribute("aria-expanded", "true");
  document.body.classList.add("tutor-open");
  render();
  loadCredits();
  (signedIn ? els.input : els.gate.querySelector("a"))?.focus();
}

function close() {
  if (!els || embedded) return;
  els.panel.hidden = true;
  els.fab?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("tutor-open");
  (els.fab || returnFocus)?.focus?.();
}

let launcherWanted = true;

export function mount(options: { launcher?: boolean; container?: HTMLElement } = {}) {
  if (els) return;
  embedded = !!options.container;
  launcherWanted = options.launcher !== false;
  build(options.container || document.body);
  const account = window.atomAccount;
  if (!account) authKnown = true;
  account?.onAuthChange?.((user) => {
    authKnown = !!account.isReady?.() || !!user;
    signedIn = !!user;
    uid = user?.uid || "";
    loadHistory();
    if (embedded) { if (uid) startSync(); else stopSync(); }
    if (signedIn) recordChat();
    if (!signedIn) creditsRequested = false;
    render();
    if (signedIn && (embedded || !els.panel.hidden)) loadCredits();
  });
  account?.whenReady?.().then(() => { authKnown = true; render(); });
  render();
}

export const openTutor = open;
window.atomTutor = { open, close, mount };
