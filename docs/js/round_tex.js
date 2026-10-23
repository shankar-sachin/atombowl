// @ts-nocheck
// Round packets as LaTeX: the bank writes math as AsciiMath in backticks (`(8 xx 10^7)/2`),
// so this turns it into LaTeX for KaTeX on the packet page and for the .tex download.
(function () {
    'use strict';
    const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
        'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi',
        'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'];
    const FUNCTIONS = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos',
        'arctan', 'log', 'ln', 'exp', 'det', 'min', 'max', 'gcd', 'lim'];
    const SYMBOLS = {
        'xx': '\\times', '**': '\\ast', '*': '\\cdot', '-:': '\\div', '+-': '\\pm', '-+': '\\mp',
        '<=': '\\le', '>=': '\\ge', '!=': '\\ne', '~~': '\\approx', '~=': '\\cong', '-=': '\\equiv',
        '->': '\\to', '=>': '\\Rightarrow', '<=>': '\\Leftrightarrow', '|->': '\\mapsto',
        'oo': '\\infty', 'deg': '^\\circ', '/_': '\\angle',
        '...': '\\ldots', 'cdots': '\\cdots', 'uu': '\\cup', 'nn': '\\cap',
        'sum': '\\sum', 'prod': '\\prod', 'int': '\\int', 'oint': '\\oint',
        'arcsec': '\\operatorname{arcsec}', 'arccsc': '\\operatorname{arccsc}', 'arccot': '\\operatorname{arccot}',
        'lcm': '\\operatorname{lcm}',
        'cdot': '\\cdot', 'times': '\\times', 'div': '\\div', 'pm': '\\pm', 'le': '\\le', 'ge': '\\ge',
        'ne': '\\ne', 'approx': '\\approx', 'infty': '\\infty', 'circ': '\\circ', 'partial': '\\partial',
        '%': '\\%', '&': '\\&', '#': '\\#', '$': '\\$', '~': '\\sim',
        '×': '\\times', '·': '\\cdot', '÷': '\\div', '±': '\\pm', '≤': '\\le', '≥': '\\ge', '≠': '\\ne',
        '≈': '\\approx', '°': '^\\circ', 'º': '^\\circ', '∞': '\\infty', '∂': '\\partial', '∆': '\\Delta',
        'Δ': '\\Delta', 'π': '\\pi', '𝜋': '\\pi', 'θ': '\\theta', 'λ': '\\lambda', 'µ': '\\mu', 'μ': '\\mu',
        'ω': '\\omega', 'Ω': '\\Omega', 'Π': '\\Pi', 'τ': '\\tau', '’': "'",
    };
    GREEK.forEach((name) => { SYMBOLS[name] = `\\${name}`; });
    FUNCTIONS.forEach((name) => { SYMBOLS[name] = `\\${name}`; });
    const UNARY = {
        sqrt: '\\sqrt', '√': '\\sqrt', abs: 'abs', text: 'text', bar: '\\overline', vec: '\\vec', hat: '\\hat',
        dot: '\\dot', ddot: '\\ddot',
    };
    const BINARY = { frac: 'frac', root: 'root' };
    const WORDS = new Set(['and', 'or', 'if', 'for', 'then', 'where']);
    // Answers are often all caps (`4 XX 10^5`, `SQRT(5)`): these names still read as math there.
    const UPPER_NAMES = new Set(['xx', 'sqrt', 'root', 'pi', 'theta', 'alpha', 'lambda', 'phi', 'omega', 'sin', 'cos',
        'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'lim', 'oo', 'int', 'sum', 'deg']);
    const NAMES = Object.keys(SYMBOLS).concat(Object.keys(UNARY), Object.keys(BINARY)).sort((a, b) => b.length - a.length);
    const LEFT = { '(': '(', '[': '[', '{': '\\{' };
    const RIGHT = { ')': ')', ']': ']', '}': '\\}' };
    // A backtick span that is really a sentence ("the fraction with numerator x squared") stays text.
    const PROSE = /\b(the|of|with|find|equals|plus|squared|numerator|denominator|fraction|quantity)\b/gi;
    function nameToken(name) {
        if (UNARY[name])
            return { t: 'un', v: UNARY[name] };
        if (BINARY[name])
            return { t: 'bin', v: BINARY[name] };
        return { t: 'sym', v: SYMBOLS[name] };
    }
    // Split a run of letters the way AsciiMath does: the longest known name at each spot, else one letter.
    function letterTokens(run, upper) {
        if (WORDS.has(run.toLowerCase()) && (!upper || run === run.toUpperCase()))
            return [{ t: 'sym', v: `\\text{ ${run.toLowerCase()} }` }];
        const out = [];
        let i = 0;
        while (i < run.length) {
            const rest = run.slice(i);
            let match = NAMES.find((name) => /^[a-z]/i.test(name) && rest.startsWith(name));
            if (!match && upper)
                match = NAMES.find((name) => UPPER_NAMES.has(name) && rest.toLowerCase().startsWith(name));
            if (match) {
                out.push(nameToken(match));
                i += match.length;
            }
            else {
                out.push({ t: 'var', v: run[i] });
                i += 1;
            }
        }
        return out;
    }
    function tokenize(src, upper) {
        const tokens = [];
        let i = 0;
        while (i < src.length) {
            const ch = src[i];
            const rest = src.slice(i);
            if (/\s/.test(ch)) {
                i += 1;
                continue;
            }
            if (ch === '"') {
                const end = src.indexOf('"', i + 1);
                const stop = end < 0 ? src.length : end;
                tokens.push({ t: 'sym', v: `\\text{${src.slice(i + 1, stop)}}` });
                i = stop + 1;
                continue;
            }
            const textCall = /^text\s*\(([^)]*)\)/.exec(rest);
            if (textCall) {
                tokens.push({ t: 'sym', v: `\\text{${textCall[1]}}` });
                i += textCall[0].length;
                continue;
            }
            const num = /^(\d+(?:,\d{3})+(?!\d)|\d+)(\.\d+)?|^\.\d+/.exec(rest);
            if (num) {
                tokens.push({ t: 'num', v: num[0].replace(/,/g, '{,}') });
                i += num[0].length;
                continue;
            }
            const command = /^\\([A-Za-z]+)/.exec(rest);
            if (command) {
                const name = command[1];
                const known = [name, name.toLowerCase()].find((n) => n in SYMBOLS || n in UNARY || n in BINARY);
                tokens.push(known ? nameToken(known) : { t: 'sym', v: `\\${name}` });
                i += command[0].length;
                continue;
            }
            const letters = /^[A-Za-z]+/.exec(rest);
            if (letters) {
                tokens.push(...letterTokens(letters[0], upper));
                i += letters[0].length;
                continue;
            }
            const symbol = NAMES.find((name) => !/^[a-z]/i.test(name) && rest.startsWith(name));
            if (symbol) {
                tokens.push(nameToken(symbol));
                i += symbol.length;
                continue;
            }
            if (LEFT[ch])
                tokens.push({ t: 'left', v: LEFT[ch], c: ch });
            else if (RIGHT[ch])
                tokens.push({ t: 'right', v: RIGHT[ch], c: ch });
            else if (ch === '_')
                tokens.push({ t: 'sub' });
            else if (ch === '^')
                tokens.push({ t: 'sup' });
            else if (ch === '/')
                tokens.push({ t: 'div' });
            else if (ch === '\\')
                tokens.push({ t: 'sym', v: '\\backslash' });
            else
                tokens.push({ t: 'sym', v: ch });
            i += [...rest][0].length;
        }
        return tokens;
    }
    // AsciiMath grammar: E = I E | I/I E, I = S | S_S | S^S | S_S^S, S = symbol | (E) | unary S | binary S S.
    function asciiToTex(source) {
        const src = String(source || '').trim();
        const upper = !/[a-z]/.test(src.replace(/\\[A-Za-z]+/g, ''));
        const tokens = tokenize(src, upper);
        let pos = 0;
        const peek = () => tokens[pos];
        const strip = (node) => (node.inner != null ? node.inner : node.tex);
        const groupNumber = (node) => (node.num && node.tex.length > 1 ? { tex: `{${node.tex}}` } : node);
        function parseSimple() {
            const tok = tokens[pos++];
            if (!tok)
                return { tex: '{}' };
            if (tok.t === 'left') {
                const inner = parseExpr(true);
                const close = peek() && peek().t === 'right' ? tokens[pos++] : null;
                return { tex: `\\left${tok.v} ${inner} \\right${close ? close.v : '.'}`, inner };
            }
            if (tok.t === 'un') {
                const arg = strip(parseSimple());
                if (tok.v === 'abs')
                    return { tex: `\\left| ${arg} \\right|` };
                return { tex: `${tok.v}{${arg}}` };
            }
            if (tok.t === 'bin') {
                const a = strip(parseSimple());
                const b = strip(parseSimple());
                return { tex: tok.v === 'root' ? `\\sqrt[${a}]{${b}}` : `\\frac{${a}}{${b}}` };
            }
            if (tok.t === 'div')
                return { tex: '/' };
            if (tok.t === 'sub' || tok.t === 'sup')
                return { tex: '{}' };
            return { tex: tok.v, num: tok.t === 'num' };
        }
        // Scripts take a leading minus (10^-3) and nest to the right (10^10^10).
        function parseScript() {
            let node;
            if (peek() && peek().t === 'sym' && peek().v === '-') {
                pos += 1;
                node = { tex: `-${parseSimple().tex}` };
            }
            else {
                node = parseSimple();
            }
            if (peek() && peek().t === 'sup') {
                pos += 1;
                node = { tex: `${groupNumber(node).tex}^{${strip(parseScript())}}` };
            }
            return node;
        }
        // A multi-digit base is grouped so 10^7 raises 10, not just its last digit (Word reads it that way).
        function parseIntermediate() {
            let node = parseSimple();
            if (peek() && (peek().t === 'sub' || peek().t === 'sup'))
                node = groupNumber(node);
            if (peek() && peek().t === 'sub') {
                pos += 1;
                node = { tex: `${node.tex}_{${strip(parseScript())}}` };
            }
            if (peek() && peek().t === 'sup') {
                pos += 1;
                node = { tex: `${node.tex}^{${strip(parseScript())}}` };
            }
            return node;
        }
        function parseExpr(nested) {
            const out = [];
            while (pos < tokens.length) {
                if (peek().t === 'right') {
                    if (nested)
                        break;
                    out.push(tokens[pos++].v);
                    continue;
                }
                let node = parseIntermediate();
                if (peek() && peek().t === 'div') {
                    pos += 1;
                    node = { tex: `\\frac{${strip(node)}}{${strip(parseIntermediate())}}` };
                }
                out.push(node.tex);
            }
            return out.join(' ');
        }
        return parseExpr(false);
    }
    // Plain-text scientific notation ("6.0 x 10^22", "10^-3") reads better typeset too.
    const SCI = /(\d(?:[\d,]*\d)?(?:\.\d+)?)\s*[xX×]\s*10\s*\^\s*(?:\(([-−+]?\d+)\)|([-−+]?\d+))|(\d+(?:\.\d+)?)\s*\^\s*(?:\(([-−]?\d+)\)|([-−]?\d+))/g;
    const MATH = /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)|`([^`]+)`/g;
    // Chemical formulas (H2O, Cu2O, C6H12O6) get real subscripts. Every part must be an element
    // symbol and at least one count above 1, so words and names like H1N1 stay text.
    const ELEMENTS = 'He Li Be Ne Na Mg Al Si Cl Ar Ca Sc Ti Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa Np Pu Am Cm Bk Cf Es Fm Md No Lr H B C N O F P S K V Y I W U'.split(' ');
    const CHEM = new RegExp(`\\b(?:(?:${ELEMENTS.join('|')})\\d*){2,}\\b`, 'g');
    const CHEM_PART = new RegExp(`(${ELEMENTS.join('|')})(\\d*)`, 'g');
    function chemTex(formula) {
        const parts = [...formula.matchAll(CHEM_PART)];
        if (!parts.some(([, , n]) => n && n !== '1'))
            return null;
        return `\\mathrm{${parts.map(([, el, n]) => (n ? `${el}_{${n}}` : el)).join('')}}`;
    }
    function splitInto(text, out, pattern, toTex, next) {
        let last = 0;
        text.replace(pattern, (...args) => {
            const match = args[0];
            const offset = args[args.length - 2];
            const tex = toTex(...args);
            if (tex == null)
                return match;
            if (offset > last)
                next(text.slice(last, offset), out);
            out.push({ math: true, tex, display: false, raw: match });
            last = offset + match.length;
            return match;
        });
        if (last < text.length)
            next(text.slice(last), out);
    }
    function textSegments(text, out) {
        const plain = (rest, list) => splitInto(rest, list, CHEM, chemTex, (t, l) => l.push({ math: false, text: t }));
        splitInto(text, out, SCI, (match, mantissa, exp1, exp2, base, power1, power2) => {
            const exp = String(mantissa != null ? exp1 !== null && exp1 !== void 0 ? exp1 : exp2 : power1 !== null && power1 !== void 0 ? power1 : power2).replace('−', '-');
            return mantissa != null ? `${mantissa.replace(/,/g, '{,}')} \\times {10}^{${exp}}` : `{${base}}^{${exp}}`;
        }, plain);
    }
    // One line of question text as text and math pieces, ready for KaTeX or a .tex file.
    function segments(line) {
        var _a;
        const text = String(line == null ? '' : line).replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
        const out = [];
        let last = 0;
        let match;
        MATH.lastIndex = 0;
        while ((match = MATH.exec(text))) {
            if (match.index > last)
                textSegments(text.slice(last, match.index), out);
            const [raw, block, dollars, inline, ascii] = match;
            if (ascii != null) {
                const prose = (ascii.match(PROSE) || []).length >= 2;
                if (prose)
                    out.push({ math: false, text: ascii });
                else
                    out.push({ math: true, tex: asciiToTex(ascii), display: false, raw: ascii });
            }
            else {
                out.push({ math: true, tex: ((_a = block !== null && block !== void 0 ? block : dollars) !== null && _a !== void 0 ? _a : inline).trim(), display: inline == null, raw });
            }
            last = match.index + raw.length;
        }
        if (last < text.length)
            textSegments(text.slice(last), out);
        // A formula alone on its line (a worked expression, an equation to solve) gets display size.
        const math = out.filter((seg) => seg.math);
        if (math.length === 1 && !math[0].display && out.every((seg) => seg.math || !seg.text.trim())) {
            math[0].tex = `\\displaystyle ${math[0].tex}`;
        }
        return out;
    }
    function lines(text) {
        return String(text == null ? '' : text).replace(/\r\n?|\u2028/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
    }
    const SMALL_WORDS = new Set(['and', 'of', 'the']);
    function categoryLabel(category) {
        const words = String(category || 'General science').toLowerCase().split(/\s+/).filter(Boolean);
        return words.map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
    }
    function typeLabel(type) {
        const t = String(type || '').toUpperCase();
        if (t === 'MC')
            return 'Multiple Choice';
        if (t === 'SA')
            return 'Short Answer';
        return t || 'Question';
    }
    function divisionLabel(division) {
        return division === 'MS' ? 'Middle school' : division === 'HS' ? 'High school' : 'Mixed';
    }
    // ---- .tex output ----
    const TEX_TEXT = {
        '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '^': '\\textasciicircum{}',
        '_': '\\_', '%': '\\%', '~': '\\textasciitilde{}', '<': '\\textless{}', '>': '\\textgreater{}',
        '°': '\\textdegree{}', 'º': '\\textdegree{}', '×': '$\\times$', '√': '$\\surd$', 'π': '$\\pi$', '𝜋': '$\\pi$',
        '∂': '$\\partial$', 'Ω': '$\\Omega$', 'ω': '$\\omega$', 'Π': '$\\Pi$', 'µ': '$\\mu$', 'μ': '$\\mu$',
        'λ': '$\\lambda$', 'τ': '$\\tau$', 'Δ': '$\\Delta$', '∆': '$\\Delta$', 'θ': '$\\theta$', '±': '$\\pm$',
        '≤': '$\\le$', '≥': '$\\ge$', '≠': '$\\ne$', '≈': '$\\approx$', '∞': '$\\infty$', '•': '\\textbullet{}',
        '■': '$\\blacksquare$', '►': '$\\blacktriangleright$', '½': '$\\frac12$', '…': '\\ldots{}',
    };
    const TEX_TEXT_RE = new RegExp(`[${Object.keys(TEX_TEXT).map((c) => c.replace(/[\\\]^-]/g, '\\$&')).join('')}]`, 'gu');
    function escapeTex(text) {
        return String(text).replace(TEX_TEXT_RE, (c) => TEX_TEXT[c]);
    }
    function lineToTex(line) {
        return segments(line).map((s) => {
            if (!s.math)
                return escapeTex(s.text);
            return s.display ? `\\[ ${s.tex} \\]` : `\\( ${s.tex} \\)`;
        }).join('');
    }
    // {} keeps a line that starts with [ or * from reading as an argument to the \\ before it.
    function blockToTex(text) {
        return lines(text).map((line, i) => (i > 0 && /^[[*]/.test(line) ? '{}' : '') + lineToTex(line)).join(' \\\\\n');
    }
    function questionToTex(q, number) {
        return [
            `\\textbf{${number})}\\enspace\\textit{${escapeTex(categoryLabel(q.category))}}\\enspace\\textendash\\enspace`
                + `\\textit{${escapeTex(typeLabel(q.type))}}\\enspace ${blockToTex(q.question_text)}`,
            '',
            `\\textbf{Answer:} ${blockToTex(q.parsed_answer)}`,
        ].join('\n');
    }
    // A whole round as a standalone LaTeX document, laid out like an NSB packet.
    function roundToTex(packet) {
        const questions = packet.questions || [];
        const date = new Date(packet.createdAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const out = [
            '% Atom Bowl practice round. Compiles with pdflatex, xelatex or lualatex.',
            '\\documentclass[11pt]{article}',
            '\\usepackage[letterpaper,margin=1in]{geometry}',
            '\\usepackage{iftex}',
            '\\ifPDFTeX',
            '  \\usepackage[T1]{fontenc}',
            '  \\usepackage[utf8]{inputenc}',
            '  \\usepackage{lmodern}',
            '\\else',
            '  \\usepackage{fontspec}',
            '\\fi',
            '\\usepackage{amsmath,amssymb,textcomp}',
            '\\setlength{\\parindent}{0pt}',
            '\\setlength{\\parskip}{0.5em}',
            '',
            '\\begin{document}',
            '\\begin{center}',
            '  {\\Large\\bfseries Atom Bowl practice round}\\\\[0.4em]',
            `  ${escapeTex(divisionLabel(packet.division))} \\textperiodcentered\\ ${Math.ceil(questions.length / 2)} toss-ups and bonuses \\textperiodcentered\\ ${escapeTex(date)}`,
            '\\end{center}',
            '',
        ];
        for (let i = 0; i < questions.length; i += 2) {
            const number = i / 2 + 1;
            const pair = [['Toss-up', questions[i]], ['Bonus', questions[i + 1]]].filter(([, q]) => q);
            pair.forEach(([label, q]) => {
                out.push('\\begin{center}\\bfseries ' + label + '\\end{center}', questionToTex(q, number), '');
            });
            out.push('\\bigskip\\hrule\\bigskip', '');
        }
        out.push('\\end{document}', '');
        return out.join('\n');
    }
    window.atomRoundTex = { asciiToTex, segments, lines, categoryLabel, typeLabel, divisionLabel, escapeTex, roundToTex };
})();
//# sourceMappingURL=round_tex.js.map