"use client";

import type { TraceStep } from "@/lib/types";

const LABEL: Record<string, string> = {
  "agent.plan": "Agent reasoning",
  "qloo.search": "Qloo · Search",
  "qloo.tags": "Qloo · Tags",
  "qloo.insights": "Qloo · Insights",
  "qloo.compare": "Qloo · Compare",
  "llm.compose": "Gemini · Wording",
  "template.compose": "Template · Wording",
};

export default function TraceView({ trace }: { trace: TraceStep[] }) {
  const qlooCalls = trace.filter((t) => t.tool.startsWith("qloo.")).length;
  const mock = trace.some((t) => t.mock);
  return (
    <details className="trace no-print">
      <summary>
        How Memory Lane chose this <span className="muted">({qlooCalls} Qloo calls{mock ? ", mock data" : ""})</span>
      </summary>
      <ol>
        {trace.map((t) => (
          <li key={t.n} className={`step step-${t.tool.split(".")[0]}${t.error ? " step-error" : ""}`}>
            <div className="step-head">
              <span className="step-tool">{LABEL[t.tool] || t.tool}</span>
              <span className="step-purpose">{t.purpose}</span>
              {t.ms > 0 && <span className="muted">{t.ms} ms</span>}
            </div>
            {t.request && (
              <code className="step-req">
                {t.request.method} {t.request.path}?
                {Object.entries(t.request.params)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("&")}
              </code>
            )}
            {t.droppedParams && (
              <p className="step-drop">Removed (not supported for this entity type): {t.droppedParams.join(", ")}</p>
            )}
            {t.error && <p className="step-drop">Error: {t.error}</p>}
            {t.summary.length > 0 && (
              <ul className="step-sum">
                {t.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
