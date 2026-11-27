// One chat call against Anthropic, Gemini or Groq over plain fetch, so switching providers is a config change.

export const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-5-5",
  gemini: "gemini-2.5-flash",
  groq: "openai/gpt-oss-120b"
};

// The host stops a function at 60 seconds (functions/vercel.json). Stop the model call well before
// that, so the caller's catch still runs and can return the credits it charged.
const CALL_TIMEOUT_MS = 50 * 1000;
const CHECK_TIMEOUT_MS = 8 * 1000;
const callSignal = () => AbortSignal.timeout(CALL_TIMEOUT_MS);

// A reply that ran out of room. JSON would not parse, so that is an error; prose is still useful,
// so it is returned with a line saying it was cut short.
const CUT_SHORT = "\n\n*This answer was cut short. Ask me to continue.*";
function finishCut(text, json) {
  if (json) throw new ProviderError("the reply was cut off before it finished", 502);
  return text ? text + CUT_SHORT : text;
}

export class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function readJson(res) {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.error?.message || res.statusText || "request failed";
    throw new ProviderError(`${res.status}: ${detail}`, res.status);
  }
  return body;
}

async function callGemini({ model, apiKey, system, messages, json, maxTokens, temperature, reasoning, fetchImpl }) {
  const generationConfig = { maxOutputTokens: maxTokens, temperature };
  if (json) generationConfig.responseMimeType = "application/json";
  // 2.5 models think by default and count it against maxOutputTokens; only extra thinking needs it.
  if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: reasoning === "high" ? -1 : 0 };
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    signal: callSignal(),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
      generationConfig
    })
  });
  const body = await readJson(res);
  const candidate = body?.candidates?.[0];
  if (!candidate) throw new ProviderError(`blocked: ${body?.promptFeedback?.blockReason || "no candidates"}`, 400);
  const text = (candidate.content?.parts || []).map((p) => p.text || "").join("");
  return candidate.finishReason === "MAX_TOKENS" ? finishCut(text, json) : text;
}

async function callGroq({ model, apiKey, system, messages, json, maxTokens, temperature, reasoning, fetchImpl }) {
  const payload = {
    model,
    messages: [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.text }))],
    max_completion_tokens: maxTokens,
    temperature
  };
  if (json) payload.response_format = { type: "json_object" };
  if (model.includes("gpt-oss")) payload.reasoning_effort = reasoning === "high" ? "high" : "low";
  const res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    signal: callSignal(),
    body: JSON.stringify(payload)
  });
  const body = await readJson(res);
  const text = body?.choices?.[0]?.message?.content || "";
  return body?.choices?.[0]?.finish_reason === "length" ? finishCut(text, json) : text;
}

const ANTHROPIC_HEADERS = (apiKey) => ({ "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" });

// Claude 5.x models reject temperature and budget_tokens and always think, so depth is set with
// output_config.effort. Thinking tokens count against max_tokens, so leave room for them.
// There is no JSON mode and no prefill: Generate's prompt asks for JSON and the parser strips fences.
async function callAnthropic({ model, apiKey, system, messages, json, maxTokens, reasoning, fetchImpl }) {
  const high = reasoning === "high";
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: ANTHROPIC_HEADERS(apiKey),
    signal: callSignal(),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens + (high ? 8000 : 2000),
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
      output_config: { effort: high ? "high" : "low" }
    })
  });
  const body = await readJson(res);
  if (body?.stop_reason === "refusal") throw new ProviderError("refused", 400);
  const text = (body?.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
  // Thinking shares the max_tokens budget, so a long answer can stop mid-sentence.
  return body?.stop_reason === "max_tokens" ? finishCut(text, json) : text;
}

function providerName(provider) {
  return provider === "anthropic" || provider === "groq" ? provider : "gemini";
}

export async function complete({ provider, model, apiKey, fetchImpl = fetch, ...job }) {
  if (!apiKey) throw new ProviderError("AI_API_KEY is not set", 500);
  const name = providerName(provider);
  const args = { ...job, model: model || DEFAULT_MODELS[name], apiKey, fetchImpl };
  return name === "anthropic" ? callAnthropic(args) : name === "groq" ? callGroq(args) : callGemini(args);
}

// Free check for the status page: the key works and the configured model still exists
// (Groq retired llama-3.1-8b-instant once, which only showed up as failed calls).
export async function checkModel({ provider, model, apiKey, fetchImpl = fetch }) {
  if (!apiKey) return { ok: false, detail: "AI_API_KEY is not set" };
  const name = providerName(provider);
  const id = model || DEFAULT_MODELS[name];
  try {
    if (name === "anthropic") {
      await readJson(await fetchImpl(`https://api.anthropic.com/v1/models/${encodeURIComponent(id)}`, { headers: ANTHROPIC_HEADERS(apiKey), signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }));
      return { ok: true };
    }
    if (name === "groq") {
      const body = await readJson(await fetchImpl("https://api.groq.com/openai/v1/models", {
        headers: { authorization: `Bearer ${apiKey}` }
      }));
      const listed = (body?.data || []).some((m) => m.id === id);
      return listed ? { ok: true } : { ok: false, detail: `model ${id} is not available` };
    }
    await readJson(await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}`, {
      headers: { "x-goog-api-key": apiKey }
    }));
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err?.status === 404 ? `model ${id} is not available` : String(err?.message || "request failed") };
  }
}
