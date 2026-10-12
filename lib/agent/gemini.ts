// Minimal Gemini REST client (server-only). Enabled when GEMINI_API_KEY is set.
// Docs: https://ai.google.dev/api/generate-content

export function geminiEnabled() {
  return !!process.env.GEMINI_API_KEY;
}

export async function geminiJSON<T>(prompt: string, timeoutMs = 25000): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    const text: string | undefined = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("");
    if (!text) return null;
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
