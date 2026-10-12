"use client";

import { useEffect } from "react";
import type { WeekPlan } from "@/lib/types";
import ItemCard from "./ItemCard";
import TraceView from "./TraceView";

export default function PlanView({ plan }: { plan: WeekPlan }) {
  const r = plan.resident;
  // Open every "Why this?" before printing so the printed sheet carries the reasons too.
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>("details.why").forEach((d) => (d.open = true));
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);
  return (
    <section className="plan" aria-live="polite">
      <header className="plan-head">
        <div>
          <p className="eyebrow">Weekly reminiscence plan</p>
          <h2>
            {r.firstName || "Your resident"}, born {r.birthYearApprox ? "about " : ""}
            {r.birthYear}
            {r.hometown ? ` · ${r.hometown}` : ""}
          </h2>
          <p className="muted">
            Formative years {plan.era.formativeStart}–{plan.era.formativeEnd} · {plan.qlooMode === "mock" ? "Demo data (mock Qloo)" : "Live Qloo taste graph"} ·
            wording by {plan.composer === "gemini" ? "Gemini" : "template"}
          </p>
        </div>
        <button className="btn btn-secondary no-print" onClick={() => window.print()}>
          Print this week
        </button>
      </header>

      {plan.understood && plan.understood.length > 0 && (
        <div className="understood no-print">
          <p>
            <strong>How Memory Lane read what you typed</strong> (via Qloo search):
          </p>
          {plan.understood.map((u) => (
            <p key={u}>{u}</p>
          ))}
        </div>
      )}

      {plan.warnings.length > 0 && (
        <div className="notice no-print">
          {plan.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <div className="care-box">
        <h3>Care notes for every session</h3>
        <ul>
          {plan.generalAdaptations.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      <div className="days">
        {plan.days.map((d) => (
          <article key={d.day} className="day">
            <header>
              <p className="eyebrow">
                {d.day} · {d.theme}
              </p>
              <h3>{d.title}</h3>
              <p className="muted">About {d.durationMins} minutes</p>
            </header>
            <p>{d.intro}</p>
            {d.items.length > 0 && (
              <ul className="items">
                {d.items.map((i) => (
                  <ItemCard key={i.entityId + d.day} item={i} />
                ))}
              </ul>
            )}
            <h4>How to run it</h4>
            <ol className="steps">
              {d.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <h4>Things to ask</h4>
            <ul className="prompts">
              {d.prompts.map((s, i) => (
                <li key={i}>“{s}”</li>
              ))}
            </ul>
            {d.adaptations.length > 0 && (
              <div className="adapt">
                {d.adaptations.map((a) => (
                  <p key={a}>{a}</p>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      <TraceView trace={plan.trace} />
      <p className="footnote">
        Suggestions support, and never replace, the resident&apos;s care plan. Recommendations powered by Qloo&apos;s taste AI.
      </p>
    </section>
  );
}
