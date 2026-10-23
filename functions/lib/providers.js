// One chat call against Gemini or Groq over plain fetch, so switching providers is a config change.

export const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash",
  groq: "openai/gpt-oss-120b"
};

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
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
      generationConfig
    })
  });
  const body = await readJson(res);
  const candidate = body?.candidates?.[0];
  if (!candidate) throw new ProviderError(`blocked: ${body?.promptFeedback?.blockReason || "no candidates"}`, 400);
  return (candidate.content?.parts || []).map((p) => p.text || "").join("");
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
    body: JSON.stringify(payload)
  });
  const body = await readJson(res);
  return body?.choices?.[0]?.message?.content || "";
}

export async function complete({ provider, model, apiKey, fetchImpl = fetch, ...job }) {
  if (!apiKey) throw new ProviderError("AI_API_KEY is not set", 500);
  const name = provider === "groq" ? "groq" : "gemini";
  const args = { ...job, model: model || DEFAULT_MODELS[name], apiKey, fetchImpl };
  return name === "groq" ? callGroq(args) : callGemini(args);
}

// Free check for the status page: the key works and the configured model still exists
// (Groq retired llama-3.1-8b-instant once, which only showed up as failed calls).
export async function checkModel({ provider, model, apiKey, fetchImpl = fetch }) {
  if (!apiKey) return { ok: false, detail: "AI_API_KEY is not set" };
  const name = provider === "groq" ? "groq" : "gemini";
  const id = model || DEFAULT_MODELS[name];
  try {
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
