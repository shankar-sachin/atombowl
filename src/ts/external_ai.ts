// "Send to Claude / ChatGPT / Gemini" after a miss: opens the chosen chat app in a new tab with
// a prompt about the question. The app is the externalAi setting (settings.html#externalAi).
// Classic script, loaded before practice.js, so the tab opens inside the click (no popup block).
// None of these apps document a prefill URL; claude.ai/new?q= and chatgpt.com/?q= work today,
// and none can pick the model, so the user's own default model is used. Gemini has no prefill,
// so its prompt goes to the clipboard to paste.
(() => {
  type MissContext = {
    question: string;
    hasImage?: boolean;
    answerLabel?: string;
    answer?: string;
    userAnswer?: string;
    category?: string;
    level?: string;
    bonus?: boolean;
  };

  // Each app's mark: the OpenAI logo is the official one; Claude and Gemini are simplified drawings.
  const CLAUDE_RAYS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
    .map((deg, i) => {
      const r = i % 2 ? 7.4 : 10;
      const a = (deg - 90) * Math.PI / 180;
      return `<path d="M12 12 L${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}"/>`;
    })
    .join('');

  const PROVIDERS = {
    claude: {
      name: 'Claude',
      logo: `<svg class="ext-ai-logo" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#d97757" stroke-width="2.4" stroke-linecap="round">${CLAUDE_RAYS}</svg>`,
      url: (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
    },
    chatgpt: {
      name: 'ChatGPT',
      logo: '<svg class="ext-ai-logo" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023-.141-.085-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z"/></svg>',
      url: (prompt: string) => `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`
    },
    gemini: {
      name: 'Gemini',
      logo: '<svg class="ext-ai-logo" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="extAiGemini" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8df7"/><stop offset="1" stop-color="#9b72cb"/></linearGradient></defs><path fill="url(#extAiGemini)" d="M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10z"/></svg>',
      url: () => 'https://gemini.google.com/app',
      paste: true
    }
  };

  function currentKey() {
    const key = (window as any).atomSettings?.externalAi;
    return Object.prototype.hasOwnProperty.call(PROVIDERS, key) ? key : 'claude';
  }

  function levelName(level: string) {
    if (level === 'MS') return 'middle school';
    if (level === 'HS') return 'high school';
    return '';
  }

  function buildPrompt(ctx: MissContext) {
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
  async function send(ctx: MissContext) {
    const provider = PROVIDERS[currentKey()];
    const prompt = buildPrompt(ctx);
    const tab = window.open(provider.url(prompt), '_blank', 'noopener');
    if (!provider.paste) return tab ? '' : `Your browser blocked the new tab. Allow pop-ups to open ${provider.name}.`;
    try {
      await navigator.clipboard.writeText(prompt);
      return `Prompt copied. Paste it into ${provider.name}.`;
    } catch {
      return `Couldn't copy the prompt. Use Claude or ChatGPT in Settings instead.`;
    }
  }

  // Fills a button's [data-ai-logo] and [data-ai-label] from the current setting.
  function paint(button: HTMLElement | null) {
    if (!button) return;
    const provider = PROVIDERS[currentKey()];
    const logo = button.querySelector('[data-ai-logo]');
    const label = button.querySelector('[data-ai-label]');
    if (logo) logo.innerHTML = provider.logo;
    if (label) label.textContent = `Send to ${provider.name}`;
    button.title = provider.paste
      ? `Copy a prompt about this question and open ${provider.name}`
      : `Open ${provider.name} in a new tab with this question`;
  }

  (window as any).atomExternalAi = { buildPrompt, send, paint, currentKey };
})();
