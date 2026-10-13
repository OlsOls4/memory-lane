"use client";

import type { ModelUse } from "@/lib/types";
import { shortModel } from "@/lib/nemotron/names";

const ORDER: ModelUse["role"][] = ["feedback", "reader", "planner", "review", "writer", "prompts", "script"];

/**
 * Subtle "Powered by NVIDIA Nemotron on Nebius Token Factory" strip with one badge per model role,
 * built from the calls this plan actually made (model, time, reasoning tokens, Qloo tool calls).
 */
export default function AiLayer({ models, planner, strategy }: { models: ModelUse[]; planner?: "nemotron" | "deterministic"; strategy?: string }) {
  if (!models.length) return null;
  // Merge planner turns into one badge.
  const merged = new Map<string, ModelUse & { turns: number }>();
  for (const m of models) {
    const key = m.role === "planner" ? "planner" : `${m.role}:${m.label}`;
    const cur = merged.get(key);
    if (cur) {
      cur.ms += m.ms;
      cur.turns += 1;
      cur.toolCalls = (cur.toolCalls || 0) + (m.toolCalls || 0);
      cur.reasoningTokens = (cur.reasoningTokens || 0) + (m.reasoningTokens || 0);
    } else merged.set(key, { ...m, label: m.role === "planner" ? "Plans the week" : m.label, turns: 1 });
  }
  const list = [...merged.values()].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));
  return (
    <aside className="ai-layer no-print" aria-label="How AI was used">
      <p className="ai-layer-head">
        <span className="nv-mark" aria-hidden="true" />
        Powered by <strong>NVIDIA Nemotron</strong> on <strong>Nebius Token Factory</strong>
        {planner === "nemotron" ? ", choosing only from Qloo’s taste graph" : ""}
      </p>
      {strategy && <p className="ai-layer-strategy">“{strategy}”</p>}
      <ul className="model-badges">
        {list.map((m) => {
          const tools = m.role === "planner" && m.toolCalls ? m.toolCalls : 0;
          const detail = [
            `${(m.ms / 1000).toFixed(1)} s`,
            m.role === "planner" && m.turns > 1 ? `${m.turns} turns` : "",
            tools ? `${tools} tool call${tools === 1 ? "" : "s"}` : "",
            m.reasoningTokens ? `${m.reasoningTokens.toLocaleString()} reasoning tokens` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={`${m.role}${m.label}`} className={`model-badge model-${m.role}`} title={`${m.model} — ${detail}`}>
              <span className="model-role">{m.label}</span>
              <span className="model-name">{shortModel(m.model)}</span>
              <span className="model-ms">{detail}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
