"use client";

import type { PlanItem } from "@/lib/types";
import DomainIcon, { DOMAIN_NAME } from "./DomainIcon";

type Signal = { kind: "link" | "tag" | "match" | "era" | "fav" | "group" | "year" | "other"; text: string; value?: number };

/** Turn the agent's compact signal strings into sentences a carer (or a judge) can read. */
function readSignal(raw: string): Signal {
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^because:\s*(.+)$/i))) return { kind: "link", text: `Qloo linked it to ${m[1]}` };
  if ((m = s.match(/^tag:\s*(.+)$/i))) return { kind: "tag", text: `Shares the taste tag “${m[1]}”` };
  if ((m = s.match(/^affinity\s+([\d.]+)$/i))) return { kind: "match", text: "Taste match", value: Math.max(0, Math.min(1, parseFloat(m[1]))) };
  if (/^era-verified$/i.test(s)) return { kind: "era", text: "Released in their memory years" };
  if (/^favourite$/i.test(s)) return { kind: "fav", text: "One of their own favourites" };
  if ((m = s.match(/^appeals to (\d+)\/(\d+)$/i))) return { kind: "group", text: `Likely to appeal to ${m[1]} of ${m[2]} residents` };
  if ((m = s.match(/^seed:\s*(.+)$/i))) return { kind: "link", text: `Starting point: ${m[1]}` };
  if (/^\d{4}$/.test(s)) return { kind: "year", text: `From ${s}` };
  return { kind: "other", text: s.charAt(0).toUpperCase() + s.slice(1) };
}

export default function ItemCard({ item }: { item: PlanItem }) {
  const signals = item.signals.map(readSignal).filter((s) => s.kind !== "year" || !item.year);
  return (
    <li className="item">
      <div className="item-main">
        <span className="item-icon" title={DOMAIN_NAME[item.domain]}>
          <DomainIcon domain={item.domain} />
          <span className="sr-only">{DOMAIN_NAME[item.domain]}: </span>
        </span>
        <span className="item-text">
          <span className="item-name">{item.name}</span>
          {item.year && <span className="item-year">{item.year}</span>}
          {item.isFavourite && <span className="flag flag-fav">Their favourite</span>}
          {item.eraVerified && !item.isFavourite && <span className="flag flag-era">From their memory years</span>}
        </span>
      </div>
      {item.landing && <p className="landing">{item.landing}</p>}
      {item.appealsTo && item.appealsTo.length > 0 && <p className="appeals">Good for {item.appealsTo.join(", ")}</p>}
      <details className="why">
        <summary>
          <span>Why this?</span>
        </summary>
        <div className="why-body">
          {item.landing && (
            <p className="why-landing">
              <span className="model-chip">Nemotron planner</span> {item.landing}
            </p>
          )}
          <p>{item.why}</p>
          {signals.length > 0 && (
            <ul className="signals" aria-label="What Qloo matched on">
              {signals.map((s, i) => (
                <li key={i} className={`signal signal-${s.kind}`}>
                  {s.kind === "match" && s.value !== undefined ? (
                    <>
                      <span>{s.text}</span>
                      <span className="meter" role="img" aria-label={`${Math.round(s.value * 100)} out of 100`}>
                        <span style={{ width: `${Math.round(s.value * 100)}%` }} />
                      </span>
                      <span className="meter-num">{Math.round(s.value * 100)}/100</span>
                    </>
                  ) : (
                    <span>{s.text}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}
