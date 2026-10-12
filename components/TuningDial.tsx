"use client";

import { useRef, useState } from "react";

/**
 * The tuning dial: a wireless-set scale of years with the resident's memory years (ages 10-25,
 * the window Memory Lane asks Qloo about) lit up. One row for a single resident, stacked rows
 * for a group, with the years they share lit as a column.
 */

export interface DialRow {
  label?: string;
  birthYear: number;
  start: number;
  end: number;
  approx?: boolean;
}

const floor10 = (n: number) => Math.floor(n / 10) * 10;
const ceil10 = (n: number) => Math.ceil(n / 10) * 10;

export default function TuningDial({
  rows,
  shared,
  caption,
  idle,
  compact = false,
  onTune,
  tuneMin = 1920,
  tuneMax = 1975,
}: {
  rows: DialRow[];
  shared?: { start: number; end: number; overlap: boolean } | null;
  caption?: React.ReactNode;
  /** Shown when there is nothing to tune to yet. */
  idle?: string;
  compact?: boolean;
  /** Makes the dial a slider: click, drag or use the arrow keys to set the birth year. */
  onTune?: (year: number) => void;
  tuneMin?: number;
  tuneMax?: number;
}) {
  const interactive = !!onTune;
  const ticksRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // An interactive dial keeps a fixed scale so it never rescales under the pointer.
  const from = interactive ? 1920 : Math.min(1920, ...rows.map((r) => floor10(r.birthYear - 2)));
  const to = interactive ? 2000 : Math.max(2000, ...rows.map((r) => ceil10(r.end + 2)));
  const span = to - from;
  const pct = (y: number) => `${(((Math.min(Math.max(y, from), to) - from) / span) * 100).toFixed(3)}%`;
  const decades: number[] = [];
  for (let y = from; y <= to; y += 10) decades.push(y);

  const single = rows.length === 1 ? rows[0] : null;
  const label = single
    ? `Born ${single.approx ? "about " : ""}${single.birthYear}. Memory years ${single.start} to ${single.end}.`
    : rows.length > 1
      ? `${rows.map((r) => `${r.label || "Resident"}: memory years ${r.start} to ${r.end}`).join(". ")}.${
          shared ? ` ${shared.overlap ? "Shared years" : "Combined years"} ${shared.start} to ${shared.end}.` : ""
        }`
      : idle || "No years chosen yet.";

  const current = rows.length === 1 ? rows[0].birthYear : null;
  const clamp = (y: number) => Math.min(tuneMax, Math.max(tuneMin, Math.round(y)));
  const yearAt = (clientX: number) => {
    const el = ticksRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return clamp(from + ((clientX - r.left) / r.width) * span);
  };
  const tune = (y: number | null) => {
    if (y != null && y !== current) onTune?.(y);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const base = current ?? 1946;
    const step = e.shiftKey ? 10 : 1;
    const next: Record<string, number> = {
      ArrowLeft: base - step,
      ArrowDown: base - step,
      ArrowRight: base + step,
      ArrowUp: base + step,
      PageDown: base - 10,
      PageUp: base + 10,
      Home: tuneMin,
      End: tuneMax,
    };
    if (e.key in next) {
      e.preventDefault();
      tune(clamp(next[e.key]));
    }
  };
  const sliderProps = interactive
    ? {
        role: "slider",
        tabIndex: 0,
        "aria-label": "Year of birth",
        "aria-valuemin": tuneMin,
        "aria-valuemax": tuneMax,
        "aria-valuenow": current ?? undefined,
        "aria-valuetext": current ? label : "Not set. Use the arrow keys to choose a year.",
        onKeyDown: onKey,
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus();
          setDragging(true);
          tune(yearAt(e.clientX));
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          if (dragging) tune(yearAt(e.clientX));
        },
        onPointerUp: () => setDragging(false),
        onPointerCancel: () => setDragging(false),
      }
    : {};

  return (
    <figure
      className={`dial${compact ? " dial-compact" : ""}${rows.length > 1 ? " dial-stack" : ""}${interactive ? " dial-live" : ""}${dragging ? " dragging" : ""}`}
      {...(interactive ? {} : { role: "img", "aria-label": label })}
    >
      <div className="dial-glass" style={{ ["--years" as any]: span }} {...sliderProps}>
        <div className="dial-scale" aria-hidden="true">
          {decades.map((y) => (
            <span key={y} className={`dial-decade${(y - from) % 20 ? " odd" : ""}`} style={{ left: pct(y) }}>
              {y}
            </span>
          ))}
        </div>
        <div className="dial-ticks" aria-hidden="true" ref={ticksRef} />
        <div className="dial-tracks" aria-hidden="true">
          {shared && rows.length > 1 && (
            <span
              className={`dial-shared${shared.overlap ? "" : " loose"}`}
              style={{ left: pct(shared.start), width: `calc(${pct(shared.end)} - ${pct(shared.start)})` }}
            />
          )}
          {rows.length === 0 && <span className="dial-needle parked" style={{ left: pct(1946) }} />}
          {rows.map((r, i) => (
            <div key={(r.label || "") + i} className="dial-track">
              <span className="dial-band" style={{ left: pct(r.start), width: `calc(${pct(r.end)} - ${pct(r.start)})` }}>
                {rows.length > 1 && <span className="dial-band-label">{r.label}</span>}
              </span>
              {single && (
                <span className="dial-needle" style={{ left: pct(r.birthYear) }}>
                  {interactive && <span className="dial-needle-year">{r.birthYear}</span>}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {(caption || rows.length === 0) && <figcaption className="dial-caption">{caption || idle}</figcaption>}
    </figure>
  );
}
