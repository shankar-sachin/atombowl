// @ts-nocheck
// Practice round download: one ZIP with the round as a KaTeX-typeset PDF, its LaTeX source
// and a Word document with native equations. Everything runs in the browser; the libraries
// load from jsDelivr the first time someone downloads.
(function () {
    'use strict';
    const CDN = 'https://cdn.jsdelivr.net/npm';
    const KATEX = `${CDN}/katex@0.16.11/dist`;
    const LIBS = {
        jspdf: `${CDN}/jspdf@4.2.1/dist/jspdf.umd.min.js`,
        htmlToImage: `${CDN}/html-to-image@1.11.13/dist/html-to-image.js`,
        fflate: `${CDN}/fflate@0.8.2/esm/browser.js`,
        mml2omml: `${CDN}/mathml2omml@0.5.0/dist/index.esm.js`,
    };
    // US Letter at 96 CSS px per inch; rendered at 2x for print-quality pages.
    const PAGE_W = 816;
    const PAGE_H = 1056;
    const PIXEL_RATIO = 2;
    const tex = () => window.atomRoundTex;
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const escapeXml = (s) => String(s)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
        .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // ---- Loading ----
    const scripts = {};
    function loadScript(src) {
        if (!scripts[src]) {
            scripts[src] = new Promise((resolve, reject) => {
                const el = document.createElement('script');
                el.src = src;
                el.onload = resolve;
                el.onerror = reject;
                document.head.appendChild(el);
            });
        }
        return scripts[src];
    }
    function loadStyle(href) {
        const existing = document.querySelector(`link[href="${href}"]`);
        if (existing)
            return Promise.resolve();
        return new Promise((resolve) => {
            const el = document.createElement('link');
            el.rel = 'stylesheet';
            el.href = href;
            el.onload = resolve;
            el.onerror = resolve;
            document.head.appendChild(el);
        });
    }
    async function loadLibraries() {
        const [katex, fflate, omml] = await Promise.all([
            import(`${KATEX}/katex.mjs`).then((mod) => mod.default || mod),
            import(LIBS.fflate),
            import(LIBS.mml2omml),
            loadScript(LIBS.jspdf),
            loadScript(LIBS.htmlToImage),
            loadStyle(`${KATEX}/katex.min.css`),
            loadStyle('css/packet.css'),
        ]).catch(() => {
            throw new Error('Could not load the typesetting tools. Check your connection and try again.');
        });
        return { katex, fflate, mml2omml: omml.mml2omml, jsPDF: window.jspdf.jsPDF, htmlToImage: window.htmlToImage };
    }
    // ---- Shared layout ----
    function datedLabel(packet) {
        const date = new Date(packet.createdAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const pairs = Math.ceil(packet.questions.length / 2);
        return `${tex().divisionLabel(packet.division)} · ${pairs} toss-ups and bonuses · ${date}`;
    }
    // Toss-up and bonus share a number, like a printed NSB packet.
    function pairsOf(packet) {
        const q = packet.questions;
        const pairs = [];
        for (let i = 0; i < q.length; i += 2) {
            pairs.push([['Toss-up', q[i]], ['Bonus', q[i + 1]]].filter(([, item]) => item));
        }
        return pairs;
    }
    // ---- PDF ----
    function lineHtml(line, katex) {
        return tex().segments(line).map((s) => {
            if (!s.math)
                return escapeHtml(s.text);
            return katex.renderToString(s.tex, { displayMode: s.display, throwOnError: false, output: 'html' });
        }).join('');
    }
    // Multiple choice options sit on their own lines under the stem.
    function blockHtml(text, katex) {
        const [first = '', ...rest] = tex().lines(text);
        return lineHtml(first, katex) + rest.map((line) => `<span class="pk-line">${lineHtml(line, katex)}</span>`).join('');
    }
    function questionHtml(label, q, number, katex) {
        return `
      <section class="pk-question">
        <h3 class="pk-kind">${label}</h3>
        <p class="pk-stem"><b class="pk-num">${number})</b> <i class="pk-meta">${escapeHtml(tex().categoryLabel(q.category))} – ${escapeHtml(tex().typeLabel(q.type))}</i> ${blockHtml(q.question_text, katex)}</p>
        <p class="pk-answer"><b>Answer:</b> ${blockHtml(q.parsed_answer, katex)}</p>
      </section>`;
    }
    function newPage(host, packet) {
        const page = document.createElement('div');
        page.className = 'pk-page';
        page.innerHTML = `<div class="pk-body"></div><footer class="pk-foot"><span>Atom Bowl practice round · ${escapeHtml(tex().divisionLabel(packet.division))}</span><span class="pk-page-num"></span></footer>`;
        host.appendChild(page);
        return page;
    }
    const overflows = (body) => body.scrollHeight > body.clientHeight + 1;
    // Flows pairs onto Letter-sized pages without splitting a question across pages.
    function paginate(host, packet, katex) {
        const blocks = [`<header class="pk-head"><p class="pk-brand">Atom Bowl</p><h1>Practice round</h1><p class="pk-sub">${escapeHtml(datedLabel(packet))}</p></header>`];
        pairsOf(packet).forEach((pair, i) => {
            blocks.push(`<div class="pk-pair">${pair.map(([label, q]) => questionHtml(label, q, i + 1, katex)).join('')}</div>`);
        });
        let page = newPage(host, packet);
        let body = page.querySelector('.pk-body');
        blocks.forEach((html) => {
            body.insertAdjacentHTML('beforeend', html);
            if (!overflows(body) || body.children.length === 1)
                return;
            const block = body.lastElementChild;
            page = newPage(host, packet);
            body = page.querySelector('.pk-body');
            body.appendChild(block);
            // A pair taller than a page goes one question per page instead.
            if (overflows(body) && block.children.length > 1) {
                const bonus = block.lastElementChild;
                page = newPage(host, packet);
                body = page.querySelector('.pk-body');
                const rest = document.createElement('div');
                rest.className = 'pk-pair';
                rest.appendChild(bonus);
                body.appendChild(rest);
            }
        });
        const pages = [...host.querySelectorAll('.pk-page')];
        pages.forEach((p, i) => { p.querySelector('.pk-page-num').textContent = `Page ${i + 1} of ${pages.length}`; });
        return pages;
    }
    async function buildPdf(packet, libs, progress) {
        const host = document.createElement('div');
        host.className = 'pk-host';
        host.setAttribute('aria-hidden', 'true');
        document.body.appendChild(host);
        try {
            const pages = paginate(host, packet, libs.katex);
            await document.fonts.ready;
            const fontEmbedCSS = await libs.htmlToImage.getFontEmbedCSS(host);
            const pdf = new libs.jsPDF({ unit: 'pt', format: 'letter', compress: true });
            pdf.setProperties({ title: `Atom Bowl practice round (${tex().divisionLabel(packet.division).toLowerCase()})`, creator: 'Atom Bowl' });
            for (let i = 0; i < pages.length; i += 1) {
                progress(`Rendering PDF page ${i + 1} of ${pages.length}…`);
                const image = await libs.htmlToImage.toJpeg(pages[i], {
                    quality: 0.92, pixelRatio: PIXEL_RATIO, backgroundColor: '#ffffff', width: PAGE_W, height: PAGE_H, fontEmbedCSS,
                });
                if (i > 0)
                    pdf.addPage('letter', 'portrait');
                pdf.addImage(image, 'JPEG', 0, 0, 612, 792, undefined, 'FAST');
            }
            return new Uint8Array(pdf.output('arraybuffer'));
        }
        finally {
            host.remove();
        }
    }
    // ---- DOCX ----
    const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    function run(text, props = '') {
        return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
    }
    function mathXml(segment, libs) {
        try {
            const html = libs.katex.renderToString(segment.tex, { displayMode: false, throwOnError: true, output: 'mathml' });
            const mathml = (html.match(/<math[\s\S]*<\/math>/) || [''])[0].replace(/<annotation[\s\S]*?<\/annotation>/g, '');
            const omml = mathml && libs.mml2omml(mathml);
            if (omml && omml.includes('<m:oMath'))
                return omml;
        }
        catch { }
        return run(segment.raw || segment.tex);
    }
    function lineXml(line, libs) {
        return tex().segments(line).map((s) => (s.math ? mathXml(s, libs) : run(s.text))).join('');
    }
    function para(content, { align = '', indent = false, keepNext = false, style = '', border = false } = {}) {
        const props = [
            style && `<w:pStyle w:val="${style}"/>`,
            keepNext && '<w:keepNext/>',
            border && '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="8" w:color="9AA3B5"/></w:pBdr>',
            indent && '<w:ind w:left="720"/>',
            align && `<w:jc w:val="${align}"/>`,
        ].filter(Boolean).join('');
        return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${content}</w:p>`;
    }
    function documentXml(packet, libs) {
        const body = [
            para(run('Atom Bowl practice round'), { style: 'Title', align: 'center' }),
            para(run(datedLabel(packet), '<w:color w:val="55617A"/>'), { align: 'center' }),
        ];
        pairsOf(packet).forEach((pair, i) => {
            pair.forEach(([label, q], j) => {
                const [first = '', ...options] = tex().lines(q.question_text);
                const meta = `${tex().categoryLabel(q.category)} – ${tex().typeLabel(q.type)}`;
                const [answer = '', ...answerRest] = tex().lines(q.parsed_answer);
                const last = j === pair.length - 1;
                body.push(para(run(label, '<w:b/>'), { align: 'center', keepNext: true, style: 'Heading2' }));
                body.push(para(run(`${i + 1}) `, '<w:b/>') + run(`${meta} `, '<w:i/>') + lineXml(first, libs), { keepNext: true }));
                options.forEach((line) => body.push(para(lineXml(line, libs), { indent: true, keepNext: true })));
                body.push(para(run('Answer: ', '<w:b/>') + lineXml(answer, libs), { keepNext: answerRest.length > 0 || !last, border: last && !answerRest.length }));
                answerRest.forEach((line, k) => body.push(para(lineXml(line, libs), { keepNext: !last || k < answerRest.length - 1, border: last && k === answerRest.length - 1 })));
            });
        });
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    }
    const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Source Serif 4" w:hAnsi="Source Serif 4" w:cs="Source Serif 4" w:eastAsia="Source Serif 4"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="111827"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
</w:styles>`;
    function buildDocx(packet, libs) {
        const { zipSync, strToU8 } = libs.fflate;
        return zipSync({
            '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
            '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
            'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
            'word/document.xml': strToU8(documentXml(packet, libs)),
            'word/styles.xml': strToU8(STYLES_XML),
        });
    }
    // ---- ZIP ----
    async function download(packet, progress = () => { }) {
        progress('Loading typesetting tools…');
        const libs = await loadLibraries();
        const name = `atom-bowl-round-${String(packet.division || 'mixed').toLowerCase()}`;
        const pdf = await buildPdf(packet, libs, progress);
        progress('Writing the LaTeX and Word files…');
        const { zipSync, strToU8 } = libs.fflate;
        const zip = zipSync({
            [`${name}.pdf`]: [pdf, { level: 0 }],
            [`${name}.tex`]: strToU8(tex().roundToTex(packet)),
            [`${name}.docx`]: [buildDocx(packet, libs), { level: 0 }],
        });
        const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    window.atomPacket = { download };
})();
//# sourceMappingURL=packet.js.map