// Everything waits for DOM so we never attach listeners to null nodes.
document.addEventListener('DOMContentLoaded', () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    // Filters
    const els = {
        bankSelect: document.getElementById('bankSelect'),
        level: document.getElementById('level'),
        qaType: document.getElementById('qaType'),
        bonus: document.getElementById('bonus'),
        count: document.getElementById('count'),
        seconds: document.getElementById('seconds'),
        setName: document.getElementById('setName'),
        roundName: document.getElementById('roundName'),
        bankStatus: document.getElementById('bankStatus'),
        bankMeta: document.getElementById('bankMeta'),
        topicGrid: document.getElementById('topicGrid'),
        clearTopics: document.getElementById('clearTopics'),
        toggleAdvanced: document.getElementById('toggleAdvanced'),
        countRapid: document.getElementById('countRapid'),
        countToss: document.getElementById('countToss'),
        countBonus: document.getElementById('countBonus'),
        countMC: document.getElementById('countMC'),
        countSA: document.getElementById('countSA'),
        countSet: document.getElementById('countSet'),
        countPick: document.getElementById('countPick'),
    };
    // Minimal self-tests (console only)
    console.assert(!!els.level && !!els.qaType && !!els.bonus, 'Missing core filter elements');
    console.assert(!!els.countRapid && !!els.bankStatus, 'Missing status/count elements');
    const SETTINGS_KEY = 'atom_settings_v1';
    const SETTINGS_DEFAULTS = {
        sfx: true,
        tts: true,
        ttsVoice: '',
        ttsRate: 1.0,
        ttsPitch: 1.0,
        ttsVolume: 1.0,
        div: 'MS',
        mode: 'rapid',
        rememberTopics: false,
        highContrast: false,
        animations: true,
        fontSize: 'm',
        accent: '#4f7cff',
        theme: 'system'
    };
    function loadSettings() {
        if (window.atomSettings)
            return window.atomSettings;
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw)
                return { ...SETTINGS_DEFAULTS };
            const parsed = JSON.parse(raw);
            return { ...SETTINGS_DEFAULTS, ...parsed };
        }
        catch {
            return { ...SETTINGS_DEFAULTS };
        }
    }
    const settings = loadSettings();
    let bank = [];
    window.bank = bank;
    const TOPIC_SAVE_KEY = 'atom_topic_super_v1';
    function normCat(c) { return String(c || '').trim(); }
    const TOPIC_GROUPS = [
        {
            id: 'PHYSICS',
            label: 'Physics',
            categories: ['PHYSICS', 'PHYSICAL SCIENCE'],
            detailed: [
                'Kinematics',
                'Newtonian Mechanics',
                'Work, Energy, & Power',
                'Momentum & Collisions',
                'Rotational Motion',
                'Waves & Sound',
                'Optics',
                'Electricity & Circuits',
                'Magnetism',
                'Electromagnetism',
                'Modern Physics',
                'Thermodynamics',
                'Units, Constants, & Measurement',
            ],
        },
        {
            id: 'CHEMISTRY',
            label: 'Chemistry',
            categories: ['CHEMISTRY'],
            detailed: [
                'Stoichiometry & Moles',
                'Atomic Structure',
                'Periodic Trends',
                'Chemical Bonding',
                'Thermochemistry',
                'Gas Laws',
                'Acids, Bases, & pH',
                'Reaction Kinetics',
                'Equilibrium',
                'Electrochemistry',
                'Organic Chemistry',
                'Nuclear Chemistry',
                'Solutions & Colligative Properties',
                'Lab Techniques & Measurement',
            ],
        },
        {
            id: 'MATH',
            label: 'Math',
            categories: ['MATH', 'MATHEMATICS'],
            detailed: [
                'Algebra',
                'Geometry',
                'Trigonometry',
                'Analytic Geometry',
                'Functions',
                'Polynomials',
                'Exponents & Radicals',
                'Probability & Statistics',
                'Number Theory',
                'Word Problems',
            ],
        },
        {
            id: 'EARTH_SCIENCE',
            label: 'Earth science',
            categories: ['EARTH SCIENCE', 'EARTH AND SPACE', 'EARTH AND SPACE SCIENCE'],
            detailed: [
                'Meteorology',
                'Climatology',
                'Atmospheric Physics',
                'Geology',
                'Mineralogy',
                'Petrology',
                'Plate Tectonics',
                'Geomorphology',
                'Hydrology',
                'Oceanography',
                'Earth Systems',
                'Environmental Earth Science',
            ],
        },
        {
            id: 'ASTRONOMY',
            label: 'Astronomy',
            categories: ['ASTRONOMY'],
            detailed: [
                'Celestial Coordinates',
                'Stars & Stellar Evolution',
                'Galaxies & Cosmology',
                'Solar System',
                'Observational Astronomy',
                'Astrophysics',
                'Spectroscopy',
                'Cosmology',
                'Space Weather',
            ],
        },
        {
            id: 'BIOLOGY',
            label: 'Biology',
            categories: ['BIOLOGY', 'LIFE SCIENCE'],
            detailed: [
                'Cell Structure & Function',
                'Biochemistry',
                'Enzymes & Metabolism',
                'Photosynthesis & Respiration',
                'Genetics',
                'Molecular Biology',
                'Evolution',
                'Ecology',
                'Plant Biology',
                'Human Physiology',
                'Immunology',
                'Microbiology',
                'Taxonomy & Classification',
            ],
        },
        {
            id: 'GENERAL_SCIENCE',
            label: 'General science',
            categories: ['GENERAL SCIENCE'],
            detailed: [
                'Scientific Measurement',
                'Dimensional Analysis',
                'Scientific Notation',
                'Laboratory Safety',
                'Applied Science',
                'Interdisciplinary Science',
            ],
        },
        {
            id: 'ENERGY',
            label: 'Energy',
            categories: ['ENERGY'],
            detailed: [
                'Renewable Energy',
                'Nonrenewable Energy',
                'Energy Resources',
                'Energy & Environment',
                'Power Generation',
                'Energy Policy',
            ],
        },
        {
            id: 'COMPUTER_SCIENCE',
            label: 'Computer science',
            categories: ['COMPUTER SCIENCE'],
            detailed: [],
        },
    ];
    // Display helper: "Work, Energy, & Power" -> "Work, energy, & power".
    // Only plain capitalized words are lowered, so "pH" and acronyms survive.
    function sentenceCase(text) {
        return String(text || '').split(' ').map((word, i) => i > 0 && /^[A-Z][a-z]+[,]?$/.test(word) ? word.toLowerCase() : word).join(' ');
    }
    function escapeAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }
    function renderTopics() {
        if (!els.topicGrid)
            return;
        els.topicGrid.innerHTML = TOPIC_GROUPS.map(group => `
          <div class="topic-card" data-topic="${group.id}">
            <label class="topic-super">
              <input type="checkbox" class="topic-super-checkbox" data-topic="${group.id}">
              <span class="topic-super-text">${group.label}</span>
            </label>
            <div class="topic-sublist" role="group" aria-label="${group.label} subtopics">
              ${group.detailed.map(topic => `
                <label class="topic-option">
                  <input type="checkbox" class="topic-detail-checkbox" data-topic="${group.id}" value="${escapeAttr(topic)}">
                  <span class="topic-option-text">${escapeAttr(sentenceCase(topic))}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `).join('');
    }
    function selectedSuperTopics() {
        return Array.from(document.querySelectorAll('.topic-super-checkbox:checked'))
            .map(el => el.dataset.topic)
            .filter(Boolean);
    }
    function loadSavedSuperTopics() {
        try {
            const raw = localStorage.getItem(TOPIC_SAVE_KEY);
            const parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    function saveSuperTopics(topics) {
        localStorage.setItem(TOPIC_SAVE_KEY, JSON.stringify(topics || []));
    }
    function selectedDetailedTopics() {
        return Array.from(document.querySelectorAll('.topic-detail-checkbox:checked'))
            .map(el => el.value)
            .filter(Boolean);
    }
    // Ticked subtopics, grouped under the topic they belong to: { MATH: ['Algebra'] }.
    function selectedDetailedByTopic() {
        const out = {};
        document.querySelectorAll('.topic-detail-checkbox:checked').forEach((el) => {
            const box = el;
            if (!box.dataset.topic || !box.value)
                return;
            (out[box.dataset.topic] = out[box.dataset.topic] || []).push(box.value);
        });
        return out;
    }
    // A subtopic narrows its own topic only. Ticking one counts as choosing that topic, so a
    // subtopic left ticked under Math never empties a Physics run.
    function topicPass(q, topics, detailedByTopic) {
        const anyDetailed = Object.values(detailedByTopic).some((list) => list.length);
        if (!topics.length && !anyDetailed)
            return true;
        const cat = normCat(q.category);
        const group = TOPIC_GROUPS.find(g => g.categories.includes(cat));
        if (!group)
            return false;
        const subs = detailedByTopic[group.id] || [];
        if (subs.length)
            return subs.includes(normCat(q.detailed_category || q.detailedCategory));
        return topics.includes(group.id);
    }
    function expandedCategories(selectedTopics) {
        if (!selectedTopics.length)
            return [];
        const lookup = new Map(TOPIC_GROUPS.map(group => [group.id, group.categories]));
        return selectedTopics.flatMap(topic => lookup.get(topic) || []);
    }
    function applyFilters(list, overrides = {}) {
        var _a, _b, _c, _d, _e;
        const level = (_a = overrides.level) !== null && _a !== void 0 ? _a : els.level.value;
        const topics = selectedSuperTopics();
        const detailedByTopic = selectedDetailedByTopic();
        const qaType = (_b = overrides.qaType) !== null && _b !== void 0 ? _b : els.qaType.value;
        const bonus = (_c = overrides.bonus) !== null && _c !== void 0 ? _c : els.bonus.value;
        const setName = ((_d = overrides.setName) !== null && _d !== void 0 ? _d : els.setName.value).trim();
        const roundName = ((_e = overrides.roundName) !== null && _e !== void 0 ? _e : els.roundName.value).trim();
        return list.filter(q => {
            if (level !== 'ANY' && q.level !== level)
                return false;
            if (!topicPass(q, topics, detailedByTopic))
                return false;
            if (qaType !== 'ANY' && q.type !== qaType)
                return false;
            if (bonus !== 'ANY' && String(!!q.bonus) !== bonus)
                return false;
            if (setName && q.set_name !== setName)
                return false;
            if (roundName && q.round_name !== roundName)
                return false;
            return true;
        });
    }
    function matchLabel(n) {
        return `${n.toLocaleString()} ${n === 1 ? 'match' : 'matches'}`;
    }
    function updateCounts() {
        els.countRapid.textContent = matchLabel(applyFilters(bank).length);
        els.countToss.textContent = matchLabel(applyFilters(bank, { bonus: 'false' }).length);
        els.countBonus.textContent = matchLabel(applyFilters(bank, { bonus: 'true' }).length);
        els.countMC.textContent = matchLabel(applyFilters(bank, { qaType: 'MC' }).length);
        els.countSA.textContent = matchLabel(applyFilters(bank, { qaType: 'SA' }).length);
        els.countSet.textContent = matchLabel(applyFilters(bank).length);
        if (els.countPick)
            els.countPick.textContent = `${applyFilters(bank).length.toLocaleString()} to choose from`;
    }
    function getRunConfig(mode) {
        let resolvedMode = mode;
        if (mode === 'rapid' && settings.mode === 'regular') {
            resolvedMode = 'regular';
        }
        const cfg = {
            mode: resolvedMode,
            level: els.level.value,
            categories: selectedSuperTopics(),
            detailedCategories: selectedDetailedTopics(),
            detailedByTopic: selectedDetailedByTopic(),
            qaType: els.qaType.value,
            bonus: els.bonus.value,
            count: Math.max(1, parseInt(els.count.value || '25', 10)),
            seconds: Math.max(5, Math.min(30, parseInt(els.seconds.value || '10', 10))),
            noTimer: document.getElementById('noTimerCheck').checked,
            setName: els.setName.value.trim(),
            roundName: els.roundName.value.trim(),
            bankFile: els.bankSelect.value,
        };
        // Tile-specific rules
        if (mode === 'tossups')
            cfg.bonus = 'false';
        if (mode === 'bonuses')
            cfg.bonus = 'true';
        if (mode === 'wxyz')
            cfg.qaType = 'MC';
        if (mode === 'sa')
            cfg.qaType = 'SA';
        return cfg;
    }
    // startRun stays on window for anything else that launches a run.
    window.startRun = function startRun(mode) {
        localStorage.setItem('atom_run', JSON.stringify(getRunConfig(mode)));
        window.location.href = '/practice';
    };
    (_a = document.getElementById('modeList')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', (e) => {
        var _a;
        const btn = (_a = e.target) === null || _a === void 0 ? void 0 : _a.closest('button[data-mode]');
        if ((btn === null || btn === void 0 ? void 0 : btn.dataset.mode) === 'pick')
            openPicker();
        else if (btn === null || btn === void 0 ? void 0 : btn.dataset.mode)
            window.startRun(btn.dataset.mode);
    });
    // ---- Pick questions (advanced): choose the exact questions for a run ----
    // The list is whatever the filters above match. Picks are kept in tick order and handed
    // to /practice?picked=1 through sessionStorage, the same way Generate hands over its set.
    const PICKED_KEY = 'atom_picked_set';
    const PICK_PAGE = 60;
    const PICK_MAX = 200;
    const pick = {
        dialog: document.getElementById('pickDialog'),
        search: document.getElementById('pickSearch'),
        onlyPicked: document.getElementById('pickOnlyPicked'),
        list: document.getElementById('pickList'),
        empty: document.getElementById('pickEmpty'),
        more: document.getElementById('pickMore'),
        count: document.getElementById('pickCount'),
        start: document.getElementById('pickStart'),
        summary: document.getElementById('pickSummary'),
    };
    const picked = new Map(); // bank index -> question, in the order ticked
    let pickPool = []; // bank indexes that pass the filters
    let pickShown = PICK_PAGE;
    function escapeText(s) {
        return String(s !== null && s !== void 0 ? s : '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function pickHaystack(q) {
        return [q.question_text, q.parsed_answer, q.category, q.detailed_category || q.detailedCategory, q.set_name, q.round_name]
            .map(v => String(v || '').toLowerCase()).join('\n');
    }
    function pickMatches() {
        var _a, _b;
        const words = (((_a = pick.search) === null || _a === void 0 ? void 0 : _a.value) || '').toLowerCase().split(/\s+/).filter(Boolean);
        const onlyPicked = !!((_b = pick.onlyPicked) === null || _b === void 0 ? void 0 : _b.checked);
        const source = onlyPicked ? Array.from(picked.keys()) : pickPool;
        if (!words.length)
            return source;
        return source.filter(i => {
            const hay = pickHaystack(bank[i]);
            return words.every(w => hay.includes(w));
        });
    }
    function pickRowHtml(i) {
        const q = bank[i];
        const meta = [
            `<b>${q.bonus ? 'Bonus' : 'Toss-up'}</b>`,
            escapeText(sentenceCase(String(q.category || '').toLowerCase().replace(/^./, c => c.toUpperCase()))),
            q.type === 'MC' ? 'Multiple choice' : 'Short answer',
            q.level === 'HS' ? 'High school' : q.level === 'MS' ? 'Middle school' : '',
            escapeText([q.set_name, q.round_name, q.num != null ? `#${q.num}` : ''].filter(Boolean).join(' ')),
        ].filter(Boolean).join(' · ');
        const text = q.question_text ? escapeText(q.question_text) : 'Picture question (shown when you play it)';
        return `<li><label class="pick-row"><input type="checkbox" data-i="${i}"${picked.has(i) ? ' checked' : ''}>` +
            `<span class="pick-meta">${meta}</span><span class="pick-text">${text}</span></label></li>`;
    }
    function renderPickFoot() {
        const n = picked.size;
        if (pick.count)
            pick.count.textContent = n >= PICK_MAX ? `${n} picked (the most one run can hold)` : `${n} picked`;
        if (pick.start) {
            pick.start.disabled = n === 0;
            pick.start.lastChild.textContent = n ? `Start with ${n} ${n === 1 ? 'question' : 'questions'}` : 'Start';
        }
    }
    function renderPickList() {
        var _a;
        if (!pick.list)
            return;
        const matches = pickMatches();
        const shown = matches.slice(0, pickShown);
        pick.list.innerHTML = shown.map(pickRowHtml).join('');
        if (pick.more) {
            pick.more.hidden = matches.length <= shown.length;
            pick.more.textContent = `Show more (${(matches.length - shown.length).toLocaleString()} left)`;
        }
        if (pick.empty) {
            pick.empty.hidden = matches.length > 0;
            pick.empty.textContent = ((_a = pick.onlyPicked) === null || _a === void 0 ? void 0 : _a.checked) && !picked.size
                ? 'Nothing picked yet.'
                : pickPool.length
                    ? 'No questions match that search.'
                    : 'No questions match your filters. Close this and include more topics or levels.';
        }
        renderPickFoot();
    }
    function openPicker() {
        if (!pick.dialog || typeof pick.dialog.showModal !== 'function')
            return;
        const pool = new Set(applyFilters(bank));
        pickPool = [];
        bank.forEach((q, i) => { if (pool.has(q))
            pickPool.push(i); });
        // Drop picks the filters no longer include, so the count always matches what is listed.
        for (const i of Array.from(picked.keys()))
            if (!pool.has(bank[i]))
                picked.delete(i);
        pickShown = PICK_PAGE;
        if (pick.search)
            pick.search.value = '';
        if (pick.onlyPicked)
            pick.onlyPicked.checked = false;
        if (pick.summary) {
            pick.summary.textContent = `${pickPool.length.toLocaleString()} questions match your filters. Tick the ones you want. They play in the order you pick them.`;
        }
        renderPickList();
        pick.dialog.showModal();
    }
    (_b = pick.list) === null || _b === void 0 ? void 0 : _b.addEventListener('change', (e) => {
        const box = e.target;
        if (!box || box.dataset.i == null)
            return;
        const i = Number(box.dataset.i);
        if (box.checked) {
            if (picked.size >= PICK_MAX) {
                box.checked = false;
                renderPickFoot();
                return;
            }
            picked.set(i, bank[i]);
        }
        else {
            picked.delete(i);
        }
        renderPickFoot();
    });
    let pickSearchTimer = 0;
    (_c = pick.search) === null || _c === void 0 ? void 0 : _c.addEventListener('input', () => {
        window.clearTimeout(pickSearchTimer);
        pickSearchTimer = window.setTimeout(() => { pickShown = PICK_PAGE; renderPickList(); }, 150);
    });
    (_d = pick.onlyPicked) === null || _d === void 0 ? void 0 : _d.addEventListener('change', () => { pickShown = PICK_PAGE; renderPickList(); });
    (_e = pick.more) === null || _e === void 0 ? void 0 : _e.addEventListener('click', () => { pickShown += PICK_PAGE; renderPickList(); });
    (_f = document.getElementById('pickAllShown')) === null || _f === void 0 ? void 0 : _f.addEventListener('click', () => {
        for (const i of pickMatches().slice(0, pickShown)) {
            if (picked.size >= PICK_MAX)
                break;
            if (!picked.has(i))
                picked.set(i, bank[i]);
        }
        renderPickList();
    });
    (_g = document.getElementById('pickClear')) === null || _g === void 0 ? void 0 : _g.addEventListener('click', () => { picked.clear(); renderPickList(); });
    (_h = document.getElementById('pickClose')) === null || _h === void 0 ? void 0 : _h.addEventListener('click', () => { var _a; return (_a = pick.dialog) === null || _a === void 0 ? void 0 : _a.close(); });
    (_j = pick.dialog) === null || _j === void 0 ? void 0 : _j.addEventListener('click', (e) => { if (e.target === pick.dialog)
        pick.dialog.close(); });
    (_k = pick.start) === null || _k === void 0 ? void 0 : _k.addEventListener('click', () => {
        if (!picked.size)
            return;
        try {
            sessionStorage.setItem(PICKED_KEY, JSON.stringify(Array.from(picked.values())));
        }
        catch {
            if (pick.count)
                pick.count.textContent = 'Too many questions to hand over. Pick fewer and try again.';
            return;
        }
        // Timing, bank and read-aloud choices still come from the filters above.
        localStorage.setItem('atom_run', JSON.stringify(getRunConfig('rapid')));
        window.location.href = '/practice?picked=1';
    });
    async function loadBank() {
        var _a;
        const selectedBank = ((_a = els.bankSelect) === null || _a === void 0 ? void 0 : _a.value) || 'data/set_B.json';
        const normalizedBank = selectedBank.replace(/^\.\/+/, '');
        try {
            setBankStatus('Loading', '');
            const res = await fetch(`./${normalizedBank}`, { cache: 'no-store' });
            if (!res.ok)
                throw new Error(`${normalizedBank} not found`);
            const data = await res.json();
            bank = Array.isArray(data) ? data : (data.questions || []);
            window.bank = bank;
            picked.clear();
            setBankStatus('Ready', 'good');
            els.bankMeta.className = 'status-note';
            els.bankMeta.textContent = `${bank.length.toLocaleString()} questions loaded from ${normalizedBank}`;
            updateCounts();
        }
        catch (e) {
            setBankStatus('Not found', 'bad');
            els.bankMeta.className = 'status-note bad';
            els.bankMeta.textContent = `Could not load ${normalizedBank}. Check that it exists in docs/data, or pick the other bank.`;
            bank = [];
            window.bank = bank;
            updateCounts();
        }
    }
    function setBankStatus(text, tone) {
        els.bankStatus.textContent = text;
        els.bankStatus.className = tone ? `tag ${tone}` : 'tag';
    }
    // Live counts
    const watch = [els.level, els.qaType, els.bonus, els.count, els.seconds, els.setName, els.roundName];
    for (const el of watch) {
        // Some are inputs, some are selects
        el.addEventListener('change', updateCounts);
        el.addEventListener('input', updateCounts);
    }
    renderTopics();
    if (settings.rememberTopics) {
        const saved = new Set(loadSavedSuperTopics());
        document.querySelectorAll('.topic-super-checkbox').forEach(input => {
            input.checked = saved.has(input.dataset.topic);
        });
    }
    if (settings.div && ['MS', 'HS'].includes(settings.div)) {
        els.level.value = settings.div;
    }
    (_l = els.topicGrid) === null || _l === void 0 ? void 0 : _l.addEventListener('change', () => {
        updateCounts();
        if (settings.rememberTopics) {
            saveSuperTopics(selectedSuperTopics());
        }
    });
    (_m = els.topicGrid) === null || _m === void 0 ? void 0 : _m.addEventListener('click', (e) => {
        const target = e.target;
        const card = target === null || target === void 0 ? void 0 : target.closest('.topic-card');
        if (!card)
            return;
        if ((target === null || target === void 0 ? void 0 : target.closest('label')) || (target === null || target === void 0 ? void 0 : target.closest('input')) || (target === null || target === void 0 ? void 0 : target.closest('.topic-sublist')))
            return;
        const toggle = card.querySelector('.topic-super-checkbox');
        if (!toggle)
            return;
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    (_o = els.clearTopics) === null || _o === void 0 ? void 0 : _o.addEventListener('click', () => {
        document.querySelectorAll('.topic-super-checkbox, .topic-detail-checkbox').forEach(input => {
            input.checked = false;
        });
        if (settings.rememberTopics) {
            saveSuperTopics([]);
        }
        updateCounts();
    });
    if (els.toggleAdvanced && els.topicGrid) {
        const setAdvanced = (isOn) => {
            els.topicGrid.classList.toggle('show-advanced', isOn);
            els.toggleAdvanced.textContent = isOn ? 'Hide subtopics' : 'Show subtopics';
            els.toggleAdvanced.setAttribute('aria-expanded', String(isOn));
        };
        setAdvanced(false);
        els.toggleAdvanced.addEventListener('click', () => {
            const next = !els.topicGrid.classList.contains('show-advanced');
            setAdvanced(next);
        });
    }
    const bankNote = document.getElementById('bankNote');
    const showBankNote = () => { if (bankNote)
        bankNote.hidden = els.bankSelect.value !== 'data/set_A.json'; };
    els.bankSelect.addEventListener('change', () => {
        showBankNote();
        loadBank();
    });
    showBankNote();
    loadBank();
});
//# sourceMappingURL=practice_home.js.map