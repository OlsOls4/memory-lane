"use client";

import { useState } from "react";
import type { ResidentProfile, DementiaStage } from "@/lib/types";

/** Shown after the first plan: optional extras as one-tap chips, then "Update the plan". */
export default function SharpenPanel({
  profile,
  locked = "",
  onChange,
  onUpdate,
  onFullForm,
  dirty,
  busy,
}: {
  profile: ResidentProfile;
  /** The Quick start favourite: edited in the form above, so it can't be removed here. */
  locked?: string;
  onChange: (p: ResidentProfile) => void;
  onUpdate: () => void;
  onFullForm: () => void;
  dirty: boolean;
  busy: boolean;
}) {
  const [extra, setExtra] = useState("");
  const c = profile.constraints;
  const loved = profile.favourites.loved || [];
  const setC = (patch: Partial<ResidentProfile["constraints"]>) => onChange({ ...profile, constraints: { ...c, ...patch } });
  const setLoved = (xs: string[]) => onChange({ ...profile, favourites: { ...profile.favourites, loved: xs.slice(0, 6) } });
  const addExtra = () => {
    const v = extra.trim();
    if (v && !loved.includes(v)) setLoved([...loved, v]);
    setExtra("");
  };
  const chip = (label: string, on: boolean, toggle: () => void) => (
    <button type="button" key={label} className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={toggle}>
      {on ? "✓ " : "+ "}
      {label}
    </button>
  );
  const stage = (s: DementiaStage, label: string) =>
    chip(label, c.dementiaStage === s, () => setC({ dementiaStage: c.dementiaStage === s ? "none" : s }));

  return (
    <section className="card sharpen no-print" aria-labelledby="sharpen-h">
      <h2 id="sharpen-h">Add more to sharpen this</h2>
      <p className="hint">All optional. Tap what applies, then update the plan.</p>

      <div className="chip-row" role="group" aria-label="Care needs">
        {chip("Hard of hearing", c.hearing !== "none", () => setC({ hearing: c.hearing === "none" ? "mild" : "none" }))}
        {chip("Poor eyesight", c.vision !== "none", () => setC({ vision: c.vision === "none" ? "mild" : "none" }))}
        {chip("Soft foods", c.softFoods, () => setC({ softFoods: !c.softFoods }))}
        {chip("Diabetic", c.diabetic, () => setC({ diabetic: !c.diabetic }))}
      </div>
      <div className="chip-row" role="group" aria-label="Dementia">
        {stage("early", "Dementia: early")}
        {stage("moderate", "Dementia: moderate")}
        {stage("advanced", "Dementia: advanced")}
      </div>

      <div className="loved-row">
        <span className="muted">Things they loved:</span>
        {loved.map((x) => (
          <span key={x} className="chip on static">
            {x}
            {x !== locked && (
              <button type="button" className="chip-x" aria-label={`Remove ${x}`} onClick={() => setLoved(loved.filter((y) => y !== x))}>
                ×
              </button>
            )}
          </span>
        ))}
        <span className="add-loved">
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addExtra();
              }
            }}
            placeholder="Add another favourite"
            aria-label="Add another favourite"
          />
          <button type="button" className="btn btn-secondary" onClick={addExtra} disabled={!extra.trim()}>
            Add
          </button>
        </span>
      </div>

      <div className="sharpen-actions">
        <button className="btn btn-primary" onClick={onUpdate} disabled={busy || !dirty}>
          {busy ? "Updating…" : dirty ? "Update the plan" : "Plan is up to date"}
        </button>
        <button type="button" className="btn btn-link" onClick={onFullForm}>
          Open the full form
        </button>
        <a className="btn btn-link" href="/group">
          Plan a group session
        </a>
      </div>
    </section>
  );
}
