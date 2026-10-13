"use client";
import { useEffect, useState } from "react";
import type { LiveStep } from "@/lib/agentClient";

const STAGE: Record<string, string> = {
  "agent.plan": "Planning",
  "qloo.search": "Looking it up in Qloo",
  "qloo.tags": "Matching interests to Qloo tags",
  "qloo.insights": "Asking Qloo's taste graph",
  "qloo.compare": "Finding taste they share",
  "template.compose": "Writing the week",
  "llm.compose": "Writing the week",
};

/**
 * Live view of the agent while it works: real steps streamed from the server, a progress bar
 * against the usual number of steps, and elapsed time. `compact` is a small floating bar used
 * when a plan is already on screen and is being updated.
 */
export default function AgentProgress({
  steps,
  expected,
  title,
  compact = false,
}: {
  steps: LiveStep[];
  expected: number;
  title: string;
  compact?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    return () => clearInterval(id);
  }, []);

  const finished = steps.filter((s) => s.done).length;
  const qlooCalls = steps.filter((s) => s.tool.startsWith("qloo.") && s.done).length;
  // Never claim 100% until the result arrives; creep slowly if Qloo is taking its time.
  const pct = Math.min(95, Math.max(4, (finished / Math.max(expected, 1)) * 100, Math.min(30, elapsed * 2)));
  const running = steps.filter((s) => !s.done);
  const current = running[running.length - 1] || steps[steps.length - 1];
  const stage = current ? STAGE[current.tool] || "Working" : "Starting the agent";

  if (compact) {
    return (
      <div className="agent-pill no-print" role="status" aria-live="polite">
        <span className="agent-spinner" aria-hidden="true" />
        <span>
          {title}: {stage.toLowerCase()} · {elapsed.toFixed(0)}s
        </span>
        <span className="agent-pill-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      </div>
    );
  }

  const recent = steps.slice(-6);
  return (
    <section className="agent-progress no-print" aria-labelledby="agent-progress-h">
      <div className="agent-progress-head">
        <span className="agent-spinner" aria-hidden="true" />
        <div>
          <h2 id="agent-progress-h">{title}</h2>
          <p className="muted small" role="status" aria-live="polite">
            {stage}… {qlooCalls > 0 && <>{qlooCalls} Qloo {qlooCalls === 1 ? "call" : "calls"} so far · </>}
            {elapsed.toFixed(0)}s
          </p>
        </div>
      </div>
      <div
        className="agent-bar"
        role="progressbar"
        aria-label="Plan progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <ol className="agent-steps">
        {recent.length === 0 && (
          <li className="agent-step running">
            <span className="agent-dot" aria-hidden="true" />
            <span>Reading what you told us…</span>
          </li>
        )}
        {recent.map((s) => (
          <li key={s.n} className={`agent-step ${s.done ? (s.error ? "failed" : "done") : "running"}`}>
            <span className="agent-dot" aria-hidden="true">
              {s.done ? (s.error ? "!" : "✓") : ""}
            </span>
            <span>
              <span className="agent-step-purpose">{s.purpose}</span>
              {s.done && !s.error && s.summary[0] && <span className="agent-step-result"> — {s.summary[0]}</span>}
              {s.done && s.error && <span className="agent-step-result"> — skipped, carrying on</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted small agent-foot">Usually 15 to 40 seconds. Every step stays visible afterwards under “How Memory Lane chose this”.</p>
    </section>
  );
}
