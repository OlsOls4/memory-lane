// Minimal Gemini REST client (server-only). Enabled when GEMINI_API_KEY is set.
// Docs: https://ai.google.dev/api/generate-content

export function geminiEnabled() {
  return !!process.env.GEMINI_API_KEY;
}

/** Last failure, for /api/status?probe=1 diagnostics (never contains the key). */
export let lastGeminiError = "";

const MODELS = () => Array.from(new Set([process.env.GEMINI_MODEL, "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash"].filter(Boolean) as string[]));
let workingModel = "";

export function geminiModel() {
  return workingModel || MODELS()[0];
}

/** Calls Gemini for JSON. If a model is retired (404), falls through to the next one and remembers what works. */
export async function geminiJSON<T>(prompt: string, timeoutMs = 25000, only?: string): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const models = only ? [only] : workingModel ? [workingModel, ...MODELS().filter((m) => m !== workingModel)] : MODELS();
  const deadline = Date.now() + timeoutMs;
  lastGeminiError = "";
  // Each model gets up to two tries: Gemini returns brief 503 "high demand" spikes.
  const attempts = models.flatMap((m) => [m, m]);
  for (const [i, model] of attempts.entries()) {
    if (i % 2 === 1) await new Promise((r) => setTimeout(r, 700));
    const left = deadline - Date.now();
    if (left < 1000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
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
      lastGeminiError = String(e?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : e?.message || e).slice(0, 300);
      console.error("gemini", lastGeminiError);
      return null;
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
