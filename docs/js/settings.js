// Settings page: every control saves to localStorage (atom_settings_v1) as it changes,
// syncs to the account when signed in, and previews through common.js's applySettings.
(() => {
    var _a, _b;
    const DEFAULT_ACCENT = '#5b83ff';
    const LEGACY_ACCENTS = ['#4f7cff'];
    const DEFAULTS = {
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
        externalAi: 'claude',
        searchEngine: 'auto',
        highContrast: false,
        animations: true,
        fontSize: 'm',
        accent: DEFAULT_ACCENT,
        theme: 'system'
    };
    const KEY = 'atom_settings_v1';
    function loadSettings() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw)
                return { ...DEFAULTS };
            return { ...DEFAULTS, ...JSON.parse(raw) };
        }
        catch {
            return { ...DEFAULTS };
        }
    }
    function saveSettings(s) {
        try {
            localStorage.setItem(KEY, JSON.stringify(s));
        }
        catch { }
        window.atomSettings = s;
    }
    async function syncAccountSettings(s) {
        var _a, _b;
        if (!window.atomAccount) {
            try {
                await import('./account_store.js');
            }
            catch {
                return;
            }
        }
        try {
            await ((_b = (_a = window.atomAccount) === null || _a === void 0 ? void 0 : _a.saveSettings) === null || _b === void 0 ? void 0 : _b.call(_a, s));
        }
        catch { }
    }
    function setToggle(el, on) {
        el.classList.toggle('on', !!on);
        el.setAttribute('aria-checked', String(!!on));
    }
    function readToggle(el) {
        return el.getAttribute('aria-checked') === 'true';
    }
    const $ = (id) => document.getElementById(id);
    // Elements
    const sfxToggle = $('sfxToggle');
    const ttsToggle = $('ttsToggle');
    const hcToggle = $('hcToggle');
    const animToggle = $('animToggle');
    const rememberTopicsToggle = $('rememberTopicsToggle');
    const autoCheckToggle = $('autoCheckToggle');
    const autoThreshold = $('autoThreshold');
    const autoThresholdValue = $('autoThresholdValue');
    const voiceSelect = $('voiceSelect');
    const voiceRate = $('voiceRate');
    const voiceRateValue = $('voiceRateValue');
    const voicePitch = $('voicePitch');
    const voicePitchValue = $('voicePitchValue');
    const voiceVolume = $('voiceVolume');
    const voiceVolumeValue = $('voiceVolumeValue');
    const voiceTest = $('voiceTest');
    const divSelect = $('divSelect');
    const modeSelect = $('modeSelect');
    const externalAiSelect = $('externalAiSelect');
    const searchEngineSelect = $('searchEngineSelect');
    const fontSelect = $('fontSelect');
    const accentGroup = $('accentSelect');
    const swatches = [...accentGroup.querySelectorAll('.swatch')];
    const themeSelect = $('themeSelect');
    const toast = $('toast');
    const resetBtn = $('reset');
    const toggles = [sfxToggle, ttsToggle, hcToggle, animToggle, rememberTopicsToggle, autoCheckToggle];
    swatches.forEach((sw) => sw.style.setProperty('--swatch', sw.dataset.value || DEFAULT_ACCENT));
    let toastTimer = 0;
    function showToast(msg, icon = 'check') {
        var _a, _b;
        const svg = ((_b = (_a = window).atomIcon) === null || _b === void 0 ? void 0 : _b.call(_a, icon)) || '';
        toast.innerHTML = `${svg}<span></span>`;
        toast.querySelector('span').textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1600);
    }
    function applyThemePreview(s) {
        var _a, _b;
        (_b = (_a = window).atomApplySettings) === null || _b === void 0 ? void 0 : _b.call(_a, s);
    }
    function normalizeAccent(value) {
        const v = String(value || '').toLowerCase();
        if (!v || LEGACY_ACCENTS.includes(v))
            return DEFAULT_ACCENT;
        return swatches.some((sw) => sw.dataset.value === v) ? v : DEFAULT_ACCENT;
    }
    function setAccent(value) {
        const v = normalizeAccent(value);
        swatches.forEach((sw) => {
            const on = sw.dataset.value === v;
            sw.setAttribute('aria-checked', String(on));
            sw.tabIndex = on ? 0 : -1;
        });
    }
    function readAccent() {
        var _a;
        return ((_a = swatches.find((sw) => sw.getAttribute('aria-checked') === 'true')) === null || _a === void 0 ? void 0 : _a.dataset.value) || DEFAULT_ACCENT;
    }
    function showRangeValues() {
        autoThresholdValue.textContent = Number(autoThreshold.value).toFixed(2);
        voiceRateValue.textContent = `${Number(voiceRate.value).toFixed(2)}x`;
        voicePitchValue.textContent = Number(voicePitch.value).toFixed(2);
        voiceVolumeValue.textContent = `${Math.round(Number(voiceVolume.value) * 100)}%`;
    }
    function hydrateUI(s) {
        var _a, _b, _c, _d;
        setToggle(sfxToggle, s.sfx);
        setToggle(ttsToggle, s.tts);
        if ([...voiceSelect.options].some((o) => o.value === (s.ttsVoice || '')))
            voiceSelect.value = s.ttsVoice || '';
        voiceRate.value = String((_a = s.ttsRate) !== null && _a !== void 0 ? _a : 1.0);
        voicePitch.value = String((_b = s.ttsPitch) !== null && _b !== void 0 ? _b : 1.0);
        voiceVolume.value = String((_c = s.ttsVolume) !== null && _c !== void 0 ? _c : 1.0);
        setToggle(hcToggle, s.highContrast);
        setToggle(animToggle, s.animations);
        setToggle(rememberTopicsToggle, s.rememberTopics);
        setToggle(autoCheckToggle, s.autoCheck);
        autoThreshold.value = String((_d = s.autoThreshold) !== null && _d !== void 0 ? _d : 0.72);
        externalAiSelect.value = ['claude', 'chatgpt', 'gemini'].includes(s.externalAi) ? s.externalAi : 'claude';
        searchEngineSelect.value = ['auto', 'google', 'bing', 'duckduckgo', 'brave'].includes(s.searchEngine) ? s.searchEngine : 'auto';
        divSelect.value = s.div;
        modeSelect.value = s.mode;
        fontSelect.value = s.fontSize;
        setAccent(s.accent);
        themeSelect.value = s.theme;
        showRangeValues();
        applyThemePreview(s);
    }
    function collectUI() {
        var _a, _b, _c;
        return {
            ...loadSettings(),
            sfx: readToggle(sfxToggle),
            tts: readToggle(ttsToggle),
            ttsVoice: voiceSelect.value || '',
            ttsRate: Number((_a = voiceRate.value) !== null && _a !== void 0 ? _a : 1.0),
            ttsPitch: Number((_b = voicePitch.value) !== null && _b !== void 0 ? _b : 1.0),
            ttsVolume: Number((_c = voiceVolume.value) !== null && _c !== void 0 ? _c : 1.0),
            div: divSelect.value,
            mode: modeSelect.value,
            rememberTopics: readToggle(rememberTopicsToggle),
            autoCheck: readToggle(autoCheckToggle),
            autoThreshold: Number(autoThreshold.value),
            externalAi: externalAiSelect.value,
            searchEngine: searchEngineSelect.value,
            highContrast: readToggle(hcToggle),
            animations: readToggle(animToggle),
            fontSize: fontSelect.value,
            accent: readAccent(),
            theme: themeSelect.value
        };
    }
    // Range inputs fire continuously; debounce the account write.
    let syncTimer = 0;
    function persistCurrentSettings({ announce = true } = {}) {
        const next = collectUI();
        saveSettings(next);
        applyThemePreview(next);
        clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => syncAccountSettings(next), 400);
        if (announce)
            showToast('Saved');
    }
    toggles.forEach((el) => {
        el.addEventListener('click', () => {
            setToggle(el, !readToggle(el));
            persistCurrentSettings();
        });
    });
    [divSelect, modeSelect, externalAiSelect, searchEngineSelect, fontSelect, themeSelect, voiceSelect].forEach((el) => {
        el.addEventListener('change', () => persistCurrentSettings());
    });
    [autoThreshold, voiceRate, voicePitch, voiceVolume].forEach((el) => {
        el.addEventListener('input', () => {
            showRangeValues();
            persistCurrentSettings({ announce: false });
        });
        el.addEventListener('change', () => showToast('Saved'));
    });
    swatches.forEach((sw, i) => {
        sw.addEventListener('click', () => {
            setAccent(sw.dataset.value || DEFAULT_ACCENT);
            persistCurrentSettings();
        });
        sw.addEventListener('keydown', (e) => {
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!step)
                return;
            e.preventDefault();
            const next = swatches[(i + step + swatches.length) % swatches.length];
            setAccent(next.dataset.value || DEFAULT_ACCENT);
            next.focus();
            persistCurrentSettings();
        });
    });
    function populateVoices(s) {
        if (!window.speechSynthesis) {
            voiceSelect.innerHTML = '<option value="">Read aloud isn\'t supported in this browser</option>';
            voiceSelect.disabled = true;
            voiceTest.disabled = true;
            return;
        }
        const voices = window.speechSynthesis.getVoices();
        voiceSelect.disabled = false;
        voiceSelect.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'System default';
        voiceSelect.appendChild(defaultOption);
        voices.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.voiceURI || voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });
        voiceSelect.value = s.ttsVoice && [...voiceSelect.options].some((opt) => opt.value === s.ttsVoice) ? s.ttsVoice : '';
    }
    function buildTestUtterance() {
        var _a, _b, _c;
        if (!window.speechSynthesis)
            return null;
        const u = new SpeechSynthesisUtterance('This is a test of your Atom Bowl voice settings.');
        u.rate = Number((_a = voiceRate.value) !== null && _a !== void 0 ? _a : 1.0);
        u.pitch = Number((_b = voicePitch.value) !== null && _b !== void 0 ? _b : 1.0);
        u.volume = Number((_c = voiceVolume.value) !== null && _c !== void 0 ? _c : 1.0);
        const match = window.speechSynthesis.getVoices().find((v) => (v.voiceURI || v.name) === (voiceSelect.value || ''));
        if (match)
            u.voice = match;
        return u;
    }
    voiceTest.addEventListener('click', () => {
        if (!window.speechSynthesis) {
            showToast("Read aloud isn't supported in this browser", 'alert');
            return;
        }
        window.speechSynthesis.cancel();
        const u = buildTestUtterance();
        if (u)
            window.speechSynthesis.speak(u);
    });
    resetBtn.addEventListener('click', () => {
        const next = { ...DEFAULTS };
        saveSettings(next);
        syncAccountSettings(next);
        hydrateUI(next);
        showToast('Settings reset to defaults');
    });
    // Init
    const initial = loadSettings();
    populateVoices(initial);
    hydrateUI(initial);
    (_b = (_a = window.speechSynthesis) === null || _a === void 0 ? void 0 : _a.addEventListener) === null || _b === void 0 ? void 0 : _b.call(_a, 'voiceschanged', () => populateVoices(loadSettings()));
    // Account sync (sign-in, or a different user's cache cleared) rewrites localStorage; reflect it.
    document.addEventListener('atomSettingsSynced', () => {
        const s = loadSettings();
        populateVoices(s);
        hydrateUI(s);
    });
})();
//# sourceMappingURL=settings.js.map