"use client";

import { useEffect } from "react";
import type { WeekPlan } from "@/lib/types";
import ItemCard from "./ItemCard";
import TraceView from "./TraceView";
import TuningDial from "./TuningDial";

const slug = (s: string) => `day-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** Parse the agent's '"Elvis" → singer/band: Elvis Presley (1935)' lines into what was typed and what it became. */
function readUnderstood(line: string) {
  const m = line.match(/^"(.+?)"\s*→\s*(.+)$/);
  return m ? { typed: m[1], read: m[2] } : { typed: "", read: line };
}

export default function PlanView({ plan, rail }: { plan: WeekPlan; rail?: React.ReactNode }) {
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
            {plan.qlooMode === "mock" ? "Demo data" : "Recommendations from Qloo’s taste graph"}. Made with Memory Lane.
          </p>
        </div>
        <button className="btn btn-secondary no-print" onClick={() => window.print()}>
          Print this week
        </button>
      </header>

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

      <div className="plan-layout">
        <aside className="rail">
          <nav className="week-index no-print" aria-label="Days of the week">
            {plan.days.map((d) => (
              <a key={d.day} href={`#${slug(d.day)}`}>
                {d.day.slice(0, 3)}
              </a>
            ))}
          </nav>
          <div className="care-notes">
            <h3>Every session</h3>
            <ul>
              {plan.generalAdaptations.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          {rail}
        </aside>

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
                </div>
              </div>
              {d.adaptations.length > 0 && (
                <div className="adapt">
                  <h4>For {name || "them"}</h4>
                  {d.adaptations.map((a) => (
                    <p key={a}>{a}</p>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      <TraceView trace={plan.trace} composer={plan.composer} />
      <p className="footnote">
        These ideas support the resident’s care plan and never replace it. Recommendations powered by Qloo’s taste AI.
      </p>
    </section>
  );
}
