// Status page (/status): polls the `ai` endpoint's public `health` action every 10 seconds.
// It posts the callable protocol by hand ({data} in, {result} out) so it needs no Firebase SDK
// and still loads when the rest of the SI stack is broken.
(() => {
    // Same as AI_URL in ai_client.ts: the Vercel function (functions/api/ai.js).
    const PROD_URL = 'https://atombowl-ai.vercel.app/api/ai';
    const EMULATOR_URL = 'http://127.0.0.1:5001/nsbatombowl/us-central1/ai';
    const REFRESH_MS = 10 * 1000;
    const TIMEOUT_MS = 15 * 1000;
    // Same switch as firebase.ts: ?emulators=1 on localhost, remembered for the tab.
    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const flag = new URLSearchParams(location.search).get('emulators');
    if (isLocalHost && flag !== null)
        sessionStorage.setItem('atom_emulators', flag === '1' ? '1' : '0');
    const endpoint = isLocalHost && sessionStorage.getItem('atom_emulators') === '1' ? EMULATOR_URL : PROD_URL;
    const PROVIDER_NAMES = { anthropic: 'Claude', groq: 'Groq', gemini: 'Google Gemini' };
    const LABELS = { ok: 'Operational', degraded: 'Degraded', down: 'Down', checking: 'Checking' };
    const banner = document.getElementById('statusBanner');
    const headline = document.getElementById('statusHeadline');
    const infoBtn = document.getElementById('statusInfoBtn');
    const infoText = document.getElementById('statusInfo');
    infoBtn.addEventListener('click', () => {
        const open = infoText.hidden;
        infoText.hidden = !open;
        infoBtn.setAttribute('aria-expanded', String(open));
    });
    const checked = document.getElementById('statusChecked');
    const refreshBtn = document.getElementById('statusRefresh');
    const rows = {};
    document.querySelectorAll('#statusList [data-service]').forEach((li) => {
        rows[li.dataset.service] = li;
    });
    function setRow(name, state, detail) {
        const li = rows[name];
        if (!li)
            return;
        const pill = li.querySelector('.status-pill');
        pill.dataset.state = state;
        pill.textContent = LABELS[state];
        const desc = li.querySelector('[data-detail]');
        if (desc && detail)
            desc.textContent = detail;
    }
    // The (i) button shows `info` under the headline; without info both are hidden.
    function setBanner(state, text, info = '') {
        banner.dataset.state = state;
        headline.textContent = text;
        infoBtn.hidden = !info;
        infoText.textContent = info;
        if (!info) {
            infoText.hidden = true;
            infoBtn.setAttribute('aria-expanded', 'false');
        }
    }
    function stamp(iso) {
        const when = iso ? new Date(iso) : new Date();
        checked.textContent = `Last checked ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
    }
    async function fetchHealth() {
        var _a;
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ data: { action: 'health' } }),
                signal: controller.signal
            });
            const body = await res.json().catch(() => null);
            if (!res.ok || !(body === null || body === void 0 ? void 0 : body.result))
                throw new Error(((_a = body === null || body === void 0 ? void 0 : body.error) === null || _a === void 0 ? void 0 : _a.message) || `HTTP ${res.status}`);
            return body.result;
        }
        finally {
            window.clearTimeout(timer);
        }
    }
    let running = false;
    async function check() {
        var _a, _b, _c;
        if (running)
            return;
        running = true;
        refreshBtn.disabled = true;
        if (banner.dataset.state === 'checking')
            setBanner('checking', 'Checking…');
        try {
            const health = await fetchHealth();
            const provider = PROVIDER_NAMES[health.provider] || health.provider;
            const main = ((_a = health.models) === null || _a === void 0 ? void 0 : _a.main) || { id: health.model, ok: health.ok };
            // Follow-ups and Extra thinking both belong to Tutor, so show whichever of them is failing.
            const followUpOnly = ((_b = health.models) === null || _b === void 0 ? void 0 : _b.followUp) || main;
            const thinking = ((_c = health.models) === null || _c === void 0 ? void 0 : _c.thinking) || main;
            const followUp = followUpOnly.ok ? thinking : followUpOnly;
            setRow('function', 'ok', `Responded in ${health.latencyMs} ms`);
            setRow('provider', health.ok ? 'ok' : main.ok || followUp.ok ? 'degraded' : 'down', health.ok ? `${provider} API` : `${provider}: ${(main.ok ? followUp : main).detail || 'not responding'}`);
            setRow('generate', main.ok ? 'ok' : 'down');
            setRow('tutor', main.ok && followUp.ok ? 'ok' : main.ok || followUp.ok ? 'degraded' : 'down');
            if (health.ok)
                setBanner('ok', 'All SI features are working');
            else if (main.ok || followUp.ok)
                setBanner('degraded', 'Some SI features are having trouble. We are fixing it.');
            else
                setBanner('down', 'Tutor and Generate are down. We are fixing it.');
            stamp(health.checkedAt);
        }
        catch {
            const offline = navigator.onLine === false;
            // From here a blocked network looks the same as an outage, so name both.
            setRow('function', offline ? 'checking' : 'down', offline ? 'You appear to be offline' : 'Not responding from this network');
            ['provider', 'tutor', 'generate'].forEach((name) => setRow(name, offline ? 'checking' : 'down'));
            setBanner(offline ? 'checking' : 'down', offline
                ? "You're offline, so the status can't be checked"
                : 'Tutor and Generate are down', offline ? '' : "If you're on a school or work network, it may block AI sites, so this page can't reach the server. Otherwise they really are down and we're fixing it.");
            stamp();
        }
        finally {
            running = false;
            refreshBtn.disabled = false;
        }
    }
    refreshBtn.addEventListener('click', check);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible')
            check();
    });
    window.setInterval(() => {
        if (document.visibilityState === 'visible')
            check();
    }, REFRESH_MS);
    check();
})();
//# sourceMappingURL=status.js.map