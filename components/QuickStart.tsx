"use client";

import { parseBirth, parseBornText } from "@/lib/validate";
import { eraFor, type QuickInput } from "@/lib/agent/care";
import TuningDial from "./TuningDial";

export const COUNTRIES = ["United Kingdom", "United States", "Ireland", "Canada", "Australia", "New Zealand"];

/** The dial, two boxes that matter and two that help, then one button. */
export default function QuickStart({
  value,
  country,
  onChange,
  onCountry,
  onSubmit,
  busy,
}: {
  value: QuickInput;
  country: string;
  onChange: (v: QuickInput) => void;
  onCountry: (c: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const set = (patch: Partial<QuickInput>) => onChange({ ...value, ...patch });
  const born = parseBornText(value.born);
  let year: { year: number; approx: boolean } | null = null;
  try {
    year = born ? parseBirth(born) : null;
  } catch {
    year = null;
  }
  const bad = !!value.born.trim() && !year;
  const bornHint = !value.born.trim()
    ? "A year, a decade or their age"
    : bad
      ? "Try a year like 1946, a decade like 1940s, or an age like 82"
      : born?.birthYear
        ? `Born ${born.birthYear}`
        : born?.birthDecade
          ? `Born in the ${born.birthDecade}`
          : `About ${born?.age}, so born around ${year?.year}`;
  const ready = !!year && !!value.loved.trim();
  const era = year ? eraFor(year.year) : null;
  const who = value.firstName.trim() || "They";

  return (
    <form
      className="quick"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onSubmit();
      }}
    >
      <TuningDial
        rows={year && era ? [{ birthYear: year.year, start: era.formativeStart, end: era.formativeEnd, approx: year.approx }] : []}
        idle="Type when they were born, or drag the needle, and the dial finds the years they remember best."
        onTune={(y) => set({ born: String(y) })}
        caption={
          year && era ? (
            <>
              {who === "They" ? "Their" : `${who}’s`} memory years: <strong>{era.formativeStart} to {era.formativeEnd}</strong>, from age 10 to 25.
            </>
          ) : undefined
        }
      />
      <div className="quick-body">
        <div className="quick-grid">
          <label className="field">
            <span className="field-label">Born</span>
            <input
              value={value.born}
              onChange={(e) => set({ born: e.target.value })}
              placeholder="1946, 1940s or age 82"
              inputMode="text"
              autoComplete="off"
              aria-describedby="born-hint"
              aria-invalid={bad}
            />
            <small id="born-hint" className={bad ? "hint bad" : "hint"}>
              {bornHint}
            </small>
          </label>
          <label className="field">
            <span className="field-label">One thing they loved</span>
            <input
              value={value.loved}
              onChange={(e) => set({ loved: e.target.value })}
              placeholder="Elvis, Coronation Street, ballroom dancing…"
              autoComplete="off"
              aria-describedby="loved-hint"
            />
            <small id="loved-hint" className="hint">
              A singer, film, TV show, food or pastime. We’ll work out which.
            </small>
          </label>
          <label className="field">
            <span className="field-label">
              First name <span className="opt">(optional)</span>
            </span>
            <input value={value.firstName} onChange={(e) => set({ firstName: e.target.value })} placeholder="Margaret" autoComplete="off" />
          </label>
          <div className="field">
            <label className="field-label" htmlFor="qs-place">
              Where they grew up <span className="opt">(optional)</span>
            </label>
            <div className="place-pair">
              <input id="qs-place" value={value.place} onChange={(e) => set({ place: e.target.value })} placeholder="Town or city" autoComplete="off" />
              <select aria-label="Country they grew up in" value={country} onChange={(e) => onCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-big" disabled={!ready || busy} aria-busy={busy}>
          {busy ? "Making the plan…" : "Make a week’s plan"}
        </button>
        {!ready && !busy && <p className="hint ready-hint">Fill in when they were born and one thing they loved to make a plan.</p>}
      </div>
    </form>
  );
}
