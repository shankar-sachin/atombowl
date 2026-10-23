// "Send to Claude / ChatGPT / Gemini" after a miss: opens the chosen chat app in a new tab with
// a prompt about the question. The app is the externalAi setting (/settings#externalAi).
// Classic script, loaded before practice.js, so the tab opens inside the click (no popup block).
// None of these apps document a prefill URL; claude.ai/new?q= and chatgpt.com/?q= work today,
// and none can pick the model, so the user's own default model is used. Gemini has no prefill,
// so its prompt goes to the clipboard to paste.
(() => {
    // Each app's official mark (paths from Simple Icons, simpleicons.org, CC0).
    const PROVIDERS = {
        claude: {
            name: 'Claude',
            logo: '<svg class="ext-ai-logo" viewBox="0 0 24 24" aria-hidden="true" fill="#d97757"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>',
            url: (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
        },
        chatgpt: {
            name: 'ChatGPT',
            logo: '<svg class="ext-ai-logo" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023-.141-.085-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z"/></svg>',
            url: (prompt) => `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`
        },
        gemini: {
            name: 'Gemini',
            logo: '<svg class="ext-ai-logo" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="extAiGemini" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1ba1e3"/><stop offset="0.3" stop-color="#5489d6"/><stop offset="0.55" stop-color="#9b72cb"/><stop offset="0.8" stop-color="#d96570"/><stop offset="1" stop-color="#f49c46"/></linearGradient></defs><path fill="url(#extAiGemini)" d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"/></svg>',
            url: () => 'https://gemini.google.com/app',
            paste: true
        }
    };
    function currentKey() {
        var _a;
        const key = (_a = window.atomSettings) === null || _a === void 0 ? void 0 : _a.externalAi;
        return Object.prototype.hasOwnProperty.call(PROVIDERS, key) ? key : 'claude';
    }
    function levelName(level) {
        if (level === 'MS')
            return 'middle school';
        if (level === 'HS')
            return 'high school';
        return '';
    }
    function buildPrompt(ctx) {
        const kind = ctx.bonus ? 'bonus' : 'toss-up';
        const about = [levelName(ctx.level || ''), ctx.category ? ctx.category.toLowerCase() : '', kind].filter(Boolean).join(' ');
        const question = ctx.question || (ctx.hasImage ? '(This question was a picture, so I can only give you the answers.)' : '(No question text.)');
        return [
            `I'm practicing for the National Science Bowl and missed this ${about} question.`,
            '',
            'Question:',
            question,
            '',
            `Official answer: ${ctx.answerLabel || ctx.answer || 'not given'}`,
            `My answer: ${ctx.userAnswer || '(I did not answer)'}`,
            '',
            'Explain why the official answer is correct and exactly where my answer went wrong. Then teach me the concept behind it in a few short paragraphs, with any formulas I need. End with one similar practice question, and put its answer at the very end so I can try it first.'
        ].join('\n');
    }
    // Opens the app with the prompt. Resolves to a short note to show when the user has to paste.
    async function send(ctx) {
        const provider = PROVIDERS[currentKey()];
        const prompt = buildPrompt(ctx);
        const tab = window.open(provider.url(prompt), '_blank', 'noopener');
        if (!provider.paste)
            return tab ? '' : `Your browser blocked the new tab. Allow pop-ups to open ${provider.name}.`;
        try {
            await navigator.clipboard.writeText(prompt);
            return `Prompt copied. Paste it into ${provider.name}.`;
        }
        catch {
            return `Couldn't copy the prompt. Use Claude or ChatGPT in Settings instead.`;
        }
    }
    // Fills a button's [data-ai-logo] and [data-ai-label] from the current setting.
    function paint(button) {
        if (!button)
            return;
        const provider = PROVIDERS[currentKey()];
        const logo = button.querySelector('[data-ai-logo]');
        const label = button.querySelector('[data-ai-label]');
        if (logo)
            logo.innerHTML = provider.logo;
        if (label)
            label.textContent = `Send to ${provider.name}`;
        button.title = provider.paste
            ? `Copy a prompt about this question and open ${provider.name}`
            : `Open ${provider.name} in a new tab with this question`;
    }
    window.atomExternalAi = { buildPrompt, send, paint, currentKey };
})();
//# sourceMappingURL=external_ai.js.map