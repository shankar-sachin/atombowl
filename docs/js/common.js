// Shared page chrome: applies saved settings and renders the one site nav.
// Classic script, loaded after icons.js and before each page's own script.
(() => {
    var _a, _b, _c;
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
        externalAi: 'claude',
        highContrast: false,
        animations: true,
        fontSize: 'm',
        accent: '#5b83ff',
        theme: 'system'
    };
    // Accent values from the old design map onto the new signal blue.
    const LEGACY_ACCENTS = ['#4f7cff'];
    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw)
                return { ...SETTINGS_DEFAULTS };
            return { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
        }
        catch {
            return { ...SETTINGS_DEFAULTS };
        }
    }
    function applySettings(s) {
        var _a;
        if (!s)
            return;
        const root = document.documentElement;
        const accent = String(s.accent || '').toLowerCase();
        if (accent && !LEGACY_ACCENTS.includes(accent) && accent !== SETTINGS_DEFAULTS.accent) {
            root.style.setProperty('--signal', accent);
            root.style.setProperty('--signal-strong', accent);
        }
        else {
            root.style.removeProperty('--signal');
            root.style.removeProperty('--signal-strong');
        }
        const sizes = { s: '15px', m: '16px', l: '18px' };
        root.style.fontSize = sizes[s.fontSize] || '16px';
        root.classList.toggle('high-contrast', !!s.highContrast);
        root.classList.toggle('no-anim', s.animations === false);
        let light = s.theme === 'light';
        if (s.theme !== 'light' && s.theme !== 'dark') {
            light = !!((_a = window.matchMedia) === null || _a === void 0 ? void 0 : _a.call(window, '(prefers-color-scheme: light)').matches);
        }
        root.classList.toggle('theme-light', light);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta)
            meta.setAttribute('content', light ? '#f2f5fb' : '#0e1626');
    }
    const settings = loadSettings();
    window.atomSettings = settings;
    window.atomApplySettings = applySettings;
    applySettings(settings);
    document.addEventListener('atomSettingsSynced', () => {
        window.atomSettings = loadSettings();
        applySettings(window.atomSettings);
    });
    (_c = (_a = window.matchMedia) === null || _a === void 0 ? void 0 : (_b = _a.call(window, '(prefers-color-scheme: light)')).addEventListener) === null || _c === void 0 ? void 0 : _c.call(_b, 'change', () => {
        const next = loadSettings();
        if ((next.theme || 'system') === 'system')
            applySettings(next);
    });
    // Kept for pages that navigate from script.
    window.atomNavigate = (url) => { if (url)
        window.location.assign(url); };
    // ---------- Nav ----------
    const icon = (name) => { var _a, _b; return ((_b = (_a = window).atomIcon) === null || _b === void 0 ? void 0 : _b.call(_a, name)) || ''; };
    const PRIMARY = [
        { href: 'practice_home.html', label: 'Practice', icon: 'practice' },
        { href: 'question_bank.html', label: 'Question bank', short: 'Bank', icon: 'bank' },
        { href: 'learn.html', label: 'Learn', icon: 'learn' },
        { href: 'buzzer_rooms.html', label: 'Buzzer rooms', short: 'Rooms', icon: 'buzzer' },
        { href: 'game_clock.html', label: 'Game clock', icon: 'clock' }
    ];
    const MORE = [
        { href: 'settings.html', label: 'Settings', icon: 'settings' },
        { href: 'generate.html', label: 'Generate', icon: 'sparkles' },
        { href: 'tutor.html', label: 'Tutor', icon: 'tutor' }
    ];
    const TABS = [
        { href: 'index.html', label: 'Home', icon: 'home' },
        PRIMARY[0],
        PRIMARY[1],
        PRIMARY[3]
    ];
    const SHEET = [
        PRIMARY[2],
        PRIMARY[4],
        { href: 'account.html', label: 'Account', icon: 'user' },
        ...MORE
    ];
    // Pages that belong to a nav section without being its link target.
    const SECTION_ALIASES = {
        'practice.html': 'practice_home.html',
        'more_options.html': 'game_clock.html',
        'buzzer_create.html': 'buzzer_rooms.html',
        'buzzer_room.html': 'buzzer_rooms.html',
        'buzzer_room_player.html': 'buzzer_rooms.html',
        'microsoft_auth.html': 'account.html'
    };
    const pageFile = (window.location.pathname.split('/').pop() || 'index.html') || 'index.html';
    const currentSection = SECTION_ALIASES[pageFile] || pageFile;
    const current = (href) => (href === currentSection ? ' aria-current="page"' : '');
    function menuLink(item) {
        const soon = item.soon ? '<span class="soon">Coming soon</span>' : '';
        return `<a href="${item.href}"${current(item.href)}>${icon(item.icon)}<span>${item.label}</span>${soon}</a>`;
    }
    function renderNav() {
        const body = document.body;
        if (!body || document.querySelector('.site-bar'))
            return;
        const focusMode = body.dataset.chrome === 'focus';
        const bar = document.createElement('header');
        bar.className = focusMode ? 'site-bar focus-bar' : 'site-bar';
        bar.innerHTML = `
      <a class="brand" href="index.html" aria-label="Atom Bowl home">
        <img src="images/brand/logo.svg" alt="" width="32" height="32"><span>Atom Bowl</span>
      </a>
      <nav class="site-links" aria-label="Primary">
        ${PRIMARY.map((item) => `<a class="site-link" href="${item.href}"${current(item.href)}>${icon(item.icon)}<span>${item.label}</span></a>`).join('')}
      </nav>
      <div class="site-more">
        <button class="site-more-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="siteMoreMenu">
          <span>More</span>${icon('chevronDown')}
        </button>
        <div class="menu" id="siteMoreMenu">${MORE.map(menuLink).join('')}</div>
      </div>
      <span class="site-spacer"></span>
      ${focusMode ? '<a class="btn quiet small" href="practice_home.html">Exit practice</a>' : ''}
      <a class="account-chip" href="account.html"${current('account.html')}>
        <span class="avatar-dot" data-account-avatar>${icon('user')}</span>
        <span class="chip-name" data-account-name>Sign in</span>
      </a>`;
        body.insertBefore(bar, body.firstChild);
        if (focusMode)
            return;
        const tabBar = document.createElement('nav');
        tabBar.className = 'tab-bar';
        tabBar.setAttribute('aria-label', 'Primary');
        tabBar.innerHTML = `
      ${TABS.map((item) => `<a href="${item.href}"${current(item.href)}>${icon(item.icon)}<span>${item.short || item.label}</span></a>`).join('')}
      <button type="button" aria-haspopup="true" aria-expanded="false" aria-controls="siteSheet">${icon('menu')}<span>More</span></button>`;
        const backdrop = document.createElement('div');
        backdrop.className = 'sheet-backdrop';
        const sheet = document.createElement('div');
        sheet.className = 'menu sheet';
        sheet.id = 'siteSheet';
        sheet.innerHTML = SHEET.map(menuLink).join('');
        body.append(tabBar, backdrop, sheet);
        body.classList.add('has-tab-bar');
        bindMenu(bar.querySelector('.site-more-btn'), bar.querySelector('#siteMoreMenu'));
        bindMenu(tabBar.querySelector('button'), sheet, backdrop);
    }
    function bindMenu(button, menu, backdrop) {
        if (!button || !menu)
            return;
        const setOpen = (open, focusButton = false) => {
            var _a;
            menu.classList.toggle('open', open);
            backdrop === null || backdrop === void 0 ? void 0 : backdrop.classList.toggle('open', open);
            button.setAttribute('aria-expanded', String(open));
            if (open)
                (_a = menu.querySelector('a')) === null || _a === void 0 ? void 0 : _a.focus();
            else if (focusButton)
                button.focus();
        };
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            setOpen(!menu.classList.contains('open'));
        });
        backdrop === null || backdrop === void 0 ? void 0 : backdrop.addEventListener('click', () => setOpen(false));
        document.addEventListener('click', (event) => {
            if (menu.classList.contains('open') && !menu.contains(event.target))
                setOpen(false);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && menu.classList.contains('open'))
                setOpen(false, true);
        });
    }
    function renderFooter() {
        if (document.body.dataset.chrome === 'focus' || document.querySelector('.site-footer'))
            return;
        const footer = document.createElement('footer');
        footer.className = 'site-footer';
        footer.innerHTML = '<span>Atom Bowl is an unofficial practice tool for the National Science Bowl.</span>'
            + '<span>Made by Sachin Shankar. <a href="https://github.com/shankar-sachin/atombowl">Source on GitHub</a> · <a href="status.html">Status</a></span>';
        const anchor = document.querySelector('.tab-bar');
        if (anchor)
            document.body.insertBefore(footer, anchor);
        else
            document.body.appendChild(footer);
    }
    // ---------- Account chip ----------
    function accountLabel(account, user) {
        var _a;
        const profile = ((_a = account === null || account === void 0 ? void 0 : account.getProfile) === null || _a === void 0 ? void 0 : _a.call(account)) || null;
        return String((profile === null || profile === void 0 ? void 0 : profile.playerName) || (profile === null || profile === void 0 ? void 0 : profile.username) || (user === null || user === void 0 ? void 0 : user.displayName)
            || String((user === null || user === void 0 ? void 0 : user.email) || '').split('@')[0] || 'Account').trim();
    }
    function updateAccountChip(user, account) {
        var _a, _b;
        const name = document.querySelector('[data-account-name]');
        const avatar = document.querySelector('[data-account-avatar]');
        const chip = document.querySelector('.account-chip');
        if (!name || !avatar || !chip)
            return;
        if (!user) {
            name.textContent = 'Sign in';
            avatar.innerHTML = icon('user');
            chip.setAttribute('aria-label', 'Sign in');
            return;
        }
        const label = accountLabel(account, user);
        const photo = String(((_b = (_a = account === null || account === void 0 ? void 0 : account.getProfile) === null || _a === void 0 ? void 0 : _a.call(account)) === null || _b === void 0 ? void 0 : _b.photoURL) || (user === null || user === void 0 ? void 0 : user.photoURL) || '');
        name.textContent = label;
        chip.setAttribute('aria-label', `Account: ${label}`);
        avatar.textContent = '';
        if (photo) {
            const img = document.createElement('img');
            img.src = photo;
            img.alt = '';
            avatar.appendChild(img);
        }
        else {
            avatar.textContent = label.charAt(0).toUpperCase();
        }
    }
    async function bindAccountChip() {
        var _a;
        try {
            await import('./account_store.js');
        }
        catch {
            return; // Firebase blocked or offline: the chip stays "Sign in".
        }
        const account = window.atomAccount;
        (_a = account === null || account === void 0 ? void 0 : account.onAuthChange) === null || _a === void 0 ? void 0 : _a.call(account, (user) => updateAccountChip(user, account));
    }
    // The floating Tutor button. Practice (focus chrome) opens Tutor from "Ask Tutor" instead,
    // and tutor.html shows the chat inline.
    async function mountTutorLauncher() {
        if (['tutor.html', 'status', 'status.html'].includes(pageFile))
            return;
        try {
            const widget = await import('./tutor_widget.js');
            widget.mount({ launcher: true });
        }
        catch { }
    }
    function init() {
        var _a, _b;
        renderNav();
        renderFooter();
        (_b = (_a = window).atomHydrateIcons) === null || _b === void 0 ? void 0 : _b.call(_a);
        if (document.body.dataset.chrome !== 'focus') {
            bindAccountChip();
            mountTutorLauncher();
        }
    }
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else
        init();
})();
//# sourceMappingURL=common.js.map