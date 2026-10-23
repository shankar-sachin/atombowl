(() => {
    // Run config (single source of truth)
    const DEFAULT_RUN = {
      mode: 'rapid',
      level: 'ANY',
      category: 'ANY',
      categories: [],
      detailedCategories: [],
      qaType: 'ANY',
      bonus: 'ANY',
      count: 25,     // rapid mode: number of PAIRS
      seconds: 20,   // TU pre-buzz timer
      setName: '',
      roundName: '',
      bankFile: 'data/set_B.json'
    };

    function safeParseJSON(s, fallback) {
      try { return JSON.parse(s); } catch { return fallback; }
    }

    // practice_home should store settings here
    const cfg = safeParseJSON(localStorage.getItem('atom_run'), null) || {};

    // question_bank's Practice button hands over one question. It is one-shot:
    // read it, then clear it so the next normal run uses atom_run again.
    const singleRaw = localStorage.getItem('atom_single_question');
    if (singleRaw !== null) {
      localStorage.removeItem('atom_single_question');
      localStorage.removeItem('atom_practice_config');
    }
    const singleParsed = safeParseJSON(singleRaw, null);
    const singleQ = singleParsed && typeof singleParsed === 'object' && !Array.isArray(singleParsed)
      ? singleParsed
      : null;
    const singleMode = !!singleQ;

    // Generate's "Practice these" plays its set in order: /practice?generated=1.
    const generatedQs = (() => {
      if (new URLSearchParams(window.location.search).get('generated') !== '1') return null;
      const list = safeParseJSON(sessionStorage.getItem('atom_generated_set'), null);
      return Array.isArray(list) ? list.filter(q => q && q.question_text && q.parsed_answer) : null;
    })();

    // A single-question session ignores atom_run's filters; only timing carries over.
    const runCfg = singleMode
      ? {
          ...DEFAULT_RUN,
          seconds: cfg.seconds ?? DEFAULT_RUN.seconds,
          noTimer: !!cfg.noTimer,
          mode: 'single',
          bankFile: singleQ.bank_id || DEFAULT_RUN.bankFile
        }
      : {
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
      if (!Array.isArray(selectedTopics) || !selectedTopics.length) return [];
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

    runCfg.seconds = parseInt(runCfg.seconds ?? runCfg.time, 10);
    if (!Number.isFinite(runCfg.seconds)) runCfg.seconds = DEFAULT_RUN.seconds;

    runCfg.count = parseInt(runCfg.count, 10);
    if (!Number.isFinite(runCfg.count)) runCfg.count = DEFAULT_RUN.count;
    if (runCfg.count < 1) runCfg.count = 1;

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
      if (window.atomSettings) return window.atomSettings;
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return { ...SETTINGS_DEFAULTS };
        const parsed = JSON.parse(raw);
        return { ...SETTINGS_DEFAULTS, ...parsed };
      } catch {
        return { ...SETTINGS_DEFAULTS };
      }
    }

    const settings = loadSettings();

    if (!singleMode && runCfg.level === DEFAULT_RUN.level && ['MS', 'HS'].includes(settings.div)) {
      runCfg.level = settings.div;
    }
    if (!singleMode && runCfg.mode === DEFAULT_RUN.mode && settings.mode) {
      runCfg.mode = settings.mode;
    }

    const MODE_NAMES = {
      rapid: 'Rapid fire',
      regular: 'Regular',
      tossups: 'Toss-ups only',
      bonuses: 'Bonuses only',
      wxyz: 'Multiple choice sprint',
      sa: 'Short answer drill',
      set: 'Run a set',
      single: 'Single question'
    };
    const modeKey = String(runCfg.mode || 'rapid').toLowerCase();
    document.getElementById('mode').textContent = MODE_NAMES[modeKey] || 'Practice';
    const exitUrl = singleMode ? '/question-bank' : generatedQs ? '/generate' : '/practice-home';

    // ---------- Display helpers (data values stay as they are) ----------
    function sentenceCase(text) {
      const s = String(text || '').trim();
      if (!s) return '';
      if (s === s.toUpperCase()) return s.charAt(0) + s.slice(1).toLowerCase();
      return s.split(' ').map((w, i) => (i > 0 && /^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w)).join(' ');
    }
    function levelName(level) {
      if (level === 'MS') return 'Middle school';
      if (level === 'HS') return 'High school';
      return String(level || '');
    }
    function typeName(type) {
      if (type === 'SA') return 'Short answer';
      if (type === 'MC') return 'Multiple choice';
      return String(type || '');
    }
    function roundName(round) {
      const r = String(round ?? '').trim();
      const m = r.match(/^round\s*(\d+)$/i);
      if (m) return `round ${m[1]}`;
      return r ? `${r} round` : '';
    }
    function setName(set) {
      return sentenceCase(String(set || '').replace(/[-_]+/g, ' '));
    }

    // Early appearances for State constants
    let ttsEnabled = settings.tts;
    let autoCheckEnabled = !!settings.autoCheck;
    let autoCheckThreshold = Number(settings.autoThreshold ?? 0.72);
    async function gradeAnswer(userAnswer, correctAnswer, questionType) {
      if (!autoCheckEnabled) return null;
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
    let readingSpeed = Number(settings.ttsRate ?? 1.0);
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
    const askTutorBtn = document.getElementById('askTutorBtn');
    const extAiRow = document.getElementById('extAiRow');
    const extAiBtn = document.getElementById('extAiBtn');
    const extAiNote = document.getElementById('extAiNote');
    let lastUserAnswer = '';
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
    const ttsToggle = document.getElementById('ttsToggle');
    const BANK_DISPLAY_NAMES = {
      A: "Dynamazar",
      B: "Scalazar"
    }
    const speedSlider = document.getElementById('speedSlider')
    function persistSettingsPatch(patch) {
      const next = { ...settings, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      window.atomSettings = next;
      Object.assign(settings, next);
    }

    function renderTtsToggle() {
      if (!ttsToggle) return;
      ttsToggle.innerHTML = `${window.atomIcon?.('volume') || ''}<span>Read aloud ${ttsEnabled ? 'on' : 'off'}</span>`;
      ttsToggle.setAttribute('aria-pressed', String(!!ttsEnabled));
    }
    renderTtsToggle();


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
      answered: 0,          // total buzzed questions
      correct: 0,           // graded correct
      totalTime: 0,         // seconds spent after buzz
      slowCorrect: 0        // correct answers taking >=10s
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
      if (!q?.question_text) return;
      if (textFullyRevealed) return;
      const startIndex = (questionTextEl?.textContent || '').length;
      startSyncedRead(q.question_text, startIndex);
    }

    if (speedSlider) {
      speedSlider.value = String(readingSpeed);
      const speedLabel = document.getElementById('speedLabel');
      if (speedLabel) speedLabel.textContent = `${readingSpeed.toFixed(2)}×`;

      speedSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement | null;
        if (!target) return;
        readingSpeed = Number(target.value);
        if (speedLabel) speedLabel.textContent = `${readingSpeed.toFixed(2)}×`;
        persistSettingsPatch({ ttsRate: readingSpeed });

        // Apply changes immediately to any ongoing typing/speaking.
        if (runActive) restartReadingAtCurrentSpeed();
      };
    }

    function createUtterance(text) {
      if (!window.speechSynthesis) return null;
      const utterance = new SpeechSynthesisUtterance(text);
      const rate = Math.max(0.6, Math.min(2.0, readingSpeed));
      utterance.rate = rate;
      utterance.pitch = Number(settings.ttsPitch ?? 1.0);
      utterance.volume = Number(settings.ttsVolume ?? 1.0);

      // Pick a clean English voice if available
      const voices = speechSynthesis.getVoices();
      const configured = settings.ttsVoice
        ? voices.find(v => (v.voiceURI || v.name) === settings.ttsVoice)
        : null;
      if (configured) {
        utterance.voice = configured;
      } else {
        const preferred = voices.find(v =>
          /en-US/i.test(v.lang) && /Google|Microsoft|Samantha/i.test(v.name)
        );
        if (preferred) utterance.voice = preferred;
      }

      currentUtterance = utterance;
      return utterance;
    }

    function speakText(text) {
      if (!ttsEnabled || !window.speechSynthesis) return;
      stopSpeech();
      const utterance = createUtterance(text);
      if (!utterance) return;
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
      if (!ttsEnabled) stopSpeech();
      renderTtsToggle();
      persistSettingsPatch({ tts: ttsEnabled });
    }

    if (ttsToggle) {
      ttsToggle.onclick = () => toggleTts();
    }

    function stopReadingNow() {
      stopSpeech();
      clearInterval(typewriterTimer);
      const q = currentQ();
      if (q?.question_text && questionTextEl) {
        questionTextEl.textContent = String(q.question_text);
        textFullyRevealed = true;
      }
    }

    function stopReadingFreeze() {
      stopSpeech();
      clearInterval(typewriterTimer);
    }

    function handleBuzzTrigger() {
      if (!runActive || buzzed || locked || awaitingGrade) return;
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
      if (!window.speechSynthesis) return;
    
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;      // silent
      u.rate = 1.0;
      u.pitch = 1.0;
    
      window.speechSynthesis.speak(u);
      window.speechSynthesis.cancel();
    }



    const STOPWATCH_TONES = ['sw-fast', 'sw-mid', 'sw-slow', 'sw-late'];

    function stopStopwatch() {
        if (stopwatchInterval) clearInterval(stopwatchInterval);
        stopwatchInterval = null;
        stopwatchRunning = false;
    }

    function resetStopwatch() {
        stopStopwatch();
        const el = document.getElementById('stopwatch');
        el.textContent = '0.00 s';
        el.classList.remove(...STOPWATCH_TONES);
    }

    function updateStopwatchColor(seconds) {
        const el = document.getElementById('stopwatch');
        if (!el) return;

        // One class at a time; color only, no animation.
        const tone = seconds < 5 ? 'sw-fast' : seconds < 10 ? 'sw-mid' : seconds < 20 ? 'sw-slow' : 'sw-late';
        if (el.classList.contains(tone)) return;
        el.classList.remove(...STOPWATCH_TONES);
        el.classList.add(tone);
    }


    function showError(msg) {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    }

    function hideError() {
      if (!errEl) return;
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }

    function norm(s) { return String(s || '').trim(); }

    function currentQ() {
      if (!Array.isArray(questions) || questions.length === 0) return null;
      if (index < 0 || index >= questions.length) return null;
      return questions[index];
    }

    // -------- Bank loading helpers --------

    function normalizeBankFile(raw) {
      // Accept: "set_A.json", "./set_A.json", "/set_A.json", "banks/set_A.json"
      // Return: a cleaned relative path we can try as-is.
      let s = String(raw || '').trim();
      if (!s) return '';

      // If it's an absolute URL, keep it.
      if (/^https?:\/\//i.test(s)) return s;

      // Strip leading file-ish markers.
      s = s.replace(/^\.\/+/, '').replace(/^\/+/, '');
      return s;
    }

    function bankCandidates(bankFile) {
      const cleaned = normalizeBankFile(bankFile);
      if (!cleaned) return [];
      if (/^https?:\/\//i.test(cleaned)) return [cleaned];

      // Try a small set of sane candidates.
      const out = [
        `./${cleaned}`,
        cleaned,
      ];

      // If Home accidentally stored "./set_A.json" we'll avoid "././set_A.json" by normalization above.
      // Add a banks/ folder option (common project layout) if user later moves banks.
      if (!cleaned.startsWith('banks/')) out.push(`./banks/${cleaned}`);

      // Deduplicate
      return [...new Set(out)];
    }

    function isLikelyFileProtocol() {
      try { return window.location.protocol === 'file:'; } catch { return false; }
    }

    // -------- Image path resolver --------

    function resolveImgCandidates(q, field) {
      const raw = String((q && q[field]) || '').trim();
      if (!raw) return [];
      if (/^https?:\/\//i.test(raw)) return [raw];

      const p = raw.replace(/^\.\/+/, '').replace(/^\/+/, '');
      if (p.startsWith('images/')) return [p];

      const cands = [];
      if (p.startsWith('ms/') || p.startsWith('hs/')) cands.push('images/' + p);

      const lvl = String(q?.level || '').toLowerCase();
      if (lvl === 'ms' || lvl === 'hs') cands.push(`images/${lvl}/${p}`);

      cands.push('images/' + p);
      cands.push(p);
      return [...new Set(cands)];
    }

    function setImgWithFallback(imgEl, q, field) {
      const cands = resolveImgCandidates(q, field);
      let i = 0;
      imgEl.onerror = null;

      if (!cands.length) {
        imgEl.classList.add('hidden');
        imgEl.removeAttribute('src');
        return;
      }

      imgEl.classList.remove('hidden');
      imgEl.src = cands[i];
      imgEl.onerror = () => {
        i += 1;
        if (i >= cands.length) {
          imgEl.onerror = null;
          imgEl.classList.add('hidden');
          imgEl.removeAttribute('src');
          return;
        }
        imgEl.src = cands[i];
      };
    }

    // -------- Text / image renderer --------

    let typewriterTimer = null;
    let textFullyRevealed = true;

    function renderQuestion(q) {
      img.classList.add('hidden');
      img.removeAttribute('src');
      questionTextEl.classList.add('hidden');
      questionTextEl.textContent = '';
      clearInterval(typewriterTimer);
      textFullyRevealed = true;

      // TEXT MODE
      if (q.question_text && !q.question_image) {
        questionTextEl.classList.remove('hidden');
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
      if (!full) return;
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
        if (level !== 'ANY' && q.level !== level) return false;
        if (categories.length && !categories.includes(norm(q.category))) return false;
        if (!categories.length && category !== 'ANY' && norm(q.category) !== category) return false;
        if (detailedCategories.length) {
          const detailed = norm(q.detailed_category || q.detailedCategory);
          if (!detailedCategories.includes(detailed)) return false;
        }
        if (qaType !== 'ANY' && q.type !== qaType) return false;

        // bonus can be ANY / true / false / TU / BONUS
        if (bonus !== 'ANY') {
          const b = String(bonus).toUpperCase().trim();
          const wantBonus = (b === 'TRUE' || b === 'BONUS' || b === 'B');
          const wantTU = (b === 'FALSE' || b === 'TU' || b === 'TOSSUP' || b === 'TOSS-UP' || b === 'T');
          if (wantBonus && !q.bonus) return false;
          if (wantTU && q.bonus) return false;
          if (!wantBonus && !wantTU && String(!!q.bonus) !== String(bonus)) return false;
        }

        if (setName && q.set_name !== setName) return false;
        if (roundName && q.round_name !== roundName) return false;
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
    // Single-question session from the question bank: exactly that question,
    // plus its bonus when the bank has one with the same set, round and number.
    function buildSingleQuestions() {
      const q = singleQ;
      if (!q) return [];
      hideError();
      if (q.bonus) return [q];
      const key = (x) => `${norm(x?.set_name)}|${norm(x?.round_name)}|${String(x?.num ?? '')}`;
      const pair = bank.find(x => x && x.bonus === true && key(x) === key(q) && x !== q);
      return pair ? [q, pair] : [q];
    }

    function buildRunQuestions() {
      if (singleMode) return buildSingleQuestions();
      const filtered = applyFilters(bank);
      if (!filtered.length) {
        showError('No questions match these filters. Exit practice and include more topics or levels.');
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
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push(q);
      }

      const allPairs = [];

      for (const items of byCat.values()) {
        // Prefer pairing within same set
        const bySet = new Map();
        for (const q of items) {
          const key = String(q.set_name || '');
          if (!bySet.has(key)) bySet.set(key, []);
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
            if (!b) b = bos.find(x => !usedBo.has(x));
            if (!b) break;
            usedBo.add(b);
            allPairs.push([t, b]);
          }
        }
      }

      shuffle(allPairs);
      const pickedPairs = allPairs.slice(0, Math.min(wantPairs, allPairs.length));

      // Flatten into TU -> BO order
      const out = [];
      for (const [t, b] of pickedPairs) out.push(t, b);
      return out;
    }

    function updateProgressUI() {
      const q = currentQ();
      if (!q || !Array.isArray(questions) || !questions.length) {
        progressEl.textContent = '-';
        return;
      }

      const mode = String(runCfg.mode || 'rapid').toLowerCase();

      if (mode === 'tossups' || mode === 'bonuses' || singleMode) {
        // raw question progress
        progressEl.textContent = `Question ${index + 1} of ${questions.length}`;
        return;
      }

      // pair progress
      const pairIndex = Math.floor(index / 2) + 1;
      const totalPairs = Math.max(1, Math.ceil(questions.length / 2));
      const label = q.bonus ? 'Bonus' : 'Toss-up';
      progressEl.textContent = `${label} ${pairIndex} of ${totalPairs}`;
    }

    function resetForQuestion() {
      buzzed = false;
      locked = false;
      awaitingGrade = false;
      interrupted = false;
      if (finalSummaryEl) finalSummaryEl.classList.add('hidden');

      feedback.textContent = '';
      feedback.className = 'feedback';

      input.classList.add('hidden');
      submitBtn.classList.add('hidden');
      choicesEl.classList.add('hidden');
      rightBtn.classList.add('hidden');
      wrongBtn.classList.add('hidden');
      nextBtn.classList.add('hidden');
      learnRow.classList.add('hidden');

      buzzEl.className = 'buzz';
      buzzEl.innerHTML = 'Press <span class="kbd">Space</span> or tap the card to buzz';

      const q = currentQ();
      const isBonus = q?.bonus === true;

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
        timerEl.textContent = 'Off';
        time = Infinity;
      } else {
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
      const tags = [
        `<span class="tag ${q.bonus ? 'accent' : ''}">${q.bonus ? 'Bonus' : 'Toss-up'}</span>`,
        q.category ? `<span class="tag">${escapeHtml(sentenceCase(q.category))}</span>` : '',
        q.type ? `<span class="tag">${escapeHtml(typeName(q.type))}</span>` : '',
        q.level ? `<span class="tag">${escapeHtml(levelName(q.level))}</span>` : ''
      ];
      metaLeft.innerHTML = tags.join('');
      metaRight.textContent = [
        setName(q.set_name),
        roundName(q.round_name),
        q.num !== undefined && q.num !== null && q.num !== '' ? `question ${q.num}` : ''
      ].filter(Boolean).join(', ');

      resetForQuestion();

    }

    function allowAnswerUI() {
      const q = currentQ();
      if (!runActive || !q) return;
      buzzStartTime = Date.now();
    

      buzzed = true;
      buzzEl.textContent = 'Buzzed. Answer within 5 seconds.';
      buzzEl.className = 'buzz is-buzzed';

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
        input.focus();
        return;
      }

      if (q.type === 'MC') {
        choicesEl.classList.remove('hidden');
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
        : '-';
    
      document.getElementById('statAccuracy').textContent = `${acc}%`;
      document.getElementById('statSpeed').textContent = `${avg} s`;
    document.getElementById('statCorrect').textContent = String(stats.correct);
    document.getElementById('statSlow').textContent = String(stats.slowCorrect);
  }
    function computeAtomScoreFallback(): number {
      const answered = Math.max(0, Math.floor(Number(stats.answered) || 0));
      const correct = Math.max(0, Math.floor(Number(stats.correct) || 0));
      const slowCorrect = Math.max(0, Math.floor(Number(stats.slowCorrect) || 0));
      const totalTime = Math.max(0, Number(stats.totalTime) || 0);

      if (!answered) return 0;

      const accuracy = correct / answered;
      const avgTime = totalTime / answered;
      const slowRate = correct > 0 ? (slowCorrect / correct) : 0;

      const accuracyPart = Math.pow(Math.max(0, Math.min(1, accuracy)), 1.5) * 70;
      const speedPart = Math.max(0, Math.min(1, (12 - avgTime) / 12)) * 20;
      const consistencyPart = Math.max(0, 10 * (1 - Math.max(0, Math.min(1, slowRate))));

      return Math.max(0, Math.min(100, accuracyPart + speedPart + consistencyPart));
    }

    function computeAtomScore(): number {
      const engine = window.atomScoreEngine;
      if (!engine || typeof engine.compute !== 'function') {
        console.log('[AtomScore] Engine not loaded, using fallback formula.');
        return computeAtomScoreFallback();
      }

      try {
        return engine.compute(stats);
      } catch (err) {
        console.log('[AtomScore] Engine compute failed, using fallback formula.', err);
        return computeAtomScoreFallback();
      }
    }

    type ManualGradeOptions = {
      showButtons?: boolean;
      autoInfo?: {
        confidence?: number;
        matched?: string;
      };
    };

    function revealManualGrade(userAnswer, correctAnswer, opts: ManualGradeOptions = {}) {
      locked = true;
      awaitingGrade = true;
      clearInterval(timerId);

      const showButtons = opts.showButtons !== false;
      const autoInfo = opts.autoInfo;
      lastUserAnswer = norm(userAnswer);
      const ua = lastUserAnswer || '(no answer)';
      // Answer keys in the data are often all caps; show them in sentence case.
      const ca = sentenceCase(norm(correctAnswer)) || '(no official answer)';

      const line = (label, value, cls = '') =>
        `<div class="fb-line"><span class="fb-label">${label}</span><span class="fb-value ${cls}">${escapeHtml(value)}</span></div>`;
      const lines = [
        line('Your answer', ua),
        line('Official answer', ca, 'q-serif')
      ];

      if (autoInfo && typeof autoInfo.confidence === 'number') {
        const conf = Math.round(autoInfo.confidence * 100);
        lines.push(line('Match confidence', `${conf}%`));
        if (autoInfo.matched) {
          lines.push(line('Matched', autoInfo.matched));
        }
      }

      feedback.innerHTML = lines.join('');
      feedback.className = 'feedback';

      if (showButtons) {
        rightBtn.classList.remove('hidden');
        wrongBtn.classList.remove('hidden');
      } else {
        rightBtn.classList.add('hidden');
        wrongBtn.classList.add('hidden');
      }

      nextBtn.classList.add('hidden');
      learnRow.classList.add('hidden');
    }

    function applyGrade(isRight) {
      // Only grade once per question (hotkeys can fire after grading).
      if (!awaitingGrade) return;
      awaitingGrade = false;

      // ---- Stats update ----
      stats.answered++;

      const gradeTime = Date.now();

      const totalSolveTime = questionStartTime
        ? (gradeTime - questionStartTime) / 1000
        : 0;

      stats.totalTime += totalSolveTime;

      if (isRight) {
        stats.correct++;
        if (totalSolveTime >= 10) stats.slowCorrect++;
      }

      const q = currentQ();
      const points = q && q.bonus ? 10 : 4;

      if (isRight) {
        score += points;
        scoreEl.textContent = String(score);
        feedback.className = 'feedback good';
        feedback.insertAdjacentHTML('afterbegin', `<div class="fb-verdict">${window.atomIcon?.('check') || ''}Correct, +${points}</div>`);
      } else {
        if (q && !q.bonus && interrupted) {
          score -= 4;
          scoreEl.textContent = String(score);
          feedback.insertAdjacentHTML('afterbegin', `<div class="fb-verdict">${window.atomIcon?.('x') || ''}Incorrect, interrupt penalty -4</div>`);
        } else {
          feedback.insertAdjacentHTML('afterbegin', `<div class="fb-verdict">${window.atomIcon?.('x') || ''}Incorrect</div>`);
        }
        feedback.className = 'feedback bad';
      }

      rightBtn.classList.add('hidden');
      wrongBtn.classList.add('hidden');

      // Only show Search/Learn AFTER the user grades; Tutor only after a miss
      learnRow.classList.remove('hidden');
      askTutorBtn?.classList.toggle('hidden', isRight);
      extAiRow?.classList.toggle('hidden', isRight);
      if (extAiNote) extAiNote.textContent = '';
      (window as any).atomExternalAi?.paint(extAiBtn);

      resetStopwatch();

      nextBtn.classList.remove('hidden');
      updateStatsUI();
    }

    async function submitSA() {
      if (!runActive || !buzzed || locked) return;
      stopStopwatch();
      const q = currentQ();
      if (!q) return;
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
      } else {
        revealManualGrade(input.value, q.parsed_answer);
      }
    }

    async function pickMC(letter) {
      if (!runActive || !buzzed || locked) return;
      stopStopwatch();
      const q = currentQ();
      if (!q) return;
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
      } else {
        revealManualGrade(letter, q.parsed_answer);
      }
    }

    async function handleTimeout() {
      if (!runActive || locked) return;
      stopStopwatch();
      const q = currentQ();
      if (!q) return;
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
      } else {
        revealManualGrade('', q.parsed_answer);
      }
    }

    async function syncRunStats() {
      if (!stats) return;
      if (!window.atomAccount) {
        try {
          await import('./account_store.js');
        } catch {
          return;
        }
      }
      const account = window.atomAccount;
      if (!account?.getUser?.()) return;
      const patch = {
        totalRuns: 1,
        totalAnswered: stats.answered,
        totalCorrect: stats.correct,
        totalTime: stats.totalTime,
        totalSlowCorrect: stats.slowCorrect
      };
      try {
        await account.updatePracticeStats(patch);
      } catch {}
    }

    function endRun(reason) {
      runActive = false;
      clearInterval(timerId);
      buzzEl.className = 'buzz is-done';
      buzzEl.textContent = reason || 'Run complete';

      img.classList.add('hidden');
      img.removeAttribute('src');
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

      // Max score from the questions actually played: 4 per toss-up, 10 per bonus.
      const maxScore = questions.reduce((sum, q) => sum + (q && q.bonus ? 10 : 4), 0);

      if (finalScoreEl) {
        finalScoreEl.innerHTML = `<span class="readout-label">Final score</span>`
          + `<span class="numerals final-value">${score}${maxScore ? `<span class="final-max"> / ${maxScore}</span>` : ''}</span>`;
      }

      const backToBank = document.getElementById('backToBankBtn');
      const runAgain = document.getElementById('runAgainBtn');
      backToBank?.classList.toggle('hidden', !singleMode);
      runAgain?.classList.toggle('hidden', singleMode);

      // Show final summary (DOM-based)
      let atomScore = Number.NaN;
      try {
        atomScore = computeAtomScore();
      } catch {}
      if (atomScoreValueEl) {
        atomScoreValueEl.textContent = Number.isFinite(atomScore) ? atomScore.toFixed(1) : '-';
      }
      if (finalSummaryEl) {
        finalSummaryEl.classList.remove('hidden');
      }

      syncRunStats();

      // Clear/hide feedback so it doesn't become the end-screen container
      feedback.textContent = '';
      feedback.className = 'feedback';


      progressEl.textContent = 'Done';

      buzzed = false;
      locked = true;
      awaitingGrade = false;
    }

    function revealFullQuestionNow() {
      const q = currentQ();
      if (!q) return;
      clearInterval(typewriterTimer);
      questionTextEl.textContent = String(q.question_text || '');
    }

    function nextQuestion() {
      resetStopwatch();  
      if (!runActive) return;
      if (!locked) return;
      if (awaitingGrade) return;

      index += 1;
      if (index >= questions.length) {
        endRun('Run complete');
        return;
      }

      loadQuestion();
    }

    // Events
    window.addEventListener('keydown', (e) => {
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
        if (input && !input.classList.contains('hidden')) input.focus();
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        const help = document.getElementById('hotkeyHelp');
        setHotkeyHelp(!help?.classList.contains('open'));
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
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;

      // Prevent space from scrolling ONLY when not typing (keeps spaces working in answer box)
      if (e.code === 'Space' && !isTyping) e.preventDefault();

      if (e.key === 'Escape') {
        const help = document.getElementById('hotkeyHelp');
        if (help?.classList.contains('open')) {
          setHotkeyHelp(false);
          return;
        }
        window.location.href = exitUrl;
        return;
      }

      const q = currentQ();
      if (!runActive || !q) return;

      if (awaitingGrade) {
        const k2 = e.key.toUpperCase();
        if (k2 === 'R') applyGrade(true);
        if (k2 === 'W') applyGrade(false);
        return;
      }

      if (e.code === 'Space' && !buzzed && !locked && !isTyping) {
        handleBuzzTrigger();
        return;
      }

      if (e.code === 'Enter' && buzzed && !locked && (q.type === 'SA' || interrupted)) submitSA();

      if (buzzed && !locked && q.type === 'MC' && !interrupted) {
        const k = e.key.toUpperCase();
        if (['W','X','Y','Z'].includes(k)) pickMC(k);
      }

      if (e.key.toUpperCase() === 'N' && locked) nextQuestion();
    }, { passive: false });

    // Tap / click anywhere to buzz (mobile-friendly)
    const questionCard = document.querySelector('.question-card');

    function shouldIgnoreTap(target) {
      const el = target as HTMLElement | null;
      return !!el?.closest('input, textarea, button, a, select, label');
    }

    function tapToBuzz(e) {
      if (shouldIgnoreTap(e.target)) return;
      handleBuzzTrigger();
    }

    if (questionCard) {
      questionCard.addEventListener('pointerdown', tapToBuzz);
    }
    window.addEventListener("load", () => {
      warmUpSpeechSynthesis();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopSpeech();
    });
    window.addEventListener('pagehide', stopSpeech);
    window.addEventListener('beforeunload', stopSpeech);


    submitBtn.addEventListener('click', submitSA);
    rightBtn.addEventListener('click', () => applyGrade(true));
    wrongBtn.addEventListener('click', () => applyGrade(false));

    // What Tutor and the external chat apps get about the question just missed.
    function missContext(q) {
      return {
        question: String(q.question_text || ''),
        hasImage: !q.question_text && !!q.question_image,
        answer: String(q.parsed_answer || ''),
        answerLabel: sentenceCase(norm(q.parsed_answer)),
        userAnswer: lastUserAnswer,
        category: String(q.category || ''),
        bonus: !!q.bonus,
        level: String(q.level || '')
      };
    }

    extAiBtn?.addEventListener('click', async () => {
      const q = currentQ();
      const ext = (window as any).atomExternalAi;
      if (!q || !ext) return;
      const note = await ext.send(missContext(q));
      if (extAiNote) extAiNote.textContent = note;
    });

    askTutorBtn?.addEventListener('click', async () => {
      const q = currentQ();
      if (!q) return;
      const context = missContext(q);
      try {
        const widget = await import('./tutor_widget.js');
        widget.openTutor({ context });
      } catch {
        showError('Tutor could not load. Check your connection and try again.');
      }
    });
    nextBtn.addEventListener('click', nextQuestion);

    choicesEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest('button[data-letter]') as HTMLElement | null;
      if (!btn) return;
      const letter = btn.dataset.letter;
      if (!letter) return;
      pickMC(letter);
    });

    // Pages can't read the browser's default search engine, so guess from the browser
    // and let Settings > "Look up answers with" override it.
    function searchEngineUrl(query: string) {
      const pick = String(settings.searchEngine || 'auto');
      const engine = pick !== 'auto' ? pick
        : (navigator as any).brave ? 'brave'
        : /Edg\//.test(navigator.userAgent) ? 'bing'
        : 'google';
      const base: Record<string, string> = {
        google: 'https://www.google.com/search?q=',
        bing: 'https://www.bing.com/search?q=',
        duckduckgo: 'https://duckduckgo.com/?q=',
        brave: 'https://search.brave.com/search?q='
      };
      return (base[engine] || base.google) + encodeURIComponent(query);
    }

    const SEARCH_STOP = new Set('a an the of in on at to for from by with and or is are was were be been which what who whom whose this that these those its it as into than then name give identify following most also known called describe term'.split(' '));
    function lookupQuery(q: any) {
      const answer = String(q.parsed_answer || '').replace(/^\s*[WXYZ]\)\s*/i, '').trim();
      const stem = String(q.question_text || '')
        .split('\n').filter((line) => !/^\s*[WXYZ]\)/i.test(line)).join(' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^A-Za-z0-9\s-]/g, ' ');
      const words = stem.split(/\s+/).filter((w) => w.length > 2 && !SEARCH_STOP.has(w.toLowerCase())).slice(0, 10);
      const context = words.length ? words.join(' ') : String(q.category || '');
      return `${context} ${answer}`.trim();
    }

    searchBtn?.addEventListener('click', () => {
      const q = currentQ();
      if (!q || !q.parsed_answer) return;
      // New tab so the run keeps going.
      window.open(searchEngineUrl(lookupQuery(q)), '_blank', 'noopener');
    });

    // Shortcuts popover: hover/focus on desktop, click or Alt+H anywhere.
    const hotkeyHelpEl = document.getElementById('hotkeyHelp');
    const hotkeyBtn = document.getElementById('hotkeyBtn');
    function setHotkeyHelp(open) {
      hotkeyHelpEl?.classList.toggle('open', !!open);
      hotkeyBtn?.setAttribute('aria-expanded', String(!!open));
    }
    hotkeyBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      setHotkeyHelp(!hotkeyHelpEl?.classList.contains('open'));
    });
    document.addEventListener('click', (e) => {
      if (hotkeyHelpEl?.classList.contains('open') && !hotkeyHelpEl.contains(e.target as Node)) setHotkeyHelp(false);
    });

    document.getElementById('runAgainBtn')?.addEventListener('click', () => window.location.reload());

    async function loadBank() {
      const requested = runCfg.bankFile || DEFAULT_RUN.bankFile;
      const tried = [];

      async function tryLoad(bankFile) {
        const cands = bankCandidates(bankFile);
        for (const url of cands) {
          tried.push(url);
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const data = await res.json();
            hideError();
            return Array.isArray(data) ? data : (data.questions || []);
          } catch {}
        }
        return null;
      }

      if (isLikelyFileProtocol()) {
        showError(
          `Bank load blocked (file://).

` +
          `Use a local server (VS Code Live Server) or GitHub Pages.
` +
          `Requested bank: ${requested}`
        );
      }

      // 1) requested bank
      let data = await tryLoad(requested);
      if (data && data.length) return data;

      // 2) fallback to set_A.json
      if (requested !== 'data/set_A.json') {
        data = await tryLoad('data/set_A.json');
        if (data && data.length) {
          showError(
            `Could not load ${requested}.
` +
            `Fell back to data/set_A.json.

` +
            `Tried: ${tried.join(', ')}`
          );
          return data;
        }
      }

      // 3) final demo fallback
      showError(
        `Failed to load any bank.

` +
        `Requested: ${requested}
` +
        `Tried: ${tried.join(', ')}

` +
        `Fix: ensure JSON exists and run via a web server.`
      );

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

    // Single mode only needs the bank to find the paired bonus, so a failed
    // load is silent: the chosen question still plays on its own.
    async function loadPairBank() {
      for (const url of bankCandidates(runCfg.bankFile)) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json();
          return Array.isArray(data) ? data : (data.questions || []);
        } catch {}
      }
      return [];
    }

    (async () => {
      questions = [];
      index = 0;

      if (generatedQs) {
        bank = generatedQs;
        questions = generatedQs.slice();
      } else {
        bank = singleMode ? await loadPairBank() : await loadBank();
        questions = buildRunQuestions();
      }

      if (!questions.length) {
        runActive = false;
        buzzEl.textContent = 'No questions to play. Press Esc to change your setup.';
        progressEl.textContent = '-';
        return;
      }

      runActive = true;
      score = 0;
      scoreEl.textContent = '0';

      loadQuestion();
    })();
  





})();
