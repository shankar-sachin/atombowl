(() => {
    const grid = document.getElementById('grid');
    const statusEl = document.getElementById('status');
    const errEl = document.getElementById('err');
    const countEl = document.getElementById('count');
    const countLabelEl = document.getElementById('countLabel');
    const searchEl = document.getElementById('search');
    const bankSelectEl = document.getElementById('bankSelect');
    const levelEl = document.getElementById('level');
    const categoryEl = document.getElementById('category');
    const bonusEl = document.getElementById('bonus');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    const pageEl = document.getElementById('page');
    const pagesEl = document.getElementById('pages');
    let bank = [];
    let filtered = [];
    let page = 1;
    const PAGE_SIZE = 100;
    function norm(s) {
        return String(s !== null && s !== void 0 ? s : '').trim();
    }
    // Display helpers. Data values stay as they are; only the copy changes.
    function sentenceCase(text) {
        const s = norm(text);
        if (!s)
            return '';
        if (s === s.toUpperCase())
            return s.charAt(0) + s.slice(1).toLowerCase();
        return s.split(' ').map((w, i) => (i > 0 && /^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w)).join(' ');
    }
    function levelName(level) {
        if (level === 'MS')
            return 'Middle school';
        if (level === 'HS')
            return 'High school';
        return norm(level);
    }
    function typeName(type) {
        if (type === 'SA')
            return 'Short answer';
        if (type === 'MC')
            return 'Multiple choice';
        return norm(type);
    }
    function setName(set) {
        return sentenceCase(norm(set).replace(/[-_]+/g, ' '));
    }
    function roundName(round) {
        const r = norm(round);
        const m = r.match(/^round\s*(\d+)$/i);
        if (m)
            return `round ${m[1]}`;
        return r ? `${r} round` : '';
    }
    function escapeHtml(s) {
        return String(s !== null && s !== void 0 ? s : '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
    function showErr(msg) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
    }
    function hideErr() {
        errEl.textContent = '';
        errEl.classList.add('hidden');
    }
    async function loadBank() {
        const sources = [
            { id: 'data/set_A.json', label: 'Dynamazar (Set A)' },
            { id: 'data/set_B.json', label: 'Scalazar (Set B)' }
        ];
        const results = await Promise.all(sources.map(async (source) => {
            const res = await fetch(`./${source.id}`, { cache: 'no-store' });
            if (!res.ok)
                throw new Error(`${source.id} not found in /data`);
            const data = await res.json();
            const items = Array.isArray(data) ? data : (data.questions || []);
            return items.map((q) => ({ ...q, bank_id: source.id, bank_label: source.label }));
        }));
        return results.flat();
    }
    function matches(q, search, bankChoice, level, category, bonus) {
        if (bankChoice !== 'ALL' && q.bank_id !== bankChoice)
            return false;
        if (level !== 'ANY' && q.level !== level)
            return false;
        if (category !== 'ANY' && norm(q.category) !== category)
            return false;
        if (bonus !== 'ANY' && String(!!q.bonus) !== bonus)
            return false;
        if (!search)
            return true;
        const s = search.toLowerCase();
        const hay = [
            q.set_name,
            q.round_name,
            q.category,
            q.type,
            q.parsed_answer,
            q.question_text,
            q.answer_text,
            q.page,
            q.num
        ].map(v => String(v !== null && v !== void 0 ? v : '')).join(' | ').toLowerCase();
        return hay.includes(s);
    }
    function apply() {
        const search = norm(searchEl.value);
        page = 1;
        filtered = bank.filter(q => matches(q, search, bankSelectEl.value, levelEl.value, categoryEl.value, bonusEl.value));
        render();
    }
    function tile(q, idx) {
        const isBonus = !!q.bonus;
        const tags = [
            q.level ? `<span class="tag accent">${escapeHtml(levelName(q.level))}</span>` : '',
            norm(q.category) ? `<span class="tag">${escapeHtml(sentenceCase(q.category))}</span>` : '',
            `<span class="tag ${isBonus ? 'bad' : 'good'}">${isBonus ? 'Bonus' : 'Toss-up'}</span>`,
            q.type ? `<span class="tag">${escapeHtml(typeName(q.type))}</span>` : ''
        ].join('');
        const questionText = norm(q.question_text)
            ? `<p class="q-serif tile-question">${escapeHtml(q.question_text)}</p>`
            : `<p class="tile-question tile-image muted">Question shown as an image. Press Practice to see it.</p>`;
        const answer = norm(q.parsed_answer) || '—';
        const where = [setName(q.set_name), roundName(q.round_name), q.num !== undefined && q.num !== null && q.num !== '' ? `question ${q.num}` : '']
            .filter(Boolean)
            .join(', ');
        return `
        <article class="tile">
          <div class="tile-tags">${tags}</div>
          ${questionText}
          <p class="tile-answer"><span class="muted">Answer</span> <strong>${escapeHtml(sentenceCase(answer))}</strong></p>
          <p class="tile-meta">${escapeHtml(where)}</p>
          <div class="tile-actions">
            <button class="btn primary small" type="button" data-action="practice" data-idx="${idx}">Practice</button>
          </div>
        </article>
      `;
    }
    function render() {
        hideErr();
        const total = filtered.length;
        countEl.textContent = total.toLocaleString();
        countLabelEl.textContent = total === 1 ? 'question' : 'questions';
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        page = Math.max(1, Math.min(totalPages, page));
        pageEl.textContent = String(page);
        pagesEl.textContent = String(totalPages);
        prevBtn.disabled = page <= 1;
        nextBtn.disabled = page >= totalPages;
        const start = (page - 1) * PAGE_SIZE;
        const slice = filtered.slice(start, start + PAGE_SIZE);
        grid.innerHTML = slice.map((q, i) => tile(q, start + i)).join('');
        statusEl.textContent = total
            ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)}.`
            : 'No results. Try changing the filters.';
    }
    // Practice hands one question to the practice engine.
    grid.addEventListener('click', (e) => {
        const target = e.target;
        const btn = target === null || target === void 0 ? void 0 : target.closest('button[data-action="practice"]');
        if (!btn)
            return;
        const idx = parseInt(btn.dataset.idx || '', 10);
        const q = filtered[idx];
        if (!q)
            return;
        try {
            localStorage.setItem('atom_single_question', JSON.stringify(q));
            localStorage.setItem('atom_practice_config', JSON.stringify({ mode: 'single', count: 1 }));
        }
        catch {
            showErr('Your browser blocked local storage, so this question cannot be sent to practice.');
            return;
        }
        window.location.href = 'practice.html';
    });
    const debounced = (() => {
        let t = null;
        return (fn) => {
            if (t)
                clearTimeout(t);
            t = setTimeout(fn, 160);
        };
    })();
    searchEl.addEventListener('input', () => debounced(apply));
    bankSelectEl.addEventListener('change', apply);
    levelEl.addEventListener('change', apply);
    categoryEl.addEventListener('change', apply);
    bonusEl.addEventListener('change', apply);
    function changePage(delta) {
        page += delta;
        render();
        window.scrollTo({ top: 0, behavior: 'auto' });
    }
    prevBtn.addEventListener('click', () => changePage(-1));
    nextBtn.addEventListener('click', () => changePage(1));
    (async () => {
        statusEl.textContent = 'Loading question banks…';
        try {
            bank = await loadBank();
        }
        catch (e) {
            showErr(String(e.message || e));
            statusEl.textContent = '';
            return;
        }
        if (!Array.isArray(bank) || bank.length === 0) {
            showErr('The question banks loaded but contain no questions.');
            statusEl.textContent = '';
            return;
        }
        statusEl.textContent = `Loaded ${bank.length.toLocaleString()} questions from both banks.`;
        filtered = bank.slice();
        render();
    })();
})();
//# sourceMappingURL=question_bank.js.map