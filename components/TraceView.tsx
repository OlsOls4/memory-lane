"use client";

import type { TraceStep } from "@/lib/types";
import { shortModel } from "@/lib/nemotron/names";

const LABEL: Record<string, string> = {
  "agent.plan": "Planner",
  "qloo.search": "Qloo search",
  "qloo.tags": "Qloo tags",
  "qloo.insights": "Qloo insights",
  "qloo.compare": "Qloo compare",
  "llm.read": "Nemotron notes reader",
  "llm.plan": "Nemotron planner",
  "llm.tool": "Planner tool call",
  "llm.review": "Nemotron care review",
  "llm.compose": "Nemotron wording",
  "llm.prompts": "Nemotron prompts",
  "llm.feedback": "Nemotron feedback loop",
  "web.history": "Local history (Tavily)",
  "template.compose": "Template wording",
};

const ENDPOINTS: { tool: string; label: string; what: string }[] = [
  { tool: "qloo.search", label: "Search", what: "to recognise what you typed" },
  { tool: "qloo.tags", label: "Tags", what: "to find genres and themes" },
  { tool: "qloo.insights", label: "Insights", what: "to find era-matched picks" },
  { tool: "qloo.compare", label: "Compare", what: "to find shared tastes" },
];

export default function TraceView({ trace, composer }: { trace: TraceStep[]; composer?: "nemotron" | "template" }) {
  const qloo = trace.filter((t) => t.tool.startsWith("qloo."));
  const mock = trace.some((t) => t.mock);
  const used = ENDPOINTS.map((e) => ({ ...e, n: trace.filter((t) => t.tool === e.tool).length })).filter((e) => e.n > 0);
  const ms = qloo.reduce((a, t) => a + (t.ms || 0), 0);
  const llm = trace.filter((t) => t.model);
  return (
    <details className="trace no-print">
      <summary>
        <span className="trace-title">
          <span className="trace-h">How Memory Lane chose this</span>
          <span className="trace-sub">
            {qloo.length} calls to Qloo’s taste graph{ms > 0 ? ` in ${(ms / 1000).toFixed(1)} seconds` : ""}
            {mock ? ", using demo data" : ""}
            {llm.length ? `, ${llm.length} NVIDIA Nemotron calls on Nebius Token Factory` : ""}
            {composer ? `. Wording by ${composer === "nemotron" ? "Nemotron" : "templates"}.` : "."}
          </span>
        </span>
        <span className="trace-pills" aria-hidden="true">
          {used.map((e) => (
            <span key={e.tool} className="pill" title={`${e.n} ${e.label.toLowerCase()} calls, ${e.what}`}>
              {e.label} <b>{e.n}</b>
            </span>
          ))}
        </span>
        <span className="trace-toggle" aria-hidden="true" />
      </summary>
      <ol className="timeline">
        {trace.map((t) => {
          const kind = t.tool.split(".")[0];
          return (
            <li key={t.n} className={`step step-${kind}${t.error ? " step-error" : ""}`}>
              <div className="step-head">
                <span className="step-tool">{LABEL[t.tool] || t.tool}</span>
                {t.model && <span className="model-chip" title={t.model}>{shortModel(t.model)}</span>}
                {t.ms > 0 && <span className="step-ms">{t.ms} ms</span>}
                {t.reasoningTokens ? <span className="step-ms">{t.reasoningTokens.toLocaleString()} reasoning tokens</span> : null}
              </div>
              <p className="step-purpose">{t.purpose}</p>
              {t.request && (
                <code className="step-req">
                  {t.request.method} {t.request.path}
                  {Object.keys(t.request.params).length > 0 ? "?" : ""}
                  {Object.entries(t.request.params)
                    .map(([k, v]) => `${k}=${v}`)
                    .join("&")}
                </code>
              )}
              {t.droppedParams && (
                <p className="step-note">Left out, as this kind of entity does not support them: {t.droppedParams.join(", ")}</p>
              )}
              {t.error && <p className="step-note step-err">Problem: {t.error}</p>}
              {t.summary.length > 0 && (
                <ul className="step-sum">
                  {t.summary.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
