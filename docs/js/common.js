(() => {
    var _a;
    const SETTINGS_KEY = 'atom_settings_v1';
    const API_BASE_KEY = 'atom_api_base';
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
    function ensureNoAnimStyle() {
        if (document.getElementById('noAnimStyle'))
            return;
        const style = document.createElement('style');
        style.id = 'noAnimStyle';
        style.textContent = `
      .no-anim *, .no-anim *::before, .no-anim *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
    `;
        document.head.appendChild(style);
    }
    function ensureHoverPillStyle() {
        if (document.getElementById('hoverPillStyle'))
            return;
        const style = document.createElement('style');
        style.id = 'hoverPillStyle';
        style.textContent = `
      .nav a[data-hover] {
        position: relative;
      }

      .nav a[data-hover]::after {
        content: attr(data-hover);
        position: absolute;
        left: calc(100% + 12px);
        top: 50%;
        transform: translateY(-50%) translateX(-6px);
        opacity: 0;
        pointer-events: none;
        padding: 6px 10px;
        border-radius: 10px;
        background: rgba(12,16,26,0.95);
        border: 1px solid rgba(255,255,255,0.12);
        color: var(--text);
        font-weight: 800;
        font-size: 0.75rem;
        letter-spacing: 0.02em;
        box-shadow: 0 10px 28px rgba(0,0,0,0.35);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .theme-light .nav a[data-hover]::after {
        background: rgba(255,255,255,0.95);
        border: 1px solid rgba(0,0,0,0.12);
        color: #0f172a;
        box-shadow: 0 8px 20px rgba(0,0,0,0.12);
      }

      .nav a[data-hover]:hover::after {
        opacity: 1;
        transform: translateY(-50%) translateX(0);
      }

      @media (max-width: 820px) {
        .nav a[data-hover]::after {
          display: none;
        }
      }
    `;
        document.head.appendChild(style);
    }
    function ensureNavMoreStyle() {
        if (document.getElementById('navMoreStyle'))
            return;
        const style = document.createElement('style');
        style.id = 'navMoreStyle';
        style.textContent = `
      .nav-title-link {
        color: inherit;
        text-decoration: none;
      }

      .nav-more {
        position: relative;
        margin-top: 12px;
      }

      .nav-quick-controls {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .nav-more-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(18,24,36,0.6);
        color: var(--text);
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s ease, transform 0.15s ease;
      }

      .nav-more-btn:hover {
        background: rgba(79,124,255,0.18);
        transform: translateY(-1px);
      }

      .nav-more-menu {
        position: absolute;
        left: calc(100% + 12px);
        top: 50%;
        transform: translateY(-50%) translateX(-8px);
        opacity: 0;
        pointer-events: none;
        min-width: 180px;
        padding: 10px;
        border-radius: 12px;
        background: rgba(12,16,26,0.96);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 12px 32px rgba(0,0,0,0.35);
        display: grid;
        gap: 8px;
        transition: opacity 0.2s ease, transform 0.2s ease;
        z-index: 1200;
      }

      .nav-more-menu a {
        text-decoration: none;
        color: var(--text);
        font-weight: 600;
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(79,124,255,0.16);
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .nav-more-soon {
        color: var(--muted);
        font-weight: 700;
        font-size: 0.85rem;
        padding: 6px 8px;
      }

      .nav-more.open .nav-more-menu,
      .nav-more:hover .nav-more-menu {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(-50%) translateX(0);
      }

      .theme-light .nav-more-btn {
        background: rgba(255,255,255,0.7);
        border: 1px solid rgba(0,0,0,0.08);
        color: #0f172a;
      }

      .theme-light .nav-more-menu {
        background: rgba(255,255,255,0.98);
        border: 1px solid rgba(0,0,0,0.12);
        box-shadow: 0 12px 28px rgba(0,0,0,0.12);
      }

      .theme-light .nav-more-menu a {
        color: #0f172a;
        background: rgba(79,124,255,0.12);
      }

      .nav-account {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 12px !important;
      }

      .nav-settings {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 12px !important;
      }

      .nav-settings .icon {
        transition: transform 0.35s ease;
      }

      .nav-settings:hover .icon {
        transform: rotate(155deg);
      }

      .nav-account .label {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
        white-space: nowrap;
      }

      .nav-settings .label {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
        white-space: nowrap;
      }

      @media (max-width: 820px) {
        .nav-quick-controls {
          display: block;
        }

        .nav-more-menu {
          position: static;
          transform: none;
          opacity: 1;
          pointer-events: auto;
          margin-top: 8px;
          box-shadow: none;
        }

        .nav-more-btn {
          justify-content: center;
        }

        .nav-account {
          width: 100%;
          height: auto;
          justify-content: center;
          padding: 10px 12px !important;
        }

        .nav-settings {
          width: 100%;
          height: auto;
          justify-content: center;
          padding: 10px 12px !important;
        }
      }
    `;
        document.head.appendChild(style);
    }
    function ensureNavWeightStyle() {
        if (document.getElementById('navWeightStyle'))
            return;
        const style = document.createElement('style');
        style.id = 'navWeightStyle';
        style.textContent = `
      .nav a.active,
      .bottom-nav a.active {
        font-weight: 500;
      }

      .high-contrast .nav a.active,
      .high-contrast .bottom-nav a.active {
        font-weight: 700;
      }
    `;
        document.head.appendChild(style);
    }
    function ensureBottomNavPinnedStyle() {
        if (document.getElementById('bottomNavPinnedStyle'))
            return;
        const style = document.createElement('style');
        style.id = 'bottomNavPinnedStyle';
        style.textContent = `
      .bottom-nav {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        z-index: 1200 !important;
      }

      @media (max-width: 820px) {
        .bottom-nav {
          padding: 10px 12px !important;
          border-radius: 0 !important;
          gap: 8px !important;
        }

        .bottom-nav a {
          font-size: 0.75rem !important;
          padding: 8px 6px !important;
          gap: 4px !important;
        }

        .bottom-nav a .icon {
          font-size: 1.15rem !important;
        }

        /* Hide labels for main nav items and more button */
        .bottom-nav a span:not(.icon),
        .bottom-nav-more button span:not(.icon) {
          display: none !important;
        }

        /* Remove gap and center icons for main nav */
        .bottom-nav a,
        .bottom-nav-more button {
          font-size: 0 !important;
          gap: 0 !important;
          justify-content: center !important;
          align-items: center !important;
        }

        /* Ensure icons are properly sized */
        .bottom-nav a .icon,
        .bottom-nav-more button .icon {
          font-size: 1.3rem !important;
          display: block !important;
        }

        /* Show labels ONLY for items inside the more menu dropdown */
        .bottom-nav-more-menu a {
          font-size: 0.9rem !important;
          gap: 10px !important;
        }

        .bottom-nav-more-menu a span:not(.icon) {
          display: inline !important;
        }
      }
    `;
        document.head.appendChild(style);
    }
    function ensureGlobalFooterStyle() {
        if (document.getElementById('globalFooterStyle'))
            return;
        const style = document.createElement('style');
        style.id = 'globalFooterStyle';
        style.textContent = `
      .global-site-footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 4px;
        text-align: center;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11px;
        line-height: 1.2;
        color: rgba(154,164,178,0.9);
        z-index: 1190;
        pointer-events: none;
        user-select: none;
        padding: 0 12px;
      }

      .theme-light .global-site-footer {
        color: rgba(95,102,117,0.92);
      }

      @media (max-width: 820px) {
        .global-site-footer {
          bottom: 72px;
          font-size: 10px;
        }
      }
    `;
        document.head.appendChild(style);
    }
    function ensurePageTransitionStyle() {
        if (document.getElementById('pageTransitionStyle'))
            return;
        const style = document.createElement('style');
        style.id = 'pageTransitionStyle';
        style.textContent = `
      html,
      body {
        overflow-x: hidden;
      }

      body {
        overflow-y: auto;
      }

      .page-shell {
        transition: opacity 0.38s cubic-bezier(0.22, 1, 0.36, 1), transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
        will-change: opacity, transform;
        width: 100%;
        min-height: 100vh;
        overflow: visible;
        position: relative;
      }

      .page-shell .main {
        overflow: visible;
        max-height: none;
      }

      .page-leave .page-shell {
        opacity: 0;
        transform: translateX(-10px);
      }

      .page-enter .page-shell {
        opacity: 0;
        transform: translateX(10px);
        transition-duration: 0.46s;
      }
    `;
        document.head.appendChild(style);
    }
    function ensureModernRefreshStyle() {
        if (document.getElementById('modernRefreshStyle'))
            return;
        const style = document.createElement('style');
        style.id = 'modernRefreshStyle';
        style.textContent = `
      :root {
        --app-font: "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        --zen-purple: #9b5cff;
        --zen-bg-1: rgba(78, 143, 217, 0.2);
        --zen-bg-2: rgba(79, 124, 255, 0.17);
        --zen-bg-3: rgba(68, 199, 170, 0.18);
        --zen-surface: rgba(12, 18, 32, 0.46);
        --zen-surface-border: rgba(150, 190, 255, 0.2);
        --zen-soft-shadow: 0 24px 48px rgba(3, 8, 24, 0.22);
      }

      .theme-light {
        --zen-bg-1: rgba(120, 186, 255, 0.22);
        --zen-bg-2: rgba(94, 130, 235, 0.16);
        --zen-bg-3: rgba(90, 201, 180, 0.18);
        --zen-surface: rgba(255, 255, 255, 0.58);
        --zen-surface-border: rgba(120, 150, 220, 0.26);
        --zen-soft-shadow: 0 22px 44px rgba(20, 30, 55, 0.12);
      }

      body,
      input,
      button,
      select,
      textarea {
        font-family: var(--app-font) !important;
        font-weight: 400;
      }

      html:not(.high-contrast) .title,
      html:not(.high-contrast) .subtitle,
      html:not(.high-contrast) h1,
      html:not(.high-contrast) h2,
      html:not(.high-contrast) h3,
      html:not(.high-contrast) h4,
      html:not(.high-contrast) h5,
      html:not(.high-contrast) h6,
      html:not(.high-contrast) .btn,
      html:not(.high-contrast) button,
      html:not(.high-contrast) .nav a,
      html:not(.high-contrast) .bottom-nav a {
        font-weight: 400 !important;
      }

      .high-contrast h1,
      .high-contrast h2,
      .high-contrast h3,
      .high-contrast h4,
      .high-contrast h5,
      .high-contrast h6,
      .high-contrast .btn,
      .high-contrast button,
      .high-contrast .nav a.active,
      .high-contrast .bottom-nav a.active {
        font-weight: 700 !important;
      }

      body {
        position: relative;
        background:
          radial-gradient(68rem 48rem at -6% -8%, var(--zen-bg-1), transparent 62%),
          radial-gradient(72rem 52rem at 110% 8%, var(--zen-bg-2), transparent 66%),
          radial-gradient(54rem 40rem at 50% 112%, var(--zen-bg-3), transparent 62%),
          linear-gradient(140deg, color-mix(in srgb, var(--bg) 88%, #0f1b2d 12%), var(--bg) 62%);
        background-attachment: fixed;
      }

      body::after {
        content: "";
        position: fixed;
        inset: -22vmax;
        pointer-events: none;
        background:
          radial-gradient(34vmax 24vmax at 16% 22%, rgba(123, 193, 255, 0.12), transparent 72%),
          radial-gradient(34vmax 24vmax at 84% 72%, rgba(120, 129, 255, 0.1), transparent 72%),
          radial-gradient(28vmax 28vmax at 50% 50%, rgba(147, 112, 219, 0.08), transparent 68%);
        filter: blur(8px);
        animation: zenDrift 26s ease-in-out infinite alternate, zenGradientFlow 20s linear infinite;
        z-index: 0;
      }

      .page-shell,
      .main,
      .main > * {
        position: relative;
        z-index: 1;
      }

      .main > * {
        animation: zenRise 0.5s ease both;
      }

      .main > *:nth-child(2) { animation-delay: 0.05s; }
      .main > *:nth-child(3) { animation-delay: 0.1s; }
      .main > *:nth-child(4) { animation-delay: 0.15s; }

      .title,
      .subtitle,
      .header,
      .grid,
      .form-grid,
      .stats-grid,
      .button-row,
      .nav,
      .bottom-nav {
        animation: zenPopIn 0.62s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .nav a,
      .bottom-nav a,
      .nav-more-btn,
      .nav-account,
      .nav-settings {
        animation: zenItemPop 0.62s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .nav a:nth-of-type(1),
      .bottom-nav a:nth-of-type(1) { animation-delay: 0.03s; }
      .nav a:nth-of-type(2),
      .bottom-nav a:nth-of-type(2) { animation-delay: 0.06s; }
      .nav a:nth-of-type(3),
      .bottom-nav a:nth-of-type(3) { animation-delay: 0.09s; }
      .nav a:nth-of-type(4),
      .bottom-nav a:nth-of-type(4) { animation-delay: 0.12s; }
      .nav a:nth-of-type(5),
      .bottom-nav a:nth-of-type(5) { animation-delay: 0.15s; }
      .nav a:nth-of-type(6),
      .bottom-nav a:nth-of-type(6) { animation-delay: 0.18s; }

      .nav-account .icon,
      .nav-settings .icon,
      .bottom-nav a[href*="settings.html"] .icon {
        filter: grayscale(1) saturate(0) brightness(1.02);
      }

      .nav a[href*="index.html"] .icon,
      .nav a[href*="generate.html"] .icon,
      .nav a[href*="practice_home.html"] .icon,
      .nav a[href*="question_bank.html"] .icon,
      .bottom-nav a[href*="index.html"] .icon,
      .bottom-nav a[href*="generate.html"] .icon,
      .bottom-nav a[href*="practice_home.html"] .icon,
      .bottom-nav a[href*="question_bank.html"] .icon {
        filter: none !important;
      }

      img.brand-icon,
      img[src*="Google-Symbol"],
      img[src*="microsoft.svg"],
      img[src*="microsoft"],
      .provider.google .brand-icon,
      .provider.microsoft .brand-icon {
        filter: none !important;
      }

      a,
      button,
      .btn,
      .tab,
      .nav a,
      .bottom-nav a,
      .card,
      .panel,
      .tile,
      .question-card,
      .stat-box,
      .modal-card,
      input,
      select {
        transition:
          transform 0.42s cubic-bezier(0.22, 1, 0.36, 1),
          box-shadow 0.42s cubic-bezier(0.22, 1, 0.36, 1),
          border-color 0.42s cubic-bezier(0.22, 1, 0.36, 1),
          background-color 0.42s cubic-bezier(0.22, 1, 0.36, 1),
          color 0.42s cubic-bezier(0.22, 1, 0.36, 1),
          opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1),
          filter 0.42s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .card,
      .stat-box,
      .modal-card,
      .panel,
      .tile,
      .question-card {
        position: relative;
        border: 1px solid var(--zen-surface-border);
        background: color-mix(in srgb, var(--zen-surface) 82%, transparent);
        box-shadow: var(--zen-soft-shadow);
        backdrop-filter: blur(7px) saturate(112%);
        animation: zenItemPop 0.66s cubic-bezier(0.22, 1, 0.36, 1) both, zenFloat 8.5s ease-in-out infinite 0.66s;
      }

      .card:nth-of-type(2n),
      .tile:nth-of-type(2n),
      .stat-box:nth-of-type(2n) {
        animation-delay: 0.16s, 0.76s;
      }

      .card:nth-of-type(3n),
      .tile:nth-of-type(3n),
      .stat-box:nth-of-type(3n) {
        animation-delay: 0.24s, 0.84s;
      }

      .grid > *:nth-child(1),
      .stats-grid > *:nth-child(1),
      .form-grid > *:nth-child(1) { animation-delay: 0.04s, 0.7s; }
      .grid > *:nth-child(2),
      .stats-grid > *:nth-child(2),
      .form-grid > *:nth-child(2) { animation-delay: 0.08s, 0.74s; }
      .grid > *:nth-child(3),
      .stats-grid > *:nth-child(3),
      .form-grid > *:nth-child(3) { animation-delay: 0.12s, 0.78s; }
      .grid > *:nth-child(4),
      .stats-grid > *:nth-child(4),
      .form-grid > *:nth-child(4) { animation-delay: 0.16s, 0.82s; }
      .grid > *:nth-child(5),
      .stats-grid > *:nth-child(5),
      .form-grid > *:nth-child(5) { animation-delay: 0.2s, 0.86s; }
      .grid > *:nth-child(6),
      .stats-grid > *:nth-child(6),
      .form-grid > *:nth-child(6) { animation-delay: 0.24s, 0.9s; }

      .modal,
      .modal-card {
        animation: zenModalIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .tab,
      .btn,
      input,
      select,
      textarea,
      .label,
      .row,
      .hotkey-item,
      .topic-option,
      .topic-super,
      .player-card,
      .log-item,
      .stats-table tr,
      .choice-btn,
      .kbd {
        animation: zenItemPop 0.56s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      input:focus,
      select:focus,
      textarea:focus,
      .btn:focus,
      .tab:focus {
        animation: zenFocusPulse 1.4s ease-in-out infinite;
      }

      .card::before,
      .stat-box::before,
      .modal-card::before,
      .panel::before,
      .tile::before,
      .question-card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        border: 1px solid rgba(208, 230, 255, 0.12);
      }

      .card:hover,
      .tile:hover,
      .question-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 30px 58px rgba(5, 12, 30, 0.28);
      }


      .btn,
      button.btn,
      .tab,
      .nav-more-btn,
      .nav-settings,
      .nav-account {
        border-color: rgba(130, 174, 255, 0.34);
        box-shadow:
          0 0 0 1px rgba(100, 150, 240, 0.18) inset,
          0 10px 24px rgba(38, 75, 135, 0.2);
        animation: zenPulse 4s ease-in-out infinite;
      }

      .nav-settings,
      .nav-account {
        border: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
        animation: none !important;
      }

      .btn:hover,
      button.btn:hover,
      .tab:hover,
      .nav-more-btn:hover,
      .nav-settings:hover,
      .nav-account:hover {
        box-shadow:
          0 0 0 1px rgba(100, 150, 240, 0.3) inset,
          0 16px 28px rgba(38, 75, 135, 0.26);
      }

      .nav-settings:hover,
      .nav-account:hover {
        box-shadow: none !important;
        background: transparent !important;
      }

      .nav a:hover,
      .bottom-nav a:hover,
      .nav-more-btn:hover,
      .nav-settings:hover,
      .nav-account:hover {
        background: color-mix(in srgb, var(--zen-purple) 22%, transparent) !important;
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--zen-purple) 58%, #ffffff 42%) inset,
          0 12px 26px color-mix(in srgb, var(--zen-purple) 34%, transparent) !important;
      }

      @media (min-width: 821px) {
        body {
          padding-top: 86px;
        }

        .nav {
          left: 16px !important;
          right: 16px !important;
          top: 14px !important;
          bottom: auto !important;
          width: auto !important;
          height: 62px !important;
          border-right: 0 !important;
          border-radius: 18px !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 10px 14px !important;
          background: linear-gradient(120deg, rgba(12,16,26,0.9), rgba(18,26,42,0.88)) !important;
          box-shadow:
            0 18px 50px rgba(0,0,0,0.32),
            0 0 0 1px rgba(107,155,255,0.22) inset !important;
          overflow: visible;
        }

        .theme-light .nav {
          background: linear-gradient(120deg, rgba(255,255,255,0.94), rgba(242,247,255,0.94)) !important;
          box-shadow:
            0 12px 32px rgba(16,24,40,0.12),
            0 0 0 1px rgba(79,124,255,0.2) inset !important;
        }

        .nav-title {
          margin: 0 8px 0 0 !important;
          min-width: max-content;
          font-size: 1.06rem !important;
        }

        .nav a {
          margin: 0 !important;
          white-space: nowrap;
          padding: 9px 12px !important;
          border-radius: 11px !important;
        }

        .main {
          margin: 0 auto !important;
          width: min(1240px, calc(100% - 36px)) !important;
          max-width: 1240px !important;
          padding-top: 34px !important;
        }

        .nav-more {
          margin-top: 0;
        }

        .nav-more-btn {
          width: auto;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(79,124,255,0.16);
        }

        .nav-quick-controls {
          margin-left: auto;
        }

        .nav-more-menu {
          left: auto;
          right: 0;
          top: calc(100% + 10px);
          transform: translateY(-6px);
          min-width: 220px;
          background: rgba(11,16,27,0.97);
        }

        .theme-light .nav-more-menu {
          background: rgba(255,255,255,0.98);
        }

        .nav-more.open .nav-more-menu,
        .nav-more:hover .nav-more-menu {
          transform: translateY(0);
        }
      }

      @keyframes zenRise {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes zenPopIn {
        0% { opacity: 0; transform: translateY(10px) scale(0.985); filter: blur(1px); }
        65% { opacity: 1; transform: translateY(-2px) scale(1.008); filter: blur(0); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }

      @keyframes zenItemPop {
        0% { opacity: 0; transform: translateY(8px) scale(0.96); }
        60% { opacity: 1; transform: translateY(-1px) scale(1.01); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes zenPulse {
        0%, 100% {
          box-shadow:
            0 0 0 1px rgba(100, 150, 240, 0.18) inset,
            0 10px 24px rgba(38, 75, 135, 0.2);
        }
        50% {
          box-shadow:
            0 0 0 1px rgba(100, 150, 240, 0.3) inset,
            0 14px 30px rgba(38, 75, 135, 0.28);
        }
      }

      @keyframes zenDrift {
        from { transform: translate3d(-1.2%, -0.8%, 0) scale(1); }
        to { transform: translate3d(1.1%, 1.2%, 0) scale(1.03); }
      }

      @keyframes zenGradientFlow {
        0% { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg); }
        25% { opacity: 0.95; transform: translate3d(0.5%, -0.5%, 0) rotate(1deg); }
        50% { opacity: 0.92; transform: translate3d(-0.3%, 0.4%, 0) rotate(-0.5deg); }
        75% { opacity: 0.95; transform: translate3d(0.4%, 0.3%, 0) rotate(0.8deg); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg); }
      }

      @keyframes zenFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }


      @keyframes zenModalIn {
        0% { opacity: 0; transform: translateY(14px) scale(0.96); }
        70% { opacity: 1; transform: translateY(-2px) scale(1.01); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes zenFocusPulse {
        0%, 100% {
          box-shadow:
            0 0 0 1px rgba(100, 150, 240, 0.28) inset,
            0 0 0 0 rgba(100, 150, 240, 0.24);
        }
        50% {
          box-shadow:
            0 0 0 1px rgba(100, 150, 240, 0.42) inset,
            0 0 0 8px rgba(100, 150, 240, 0.1);
        }
      }

    `;
        document.head.appendChild(style);
    }
    function applySettings(s) {
        var _a;
        if (!s)
            return;
        ensureNoAnimStyle();
        document.documentElement.style.setProperty('--accent', s.accent);
        const sizes = { s: '14px', m: '16px', l: '18px' };
        document.body.style.fontSize = sizes[s.fontSize] || '16px';
        document.body.style.filter = s.highContrast ? 'contrast(1.06) saturate(1.02)' : 'none';
        document.documentElement.classList.toggle('high-contrast', !!s.highContrast);
        document.documentElement.classList.toggle('no-anim', !s.animations);
        if (s.theme === 'light') {
            document.documentElement.classList.add('theme-light');
        }
        else if (s.theme === 'dark') {
            document.documentElement.classList.remove('theme-light');
        }
        else {
            const prefersLight = (_a = window.matchMedia) === null || _a === void 0 ? void 0 : _a.call(window, '(prefers-color-scheme: light)').matches;
            document.documentElement.classList.toggle('theme-light', !!prefersLight);
        }
    }
    const settings = loadSettings();
    window.atomSettings = settings;
    applySettings(settings);
    document.addEventListener("atomSettingsSynced", () => { window.atomSettings = loadSettings(); applySettings(window.atomSettings); });
    ensureHoverPillStyle();
    ensureNavMoreStyle();
    ensureNavWeightStyle();
    ensureBottomNavPinnedStyle();
    ensureGlobalFooterStyle();
    ensurePageTransitionStyle();
    ensureModernRefreshStyle();
    // Re-apply theme after DOM is fully loaded to ensure it's applied correctly
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applySettings(loadSettings()));
    }
    function ensurePageShell() {
        if (!document.body)
            return;
        if (document.querySelector('.page-shell'))
            return;
        const shell = document.createElement('div');
        shell.className = 'page-shell';
        const children = Array.from(document.body.childNodes);
        children.forEach((node) => {
            if (!(node instanceof Element))
                return;
            if (node.tagName === 'SCRIPT')
                return;
            if (node.classList.contains('bottom-nav'))
                return;
            if (node.classList.contains('nav'))
                return;
            if (node.classList.contains('overlay'))
                return;
            if (node.classList.contains('hamburger'))
                return;
            if (node.classList.contains('topbar'))
                return;
            shell.appendChild(node);
        });
        document.body.insertBefore(shell, document.body.firstChild);
    }
    if (document.body) {
        document.body.classList.add('page-transition');
        ensurePageShell();
    }
    function finishPageEnter() {
        if (!document.body)
            return;
        if (!document.body.classList.contains('page-enter'))
            return;
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                document.body.classList.remove('page-enter');
            });
        });
    }
    finishPageEnter();
    function navigateWithFade(url) {
        if (!url)
            return;
        if (document.documentElement.classList.contains('no-anim')) {
            window.location.assign(url);
            return;
        }
        if (document.body) {
            document.body.classList.add('page-transition');
            document.body.classList.add('page-leave');
        }
        window.setTimeout(() => window.location.assign(url), 180);
    }
    window.atomNavigate = navigateWithFade;
    const navMore = document.querySelector('[data-nav-more]');
    const navMoreBtn = navMore === null || navMore === void 0 ? void 0 : navMore.querySelector('.nav-more-btn');
    if (navMore && navMoreBtn) {
        navMoreBtn.innerHTML = '<span>Buzzers</span><span aria-hidden="true">&#9662;</span>';
        const menuLinks = navMore.querySelectorAll('.nav-more-menu a');
        menuLinks.forEach((link) => {
            const href = link.getAttribute('href') || '';
            if (href.includes('game_clock.html')) {
                link.innerHTML = '<span class="icon">&#9201;</span><span>Game Clock</span>';
            }
            if (href.includes('buzzer_rooms.html')) {
                link.innerHTML = '<span class="icon">&#128680;</span><span>Buzzer Rooms</span>';
            }
        });
        navMoreBtn.addEventListener('click', (event) => {
            event.preventDefault();
            const isOpen = navMore.classList.toggle('open');
            navMoreBtn.setAttribute('aria-expanded', String(isOpen));
        });
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (!target || !navMore.contains(target)) {
                navMore.classList.remove('open');
                navMoreBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }
    function ensureNavHomeFromTitle() {
        const nav = document.querySelector('.nav');
        if (!nav)
            return;
        const homeLinks = Array.from(nav.querySelectorAll('a[href*="index.html"]'));
        homeLinks.forEach((link) => {
            if (!link.classList.contains('nav-title-link')) {
                link.remove();
            }
        });
        const title = nav.querySelector('.nav-title');
        if (!title)
            return;
        if (title.querySelector('.nav-title-link'))
            return;
        const titleText = (title.textContent || '').trim() || 'Atom Bowl';
        title.textContent = '';
        const titleLink = document.createElement('a');
        titleLink.href = 'index.html';
        titleLink.className = 'nav-title-link';
        titleLink.textContent = titleText;
        title.appendChild(titleLink);
    }
    function ensureAccountLink() {
        const nav = document.querySelector('.nav');
        if (!nav)
            return null;
        let link = nav.querySelector('a[href*="account.html"]');
        if (link) {
            link.classList.add('nav-account');
            link.innerHTML = '<span class="icon" aria-hidden="true">&#128100;</span><span class="label">Account</span>';
            link.setAttribute('aria-label', 'Account');
            link.title = 'Account';
            return link;
        }
        const settingsLink = nav.querySelector('a[href*="settings.html"]');
        link = document.createElement('a');
        link.href = 'account.html';
        link.className = 'nav-account';
        link.innerHTML = '<span class="icon" aria-hidden="true">&#128100;</span><span class="label">Account</span>';
        link.setAttribute('aria-label', 'Account');
        link.title = 'Account';
        if (settingsLink && settingsLink.parentElement === nav) {
            settingsLink.insertAdjacentElement('afterend', link);
        }
        else {
            nav.appendChild(link);
        }
        const path = window.location.pathname || '';
        if (path.endsWith('account.html')) {
            link.classList.add('active');
        }
        return link;
    }
    function ensureSettingsQuickLink() {
        const nav = document.querySelector('.nav');
        if (!nav)
            return null;
        const link = nav.querySelector('a[href*="settings.html"]');
        if (!link)
            return null;
        link.classList.add('nav-settings');
        link.innerHTML = '<span class="icon" aria-hidden="true">&#9881;&#65039;</span><span class="label">Settings</span>';
        link.setAttribute('aria-label', 'Settings');
        link.title = 'Settings';
        const path = window.location.pathname || '';
        if (path.endsWith('settings.html')) {
            link.classList.add('active');
        }
        return link;
    }
    function getNavUsername(account, user) {
        var _a;
        const profile = ((_a = account === null || account === void 0 ? void 0 : account.getProfile) === null || _a === void 0 ? void 0 : _a.call(account)) || null;
        const username = String((profile === null || profile === void 0 ? void 0 : profile.username) || '').trim();
        if (username)
            return username;
        const email = String((user === null || user === void 0 ? void 0 : user.email) || '').trim();
        if (email && email.includes('@'))
            return email.split('@')[0];
        return String((user === null || user === void 0 ? void 0 : user.displayName) || '').trim();
    }
    function updateAccountLinkLabel(link, user, account) {
        if (!link)
            return;
        const label = link.querySelector('.label');
        if (!label)
            return;
        if (user) {
            const name = getNavUsername(account, user);
            const displayName = String(name || 'Account').trim();
            label.textContent = displayName || 'Account';
            link.setAttribute('aria-label', `${displayName || 'Account'} account`);
            link.title = displayName || 'Account';
        }
        else {
            label.textContent = 'Account';
            link.setAttribute('aria-label', 'Account');
            link.title = 'Account';
        }
    }
    function resolveApiBase() {
        let base = '';
        try {
            const params = new URLSearchParams(window.location.search);
            const fromQuery = (params.get('api') || params.get('apiBase') || '').trim();
            if (fromQuery) {
                base = fromQuery;
                localStorage.setItem(API_BASE_KEY, base);
            }
            if (!base) {
                const stored = (localStorage.getItem(API_BASE_KEY) || '').trim();
                if (stored)
                    base = stored;
            }
            if (!base) {
                const host = window.location.hostname || '';
                const isLocalHost = host === 'localhost' || host === '127.0.0.1';
                if (!isLocalHost) {
                    base = 'https://atom-bowl.onrender.com';
                }
            }
        }
        catch { }
        window.ATOM_API_BASE = base;
    }
    resolveApiBase();
    async function bindAccountNav() {
        ensureNavHomeFromTitle();
        const accountLink = ensureAccountLink();
        const settingsLink = ensureSettingsQuickLink();
        const navMoreWrap = document.querySelector('[data-nav-more]');
        if (navMoreWrap && navMoreWrap.parentElement) {
            let controls = navMoreWrap.closest('.nav-quick-controls');
            if (!controls) {
                controls = document.createElement('div');
                controls.className = 'nav-quick-controls';
                navMoreWrap.insertAdjacentElement('beforebegin', controls);
            }
            controls.appendChild(navMoreWrap);
            if (accountLink)
                controls.appendChild(accountLink);
            if (settingsLink)
                controls.appendChild(settingsLink);
        }
        else if (accountLink && settingsLink && settingsLink.previousElementSibling !== accountLink) {
            accountLink.insertAdjacentElement('afterend', settingsLink);
        }
        try {
            await import('./account_store.js');
        }
        catch {
            return;
        }
        const account = window.atomAccount;
        if (!(account === null || account === void 0 ? void 0 : account.onAuthChange))
            return;
        account.onAuthChange((user) => updateAccountLinkLabel(accountLink, user, account));
    }
    bindAccountNav();
    function ensureGlobalFooter() {
        if (document.querySelector('.global-site-footer'))
            return;
        const footer = document.createElement('footer');
        footer.className = 'global-site-footer';
        footer.textContent = 'Made by Sachin Shankar using Github + Firebase + Render';
        document.body.appendChild(footer);
    }
    ensureGlobalFooter();
    const mq = (_a = window.matchMedia) === null || _a === void 0 ? void 0 : _a.call(window, '(prefers-color-scheme: light)');
    if (mq === null || mq === void 0 ? void 0 : mq.addEventListener) {
        mq.addEventListener('change', () => {
            const next = loadSettings();
            if ((next.theme || 'system') === 'system') {
                applySettings(next);
            }
        });
    }
    function handleSameWindowNavigation(event) {
        if (event.defaultPrevented)
            return;
        if (event.button !== 0)
            return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
        const target = event.target;
        const link = target === null || target === void 0 ? void 0 : target.closest('a[href]');
        if (!link)
            return;
        if (link.target === '_blank') {
            link.target = '_self';
        }
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin)
            return;
        const samePage = url.pathname === window.location.pathname
            && url.search === window.location.search
            && url.hash;
        if (samePage)
            return;
        event.preventDefault();
        navigateWithFade(url.href);
    }
    document.addEventListener('click', handleSameWindowNavigation);
})();
// Mobile bottom nav dropdown toggle
function toggleBottomNavMore(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const menu = button.nextElementSibling;
    const isActive = menu.classList.contains('active');
    // Close all other open menus
    document.querySelectorAll('.bottom-nav-more-menu.active').forEach(m => {
        m.classList.remove('active');
    });
    if (!isActive) {
        menu.classList.add('active');
        button.setAttribute('aria-expanded', 'true');
    }
    else {
        button.setAttribute('aria-expanded', 'false');
    }
}
// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target.closest('.bottom-nav-more')) {
        document.querySelectorAll('.bottom-nav-more-menu.active').forEach(menu => {
            menu.classList.remove('active');
            const button = menu.previousElementSibling;
            if (button)
                button.setAttribute('aria-expanded', 'false');
        });
    }
});
// Make the function globally available
window.toggleBottomNavMore = toggleBottomNavMore;
//# sourceMappingURL=common.js.map