"use client";

import { useState } from "react";
import type { DayPlan, Reaction, ResidentProfile } from "@/lib/types";
import { shortModel } from "@/lib/nemotron/names";

interface ScriptState {
  lines: { cue: string; say: string }[];
  model?: string;
  ms: number;
  source: "nemotron" | "template";
}

/** "Script this session" (Nemotron 3.5 Lightning, on demand). */
export function SessionScript({ day, resident }: { day: DayPlan; resident: ResidentProfile }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<ScriptState | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day: { ...day, items: day.items.map((i) => ({ name: i.name, year: i.year })) },
          resident: { firstName: resident.firstName, country: resident.country, constraints: resident.constraints },
        }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || "Could not write the script.");
      setOut(b);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!out)
    return (
      <div className="script-cta no-print">
        <button type="button" className="btn btn-secondary btn-small" onClick={run} disabled={busy} aria-busy={busy}>
          {busy ? "Writing the script…" : "Script this session"}
        </button>
        <span className="muted tiny">A word-for-word script for staff new to this resident</span>
        {error && <p className="error">{error}</p>}
      </div>
    );
  return (
    <div className="script">
      <h4>
        Session script{" "}
        {out.model && (
          <span className="model-chip" title={`${out.model}, ${(out.ms / 1000).toFixed(1)} s`}>
            {shortModel(out.model)}
          </span>
        )}
      </h4>
      <ol>
        {out.lines.map((l, i) => (
          <li key={i}>
            <span className="script-cue">{l.cue}</span>
            <span className="script-say">“{l.say}”</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface DayFeedbackState {
  reaction?: Reaction;
  note?: string;
}

const REACTIONS: { r: Reaction; label: string }[] = [
  { r: "loved", label: "Loved it" },
  { r: "some", label: "Some of it" },
  { r: "no", label: "Didn’t land" },
];

/** "How did it go?" for one day; feeds next week's plan. */
export function HowDidItGo({ value, onChange }: { value?: DayFeedbackState; onChange: (v: DayFeedbackState) => void }) {
  const v = value || {};
  return (
    <div className="how no-print" role="group" aria-label="How did it go?">
      <p className="how-h">How did it go?</p>
      <div className="chip-row">
        {REACTIONS.map((x) => (
          <button
            type="button"
            key={x.r}
            className={`chip chip-${x.r}${v.reaction === x.r ? " on" : ""}`}
            aria-pressed={v.reaction === x.r}
            onClick={() => onChange({ ...v, reaction: v.reaction === x.r ? undefined : x.r })}
          >
            {x.label}
          </button>
        ))}
      </div>
      {v.reaction && (
        <input
          className="how-note"
          value={v.note || ""}
          maxLength={300}
          onChange={(e) => onChange({ ...v, note: e.target.value })}
          placeholder="What did you notice? e.g. sang every word of Moon River"
          aria-label="Notes on how it went"
        />
      )}
    </div>
  );
}
