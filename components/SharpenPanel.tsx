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
      <span className="chip-mark" aria-hidden="true">{on ? "✓" : "+"}</span>
      {label}
    </button>
  );
  const stage = (s: DementiaStage, label: string) =>
    chip(label, c.dementiaStage === s, () => setC({ dementiaStage: c.dementiaStage === s ? "none" : s }));

  return (
    <section className="sharpen no-print" aria-labelledby="sharpen-h">
      <h3 id="sharpen-h">Sharpen this plan</h3>
      <p className="hint">Tap anything that applies, then update the plan.</p>

      <p className="group-label" id="sh-care">Care needs</p>
      <div className="chip-row" role="group" aria-labelledby="sh-care">
        {chip("Hard of hearing", c.hearing !== "none", () => setC({ hearing: c.hearing === "none" ? "mild" : "none" }))}
        {chip("Poor eyesight", c.vision !== "none", () => setC({ vision: c.vision === "none" ? "mild" : "none" }))}
        {chip("Soft foods", c.softFoods, () => setC({ softFoods: !c.softFoods }))}
        {chip("Diabetic", c.diabetic, () => setC({ diabetic: !c.diabetic }))}
      </div>
      <p className="group-label" id="sh-dementia">Dementia</p>
      <div className="chip-row" role="group" aria-labelledby="sh-dementia">
        {stage("early", "Early stage")}
        {stage("moderate", "Moderate")}
        {stage("advanced", "Advanced")}
      </div>

      <label className="group-label" htmlFor="sh-avoid">Anything to steer clear of?</label>
      <input
        id="sh-avoid"
        className="avoid-input"
        value={c.avoid || ""}
        maxLength={200}
        onChange={(e) => setC({ avoid: e.target.value || undefined })}
        placeholder="e.g. war films, talk of the sea"
      />

      <p className="group-label" id="sh-loved">Things they loved</p>
      <div className="chip-row" role="group" aria-labelledby="sh-loved">
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
      </div>
      <div className="add-loved">
        <input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addExtra();
            }
          }}
          placeholder="Another favourite"
          aria-label="Add another thing they loved"
        />
        <button type="button" className="btn btn-secondary" onClick={addExtra} disabled={!extra.trim()}>
          Add
        </button>
      </div>

      <button className="btn btn-primary btn-wide" onClick={onUpdate} disabled={busy || !dirty} aria-busy={busy}>
        {busy ? "Updating the plan…" : dirty ? "Update the plan" : "Plan is up to date"}
      </button>
      <p className="sharpen-links">
        <button type="button" className="btn-text" onClick={onFullForm}>
          Open the full form
        </button>
        <a className="btn-text" href="/group">
          Plan a group session
        </a>
      </p>
    </section>
  );
}
