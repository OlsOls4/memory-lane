"use client";
// Browser side: POST to an agent route asking for NDJSON progress, falling back to plain JSON.

export interface LiveStep {
  n: number;
  tool: string;
  purpose: string;
  summary: string[];
  ms: number;
  error?: string;
  done: boolean;
}

export async function runAgent<T>(url: string, body: unknown, onSteps: (steps: LiveStep[]) => void): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, application/json" },
    body: JSON.stringify(body),
  });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.includes("ndjson") || !res.body) {
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "Something went wrong. Please try again.");
    return out as T;
  }
  const steps = new Map<number, LiveStep>();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let result: T | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === "step") {
        steps.set(msg.step.n, { ...msg.step, done: msg.phase === "end" });
        onSteps([...steps.values()].sort((a, b) => a.n - b.n));
      } else if (msg.type === "done") result = msg.result as T;
      else if (msg.type === "error") throw new Error(msg.error);
    }
    if (done) break;
  }
  if (result === undefined) throw new Error("The connection dropped before the plan was ready. Please try again.");
  return result;
}
