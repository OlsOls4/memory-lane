// NVIDIA Nemotron on Nebius Token Factory (OpenAI-compatible chat completions). Server-only.
// Docs: https://docs.tokenfactory.nebius.com  ·  Base URL: https://api.tokenfactory.nebius.com/v1
//
// Every Nemotron 3 model is a reasoning model: by default it spends completion tokens on a hidden
// `reasoning_content` trace before answering. We only ever read `message.content` (and tool calls).
// Fast calls switch reasoning off with `chat_template_kwargs: { enable_thinking: false }`, which the
// Token Factory endpoints honour for all four models (measured: ~0.7 s vs 1.5–3 s for a short JSON).
//
// Roles map to models (each overridable by env):
//   planner  → Nemotron 3 Ultra 550B-A55B   (reasoning ON, tool calls into Qloo; picks and orders the week)
//   writer   → Nemotron 3 Super 120B-A12B   (reasoning OFF; day wording, group running order, AI-only picks)
//   feedback → Nemotron 3 Super 120B-A12B   (reasoning ON, short budget; "how did it go" → next week's changes)
//   reader   → Nemotron 3 Nano 30B-A3B      (reasoning OFF; reads staff notes, local-history hooks)
//   prompts  → Nemotron 3 Nano 30B-A3B      (reasoning OFF; conversation prompts + follow-up questions)
//   script   → Nemotron 3.5 Lightning       (reasoning OFF; on-demand word-for-word session scripts)
// If a role's model fails or times out, the next model in its chain is tried, then the caller's
// deterministic template fallback. With no NEBIUS_API_KEY nothing here is called at all.

export type NemotronRole = "planner" | "writer" | "feedback" | "reader" | "prompts" | "script";

export const MODELS = {
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
  super: "nvidia/nemotron-3-super-120b-a12b",
  nano: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  lightning: "nvidia/Nemotron-3_5-Lightning",
} as const;

const ENV_KEY: Record<NemotronRole, string> = {
  planner: "NEMOTRON_PLANNER_MODEL",
  writer: "NEMOTRON_WRITER_MODEL",
  feedback: "NEMOTRON_FEEDBACK_MODEL",
  reader: "NEMOTRON_READER_MODEL",
  prompts: "NEMOTRON_PROMPTS_MODEL",
  script: "NEMOTRON_SCRIPT_MODEL",
};

const CHAINS: Record<NemotronRole, string[]> = {
  planner: [MODELS.ultra, MODELS.super],
  writer: [MODELS.super, MODELS.nano],
  feedback: [MODELS.super, MODELS.nano],
  reader: [MODELS.nano, MODELS.super],
  prompts: [MODELS.nano, MODELS.lightning],
  script: [MODELS.lightning, MODELS.nano],
};

export const BASE_URL = () => (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "");

export function nemotronEnabled() {
  return !!process.env.NEBIUS_API_KEY && !/^(off|0|false)$/i.test(process.env.NEMOTRON || "");
}

export function modelsFor(role: NemotronRole): string[] {
  const pinned = process.env[ENV_KEY[role]];
  return Array.from(new Set([pinned, ...CHAINS[role]].filter(Boolean) as string[]));
}

export function primaryModel(role: NemotronRole) {
  return modelsFor(role)[0];
}

export { shortModel } from "./names";
import { shortModel } from "./names";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatOptions {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** Reasoning on (true) or off (false). Default off: fast calls. */
  think?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  json?: boolean;
  /** Restrict to one model (no chain fallback). */
  only?: string;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  model: string;
  ms: number;
  completionTokens?: number;
  reasoningTokens?: number;
  finishReason?: string;
  /** Models that failed before this one answered, with why. */
  fellBackFrom: string[];
}

/** Rolling per-model latency log for /api/status (in-memory, per server instance). */
export const latencyLog: { role: NemotronRole; model: string; ms: number; ok: boolean; at: string }[] = [];
export let lastNemotronError = "";

function log(role: NemotronRole, model: string, ms: number, ok: boolean) {
  latencyLog.push({ role, model, ms, ok, at: new Date().toISOString() });
  if (latencyLog.length > 200) latencyLog.splice(0, latencyLog.length - 200);
}

/** One chat completion for a role, walking its model chain on failure. Returns null if every model failed. */
export async function chat(role: NemotronRole, o: ChatOptions): Promise<ChatResult | null> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key || !nemotronEnabled()) return null;
  const models = o.only ? [o.only] : modelsFor(role);
  const deadline = Date.now() + (o.timeoutMs ?? 30000);
  const failed: string[] = [];
  for (const [i, model] of models.entries()) {
    // Keep a little of the budget for the fallback model.
    const left = deadline - Date.now();
    if (left < 1500) break;
    const budget = i < models.length - 1 && models.length > 1 ? Math.max(left * 0.75, Math.min(left, 8000)) : left;
    const started = Date.now();
    try {
      const body: Record<string, unknown> = {
        model,
        messages: o.messages,
        max_tokens: o.maxTokens ?? (o.think ? 6000 : 1500),
        temperature: o.temperature ?? (o.think ? 0.6 : 0.5),
        chat_template_kwargs: { enable_thinking: !!o.think },
      };
      if (o.tools?.length) {
        body.tools = o.tools;
        body.tool_choice = "auto";
      }
      if (o.json && !o.tools?.length) body.response_format = { type: "json_object" };
      const res = await fetch(`${BASE_URL()}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.round(budget)),
        cache: "no-store",
      });
      const ms = Date.now() - started;
      if (!res.ok) {
        const text = (await res.text()).slice(0, 200);
        lastNemotronError = `${model}: HTTP ${res.status}: ${text}`;
        failed.push(`${shortModel(model)} (HTTP ${res.status})`);
        log(role, model, ms, false);
        continue;
      }
      const out = await res.json();
      const choice = out?.choices?.[0];
      const msg = choice?.message || {};
      const content = typeof msg.content === "string" ? msg.content.trim() : "";
      const toolCalls: ToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (!content && !toolCalls.length) {
        // Usually means the reasoning ate the whole max_tokens budget.
        lastNemotronError = `${model}: empty content (finish_reason ${choice?.finish_reason})`;
        failed.push(`${shortModel(model)} (empty answer)`);
        log(role, model, ms, false);
        continue;
      }
      log(role, model, ms, true);
      return {
        content,
        toolCalls,
        model,
        ms,
        completionTokens: out?.usage?.completion_tokens,
        reasoningTokens: out?.usage?.completion_tokens_details?.reasoning_tokens ?? undefined,
        finishReason: choice?.finish_reason,
        fellBackFrom: failed,
      };
    } catch (e: any) {
      const ms = Date.now() - started;
      lastNemotronError = `${model}: ${e?.name === "TimeoutError" || e?.name === "AbortError" ? `timeout after ${ms}ms` : String(e?.message || e).slice(0, 200)}`;
      failed.push(`${shortModel(model)} (${e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "error"})`);
      log(role, model, ms, false);
    }
  }
  return null;
}

/** Pull the first JSON object/array out of a model answer (tolerates ```json fences and stray prose). */
export function parseJSONLoose<T = any>(text: string): T | null {
  if (!text) return null;
  const t = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(t) as T;
  } catch {}
  const starts = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const s = Math.min(...starts);
  const close = t[s] === "{" ? "}" : "]";
  const e = t.lastIndexOf(close);
  if (e <= s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1)) as T;
  } catch {
    return null;
  }
}

export interface JSONResult<T> {
  data: T;
  meta: ChatResult;
}

/** Ask a role for JSON. One retry on unparsable output with the same chain. */
export async function nemotronJSON<T>(
  role: NemotronRole,
  prompt: string,
  o: Omit<ChatOptions, "messages" | "json"> & { system?: string } = {},
): Promise<JSONResult<T> | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: o.system || "You are a careful assistant for care-home activity staff. Reply with a single JSON object and nothing else." },
    { role: "user", content: prompt },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chat(role, { ...o, messages, json: true });
    if (!r) return null;
    const data = parseJSONLoose<T>(r.content);
    if (data !== null) return { data, meta: r };
    lastNemotronError = `${r.model}: unparsable JSON: ${r.content.slice(0, 120)}`;
  }
  return null;
}
