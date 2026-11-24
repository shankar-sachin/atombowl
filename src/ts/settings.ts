// Settings page: every control saves to localStorage (atom_settings_v1) as it changes,
// syncs to the account when signed in, and previews through common.js's applySettings.
(() => {
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
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
    (window as any).atomSettings = s;
  }

  async function syncAccountSettings(s) {
    if (!window.atomAccount) {
      try {
        await import('./account_store.js');
      } catch {
        return;
      }
    }
    try {
      await window.atomAccount?.saveSettings?.(s);
    } catch {}
  }

  function setToggle(el: HTMLElement, on: boolean) {
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-checked', String(!!on));
  }

  function readToggle(el: HTMLElement) {
    return el.getAttribute('aria-checked') === 'true';
  }

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  // Elements
  const sfxToggle = $('sfxToggle');
  const ttsToggle = $('ttsToggle');
  const hcToggle = $('hcToggle');
  const animToggle = $('animToggle');
  const rememberTopicsToggle = $('rememberTopicsToggle');
  const autoCheckToggle = $('autoCheckToggle');
  const autoThreshold = $<HTMLInputElement>('autoThreshold');
  const autoThresholdValue = $('autoThresholdValue');
  const voiceSelect = $<HTMLSelectElement>('voiceSelect');
  const voiceRate = $<HTMLInputElement>('voiceRate');
  const voiceRateValue = $('voiceRateValue');
  const voicePitch = $<HTMLInputElement>('voicePitch');
  const voicePitchValue = $('voicePitchValue');
  const voiceVolume = $<HTMLInputElement>('voiceVolume');
  const voiceVolumeValue = $('voiceVolumeValue');
  const voiceTest = $<HTMLButtonElement>('voiceTest');

  const divSelect = $<HTMLSelectElement>('divSelect');
  const modeSelect = $<HTMLSelectElement>('modeSelect');
  const externalAiSelect = $<HTMLSelectElement>('externalAiSelect');
  const searchEngineSelect = $<HTMLSelectElement>('searchEngineSelect');
  const fontSelect = $<HTMLSelectElement>('fontSelect');
  const accentGroup = $('accentSelect');
  const swatches = [...accentGroup.querySelectorAll<HTMLButtonElement>('.swatch')];
  const themeSelect = $<HTMLSelectElement>('themeSelect');

  const toast = $('toast');
  const resetBtn = $<HTMLButtonElement>('reset');

  const toggles = [sfxToggle, ttsToggle, hcToggle, animToggle, rememberTopicsToggle, autoCheckToggle];

  swatches.forEach((sw) => sw.style.setProperty('--swatch', sw.dataset.value || DEFAULT_ACCENT));

  let toastTimer = 0;
  function showToast(msg: string, icon = 'check') {
    const svg = (window as any).atomIcon?.(icon) || '';
    toast.innerHTML = `${svg}<span></span>`;
    (toast.querySelector('span') as HTMLElement).textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function applyThemePreview(s) {
    (window as any).atomApplySettings?.(s);
  }

  function normalizeAccent(value: string) {
    const v = String(value || '').toLowerCase();
    if (!v || LEGACY_ACCENTS.includes(v)) return DEFAULT_ACCENT;
    return swatches.some((sw) => sw.dataset.value === v) ? v : DEFAULT_ACCENT;
  }

  function setAccent(value: string) {
    const v = normalizeAccent(value);
    swatches.forEach((sw) => {
      const on = sw.dataset.value === v;
      sw.setAttribute('aria-checked', String(on));
      sw.tabIndex = on ? 0 : -1;
    });
  }

  function readAccent() {
    return swatches.find((sw) => sw.getAttribute('aria-checked') === 'true')?.dataset.value || DEFAULT_ACCENT;
  }

  function showRangeValues() {
    autoThresholdValue.textContent = Number(autoThreshold.value).toFixed(2);
    voiceRateValue.textContent = `${Number(voiceRate.value).toFixed(2)}x`;
    voicePitchValue.textContent = Number(voicePitch.value).toFixed(2);
    voiceVolumeValue.textContent = `${Math.round(Number(voiceVolume.value) * 100)}%`;
  }

  function hydrateUI(s) {
    setToggle(sfxToggle, s.sfx);
    setToggle(ttsToggle, s.tts);
    if ([...voiceSelect.options].some((o) => o.value === (s.ttsVoice || ''))) voiceSelect.value = s.ttsVoice || '';
    voiceRate.value = String(s.ttsRate ?? 1.0);
    voicePitch.value = String(s.ttsPitch ?? 1.0);
    voiceVolume.value = String(s.ttsVolume ?? 1.0);
    setToggle(hcToggle, s.highContrast);
    setToggle(animToggle, s.animations);
    setToggle(rememberTopicsToggle, s.rememberTopics);
    setToggle(autoCheckToggle, s.autoCheck);
    autoThreshold.value = String(s.autoThreshold ?? 0.72);
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
    return {
      ...loadSettings(),
      sfx: readToggle(sfxToggle),
      tts: readToggle(ttsToggle),
      ttsVoice: voiceSelect.value || '',
      ttsRate: Number(voiceRate.value ?? 1.0),
      ttsPitch: Number(voicePitch.value ?? 1.0),
      ttsVolume: Number(voiceVolume.value ?? 1.0),
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
    if (announce) showToast('Saved');
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
      if (!step) return;
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
    if (!window.speechSynthesis) return null;
    const u = new SpeechSynthesisUtterance('This is a test of your Atom Bowl voice settings.');
    u.rate = Number(voiceRate.value ?? 1.0);
    u.pitch = Number(voicePitch.value ?? 1.0);
    u.volume = Number(voiceVolume.value ?? 1.0);
    const match = window.speechSynthesis.getVoices().find((v) => (v.voiceURI || v.name) === (voiceSelect.value || ''));
    if (match) u.voice = match;
    return u;
  }

  voiceTest.addEventListener('click', () => {
    if (!window.speechSynthesis) {
      showToast("Read aloud isn't supported in this browser", 'alert');
      return;
    }
    window.speechSynthesis.cancel();
    const u = buildTestUtterance();
    if (u) window.speechSynthesis.speak(u);
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
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => populateVoices(loadSettings()));

  // Account sync (sign-in, or a different user's cache cleared) rewrites localStorage; reflect it.
  document.addEventListener('atomSettingsSynced', () => {
    const s = loadSettings();
    populateVoices(s);
    hydrateUI(s);
  });
})();
