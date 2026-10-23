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
    // Required by existing onclick handlers in index.html cards.
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
        go('practice.html');
    }
    function pdfEscape(input) {
        return input.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }
    function wrapText(text, maxLen) {
        const normalized = text.replace(/\s+/g, ' ').trim();
        if (!normalized)
            return [''];
        const words = normalized.split(' ');
        const lines = [];
        let current = '';
        for (const word of words) {
            if (!current) {
                current = word;
                continue;
            }
            if ((current + ' ' + word).length <= maxLen) {
                current += ' ' + word;
            }
            else {
                lines.push(current);
                current = word;
            }
        }
        if (current)
            lines.push(current);
        return lines;
    }
    function lineBlocks(label, text, maxLen) {
        const chunks = text.split('\n').map((line) => line.trim()).filter(Boolean);
        if (!chunks.length)
            return [label];
        const out = [];
        chunks.forEach((chunk, idx) => {
            const wrapped = wrapText(chunk, maxLen);
            wrapped.forEach((line, lineIdx) => {
                if (idx === 0 && lineIdx === 0) {
                    out.push(`${label} ${line}`);
                }
                else {
                    out.push(`   ${line}`);
                }
            });
        });
        return out;
    }
    function estimateTextWidth(text, size) {
        return text.length * size * 0.48;
    }
    function buildRoundLines(questions) {
        const lines = [];
        const now = new Date().toLocaleString();
        const meta = questions[0] || {};
        const roundName = meta.round_name && meta.round_name.toLowerCase() !== 'mixed'
            ? meta.round_name
            : 'Full Round';
        lines.push({ text: 'Atom Bowl Practice Set', font: 'F2', size: 20, align: 'center', gapAfter: 8 });
        lines.push({ text: `Round: ${roundName}`, font: 'F2', size: 13, align: 'center', gapAfter: 4 });
        lines.push({ text: `Generated: ${now}`, font: 'F1', size: 10, align: 'center', gapAfter: 14 });
        questions.forEach((q, idx) => {
            const qType = q.type || 'Q';
            const qBonus = q.bonus ? 'Bonus' : 'Toss-up';
            const qLevel = q.level || 'ANY';
            const qCategory = q.category || 'GENERAL SCIENCE';
            lines.push({ text: qCategory, font: 'F3', size: 13, align: 'center', gapAfter: 2 });
            lines.push({ text: `${idx + 1}. ${qType} | ${qBonus} | ${qLevel}`, font: 'F2', size: 11, align: 'left', gapAfter: 2 });
            lineBlocks('Q:', q.question_text || '', 95).forEach((line) => {
                lines.push({ text: line, font: 'F1', size: 10, align: 'left' });
            });
            lineBlocks('A:', q.parsed_answer || '', 95).forEach((line) => {
                lines.push({ text: line, font: 'F2', size: 10, align: 'left' });
            });
            lines.push({ text: '', font: 'F1', size: 10, align: 'left', gapAfter: 4 });
        });
        return lines;
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
          <p class="muted">25 toss-up and bonus pairs as a printable PDF. Choose a division.</p>
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
    function makePdf(lines) {
        const pageWidth = 612;
        const topY = 760;
        const bottomY = 50;
        const leftX = 45;
        const pages = [];
        let y = topY;
        let currentPageOps = [];
        function pushPage() {
            pages.push(currentPageOps.join('\n'));
            currentPageOps = [];
            y = topY;
        }
        lines.forEach((line) => {
            const lineHeight = line.size + 4 + (line.gapAfter || 0);
            if (y - lineHeight < bottomY && currentPageOps.length) {
                pushPage();
            }
            const width = estimateTextWidth(line.text, line.size);
            const x = line.align === 'center'
                ? Math.max(leftX, Math.round((pageWidth - width) / 2))
                : leftX;
            currentPageOps.push(`BT /${line.font} ${line.size} Tf ${x} ${y} Td (${pdfEscape(line.text)}) Tj ET`);
            y -= lineHeight;
        });
        if (currentPageOps.length) {
            pushPage();
        }
        const objects = [];
        const pageObjectIds = [];
        const pageCount = pages.length;
        const firstPageObjId = 3;
        const firstContentObjId = 4;
        const fontRegularId = firstPageObjId + pageCount * 2;
        const fontBoldId = fontRegularId + 1;
        const fontItalicId = fontRegularId + 2;
        pages.forEach((content, index) => {
            const pageId = firstPageObjId + index * 2;
            const contentId = firstContentObjId + index * 2;
            pageObjectIds.push(pageId);
            objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontItalicId} 0 R >> >> /Contents ${contentId} 0 R >>`;
            objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
        });
        objects[fontRegularId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
        objects[fontBoldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
        objects[fontItalicId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>';
        const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
        objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageObjectIds.length} >>`;
        const header = '%PDF-1.4\n';
        let body = '';
        const offsets = [0];
        const totalObjects = fontItalicId;
        for (let id = 1; id <= totalObjects; id += 1) {
            offsets[id] = header.length + body.length;
            body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
        }
        const xrefOffset = header.length + body.length;
        let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
        for (let id = 1; id <= totalObjects; id += 1) {
            xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
        }
        const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
        const pdf = header + body + xref + trailer;
        return new Blob([pdf], { type: 'application/pdf' });
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
            const pdfBlob = makePdf(buildRoundLines(round));
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'atom-bowl-practice-set.pdf';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setStatus(`Downloaded a ${division === 'MS' ? 'middle school' : 'high school'} set: 25 toss-up and bonus pairs.`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to generate PDF.';
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