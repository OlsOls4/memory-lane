"use client";

import { parseBornText } from "@/lib/validate";
import type { QuickInput } from "@/lib/agent/care";

export const COUNTRIES = ["United Kingdom", "United States", "Ireland", "Canada", "Australia", "New Zealand"];

/** Four boxes and one button. Only "Born" and "One thing they loved" are needed for a useful plan. */
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
  const bornHint = !value.born.trim()
    ? "A year, a decade or their age"
    : !born
      ? "Try 1946, 1940s or age 82"
      : born.birthYear
        ? `Born ${born.birthYear}`
        : born.birthDecade
          ? `Born in the ${born.birthDecade}`
          : `About ${born.age}, so born around ${new Date().getFullYear() - (born.age || 0)}`;
  const ready = !!born && !!value.loved.trim();

  return (
    <form
      className="quick"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onSubmit();
      }}
    >
      <div className="quick-grid">
        <label>
          <span>
            First name <em className="opt">optional</em>
          </span>
          <input value={value.firstName} onChange={(e) => set({ firstName: e.target.value })} placeholder="Margaret" autoComplete="off" />
        </label>
        <label>
          <span>Born</span>
          <input
            value={value.born}
            onChange={(e) => set({ born: e.target.value })}
            placeholder="1946, 1940s or age 82"
            inputMode="text"
            autoComplete="off"
            aria-describedby="born-hint"
            aria-invalid={!!value.born.trim() && !born}
          />
          <small id="born-hint" className={value.born.trim() && !born ? "hint bad" : "hint"}>
            {bornHint}
          </small>
        </label>
        <label>
          <span>
            Where they grew up <em className="opt">optional</em>
          </span>
          <input value={value.place} onChange={(e) => set({ place: e.target.value })} placeholder="Town or city" autoComplete="off" />
          <small className="hint country-line">
            in{" "}
            <select aria-label="Country they grew up in" value={country} onChange={(e) => onCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </small>
        </label>
        <label className="wide">
          <span>One thing they loved</span>
          <input
            value={value.loved}
            onChange={(e) => set({ loved: e.target.value })}
            placeholder="A singer, film, TV show, food or pastime: e.g. Elvis, Coronation Street, ballroom dancing"
            autoComplete="off"
          />
          <small className="hint">Anything at all. Memory Lane works out whether it&apos;s music, film, TV, food or a hobby.</small>
        </label>
      </div>
      <button type="submit" className="btn btn-primary btn-big" disabled={!ready || busy}>
        {busy ? "Making the plan…" : "Make a plan"}
      </button>
    </form>
  );
}
