const PROGRESS_KEY = "atom_learn_progress_v1";
const MANIFEST_URL = "data/lessons/index.json";
let manifest = null;
let activeSubject = "";
const completedLessons = new Set();
const subjectCache = new Map();
let account = null;
// DOM refs
const browserView = document.getElementById("browserView");
const readerView = document.getElementById("readerView");
const subjectTabs = document.getElementById("subjectTabs");
const lessonGrid = document.getElementById("lessonGrid");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");
const progressTrack = document.getElementById("progressTrack");
const progressFill = document.getElementById("progressFill");
const readerSubject = document.getElementById("readerSubject");
const readerTitle = document.getElementById("readerTitle");
const lessonContent = document.getElementById("lessonContent");
const backBtn = document.getElementById("backBtn");
const completeBtn = document.getElementById("completeBtn");
const completeLabel = document.getElementById("completeLabel");
const completeStatus = document.getElementById("completeStatus");
const sectionProgress = document.getElementById("sectionProgress");
const sectionSteps = document.getElementById("sectionSteps");
const prevSectionBtn = document.getElementById("prevSectionBtn");
const nextSectionBtn = document.getElementById("nextSectionBtn");
const keyTermTooltip = document.getElementById("keyTermTooltip");
const readerEl = readerView.querySelector(".reader");
let currentLessonId = "";
let currentLesson = null;
let currentSectionIndex = 0;
let currentDefs = {};
let openRequest = 0; // bumps on every showReader/showBrowser so stale loads are dropped
let lastOpened = null;
const icon = (name) => { var _a; return ((_a = window.atomIcon) === null || _a === void 0 ? void 0 : _a.call(window, name)) || ""; };
// ---- Utility ----
function escapeHtml(str) {
    return String(str !== null && str !== void 0 ? str : "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function subjectFor(lessonId) {
    return manifest === null || manifest === void 0 ? void 0 : manifest.subjects.find((s) => s.lessons.some((l) => l.id === lessonId));
}
// ---- Progress ----
function loadLocalProgress() {
    try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    }
    catch {
        return [];
    }
}
function saveLocalProgress() {
    try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify([...completedLessons]));
    }
    catch { }
}
// Merge remote progress into local. Only writes to Firestore when local has ids the account lacks.
async function syncProgress() {
    var _a, _b, _c;
    const user = (_a = account === null || account === void 0 ? void 0 : account.getUser) === null || _a === void 0 ? void 0 : _a.call(account);
    if (!user || !account.loadLearnProgress)
        return;
    try {
        const remote = await account.loadLearnProgress();
        if (((_b = account.getUser) === null || _b === void 0 ? void 0 : _b.call(account)) !== user)
            return;
        const remoteSet = new Set(Array.isArray(remote) ? remote : []);
        let localChanged = false;
        remoteSet.forEach((id) => {
            if (!completedLessons.has(id)) {
                completedLessons.add(id);
                localChanged = true;
            }
        });
        if (localChanged)
            saveLocalProgress();
        const missingRemotely = [...completedLessons].some((id) => !remoteSet.has(id));
        if (missingRemotely)
            await ((_c = account.saveLearnProgress) === null || _c === void 0 ? void 0 : _c.call(account, [...completedLessons]));
    }
    catch { }
}
function manifestIds(subjects) {
    const list = subjects || (manifest === null || manifest === void 0 ? void 0 : manifest.subjects) || [];
    return list.flatMap((s) => s.lessons.map((l) => l.id));
}
function countDone(ids) {
    return ids.filter((id) => completedLessons.has(id)).length;
}
function updateProgressUI() {
    if (!manifest)
        return;
    const ids = manifestIds();
    const total = ids.length;
    const done = countDone(ids);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    progressText.textContent = `${done} of ${total} lessons complete`;
    progressPct.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;
    progressTrack.setAttribute("aria-valuenow", String(pct));
}
// ---- Copy prevention (lesson text only) ----
function setupCopyProtection() {
    const inReader = () => !readerView.classList.contains("hidden");
    const inLesson = (e) => inReader() && lessonContent.contains(e.target);
    document.addEventListener("copy", (e) => { if (inReader())
        e.preventDefault(); });
    document.addEventListener("cut", (e) => { if (inReader())
        e.preventDefault(); });
    lessonContent.addEventListener("contextmenu", (e) => { if (inLesson(e))
        e.preventDefault(); });
    lessonContent.addEventListener("selectstart", (e) => { if (inLesson(e))
        e.preventDefault(); });
}
// ---- Data loading ----
async function loadManifest() {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok)
        throw new Error(`Lesson list request failed (${res.status})`);
    return res.json();
}
async function loadSubjectData(file) {
    if (subjectCache.has(file))
        return subjectCache.get(file);
    const res = await fetch(`data/lessons/${file}`);
    if (!res.ok)
        throw new Error(`Lesson file request failed (${res.status})`);
    const data = await res.json();
    subjectCache.set(file, data);
    return data;
}
// ---- Browser rendering ----
function renderTabs() {
    if (!manifest)
        return;
    const tab = (id, label) => {
        const active = activeSubject === id;
        return `<button class="tab${active ? " active" : ""}" type="button" data-subject="${escapeHtml(id)}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
    };
    subjectTabs.innerHTML = tab("", "All subjects") + manifest.subjects.map((s) => tab(s.id, s.label)).join("");
}
function lessonCard(s, l, index) {
    const done = completedLessons.has(l.id);
    const status = done
        ? `<span class="tag good lesson-status">${icon("check")}Completed</span>`
        : `<span></span>`;
    return `
    <button class="lesson-card${done ? " completed" : ""}" type="button" data-lesson="${escapeHtml(l.id)}" data-file="${escapeHtml(s.file)}">
      <span class="lesson-num">Lesson ${index + 1}</span>
      <span class="lesson-card-title">${escapeHtml(l.title)}</span>
      <span class="lesson-card-desc">${escapeHtml(l.description)}</span>
      <span class="lesson-card-footer">${status}<span class="lesson-open">Read${icon("chevronRight")}</span></span>
    </button>`;
}
function renderGrid() {
    if (!manifest)
        return;
    const subjects = activeSubject ? manifest.subjects.filter((s) => s.id === activeSubject) : manifest.subjects;
    const html = subjects.map((s) => {
        const lessons = [...s.lessons].sort((a, b) => { var _a, _b; return ((_a = a.order) !== null && _a !== void 0 ? _a : 0) - ((_b = b.order) !== null && _b !== void 0 ? _b : 0); });
        const ids = lessons.map((l) => l.id);
        return `
      <section class="subject-group" aria-label="${escapeHtml(s.label)}">
        <div class="subject-head">
          <h2>${escapeHtml(s.label)}</h2>
          <span class="muted">${countDone(ids)} of ${ids.length} complete</span>
        </div>
        <div class="lesson-list">${lessons.map((l, i) => lessonCard(s, l, i)).join("")}</div>
      </section>`;
    }).join("");
    lessonGrid.innerHTML = html || `<p class="state-msg">No lessons in this subject yet.</p>`;
}
function renderBrowserError(message) {
    subjectTabs.innerHTML = "";
    progressText.textContent = "Progress unavailable";
    progressPct.textContent = "";
    lessonGrid.innerHTML = `
    <div class="state-panel" role="alert">
      ${icon("alert")}
      <div>
        <p><strong>Couldn't load the lessons.</strong> ${escapeHtml(message)}. Check your connection, then try again.</p>
        <button class="btn" type="button" data-action="retry-manifest">${icon("reset")}Try again</button>
      </div>
    </div>`;
}
// ---- Key terms ----
// One pass over the plain text: a single alternation of all terms (longest first),
// boundaries checked by hand so no lookbehind is needed (Safari < 16.4).
// Only the first occurrence of each term is marked, and text is escaped as it is copied.
function highlightKeyTerms(body, keyTerms, defs) {
    const terms = [...new Set(keyTerms.map((t) => String(t || "").trim()).filter(Boolean))]
        .sort((a, b) => b.length - a.length);
    if (!terms.length)
        return escapeHtml(body);
    const canonical = new Map(terms.map((t) => [t.toLowerCase(), t]));
    const re = new RegExp(`(?:${terms.map(escapeRegex).join("|")})(?![\\w-])`, "gi");
    const seen = new Set();
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(body))) {
        const start = m.index;
        const prev = start > 0 ? body[start - 1] : "";
        if (prev && /[\w-]/.test(prev)) {
            re.lastIndex = start + 1;
            continue;
        }
        const key = m[0].toLowerCase();
        const term = canonical.get(key) || m[0];
        if (seen.has(key))
            continue;
        seen.add(key);
        out += escapeHtml(body.slice(last, start)) + termMarkup("mark", "key-term", term, m[0], defs);
        last = start + m[0].length;
    }
    return out + escapeHtml(body.slice(last));
}
function termMarkup(tag, cls, term, text, defs) {
    const hasDef = !!lookupDef(term, defs);
    const attrs = hasDef ? ` tabindex="0" role="button" aria-expanded="false" aria-controls="keyTermTooltip"` : "";
    return `<${tag} class="${cls}${hasDef ? " has-def" : ""}" data-term="${escapeHtml(term)}"${attrs}>${escapeHtml(text)}</${tag}>`;
}
function lookupDef(term, defs) {
    if (defs[term])
        return defs[term];
    const lower = term.toLowerCase();
    const key = Object.keys(defs).find((k) => k.toLowerCase() === lower);
    return key ? defs[key] : "";
}
// ---- Tooltip ----
let tooltipFor = null;
function showTooltip(el) {
    const def = lookupDef(el.dataset.term || "", currentDefs);
    if (!def)
        return;
    if (tooltipFor && tooltipFor !== el)
        tooltipFor.setAttribute("aria-expanded", "false");
    tooltipFor = el;
    el.setAttribute("aria-expanded", "true");
    keyTermTooltip.innerHTML = `<strong>${escapeHtml(el.dataset.term || "")}</strong><span>${escapeHtml(def)}</span>`;
    keyTermTooltip.classList.remove("hidden");
    // Position relative to the reader (both scroll together), below the term, clamped to the reader width.
    const host = readerEl.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const tipWidth = keyTermTooltip.offsetWidth;
    let left = rect.left - host.left + rect.width / 2 - tipWidth / 2;
    left = Math.max(0, Math.min(left, host.width - tipWidth));
    keyTermTooltip.style.left = `${left}px`;
    keyTermTooltip.style.top = `${rect.bottom - host.top + 8}px`;
}
function hideTooltip() {
    if (tooltipFor)
        tooltipFor.setAttribute("aria-expanded", "false");
    tooltipFor = null;
    keyTermTooltip.classList.add("hidden");
}
function termFrom(e) {
    var _a, _b;
    return (_b = (_a = e.target) === null || _a === void 0 ? void 0 : _a.closest) === null || _b === void 0 ? void 0 : _b.call(_a, ".has-def");
}
lessonContent.addEventListener("mouseover", (e) => {
    const el = termFrom(e);
    if (el && el !== tooltipFor)
        showTooltip(el);
});
lessonContent.addEventListener("mouseout", (e) => {
    const el = termFrom(e);
    if (!el || el.contains(e.relatedTarget))
        return;
    if (document.activeElement !== el)
        hideTooltip();
});
lessonContent.addEventListener("focusin", (e) => {
    const el = termFrom(e);
    if (el)
        showTooltip(el);
});
lessonContent.addEventListener("focusout", (e) => {
    if (termFrom(e) === tooltipFor)
        hideTooltip();
});
lessonContent.addEventListener("click", (e) => {
    const el = termFrom(e);
    if (el)
        showTooltip(el);
});
lessonContent.addEventListener("keydown", (e) => {
    const el = termFrom(e);
    if (!el)
        return;
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (tooltipFor === el)
            hideTooltip();
        else
            showTooltip(el);
    }
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tooltipFor)
        hideTooltip();
});
window.addEventListener("resize", () => hideTooltip());
// ---- Reader rendering ----
function renderSection(lesson, sectionIndex) {
    if (sectionIndex < 0 || sectionIndex >= lesson.sections.length)
        return;
    hideTooltip();
    const section = lesson.sections[sectionIndex];
    const keyTerms = Array.isArray(section.keyTerms) ? section.keyTerms : [];
    currentDefs = section.keyTermsDefs || {};
    const total = lesson.sections.length;
    lessonContent.innerHTML = `
    <h2 class="section-heading">${escapeHtml(section.heading)}</h2>
    <p class="lesson-body q-serif">${highlightKeyTerms(section.body || "", keyTerms, currentDefs)}</p>
    ${keyTerms.length ? `
      <div class="key-terms">
        <h3>Key terms</h3>
        <div class="key-terms-list">
          ${keyTerms.map((t) => termMarkup("span", "pill key-term-pill", t, t, currentDefs)).join("")}
        </div>
        ${Object.keys(currentDefs).length ? `<p class="key-terms-hint muted">Underlined terms have definitions. Hover, tap or focus one to read it.</p>` : ""}
      </div>` : ""}`;
    sectionProgress.textContent = `Section ${sectionIndex + 1} of ${total}`;
    sectionSteps.innerHTML = lesson.sections
        .map((_, i) => `<span class="${i < sectionIndex ? "seen" : i === sectionIndex ? "current" : ""}"></span>`)
        .join("");
    prevSectionBtn.disabled = sectionIndex === 0;
    nextSectionBtn.disabled = sectionIndex === total - 1;
}
function renderReaderError(message) {
    lessonContent.innerHTML = `
    <div class="state-panel" role="alert">
      ${icon("alert")}
      <div>
        <p><strong>Couldn't open this lesson.</strong> ${escapeHtml(message)}. Check your connection, then try again.</p>
        <button class="btn" type="button" data-action="retry-lesson">${icon("reset")}Try again</button>
      </div>
    </div>`;
    sectionProgress.textContent = "";
    sectionSteps.innerHTML = "";
    prevSectionBtn.disabled = true;
    nextSectionBtn.disabled = true;
    completeBtn.disabled = true;
}
// ---- View switching ----
function showBrowser() {
    openRequest++;
    hideTooltip();
    const returnTo = currentLessonId;
    browserView.classList.remove("hidden");
    readerView.classList.add("hidden");
    currentLessonId = "";
    currentLesson = null;
    currentSectionIndex = 0;
    renderGrid();
    updateProgressUI();
    const card = returnTo ? lessonGrid.querySelector(`.lesson-card[data-lesson="${CSS.escape(returnTo)}"]`) : null;
    if (card) {
        card.scrollIntoView({ block: "center" });
        card.focus({ preventScroll: true });
    }
    else {
        window.scrollTo(0, 0);
    }
}
async function showReader(lessonId, file) {
    const request = ++openRequest;
    hideTooltip();
    lastOpened = { id: lessonId, file };
    const meta = subjectFor(lessonId);
    const metaLesson = meta === null || meta === void 0 ? void 0 : meta.lessons.find((l) => l.id === lessonId);
    currentLessonId = lessonId;
    currentLesson = null;
    currentSectionIndex = 0;
    readerSubject.textContent = (meta === null || meta === void 0 ? void 0 : meta.label) || "";
    readerTitle.textContent = (metaLesson === null || metaLesson === void 0 ? void 0 : metaLesson.title) || "Lesson";
    lessonContent.innerHTML = `<p class="state-msg">Loading lesson…</p>`;
    sectionProgress.textContent = "";
    sectionSteps.innerHTML = "";
    prevSectionBtn.disabled = true;
    nextSectionBtn.disabled = true;
    updateCompleteUI();
    browserView.classList.add("hidden");
    readerView.classList.remove("hidden");
    window.scrollTo(0, 0);
    try {
        const subjectData = await loadSubjectData(file);
        if (request !== openRequest)
            return;
        const lesson = subjectData.lessons.find((l) => l.id === lessonId);
        if (!lesson || !Array.isArray(lesson.sections) || !lesson.sections.length) {
            throw new Error("This lesson has no content yet");
        }
        currentLesson = lesson;
        readerTitle.textContent = lesson.title;
        renderSection(lesson, 0);
        updateCompleteUI();
        readerTitle.focus({ preventScroll: true });
    }
    catch (err) {
        if (request !== openRequest)
            return;
        renderReaderError(err instanceof Error ? err.message : "Unknown error");
    }
}
function navigateSection(direction) {
    if (!currentLesson)
        return;
    const newIndex = currentSectionIndex + direction;
    if (newIndex < 0 || newIndex >= currentLesson.sections.length)
        return;
    currentSectionIndex = newIndex;
    renderSection(currentLesson, currentSectionIndex);
    const top = readerView.getBoundingClientRect().top + window.scrollY - 80;
    if (window.scrollY > top)
        window.scrollTo(0, Math.max(0, top));
}
function updateCompleteUI() {
    var _a;
    const done = !!currentLessonId && completedLessons.has(currentLessonId);
    completeBtn.disabled = !currentLesson;
    completeBtn.classList.toggle("good", !done);
    completeBtn.classList.toggle("quiet", done);
    completeBtn.setAttribute("aria-pressed", String(done));
    completeLabel.textContent = done ? "Mark as not complete" : "Mark complete";
    (_a = completeBtn.querySelector("svg")) === null || _a === void 0 ? void 0 : _a.classList.toggle("hidden", done);
    completeStatus.classList.toggle("hidden", !done);
}
// ---- Events ----
subjectTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn)
        return;
    activeSubject = btn.dataset.subject || "";
    renderTabs();
    renderGrid();
});
lessonGrid.addEventListener("click", (e) => {
    const target = e.target;
    if (target.closest('[data-action="retry-manifest"]')) {
        void loadAndRender();
        return;
    }
    const card = target.closest(".lesson-card");
    if (!card)
        return;
    const lessonId = card.dataset.lesson || "";
    const file = card.dataset.file || "";
    if (lessonId && file)
        void showReader(lessonId, file);
});
lessonContent.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="retry-lesson"]') && lastOpened) {
        subjectCache.delete(lastOpened.file);
        void showReader(lastOpened.id, lastOpened.file);
    }
});
backBtn.addEventListener("click", showBrowser);
prevSectionBtn.addEventListener("click", () => navigateSection(-1));
nextSectionBtn.addEventListener("click", () => navigateSection(1));
document.addEventListener("keydown", (e) => {
    var _a;
    if (readerView.classList.contains("hidden") || !currentLesson)
        return;
    const t = e.target;
    if (((_a = t === null || t === void 0 ? void 0 : t.closest) === null || _a === void 0 ? void 0 : _a.call(t, "input, textarea, select, [contenteditable]")) || e.metaKey || e.ctrlKey || e.altKey)
        return;
    if (e.key === "ArrowRight")
        navigateSection(1);
    else if (e.key === "ArrowLeft")
        navigateSection(-1);
});
completeBtn.addEventListener("click", async () => {
    var _a;
    if (!currentLessonId || !currentLesson)
        return;
    const nowDone = !completedLessons.has(currentLessonId);
    if (nowDone)
        completedLessons.add(currentLessonId);
    else
        completedLessons.delete(currentLessonId);
    saveLocalProgress();
    updateCompleteUI();
    updateProgressUI();
    // The account store only adds ids (arrayUnion), so un-marking stays local.
    if (nowDone && ((_a = account === null || account === void 0 ? void 0 : account.getUser) === null || _a === void 0 ? void 0 : _a.call(account)) && account.saveLearnProgress) {
        try {
            await account.saveLearnProgress([...completedLessons]);
        }
        catch { }
    }
});
// ---- Init ----
async function loadAndRender() {
    lessonGrid.innerHTML = `<p class="state-msg">Loading lessons…</p>`;
    try {
        manifest = await loadManifest();
        if (!Array.isArray(manifest === null || manifest === void 0 ? void 0 : manifest.subjects))
            throw new Error("The lesson list is malformed");
        if (activeSubject && !manifest.subjects.some((s) => s.id === activeSubject))
            activeSubject = "";
        renderTabs();
        renderGrid();
        updateProgressUI();
    }
    catch (err) {
        manifest = null;
        renderBrowserError(err instanceof Error ? err.message : "Unknown error");
    }
}
async function connectAccount() {
    // Firebase loads from gstatic; if it's blocked or offline, lessons still work and progress stays local.
    try {
        await import("./account_store.js");
    }
    catch {
        return;
    }
    account = window.atomAccount || null;
    if (!(account === null || account === void 0 ? void 0 : account.onAuthChange))
        return;
    account.onAuthChange(async (user) => {
        completedLessons.clear();
        loadLocalProgress().forEach((id) => completedLessons.add(id));
        if (user)
            await syncProgress();
        renderGrid();
        updateProgressUI();
        updateCompleteUI();
    });
}
async function init() {
    setupCopyProtection();
    loadLocalProgress().forEach((id) => completedLessons.add(id));
    await loadAndRender();
    void connectAccount();
}
void init();
export {};
//# sourceMappingURL=learn.js.map