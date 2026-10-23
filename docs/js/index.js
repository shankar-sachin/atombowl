document.addEventListener('DOMContentLoaded', () => {
    const startNowBtn = document.getElementById('startNowBtn');
    const downloadPracticeSetBtn = document.getElementById('downloadPracticeSetBtn');
    const homeActionStatus = document.getElementById('homeActionStatus');
    function setStatus(message, isError = false) {
        if (!homeActionStatus)
            return;
        homeActionStatus.textContent = message;
        homeActionStatus.classList.toggle('error', isError);
    }
    function go(page) {
        if (window.atomNavigate) {
            window.atomNavigate(page);
            return;
        }
        window.location.href = page;
    }
    // Required by existing onclick handlers in / cards.
    window.go = go;
    function startNow() {
        const defaultRun = {
            mode: 'rapid',
            level: 'ANY',
            categories: [],
            detailedCategories: [],
            qaType: 'ANY',
            bonus: 'ANY',
            count: 25,
            seconds: 10,
            noTimer: true,
            setName: '',
            roundName: '',
            bankFile: 'data/set_B.json',
        };
        localStorage.setItem('atom_run', JSON.stringify(defaultRun));
        go('/practice');
    }
    function pickDivisionPopup() {
        return new Promise((resolve) => {
            var _a;
            const overlayEl = document.createElement('div');
            overlayEl.className = 'modal';
            overlayEl.setAttribute('role', 'dialog');
            overlayEl.setAttribute('aria-modal', 'true');
            overlayEl.setAttribute('aria-labelledby', 'divisionTitle');
            overlayEl.innerHTML = `
        <div class="modal-card division-card">
          <div class="modal-header">
            <h2 id="divisionTitle">Download a practice set</h2>
          </div>
          <p class="muted">25 toss-up and bonus pairs, typeset with LaTeX math, in one ZIP: a PDF, the .tex source and a Word file. Choose a division.</p>
          <div class="division-choices">
            <button class="btn large" type="button" data-division="MS">Middle school</button>
            <button class="btn large" type="button" data-division="HS">High school</button>
          </div>
          <button class="btn quiet" type="button" data-division="">Cancel</button>
        </div>`;
            const cleanup = (result) => {
                document.removeEventListener('keydown', onKey);
                overlayEl.remove();
                downloadPracticeSetBtn === null || downloadPracticeSetBtn === void 0 ? void 0 : downloadPracticeSetBtn.focus();
                resolve(result);
            };
            const onKey = (event) => {
                if (event.key === 'Escape')
                    cleanup(null);
            };
            overlayEl.addEventListener('click', (event) => {
                const target = event.target;
                if (target === overlayEl)
                    return cleanup(null);
                const choice = target.closest('[data-division]');
                if (choice)
                    cleanup(choice.dataset.division || null);
            });
            document.addEventListener('keydown', onKey);
            document.body.append(overlayEl);
            (_a = overlayEl.querySelector('[data-division="MS"]')) === null || _a === void 0 ? void 0 : _a.focus();
        });
    }
    function chooseRoundPairs(bank, division) {
        const filtered = bank.filter((q) => (q.level || '').toUpperCase() === division);
        const pairs = [];
        let pendingTossup = null;
        filtered.forEach((q) => {
            if (q.bonus) {
                if (pendingTossup) {
                    pairs.push({ tossup: pendingTossup, bonus: q });
                    pendingTossup = null;
                }
                return;
            }
            pendingTossup = q;
        });
        if (pairs.length < 25) {
            throw new Error(`Not enough ${division} toss-up/bonus pairs in this bank.`);
        }
        const selectedPairs = pairs.slice(0, 25);
        const round = [];
        selectedPairs.forEach((pair) => {
            round.push(pair.tossup, pair.bonus);
        });
        return round;
    }
    async function downloadPracticeSet() {
        if (!downloadPracticeSetBtn)
            return;
        downloadPracticeSetBtn.disabled = true;
        setStatus('Building your practice set…');
        try {
            const res = await fetch('./data/set_B.json', { cache: 'no-store' });
            if (!res.ok) {
                throw new Error('Unable to load default question bank.');
            }
            const data = await res.json();
            const bank = Array.isArray(data) ? data : (Array.isArray(data === null || data === void 0 ? void 0 : data.questions) ? data.questions : []);
            if (!bank.length) {
                throw new Error('Question bank is empty.');
            }
            const division = await pickDivisionPopup();
            if (!division) {
                setStatus('Download canceled.');
                return;
            }
            const round = chooseRoundPairs(bank, division);
            if (!round.length) {
                throw new Error('Could not build a full round.');
            }
            if (!window.atomPacket) {
                throw new Error('The download tools did not load. Refresh and try again.');
            }
            await window.atomPacket.download({ division, createdAt: Date.now(), questions: round }, (message) => setStatus(message));
            setStatus(`Downloaded a ${division === 'MS' ? 'middle school' : 'high school'} set: 25 toss-up and bonus pairs as a PDF, LaTeX and Word file.`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Could not build the practice set.';
            setStatus(message, true);
        }
        finally {
            downloadPracticeSetBtn.disabled = false;
        }
    }
    startNowBtn === null || startNowBtn === void 0 ? void 0 : startNowBtn.addEventListener('click', startNow);
    downloadPracticeSetBtn === null || downloadPracticeSetBtn === void 0 ? void 0 : downloadPracticeSetBtn.addEventListener('click', () => {
        void downloadPracticeSet();
    });
});
//# sourceMappingURL=index.js.map