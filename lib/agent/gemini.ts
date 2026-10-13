// Minimal LLM client (server-only) for the optional AI steps.
// Providers, each optional and used in order until one answers:
//   Groq (GROQ_API_KEY, free tier, OpenAI-compatible, very fast)
//   Gemini (GEMINI_API_KEY) https://ai.google.dev/api/generate-content
//   OpenRouter (OPENROUTER_API_KEY, free models, OpenAI-compatible)
// Override the order with AI_ORDER="gemini,groq,openrouter".

export function geminiEnabled() {
  return !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
}

let lastUsed = "";

/** Last failure, for /api/status?probe=1 diagnostics (never contains the key). */
export let lastGeminiError = "";

const MODELS = () => Array.from(new Set([process.env.GEMINI_MODEL, "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-3.1-flash-lite"].filter(Boolean) as string[]));
let workingModel = "";

export function geminiModel() {
  return lastUsed || workingModel || MODELS()[0];
}

const OPENAI_COMPAT: Record<string, { url: string; key?: string; model: string }> = {
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "openai/gpt-oss-20b" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free" },
};

async function callOpenAICompat<T>(name: string, prompt: string, timeoutMs: number): Promise<T | null> {
  const p = OPENAI_COMPAT[name];
  if (!p?.key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: "system", content: "Reply with one JSON object only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.6,
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      lastGeminiError = `${lastGeminiError} || ${name}: HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`.slice(-900);
      return null;
    }
    const body = await res.json();
    const text: string | undefined = body?.choices?.[0]?.message?.content;
    if (!text) return null;
    const out = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as T;
    lastUsed = `${name}:${p.model}`;
    return out;
  } catch (e: any) {
    lastGeminiError = `${lastGeminiError} || ${name}: ${e?.name === "AbortError" ? "timed out" : String(e?.message || e).slice(0, 120)}`.slice(-900);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Calls the first configured LLM provider that answers, within one time budget. */
export async function geminiJSON<T>(prompt: string, timeoutMs = 25000, only?: string): Promise<T | null> {
  lastGeminiError = "";
  if (only) return callGemini<T>(prompt, timeoutMs, only);
  const order = (process.env.AI_ORDER || "groq,gemini,openrouter").split(",").map((x) => x.trim());
  const deadline = Date.now() + timeoutMs;
  for (const name of order) {
    const left = deadline - Date.now();
    if (left < 1000) break;
    let out: T | null = null;
    if (name === "gemini") {
      if (!process.env.GEMINI_API_KEY) continue;
      out = await callGemini<T>(prompt, left);
      if (out) lastUsed = `gemini:${workingModel || MODELS()[0]}`;
    } else out = await callOpenAICompat<T>(name, prompt, Math.min(left, 10000));
    if (out) return out;
  }
  return null;
}

/** Calls Gemini for JSON. If a model is retired (404), falls through to the next one and remembers what works. */
async function callGemini<T>(prompt: string, timeoutMs = 25000, only?: string): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const models = only ? [only] : workingModel ? [workingModel, ...MODELS().filter((m) => m !== workingModel)] : MODELS();
  const deadline = Date.now() + timeoutMs;
  // Each model gets up to two tries: Gemini returns brief 503 "high demand" spikes.
  const attempts = models.flatMap((m) => [m, m]);
  for (const [i, model] of attempts.entries()) {
    if (i % 2 === 1) await new Promise((r) => setTimeout(r, 700));
    const left = deadline - Date.now();
    if (left < 1000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(left, 8000)); // a hung model must not eat the whole budget
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.6, ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}) },
        }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      if ([400, 404, 429, 500, 503].includes(res.status)) {
        lastGeminiError = `${lastGeminiError} || ${model}: HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`.slice(-900);
        continue;
      }
      if (!res.ok) {
        lastGeminiError = `${model}: HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        console.error("gemini", lastGeminiError);
        return null;
      }
      if (!workingModel && !only) workingModel = model;
      const body = await res.json();
      const text: string | undefined = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("");
      if (!text) return null;
      return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as T;
    } catch (e: any) {
      lastGeminiError = `${lastGeminiError} || ${model}: ${e?.name === "AbortError" ? "timed out" : String(e?.message || e).slice(0, 120)}`.slice(-900);
      if (e instanceof SyntaxError) return null;
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Names of models this key can call generateContent on (diagnostics only). */
export async function geminiModels(): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, cache: "no-store" });
  const b = await res.json().catch(() => ({}));
  return (b.models || []).filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m: any) => String(m.name).replace("models/", ""));
}
