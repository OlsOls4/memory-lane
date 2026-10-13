"use client";

import { useEffect } from "react";
import type { WeekPlan } from "@/lib/types";
import ItemCard from "./ItemCard";
import TraceView from "./TraceView";
import AiCompare from "./AiCompare";
import TuningDial from "./TuningDial";
import AiLayer from "./AiLayer";
import { HowDidItGo, SessionScript, type DayFeedbackState } from "./DayExtras";

const slug = (s: string) => `day-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** Parse the agent's '"Elvis" → singer/band: Elvis Presley (1935)' lines into what was typed and what it became. */
function readUnderstood(line: string) {
  const m = line.match(/^"(.+?)"\s*→\s*(.+)$/);
  return m ? { typed: m[1], read: m[2] } : { typed: "", read: line };
}

function PrinterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

function PrintButton() {
  return (
    <button type="button" className="btn btn-primary btn-print no-print" onClick={() => window.print()}>
      <PrinterIcon /> Print this week
    </button>
  );
}

export default function PlanView({
  plan,
  rail,
  feedback = {},
  onFeedback,
  onAdapt,
  busy = false,
}: {
  plan: WeekPlan;
  rail?: React.ReactNode;
  /** "How did it go" per day name. */
  feedback?: Record<string, DayFeedbackState>;
  onFeedback?: (day: string, v: DayFeedbackState) => void;
  onAdapt?: () => void;
  busy?: boolean;
}) {
  const rated = Object.values(feedback).filter((f) => f.reaction).length;
  const r = plan.resident;
  // Open every "Why this?" before printing so the printed sheet carries the reasons too.
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>("details.why").forEach((d) => (d.open = true));
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);
  const name = r.firstName?.trim();
  const born = `${r.birthYearApprox ? "around " : ""}${r.birthYear}`;
  return (
    <section className="plan" aria-labelledby="plan-h" aria-live="polite">
      <header className="plan-head">
        <div className="plan-title">
          <h2 id="plan-h">{name ? `${name}’s week` : "Their week"}</h2>
          <p className="plan-sub">
            Born {born}
            {r.hometown ? ` in ${r.hometown}` : ""}. Songs, films and stories from {plan.era.formativeStart} to {plan.era.formativeEnd}.
          </p>
          <p className="print-only plan-print-meta">
            {plan.qlooMode === "mock" ? "Demo data" : "Recommendations from Qloo’s taste graph"}
            {plan.planner === "nemotron" ? ", planned with NVIDIA Nemotron" : ""}. Made with Memory Lane.
          </p>
        </div>
        <PrintButton />
      </header>

      <AiLayer models={plan.models || []} planner={plan.planner} strategy={plan.strategy} />

      {plan.adapted && (
        <div className="adapted no-print" role="status">
          <h3 className="understood-h">What changed from last week{plan.adapted.model ? <span className="model-chip">{plan.adapted.model}</span> : null}</h3>
          <p>{plan.adapted.summary}</p>
          <ul>
            {plan.adapted.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="no-print">
        <TuningDial
          compact
          rows={[{ birthYear: r.birthYear, start: plan.era.formativeStart, end: plan.era.formativeEnd, approx: r.birthYearApprox }]}
        />
      </div>

      {plan.understood && plan.understood.length > 0 && (
        <div className="understood no-print">
          <h3 className="understood-h">How we read what you typed</h3>
          <ul>
            {plan.understood.map((u) => {
              const x = readUnderstood(u);
              return (
                <li key={u}>
                  {x.typed && <span className="typed">“{x.typed}”</span>}
                  {x.typed && <span className="became"> became </span>}
                  <span className="read">{x.read}</span>
                </li>
              );
            })}
          </ul>
          <p className="understood-note">Matched with Qloo search and taste tags.</p>
        </div>
      )}

      {plan.warnings.length > 0 && (
        <div className="notice no-print" role="status">
          {plan.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {plan.flagged && plan.flagged.length > 0 && (
        <details className="flagged no-print">
          <summary>
            Left out for {name || "them"} <span className="pill">{plan.flagged.length}</span>
          </summary>
          <ul>
            {plan.flagged.map((f) => (
              <li key={f.name}>
                <strong>{f.name}</strong>: {f.reason}
                <span className="muted tiny"> ({f.by === "nemotron" ? "Nemotron planner" : "safety guard"})</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="plan-layout">
        <div className="week-bar no-print">
          <nav className="week-index" aria-label="Days of the week">
            {plan.days.map((d) => (
              <a key={d.day} href={`#${slug(d.day)}`}>
                {d.day.slice(0, 3)}
              </a>
            ))}
          </nav>
          <button type="button" className="week-print" onClick={() => window.print()} aria-label="Print this week">
            <PrinterIcon /> <span>Print</span>
          </button>
        </div>

        <div className="days">
          {plan.days.map((d) => (
            <article key={d.day} className="day" id={slug(d.day)} aria-labelledby={`${slug(d.day)}-h`}>
              <header className="day-head">
                <p className="day-name">{d.day}</p>
                <p className="day-mins">About {d.durationMins} minutes</p>
                <h3 id={`${slug(d.day)}-h`}>{d.title}</h3>
                <p className="day-theme">{d.theme}</p>
              </header>
              <p className="day-intro">{d.intro}</p>
              {d.items.length > 0 && (
                <ul className="items">
                  {d.items.map((i) => (
                    <ItemCard key={i.entityId + d.day} item={i} />
                  ))}
                </ul>
              )}
              <div className="day-cols">
                <div>
                  <h4>How to run it</h4>
                  <ol className="steps">
                    {d.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h4>Things to ask</h4>
                  <ul className="prompts">
                    {d.prompts.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                  {d.followUps && d.followUps.length > 0 && (
                    <>
                      <p className="follow-h">If they light up</p>
                      <ul className="prompts follow">
                        {d.followUps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
              {d.localHistory && d.localHistory.length > 0 && (
                <div className="local-history">
                  <h4>Around {r.hometown || "home"} back then</h4>
                  <ul>
                    {d.localHistory.map((h) => (
                      <li key={h.title}>
                        <strong>
                          {h.title}
                          {h.year ? ` (${h.year})` : ""}
                        </strong>{" "}
                        {h.detail}{" "}
                        {h.url && (
                          <a href={h.url} target="_blank" rel="noreferrer" className="no-print">
                            Source
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="print-only joy">
                <p>What sparked joy today:</p>
                <span />
                <span />
              </div>
              {d.adaptations.length > 0 && (
                <div className="adapt">
                  <h4>For {name || "them"}</h4>
                  {d.adaptations.map((a) => (
                    <p key={a}>{a}</p>
                  ))}
                </div>
              )}
              <SessionScript key={plan.generatedAt + d.day} day={d} resident={r} />
              {onFeedback && <HowDidItGo value={feedback[d.day]} onChange={(v) => onFeedback(d.day, v)} />}
            </article>
          ))}
        </div>

        <div className="plan-after">
          <div className="care-notes">
            <h3>Every session</h3>
            <ul>
              {plan.generalAdaptations.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          {onAdapt && (
            <section className="next-week no-print" aria-labelledby="next-week-h">
              <h3 id="next-week-h">Plan next week from how it went</h3>
              <p className="hint">
                {rated
                  ? `${rated} of 7 days rated. The agent keeps what sparked joy, swaps what didn’t, and picks up anything new from your notes.`
                  : "After each session, tap how it went on that day. The agent then adapts next week around it."}
              </p>
              <button className="btn btn-primary btn-wide" onClick={onAdapt} disabled={!rated || busy} aria-busy={busy}>
                {busy ? "Planning next week…" : "Plan next week"}
              </button>
            </section>
          )}
          {rail}
          <div className="print-again no-print">
            <PrintButton />
            <p className="muted small">Prints one clean A4 sheet per day or two, with the reasons and a space to note what sparked joy.</p>
          </div>
        </div>
      </div>

      <TraceView trace={plan.trace} composer={plan.composer} />
      <AiCompare plan={plan} />
      <p className="footnote">
        These ideas support the resident’s care plan and never replace it. Recommendations from Qloo’s taste AI
        {plan.composer === "nemotron" || plan.planner === "nemotron" ? "; planned and written with NVIDIA Nemotron on Nebius Token Factory" : ""}.
      </p>
    </section>
  );
}
