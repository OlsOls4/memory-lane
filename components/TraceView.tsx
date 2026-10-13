"use client";

import type { TraceStep } from "@/lib/types";

const LABEL: Record<string, string> = {
  "agent.plan": "Planner",
  "qloo.search": "Qloo search",
  "qloo.tags": "Qloo tags",
  "qloo.insights": "Qloo insights",
  "qloo.compare": "Qloo compare",
  "llm.plan": "AI planner",
  "llm.review": "AI care review",
  "llm.compose": "Gemini wording",
  "template.compose": "Template wording",
};

const ENDPOINTS: { tool: string; label: string; what: string }[] = [
  { tool: "qloo.search", label: "Search", what: "to recognise what you typed" },
  { tool: "qloo.tags", label: "Tags", what: "to find genres and themes" },
  { tool: "qloo.insights", label: "Insights", what: "to find era-matched picks" },
  { tool: "qloo.compare", label: "Compare", what: "to find shared tastes" },
];

export default function TraceView({ trace, composer }: { trace: TraceStep[]; composer?: "gemini" | "template" }) {
  const qloo = trace.filter((t) => t.tool.startsWith("qloo."));
  const mock = trace.some((t) => t.mock);
  const used = ENDPOINTS.map((e) => ({ ...e, n: trace.filter((t) => t.tool === e.tool).length })).filter((e) => e.n > 0);
  const ms = qloo.reduce((a, t) => a + (t.ms || 0), 0);
  return (
    <details className="trace no-print">
      <summary>
        <span className="trace-title">
          <span className="trace-h">How Memory Lane chose this</span>
          <span className="trace-sub">
            {qloo.length} calls to Qloo’s taste graph{ms > 0 ? ` in ${(ms / 1000).toFixed(1)} seconds` : ""}
            {mock ? ", using demo data" : ""}
            {composer ? `. Wording by ${composer === "gemini" ? "Gemini" : "templates"}.` : "."}
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
                {t.ms > 0 && <span className="step-ms">{t.ms} ms</span>}
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
