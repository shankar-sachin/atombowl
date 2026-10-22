(() => {
    var _a, _b, _c;
    // NAV (Practice Engine hides nav entirely)
    const nav = document.getElementById('nav');
    const overlay = document.getElementById('overlay');
    const hamburger = document.getElementById('hamburger');
    if (nav && overlay && hamburger) {
        function toggleNav() {
            const isOpen = nav.classList.toggle('open');
            overlay.classList.toggle('show');
            hamburger.classList.toggle('open');
            hamburger.textContent = isOpen ? '?' : '?';
        }
        hamburger.addEventListener('click', toggleNav);
        overlay.addEventListener('click', toggleNav);
    }
    // Run config (single source of truth)
    const DEFAULT_RUN = {
        mode: 'rapid',
        level: 'ANY',
        category: 'ANY',
        categories: [],
        detailedCategories: [],
        qaType: 'ANY',
        bonus: 'ANY',
        count: 25, // rapid mode: number of PAIRS
        seconds: 20, // TU pre-buzz timer
        setName: '',
        roundName: '',
        bankFile: 'data/set_B.json'
    };
    function safeParseJSON(s, fallback) {
        try {
            return JSON.parse(s);
        }
        catch {
            return fallback;
        }
    }
    // practice_home should store settings here
    const cfg = safeParseJSON(localStorage.getItem('atom_run'), null) || {};
    const runCfg = {
        ...DEFAULT_RUN,
        ...cfg
    };
    const TOPIC_GROUPS = [
        { id: 'PHYSICS', categories: ['PHYSICS', 'PHYSICAL SCIENCE'] },
        { id: 'CHEMISTRY', categories: ['CHEMISTRY'] },
        { id: 'MATH', categories: ['MATH', 'MATHEMATICS'] },
        { id: 'EARTH_SCIENCE', categories: ['EARTH SCIENCE', 'EARTH AND SPACE', 'EARTH AND SPACE SCIENCE'] },
        { id: 'ASTRONOMY', categories: ['ASTRONOMY'] },
        { id: 'BIOLOGY', categories: ['BIOLOGY', 'LIFE SCIENCE'] },
        { id: 'GENERAL_SCIENCE', categories: ['GENERAL SCIENCE'] },
        { id: 'ENERGY', categories: ['ENERGY'] },
    ];
    function expandCategories(selectedTopics) {
        if (!Array.isArray(selectedTopics) || !selectedTopics.length)
            return [];
        const lookup = new Map(TOPIC_GROUPS.map(group => [group.id, group.categories]));
        return selectedTopics.flatMap(topic => lookup.get(topic) || []);
    }
    runCfg.qaType = runCfg.qaType || runCfg.qtype || 'ANY';
    if (!Array.isArray(runCfg.categories)) {
        runCfg.categories = [];
    }
    if (!Array.isArray(runCfg.detailedCategories)) {
        runCfg.detailedCategories = [];
    }
    runCfg.seconds = parseInt((_a = runCfg.seconds) !== null && _a !== void 0 ? _a : runCfg.time, 10);
    if (!Number.isFinite(runCfg.seconds))
        runCfg.seconds = DEFAULT_RUN.seconds;
    runCfg.count = parseInt(runCfg.count, 10);
    if (!Number.isFinite(runCfg.count))
        runCfg.count = DEFAULT_RUN.count;
    if (runCfg.count < 1)
        runCfg.count = 1;
    runCfg.mode = runCfg.mode || DEFAULT_RUN.mode;
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
        autoCheck: false,
        autoThreshold: 0.72,
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
    if (runCfg.level === DEFAULT_RUN.level && ['MS', 'HS'].includes(settings.div)) {
        runCfg.level = settings.div;
    }
    if (runCfg.mode === DEFAULT_RUN.mode && settings.mode) {
        runCfg.mode = settings.mode;
    }
    document.getElementById('mode').textContent = runCfg.mode;
    // Early appearances for State constants
    let ttsEnabled = settings.tts;
    let autoCheckEnabled = !!settings.autoCheck;
    let autoCheckThreshold = Number((_b = settings.autoThreshold) !== null && _b !== void 0 ? _b : 0.72);
    async function gradeAnswer(userAnswer, correctAnswer, questionType) {
        if (!autoCheckEnabled)
            return null;
        const payload = {
            userAnswer,
            correctAnswer,
            questionType,
            threshold: autoCheckThreshold
        };
        if (window.autoChecker) {
            return window.autoChecker.grade(payload);
        }
        return null;
    }
    let currentUtterance = null;
    let readingSpeed = Number((_c = settings.ttsRate) !== null && _c !== void 0 ? _c : 1.0);
    if (!Number.isFinite(readingSpeed) || readingSpeed <= 0) {
        readingSpeed = 1.0;
    }
    // DOM
    const img = document.getElementById('questionImg');
    const questionTextEl = document.getElementById('questionText');
    const input = document.getElementById('answer');
    const feedback = document.getElementById('feedback');
    const timerEl = document.getElementById('timer');
    const scoreEl = document.getElementById('score');
    const progressEl = document.getElementById('progress');
    const buzzEl = document.getElementById('buzz');
    const choicesEl = document.getElementById('choices');
    const submitBtn = document.getElementById('submitBtn');
    const rightBtn = document.getElementById('rightBtn');
    const wrongBtn = document.getElementById('wrongBtn');
    const nextBtn = document.getElementById('nextBtn');
    const errEl = document.getElementById('err');
    const metaLeft = document.getElementById('metaLeft');
    const metaRight = document.getElementById('metaRight');
    const finalSummaryEl = document.getElementById('finalSummary');
    const finalScoreEl = document.getElementById('finalScore');
    const atomScoreValueEl = document.getElementById('atomScoreValue');
    const interruptBadgeEl = document.getElementById('interruptBadge');
    const learnRow = document.getElementById('learnRow');
    const searchBtn = document.getElementById('searchBtn');
    const learnBtn = document.getElementById('learnBtn');
    const ttsToggle = document.getElementById('ttsToggle');
    const BANK_DISPLAY_NAMES = {
        A: "Dyrapack",
        B: "Scalazar"
    };
    const speedSlider = document.getElementById('speedSlider');
    function persistSettingsPatch(patch) {
        const next = { ...settings, ...patch };
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        }
        catch { }
        window.atomSettings = next;
        Object.assign(settings, next);
    }
    if (ttsToggle) {
        ttsToggle.textContent = ttsEnabled ? "TTS ON" : "TTS OFF";
        ttsToggle.onclick = () => {
            ttsEnabled = !ttsEnabled;
            if (!ttsEnabled)
                stopSpeech();
            ttsToggle.textContent = ttsEnabled ? "TTS ON" : "TTS OFF";
            persistSettingsPatch({ tts: ttsEnabled });
        };
    }
    // State
    let bank = [];
    let questions = [];
    let index = 0;
    let time = 20;
    let timerId = null;
    let buzzed = false;
    let locked = false;
    let awaitingGrade = false;
    let score = 0;
    let runActive = false;
    // ---- Stats tracking ----
    let stats = {
        answered: 0, // total buzzed questions
        correct: 0, // graded correct
        totalTime: 0, // seconds spent after buzz
        slowCorrect: 0 // correct answers taking >=10s
    };
    let buzzStartTime = null;
    let questionStartTime = null;
    let stopwatchStart = null;
    let stopwatchInterval = null;
    let stopwatchRunning = false;
    let interrupted = false;
    let baseTypeDelay = 40;
    function getTypewriterDelay() {
        return baseTypeDelay / readingSpeed;
    }
    function animateIn(el) {
        if (!el)
            return;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 260);
    }
    function startStopwatch() {
        stopStopwatch();
        stopwatchStart = Date.now();
        stopwatchRunning = true;
        stopwatchInterval = setInterval(() => {
            const elapsed = (Date.now() - stopwatchStart) / 1000;
            const el = document.getElementById('stopwatch');
            el.textContent = `${elapsed.toFixed(2)} s`;
            updateStopwatchColor(elapsed);
        }, 30);
    }
    function restartReadingAtCurrentSpeed() {
        const q = currentQ();
        if (!(q === null || q === void 0 ? void 0 : q.question_text))
            return;
        if (textFullyRevealed)
            return;
        const startIndex = ((questionTextEl === null || questionTextEl === void 0 ? void 0 : questionTextEl.textContent) || '').length;
        startSyncedRead(q.question_text, startIndex);
    }
    if (speedSlider) {
        speedSlider.value = String(readingSpeed);
        const speedLabel = document.getElementById('speedLabel');
        if (speedLabel)
            speedLabel.textContent = `${readingSpeed.toFixed(2)}x`;
        speedSlider.oninput = (e) => {
            const target = e.target;
            if (!target)
                return;
            readingSpeed = Number(target.value);
            if (speedLabel)
                speedLabel.textContent = `${readingSpeed.toFixed(2)}x`;
            persistSettingsPatch({ ttsRate: readingSpeed });
            // Apply changes immediately to any ongoing typing/speaking.
            if (runActive)
                restartReadingAtCurrentSpeed();
        };
    }
    function createUtterance(text) {
        var _a, _b;
        if (!window.speechSynthesis)
            return null;
        const utterance = new SpeechSynthesisUtterance(text);
        const rate = Math.max(0.6, Math.min(2.0, readingSpeed));
        utterance.rate = rate;
        utterance.pitch = Number((_a = settings.ttsPitch) !== null && _a !== void 0 ? _a : 1.0);
        utterance.volume = Number((_b = settings.ttsVolume) !== null && _b !== void 0 ? _b : 1.0);
        // Pick a clean English voice if available
        const voices = speechSynthesis.getVoices();
        const configured = settings.ttsVoice
            ? voices.find(v => (v.voiceURI || v.name) === settings.ttsVoice)
            : null;
        if (configured) {
            utterance.voice = configured;
        }
        else {
            const preferred = voices.find(v => /en-US/i.test(v.lang) && /Google|Microsoft|Samantha/i.test(v.name));
            if (preferred)
                utterance.voice = preferred;
        }
        currentUtterance = utterance;
        return utterance;
    }
    function speakText(text) {
        if (!ttsEnabled || !window.speechSynthesis)
            return;
        stopSpeech();
        const utterance = createUtterance(text);
        if (!utterance)
            return;
        speechSynthesis.speak(utterance);
    }
    function stopSpeech() {
        if (window.speechSynthesis) {
            speechSynthesis.cancel();
            currentUtterance = null;
        }
    }
    function toggleTts() {
        ttsEnabled = !ttsEnabled;
        if (!ttsEnabled)
            stopSpeech();
        if (ttsToggle)
            ttsToggle.textContent = ttsEnabled ? "TTS ON" : "TTS OFF";
        persistSettingsPatch({ tts: ttsEnabled });
    }
    if (ttsToggle) {
        ttsToggle.onclick = () => toggleTts();
    }
    function stopReadingNow() {
        stopSpeech();
        clearInterval(typewriterTimer);
        const q = currentQ();
        if ((q === null || q === void 0 ? void 0 : q.question_text) && questionTextEl) {
            questionTextEl.textContent = String(q.question_text);
            textFullyRevealed = true;
        }
    }
    function stopReadingFreeze() {
        stopSpeech();
        clearInterval(typewriterTimer);
    }
    function handleBuzzTrigger() {
        if (!runActive || buzzed || locked || awaitingGrade)
            return;
        const q = currentQ();
        // Freeze reading immediately on buzz
        stopReadingFreeze();
        if (q && !textFullyRevealed) {
            interrupted = true;
            if (interruptBadgeEl) {
                interruptBadgeEl.classList.remove('hidden');
            }
        }
        allowAnswerUI();
    }
    function warmUpSpeechSynthesis() {
        if (!window.speechSynthesis)
            return;
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0; // silent
        u.rate = 1.0;
        u.pitch = 1.0;
        window.speechSynthesis.speak(u);
        window.speechSynthesis.cancel();
    }
    function stopStopwatch() {
        if (stopwatchInterval)
            clearInterval(stopwatchInterval);
        stopwatchInterval = null;
        stopwatchRunning = false;
    }
    function resetStopwatch() {
        stopStopwatch();
        const el = document.getElementById('stopwatch');
        el.textContent = '0.00 s';
        el.style.color = 'var(--text)';
        el.classList.remove('stopwatch-pulse');
    }
    function updateStopwatchColor(seconds) {
        const el = document.getElementById('stopwatch');
        if (!el)
            return;
        el.classList.remove('stopwatch-pulse');
        if (seconds < 5) {
            el.style.color = 'var(--good)';
        }
        else if (seconds < 10) {
            el.style.color = 'var(--warn)';
        }
        else {
            el.style.color = 'var(--bad)';
            if (seconds >= 20) {
                el.classList.add('stopwatch-pulse');
            }
        }
    }
    function showError(msg) {
        if (!errEl)
            return;
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        animateIn(errEl);
    }
    function hideError() {
        if (!errEl)
            return;
        errEl.classList.add('hidden');
        errEl.textContent = '';
    }
    function norm(s) { return String(s || '').trim(); }
    function currentQ() {
        if (!Array.isArray(questions) || questions.length === 0)
            return null;
        if (index < 0 || index >= questions.length)
            return null;
        return questions[index];
    }
    // -------- Bank loading helpers --------
    function normalizeBankFile(raw) {
        // Accept: "set_A.json", "./set_A.json", "/set_A.json", "banks/set_A.json"
        // Return: a cleaned relative path we can try as-is.
        let s = String(raw || '').trim();
        if (!s)
            return '';
        // If it's an absolute URL, keep it.
        if (/^https?:\/\//i.test(s))
            return s;
        // Strip leading file-ish markers.
        s = s.replace(/^\.\/+/, '').replace(/^\/+/, '');
        return s;
    }
    function bankCandidates(bankFile) {
        const cleaned = normalizeBankFile(bankFile);
        if (!cleaned)
            return [];
        if (/^https?:\/\//i.test(cleaned))
            return [cleaned];
        // Try a small set of sane candidates.
        const out = [
            `./${cleaned}`,
            cleaned,
        ];
        // If Home accidentally stored "./set_A.json" we'll avoid "././set_A.json" by normalization above.
        // Add a banks/ folder option (common project layout) if user later moves banks.
        if (!cleaned.startsWith('banks/'))
            out.push(`./banks/${cleaned}`);
        // Deduplicate
        return [...new Set(out)];
    }
    function isLikelyFileProtocol() {
        try {
            return window.location.protocol === 'file:';
        }
        catch {
            return false;
        }
    }
    // -------- Image path resolver --------
    function resolveImgCandidates(q, field) {
        const raw = String((q && q[field]) || '').trim();
        if (!raw)
            return [];
        if (/^https?:\/\//i.test(raw))
            return [raw];
        const p = raw.replace(/^\.\/+/, '').replace(/^\/+/, '');
        if (p.startsWith('images/'))
            return [p];
        const cands = [];
        if (p.startsWith('ms/') || p.startsWith('hs/'))
            cands.push('images/' + p);
        const lvl = String((q === null || q === void 0 ? void 0 : q.level) || '').toLowerCase();
        if (lvl === 'ms' || lvl === 'hs')
            cands.push(`images/${lvl}/${p}`);
        cands.push('images/' + p);
        cands.push(p);
        return [...new Set(cands)];
    }
    function setImgWithFallback(imgEl, q, field) {
        const cands = resolveImgCandidates(q, field);
        let i = 0;
        imgEl.onerror = null;
        if (!cands.length) {
            imgEl.style.display = 'none';
            imgEl.src = '';
            return;
        }
        imgEl.style.display = 'block';
        imgEl.src = cands[i];
        imgEl.onerror = () => {
            i += 1;
            if (i >= cands.length) {
                imgEl.onerror = null;
                imgEl.style.display = 'none';
                imgEl.src = '';
                return;
            }
            imgEl.src = cands[i];
        };
    }
    // -------- Text / image renderer --------
    let typewriterTimer = null;
    let textFullyRevealed = true;
    function renderQuestion(q) {
        img.style.display = 'none';
        img.src = '';
        questionTextEl.classList.add('hidden');
        questionTextEl.textContent = '';
        clearInterval(typewriterTimer);
        textFullyRevealed = true;
        // TEXT MODE
        if (q.question_text && !q.question_image) {
            questionTextEl.classList.remove('hidden');
            animateIn(questionTextEl);
            startSyncedRead(q.question_text);
            return;
        }
        // IMAGE MODE
        setImgWithFallback(img, q, 'question_image');
        img.alt = `Question ${index + 1}`;
    }
    const LETTER_DELAY_FACTOR = 1;
    const LETTER_SYNC_LEAD = 0;
    function startTypewriter(text, startIndex = 0) {
        const full = String(text || '');
        const safeStart = Math.max(0, Math.min(full.length, startIndex));
        let i = safeStart;
        textFullyRevealed = false;
        questionTextEl.textContent = full.slice(0, safeStart);
        // Letter-by-letter typing at a constant per-letter delay.
        const delay = Math.max(12, getTypewriterDelay() / LETTER_DELAY_FACTOR);
        typewriterTimer = setInterval(() => {
            if (i < full.length) {
                questionTextEl.textContent += full[i];
                i += 1;
            }
            if (i >= full.length) {
                clearInterval(typewriterTimer);
                textFullyRevealed = true;
            }
        }, delay);
    }
    function startSyncedRead(text, startIndex = 0) {
        const full = String(text || '');
        if (!full)
            return;
        const safeStart = Math.max(0, Math.min(full.length, startIndex));
        const remaining = full.slice(safeStart);
        clearInterval(typewriterTimer);
        textFullyRevealed = false;
        questionTextEl.textContent = full.slice(0, safeStart);
        startTypewriter(full, safeStart);
        if (ttsEnabled && window.speechSynthesis) {
            stopSpeech();
            const utterance = createUtterance(remaining);
            if (utterance) {
                utterance.onend = () => {
                    currentUtterance = null;
                };
                utterance.onerror = () => {
                    currentUtterance = null;
                };
                speechSynthesis.speak(utterance);
                return;
            }
        }
        speakText(remaining || full);
    }
    function applyFilters(list) {
        const level = runCfg.level;
        const category = runCfg.category;
        const categories = expandCategories(runCfg.categories);
        const detailedCategories = runCfg.detailedCategories || [];
        const qaType = runCfg.qaType;
        const bonus = runCfg.bonus;
        const setName = norm(runCfg.setName);
        const roundName = norm(runCfg.roundName);
        return list.filter(q => {
            if (level !== 'ANY' && q.level !== level)
                return false;
            if (categories.length && !categories.includes(norm(q.category)))
                return false;
            if (!categories.length && category !== 'ANY' && norm(q.category) !== category)
                return false;
            if (detailedCategories.length) {
                const detailed = norm(q.detailed_category || q.detailedCategory);
                if (!detailedCategories.includes(detailed))
                    return false;
            }
            if (qaType !== 'ANY' && q.type !== qaType)
                return false;
            // bonus can be ANY / true / false / TU / BONUS
            if (bonus !== 'ANY') {
                const b = String(bonus).toUpperCase().trim();
                const wantBonus = (b === 'TRUE' || b === 'BONUS' || b === 'B');
                const wantTU = (b === 'FALSE' || b === 'TU' || b === 'TOSSUP' || b === 'TOSS-UP' || b === 'T');
                if (wantBonus && !q.bonus)
                    return false;
                if (wantTU && q.bonus)
                    return false;
                if (!wantBonus && !wantTU && String(!!q.bonus) !== String(bonus))
                    return false;
            }
            if (setName && q.set_name !== setName)
                return false;
            if (roundName && q.round_name !== roundName)
                return false;
            return true;
        });
    }
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    // Pair builder: TU -> BO, same SUBJECT (category) required; same set preferred; same round preferred.
    function buildRunQuestions() {
        const filtered = applyFilters(bank);
        if (!filtered.length) {
            showError('No matches for your run. Go back and loosen filters.');
            return [];
        }
        hideError();
        const mode = String(runCfg.mode || 'rapid').toLowerCase();
        // In tossups/bonuses modes, count means raw questions (not pairs)
        if (mode === 'tossups') {
            const tus = filtered.filter(q => !q.bonus);
            shuffle(tus);
            const n = Math.max(1, parseInt(runCfg.count, 10) || DEFAULT_RUN.count);
            return tus.slice(0, Math.min(n, tus.length));
        }
        if (mode === 'bonuses') {
            const bos = filtered.filter(q => q.bonus);
            shuffle(bos);
            const n = Math.max(1, parseInt(runCfg.count, 10) || DEFAULT_RUN.count);
            return bos.slice(0, Math.min(n, bos.length));
        }
        // Rapid/default: count means number of PAIRS
        const wantPairs = Math.max(1, parseInt(runCfg.count, 10) || DEFAULT_RUN.count);
        // Group by category first (subject is the hard requirement)
        const byCat = new Map();
        for (const q of filtered) {
            const cat = norm(q.category);
            if (!byCat.has(cat))
                byCat.set(cat, []);
            byCat.get(cat).push(q);
        }
        const allPairs = [];
        for (const items of byCat.values()) {
            // Prefer pairing within same set
            const bySet = new Map();
            for (const q of items) {
                const key = String(q.set_name || '');
                if (!bySet.has(key))
                    bySet.set(key, []);
                bySet.get(key).push(q);
            }
            for (const setItems of bySet.values()) {
                const tus = setItems.filter(x => !x.bonus);
                const bos = setItems.filter(x => x.bonus);
                shuffle(tus);
                shuffle(bos);
                const usedBo = new Set();
                for (const t of tus) {
                    // Prefer same round first
                    let b = bos.find(x => !usedBo.has(x) && String(x.round_name) === String(t.round_name));
                    if (!b)
                        b = bos.find(x => !usedBo.has(x));
                    if (!b)
                        break;
                    usedBo.add(b);
                    allPairs.push([t, b]);
                }
            }
        }
        shuffle(allPairs);
        const pickedPairs = allPairs.slice(0, Math.min(wantPairs, allPairs.length));
        // Flatten into TU -> BO order
        const out = [];
        for (const [t, b] of pickedPairs)
            out.push(t, b);
        return out;
    }
    function updateProgressUI() {
        const q = currentQ();
        if (!q || !Array.isArray(questions) || !questions.length) {
            progressEl.textContent = '—';
            return;
        }
        const mode = String(runCfg.mode || 'rapid').toLowerCase();
        if (mode === 'tossups' || mode === 'bonuses') {
            // raw question progress
            progressEl.textContent = `${index + 1} / ${questions.length}`;
            return;
        }
        // pair progress
        const pairIndex = Math.floor(index / 2) + 1;
        const totalPairs = Math.max(1, Math.ceil(questions.length / 2));
        const label = q.bonus ? 'BO' : 'TU';
        progressEl.textContent = `${label} ${pairIndex} / ${totalPairs}`;
    }
    function resetForQuestion() {
        buzzed = false;
        locked = false;
        awaitingGrade = false;
        interrupted = false;
        if (finalSummaryEl)
            finalSummaryEl.classList.add('hidden');
        feedback.textContent = '';
        feedback.className = 'feedback';
        input.classList.add('hidden');
        submitBtn.classList.add('hidden');
        choicesEl.classList.add('hidden');
        rightBtn.classList.add('hidden');
        wrongBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
        learnRow.classList.add('hidden');
        buzzEl.innerHTML = 'Press <span class="kbd">SPACE</span> to buzz';
        const q = currentQ();
        const isBonus = (q === null || q === void 0 ? void 0 : q.bonus) === true;
        // Pre-buzz timing rules
        // TU: custom (runCfg.seconds)
        // BO: always 20s
        const preBuzzTime = isBonus
            ? 20
            : Math.max(5, parseInt(runCfg.seconds, 10) || 20);
        ;
        if (interruptBadgeEl) {
            interruptBadgeEl.classList.add('hidden');
        }
        clearInterval(timerId);
        if (runCfg.noTimer) {
            timerEl.textContent = '∞';
            time = Infinity;
        }
        else {
            time = preBuzzTime;
            timerEl.textContent = String(time);
            timerId = setInterval(() => {
                // Pause pre-buzz countdown while the question is still typing,
                // so it doesn't auto-timeout mid-question.
                if (!buzzed && !textFullyRevealed) {
                    return;
                }
                time -= 1;
                timerEl.textContent = String(time);
                if (time <= 0) {
                    clearInterval(timerId);
                    handleTimeout();
                }
            }, 1000);
        }
    }
    function loadQuestion() {
        const q = currentQ();
        if (!q) {
            endRun('No question available.');
            return;
        }
        questionStartTime = Date.now();
        buzzStartTime = null;
        resetStopwatch();
        startStopwatch();
        updateProgressUI();
        renderQuestion(q);
        input.value = '';
        function findBankName(q) {
            if (!q || !q.set_name)
                return '—';
            if (q.set_name === 'SciBowlDB')
                return 'Scalazar';
            return 'Dynazar';
        }
        const bankNameRegistry = findBankName(q);
        const mode = String(runCfg.mode || 'rapid').toLowerCase();
        const isRapid = !['tossups', 'bonuses'].includes(mode);
        if (isRapid) {
            metaLeft.textContent = `${q.level} • ${q.category} • ${q.bonus ? 'Bonus' : 'Toss-up'} • ${q.type}`;
            metaRight.textContent = `${bankNameRegistry} / ${q.round_name} • #${q.num}`;
        }
        else {
            metaLeft.textContent = `${q.level} • ${q.category} • ${q.type}`;
            metaRight.textContent = `${bankNameRegistry} / ${q.round_name} • #${q.num}`;
        }
        resetForQuestion();
    }
    function allowAnswerUI() {
        const q = currentQ();
        if (!runActive || !q)
            return;
        buzzStartTime = Date.now();
        buzzed = true;
        buzzEl.textContent = 'Buzzed';
        animateIn(buzzEl);
        // After-buzz timing: always 5 seconds (TU & BO)
        clearInterval(timerId);
        time = 5;
        timerEl.textContent = String(time);
        timerId = setInterval(() => {
            time -= 1;
            timerEl.textContent = String(time);
            if (time <= 0) {
                clearInterval(timerId);
                handleTimeout();
            }
        }, 1000);
        const shouldShowInput = interrupted || q.type === 'SA';
        if (shouldShowInput) {
            input.classList.remove('hidden');
            submitBtn.classList.remove('hidden');
            animateIn(input);
            animateIn(submitBtn);
            input.focus();
            return;
        }
        if (q.type === 'MC') {
            choicesEl.classList.remove('hidden');
            animateIn(choicesEl);
        }
    }
    function escapeHtml(s) {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
    function updateStatsUI() {
        const acc = stats.answered
            ? Math.round((stats.correct / stats.answered) * 100)
            : 0;
        const avg = stats.answered
            ? (stats.totalTime / stats.answered).toFixed(1)
            : '—';
        document.getElementById('statAccuracy').textContent = `${acc}%`;
        document.getElementById('statSpeed').textContent = `${avg}s`;
        document.getElementById('statCorrect').textContent = String(stats.correct);
        document.getElementById('statSlow').textContent = String(stats.slowCorrect);
    }
    function computeAtomScoreFallback() {
        const answered = Math.max(0, Math.floor(Number(stats.answered) || 0));
        const correct = Math.max(0, Math.floor(Number(stats.correct) || 0));
        const slowCorrect = Math.max(0, Math.floor(Number(stats.slowCorrect) || 0));
        const totalTime = Math.max(0, Number(stats.totalTime) || 0);
        if (!answered)
            return 0;
        const accuracy = correct / answered;
        const avgTime = totalTime / answered;
        const slowRate = correct > 0 ? (slowCorrect / correct) : 0;
        const accuracyPart = Math.pow(Math.max(0, Math.min(1, accuracy)), 1.5) * 70;
        const speedPart = Math.max(0, Math.min(1, (12 - avgTime) / 12)) * 20;
        const consistencyPart = Math.max(0, 10 * (1 - Math.max(0, Math.min(1, slowRate))));
        return Math.max(0, Math.min(100, accuracyPart + speedPart + consistencyPart));
    }
    function computeAtomScore() {
        const engine = window.atomScoreEngine;
        if (!engine || typeof engine.compute !== 'function') {
            console.log('[AtomScore] Engine not loaded, using fallback formula.');
            return computeAtomScoreFallback();
        }
        try {
            return engine.compute(stats);
        }
        catch (err) {
            console.log('[AtomScore] Engine compute failed, using fallback formula.', err);
            return computeAtomScoreFallback();
        }
    }
    function revealManualGrade(userAnswer, correctAnswer, opts = {}) {
        locked = true;
        awaitingGrade = true;
        clearInterval(timerId);
        const showButtons = opts.showButtons !== false;
        const autoInfo = opts.autoInfo;
        const ua = norm(userAnswer) || '(no answer)';
        const ca = norm(correctAnswer) || '(no official answer)';
        const lines = [
            `Your answer: <span style="color:var(--text)">${escapeHtml(ua)}</span>`,
            `Official: <span style="color:var(--muted)">${escapeHtml(ca)}</span>`
        ];
        if (autoInfo && typeof autoInfo.confidence === 'number') {
            const conf = Math.round(autoInfo.confidence * 100);
            lines.push(`Confidence: <span style="color:var(--text)">${conf}%</span>`);
            if (autoInfo.matched) {
                lines.push(`Matched: <span style="color:var(--muted)">${escapeHtml(autoInfo.matched)}</span>`);
            }
        }
        feedback.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
        feedback.className = 'feedback';
        animateIn(feedback);
        if (showButtons) {
            rightBtn.classList.remove('hidden');
            wrongBtn.classList.remove('hidden');
            animateIn(rightBtn);
            animateIn(wrongBtn);
        }
        else {
            rightBtn.classList.add('hidden');
            wrongBtn.classList.add('hidden');
        }
        nextBtn.classList.add('hidden');
        learnRow.classList.add('hidden');
    }
    function applyGrade(isRight) {
        // ---- Stats update ----
        stats.answered++;
        const gradeTime = Date.now();
        const totalSolveTime = questionStartTime
            ? (gradeTime - questionStartTime) / 1000
            : 0;
        stats.totalTime += totalSolveTime;
        if (isRight) {
            stats.correct++;
            if (totalSolveTime >= 10)
                stats.slowCorrect++;
        }
        if (!awaitingGrade)
            return;
        awaitingGrade = false;
        const q = currentQ();
        const points = q && q.bonus ? 10 : 4;
        if (isRight) {
            score += points;
            scoreEl.textContent = String(score);
            feedback.className = 'feedback good';
            feedback.insertAdjacentHTML('beforeend', `<div>Score change: +${points}</div>`);
        }
        else {
            if (q && !q.bonus && interrupted) {
                score -= 4;
                scoreEl.textContent = String(score);
                feedback.insertAdjacentHTML('beforeend', `<div>Interrupt penalty: -4</div>`);
            }
            feedback.className = 'feedback bad';
        }
        animateIn(feedback);
        rightBtn.classList.add('hidden');
        wrongBtn.classList.add('hidden');
        // Only show Search/Learn AFTER the user grades
        learnRow.classList.remove('hidden');
        animateIn(learnRow);
        resetStopwatch();
        nextBtn.classList.remove('hidden');
        animateIn(nextBtn);
        updateStatsUI();
    }
    async function submitSA() {
        if (!runActive || !buzzed || locked)
            return;
        stopStopwatch();
        const q = currentQ();
        if (!q)
            return;
        if (interruptBadgeEl) {
            interruptBadgeEl.classList.add('hidden');
        }
        revealFullQuestionNow();
        const result = await gradeAnswer(input.value, q.parsed_answer, q.type);
        if (result) {
            revealManualGrade(input.value, q.parsed_answer, {
                showButtons: false,
                autoInfo: { confidence: result.confidence, matched: result.matched }
            });
            applyGrade(!!result.isCorrect);
        }
        else {
            revealManualGrade(input.value, q.parsed_answer);
        }
    }
    async function pickMC(letter) {
        if (!runActive || !buzzed || locked)
            return;
        stopStopwatch();
        const q = currentQ();
        if (!q)
            return;
        if (interruptBadgeEl) {
            interruptBadgeEl.classList.add('hidden');
        }
        revealFullQuestionNow();
        const result = await gradeAnswer(letter, q.parsed_answer, q.type);
        if (result) {
            revealManualGrade(letter, q.parsed_answer, {
                showButtons: false,
                autoInfo: { confidence: result.confidence, matched: result.matched }
            });
            applyGrade(!!result.isCorrect);
        }
        else {
            revealManualGrade(letter, q.parsed_answer);
        }
    }
    async function handleTimeout() {
        if (!runActive || locked)
            return;
        stopStopwatch();
        const q = currentQ();
        if (!q)
            return;
        if (interruptBadgeEl) {
            interruptBadgeEl.classList.add('hidden');
        }
        revealFullQuestionNow();
        const result = await gradeAnswer('', q.parsed_answer, q.type);
        if (result) {
            revealManualGrade('', q.parsed_answer, {
                showButtons: false,
                autoInfo: { confidence: result.confidence, matched: result.matched }
            });
            applyGrade(!!result.isCorrect);
        }
        else {
            revealManualGrade('', q.parsed_answer);
        }
    }
    async function syncRunStats() {
        var _a;
        if (!stats)
            return;
        if (!window.atomAccount) {
            try {
                await import('./account_store.js');
            }
            catch {
                return;
            }
        }
        const account = window.atomAccount;
        if (!((_a = account === null || account === void 0 ? void 0 : account.getUser) === null || _a === void 0 ? void 0 : _a.call(account)))
            return;
        const patch = {
            totalRuns: 1,
            totalAnswered: stats.answered,
            totalCorrect: stats.correct,
            totalTime: stats.totalTime,
            totalSlowCorrect: stats.slowCorrect
        };
        try {
            await account.updatePracticeStats(patch);
        }
        catch { }
    }
    function endRun(reason) {
        runActive = false;
        clearInterval(timerId);
        buzzEl.textContent = reason || 'Run complete';
        img.style.display = 'none';
        img.src = '';
        img.alt = '';
        questionTextEl.classList.add('hidden');
        questionTextEl.textContent = '';
        clearInterval(typewriterTimer);
        input.classList.add('hidden');
        submitBtn.classList.add('hidden');
        choicesEl.classList.add('hidden');
        rightBtn.classList.add('hidden');
        wrongBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
        learnRow.classList.add('hidden');
        const mode = String(runCfg.mode || 'rapid').toLowerCase();
        let maxScore = 0;
        if (mode === 'tossups' || mode === 'bonuses') {
            maxScore = questions.length * 4;
        }
        else {
            const totalPairs = questions.length ? Math.ceil(questions.length / 2) : 0;
            maxScore = totalPairs * 14;
        }
        if (finalScoreEl) {
            finalScoreEl.textContent = maxScore ? `Final score: ${score}/${maxScore}` : `Final score: ${score}`;
        }
        // Show final summary (DOM-based)
        let atomScore = Number.NaN;
        try {
            atomScore = computeAtomScore();
        }
        catch { }
        if (atomScoreValueEl) {
            atomScoreValueEl.textContent = Number.isFinite(atomScore) ? atomScore.toFixed(3) : '—';
        }
        if (finalSummaryEl) {
            finalSummaryEl.classList.remove('hidden');
            animateIn(finalSummaryEl);
        }
        syncRunStats();
        // Clear/hide feedback so it doesn't become the end-screen container
        feedback.textContent = '';
        feedback.className = 'feedback';
        progressEl.textContent = '—';
        buzzed = false;
        locked = true;
        awaitingGrade = false;
    }
    function revealFullQuestionNow() {
        const q = currentQ();
        if (!q)
            return;
        clearInterval(typewriterTimer);
        questionTextEl.textContent = String(q.question_text || '');
    }
    function nextQuestion() {
        resetStopwatch();
        if (!runActive)
            return;
        if (!locked)
            return;
        if (awaitingGrade)
            return;
        index += 1;
        if (index >= questions.length) {
            endRun('Run complete');
            return;
        }
        loadQuestion();
    }
    // Events
    window.addEventListener('keydown', (e) => {
        var _a;
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            stopReadingNow();
            return;
        }
        if (e.altKey && e.key.toLowerCase() === 't') {
            e.preventDefault();
            toggleTts();
            return;
        }
        if (e.altKey && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            handleBuzzTrigger();
            return;
        }
        if (e.altKey && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            nextQuestion();
            return;
        }
        if (e.altKey && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            if (input && !input.classList.contains('hidden'))
                input.focus();
            return;
        }
        if (e.altKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            const help = document.getElementById('hotkeyHelp');
            if (help)
                help.classList.toggle('open');
            return;
        }
        if (e.altKey && e.key.toLowerCase() === 'r') {
            e.preventDefault();
            applyGrade(true);
            return;
        }
        if (e.altKey && e.key.toLowerCase() === 'w') {
            e.preventDefault();
            applyGrade(false);
            return;
        }
        const target = e.target;
        const tag = (_a = target === null || target === void 0 ? void 0 : target.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        const isTyping = tag === 'input' || tag === 'textarea' || (target === null || target === void 0 ? void 0 : target.isContentEditable);
        // Prevent space from scrolling ONLY when not typing (keeps spaces working in answer box)
        if (e.code === 'Space' && !isTyping)
            e.preventDefault();
        if (e.key === 'Escape') {
            window.location.href = 'practice_home.html';
            return;
        }
        const q = currentQ();
        if (!runActive || !q)
            return;
        if (awaitingGrade) {
            const k2 = e.key.toUpperCase();
            if (k2 === 'R')
                applyGrade(true);
            if (k2 === 'W')
                applyGrade(false);
            return;
        }
        if (e.code === 'Space' && !buzzed && !locked && !isTyping) {
            handleBuzzTrigger();
            return;
        }
        if (e.code === 'Enter' && buzzed && !locked && (q.type === 'SA' || interrupted))
            submitSA();
        if (buzzed && !locked && q.type === 'MC' && !interrupted) {
            const k = e.key.toUpperCase();
            if (['W', 'X', 'Y', 'Z'].includes(k))
                pickMC(k);
        }
        if (e.key.toUpperCase() === 'N' && locked)
            nextQuestion();
    }, { passive: false });
    // Tap / click anywhere to buzz (mobile-friendly)
    const questionCard = document.querySelector('.question-card');
    function shouldIgnoreTap(target) {
        const el = target;
        return !!(el === null || el === void 0 ? void 0 : el.closest('input, textarea, button, a, select, label'));
    }
    function tapToBuzz(e) {
        if (shouldIgnoreTap(e.target))
            return;
        handleBuzzTrigger();
    }
    if (questionCard) {
        questionCard.addEventListener('pointerdown', tapToBuzz);
    }
    window.addEventListener("load", () => {
        warmUpSpeechSynthesis();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden)
            stopSpeech();
    });
    window.addEventListener('pagehide', stopSpeech);
    window.addEventListener('beforeunload', stopSpeech);
    submitBtn.addEventListener('click', submitSA);
    rightBtn.addEventListener('click', () => applyGrade(true));
    wrongBtn.addEventListener('click', () => applyGrade(false));
    nextBtn.addEventListener('click', nextQuestion);
    choicesEl.addEventListener('click', (e) => {
        const target = e.target;
        const btn = target === null || target === void 0 ? void 0 : target.closest('button[data-letter]');
        if (!btn)
            return;
        const letter = btn.dataset.letter;
        if (!letter)
            return;
        pickMC(letter);
    });
    searchBtn.addEventListener('click', () => {
        const q = currentQ();
        if (!q || !q.parsed_answer)
            return;
        const query = encodeURIComponent(q.parsed_answer);
        window.location.assign(`https://www.bing.com/search?q=${query}`);
    });
    learnBtn.addEventListener('click', () => {
        const q = currentQ();
        if (!q)
            return;
        localStorage.setItem('atom_tutor_context', JSON.stringify({
            answer: q.parsed_answer,
            category: q.category,
            level: q.level
        }));
        window.location.href = 'tutor.html';
    });
    async function loadBank() {
        const requested = runCfg.bankFile || DEFAULT_RUN.bankFile;
        const tried = [];
        async function tryLoad(bankFile) {
            const cands = bankCandidates(bankFile);
            for (const url of cands) {
                tried.push(url);
                try {
                    const res = await fetch(url, { cache: 'no-store' });
                    if (!res.ok)
                        throw new Error(`${res.status} ${res.statusText}`);
                    const data = await res.json();
                    hideError();
                    return Array.isArray(data) ? data : (data.questions || []);
                }
                catch { }
            }
            return null;
        }
        if (isLikelyFileProtocol()) {
            showError(`Bank load blocked (file://).

` +
                `Use a local server (VS Code Live Server) or GitHub Pages.
` +
                `Requested bank: ${requested}`);
        }
        // 1) requested bank
        let data = await tryLoad(requested);
        if (data && data.length)
            return data;
        // 2) fallback to set_A.json
        if (requested !== 'data/set_A.json') {
            data = await tryLoad('data/set_A.json');
            if (data && data.length) {
                showError(`⚠ Failed to load ${requested}.
` +
                    `Fell back to data/set_A.json.

` +
                    `Tried: ${tried.join(', ')}`);
                return data;
            }
        }
        // 3) final demo fallback
        showError(`Failed to load any bank.

` +
            `Requested: ${requested}
` +
            `Tried: ${tried.join(', ')}

` +
            `Fix: ensure JSON exists and run via a web server.`);
        return [
            {
                set_name: 'DEMO',
                round_name: 'demo',
                num: 1,
                bonus: false,
                level: 'MS',
                category: 'BIOLOGY',
                type: 'SA',
                question_text: 'What organelle is known as the powerhouse of the cell?',
                parsed_answer: 'MITOCHONDRIA'
            },
            {
                set_name: 'DEMO',
                round_name: 'demo',
                num: 2,
                bonus: true,
                level: 'MS',
                category: 'BIOLOGY',
                type: 'SA',
                question_text: 'This organelle contains its own DNA and is responsible for respiration',
                parsed_answer: 'MITOCHONDRIA'
            }
        ];
    }
    (async () => {
        questions = [];
        index = 0;
        bank = await loadBank();
        questions = buildRunQuestions();
        if (!questions.length) {
            runActive = false;
            buzzEl.textContent = 'No questions matched — press Esc';
            progressEl.textContent = '—';
            return;
        }
        runActive = true;
        score = 0;
        scoreEl.textContent = '0';
        loadQuestion();
    })();
})();
//# sourceMappingURL=practice.js.map