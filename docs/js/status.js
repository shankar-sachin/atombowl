// Status page (/status): polls the `ai` function's public `health` action once a minute.
// It posts the callable protocol by hand ({data} in, {result} out) so it needs no Firebase SDK
// and still loads when the rest of the AI stack is broken.
(() => {
    const PROD_URL = 'https://us-central1-nsbatombowl.cloudfunctions.net/ai';
    const EMULATOR_URL = 'http://127.0.0.1:5001/nsbatombowl/us-central1/ai';
    const REFRESH_MS = 60 * 1000;
    const TIMEOUT_MS = 15 * 1000;
    // Same switch as firebase.ts: ?emulators=1 on localhost, remembered for the tab.
    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const flag = new URLSearchParams(location.search).get('emulators');
    if (isLocalHost && flag !== null)
        sessionStorage.setItem('atom_emulators', flag === '1' ? '1' : '0');
    const endpoint = isLocalHost && sessionStorage.getItem('atom_emulators') === '1' ? EMULATOR_URL : PROD_URL;
    const PROVIDER_NAMES = { groq: 'Groq', gemini: 'Google Gemini' };
    const LABELS = { ok: 'Operational', degraded: 'Degraded', down: 'Down', checking: 'Checking' };
    const banner = document.getElementById('statusBanner');
    const headline = document.getElementById('statusHeadline');
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
    function setBanner(state, text) {
        banner.dataset.state = state;
        headline.textContent = text;
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
        var _a, _b;
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
            const followUp = ((_b = health.models) === null || _b === void 0 ? void 0 : _b.followUp) || main;
            setRow('function', 'ok', `Responded in ${health.latencyMs} ms`);
            setRow('provider', health.ok ? 'ok' : main.ok || followUp.ok ? 'degraded' : 'down', health.ok ? `${provider}, ${main.id}` : `${provider}: ${(main.ok ? followUp : main).detail || 'not responding'}`);
            setRow('generate', main.ok ? 'ok' : 'down');
            setRow('tutor', main.ok && followUp.ok ? 'ok' : main.ok || followUp.ok ? 'degraded' : 'down');
            if (health.ok)
                setBanner('ok', 'All AI features are working');
            else if (main.ok || followUp.ok)
                setBanner('degraded', 'Some AI features are having trouble. We are fixing it.');
            else
                setBanner('down', 'Tutor and Generate are down. We are fixing it.');
            stamp(health.checkedAt);
        }
        catch {
            const offline = navigator.onLine === false;
            setRow('function', offline ? 'checking' : 'down', offline ? 'You appear to be offline' : 'Not responding');
            ['provider', 'tutor', 'generate'].forEach((name) => setRow(name, offline ? 'checking' : 'down'));
            setBanner(offline ? 'checking' : 'down', offline
                ? "You're offline, so the status can't be checked"
                : 'Tutor and Generate are down. We are fixing it.');
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