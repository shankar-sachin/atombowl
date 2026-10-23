    // Everything waits for DOM so we never attach listeners to null nodes.
    document.addEventListener('DOMContentLoaded', () => {
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
      ];

      // Display helper: "Work, Energy, & Power" -> "Work, energy, & power".
      // Only plain capitalized words are lowered, so "pH" and acronyms survive.
      function sentenceCase(text) {
        return String(text || '').split(' ').map((word, i) =>
          i > 0 && /^[A-Z][a-z]+[,]?$/.test(word) ? word.toLowerCase() : word
        ).join(' ');
      }

      function escapeAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      }

      function renderTopics() {
        if (!els.topicGrid) return;
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
        } catch {
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

      function expandedCategories(selectedTopics) {
        if (!selectedTopics.length) return [];
        const lookup = new Map(TOPIC_GROUPS.map(group => [group.id, group.categories]));
        return selectedTopics.flatMap(topic => lookup.get(topic) || []);
      }

      
      type FilterOverrides = Partial<{
        level: string;
        categories: string[];
        detailedCategories: string[];
        qaType: string;
        bonus: string;
        setName: string;
        roundName: string;
      }>;

      function applyFilters(list, overrides: FilterOverrides = {}) {
        const level = overrides.level ?? els.level.value;
        const categories = overrides.categories ?? expandedCategories(selectedSuperTopics());
        const detailedCategories = overrides.detailedCategories ?? selectedDetailedTopics();
        const qaType = overrides.qaType ?? els.qaType.value;
        const bonus = overrides.bonus ?? els.bonus.value;
        const setName = (overrides.setName ?? els.setName.value).trim();
        const roundName = (overrides.roundName ?? els.roundName.value).trim();

        return list.filter(q => {
          if (level !== 'ANY' && q.level !== level) return false;
          if (categories.length && !categories.includes(normCat(q.category))) return false;
          if (detailedCategories.length) {
            const detailed = normCat(q.detailed_category || q.detailedCategory);
            if (!detailedCategories.includes(detailed)) return false;
          }
          if (qaType !== 'ANY' && q.type !== qaType) return false;
          if (bonus !== 'ANY' && String(!!q.bonus) !== bonus) return false;
          if (setName && q.set_name !== setName) return false;
          if (roundName && q.round_name !== roundName) return false;
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
        if (mode === 'tossups') cfg.bonus = 'false';
        if (mode === 'bonuses') cfg.bonus = 'true';
        if (mode === 'wxyz') cfg.qaType = 'MC';
        if (mode === 'sa') cfg.qaType = 'SA';

        return cfg;
      }

      // startRun stays on window for anything else that launches a run.
      window.startRun = function startRun(mode) {
        localStorage.setItem('atom_run', JSON.stringify(getRunConfig(mode)));
        window.location.href = 'practice.html';
      };

      document.getElementById('modeList')?.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement | null)?.closest('button[data-mode]') as HTMLElement | null;
        if (btn?.dataset.mode) window.startRun(btn.dataset.mode);
      });

      async function loadBank() {
        const selectedBank = els.bankSelect?.value || 'data/set_B.json';
        const normalizedBank = selectedBank.replace(/^\.\/+/, '');
        try {
          setBankStatus('Loading', '');
          const res = await fetch(`./${normalizedBank}`, { cache: 'no-store' });
          if (!res.ok) throw new Error(`${normalizedBank} not found`);
          const data = await res.json();
          bank = Array.isArray(data) ? data : (data.questions || []);
          window.bank = bank;

          setBankStatus('Ready', 'good');
          els.bankMeta.className = 'status-note';
          els.bankMeta.textContent = `${bank.length.toLocaleString()} questions loaded from ${normalizedBank}`;

          updateCounts();
        } catch (e) {
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
      els.topicGrid?.addEventListener('change', () => {
        updateCounts();
        if (settings.rememberTopics) {
          saveSuperTopics(selectedSuperTopics());
        }
      });
      els.topicGrid?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const card = target?.closest('.topic-card') as HTMLElement | null;
        if (!card) return;
        if (target?.closest('label') || target?.closest('input') || target?.closest('.topic-sublist')) return;
        const toggle = card.querySelector('.topic-super-checkbox') as HTMLInputElement | null;
        if (!toggle) return;
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      });
      els.clearTopics?.addEventListener('click', () => {
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

      els.bankSelect.addEventListener('change', () => {
        loadBank();
      });

      loadBank();
    });
