"use client";

import { useEffect, useMemo, useState } from "react";
import ResidentForm, { EMPTY_RESIDENT, cleanResident } from "@/components/ResidentForm";
import PlanView from "@/components/PlanView";
import QuickStart, { COUNTRIES } from "@/components/QuickStart";
import SharpenPanel from "@/components/SharpenPanel";
import { QUICK_SAMPLES, SAMPLE_RESIDENTS, type QuickInput } from "@/lib/agent/care";
import { parseBirth, parseBornText, splitPlace } from "@/lib/validate";
import type { ResidentProfile, WeekPlan } from "@/lib/types";

const EMPTY_QUICK: QuickInput = { firstName: "", born: "", place: "", loved: "" };

/** Turn the Quick start boxes (plus anything added via "sharpen") into the /api/plan request body. */
function quickPayload(q: QuickInput, country: string, base: ResidentProfile) {
  const place = splitPlace(q.place, country);
  const born = parseBornText(q.born) || {};
  const extraLoved = (base.favourites.loved || []).filter((x) => x.toLowerCase() !== q.loved.trim().toLowerCase());
  const loved = [q.loved.trim(), ...extraLoved].filter(Boolean);
  return {
    ...cleanResident(base),
    birthYear: undefined,
    birthYearApprox: undefined,
    ...born,
    firstName: q.firstName.trim(),
    hometown: place.hometown,
    country: place.country,
    favourites: { ...cleanResident(base).favourites, loved: [...new Set(loved)] },
  };
}

export default function Home() {
  const [view, setView] = useState<"quick" | "full">("quick");
  const [quick, setQuick] = useState<QuickInput>(EMPTY_QUICK);
  const [country, setCountry] = useState("United Kingdom");
  const [resident, setResident] = useState<ResidentProfile>(EMPTY_RESIDENT);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [lastSent, setLastSent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sensible default country from the browser's language (en-US -> United States), editable inline.
  useEffect(() => {
    const lang = (navigator.language || "").toLowerCase();
    const guess = lang.endsWith("-us") ? "United States" : lang.endsWith("-ie") ? "Ireland" : lang.endsWith("-ca") ? "Canada" : lang.endsWith("-au") ? "Australia" : lang.endsWith("-nz") ? "New Zealand" : null;
    if (guess && COUNTRIES.includes(guess)) setCountry(guess);
  }, []);

  const payload = useMemo(
    () => (view === "quick" ? quickPayload(quick, country, resident) : cleanResident(resident)),
    [view, quick, country, resident],
  );
  const dirty = JSON.stringify(payload) !== lastSent;

  async function build(body: unknown = payload) {
    setBusy(true);
    setError(null);
    const sent = JSON.stringify(body);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resident: body }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Something went wrong.");
      const firstPlan = !plan;
      setPlan(out);
      setLastSent(sent);
      if (firstPlan) setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function tryExample(q: QuickInput) {
    const fresh = EMPTY_RESIDENT;
    const c = splitPlace(q.place, "United Kingdom").country;
    setView("quick");
    setQuick(q);
    setCountry(c);
    setResident(fresh);
    setPlan(null);
    void build(quickPayload(q, c, fresh));
  }

  function openFullForm() {
    if (view === "quick") {
      const place = splitPlace(quick.place, country);
      let birthYear = resident.birthYear;
      try {
        birthYear = parseBirth(parseBornText(quick.born) || {}).year;
      } catch {}
      const loved = quickPayload(quick, country, resident).favourites.loved;
      const next = { ...resident, firstName: quick.firstName.trim(), birthYear, hometown: place.hometown, country: place.country, favourites: { ...resident.favourites, loved } };
      setResident(next);
    }
    setView("full");
    setTimeout(() => document.getElementById("full-form")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function backToQuick() {
    const loved = resident.favourites.loved || [];
    setQuick({
      firstName: resident.firstName,
      born: resident.birthYear ? String(resident.birthYear) : "",
      place: resident.hometown,
      loved: loved[0] || resident.favourites.artists[0] || resident.favourites.films[0] || resident.favourites.tvShows[0] || resident.favourites.hobbies[0] || "",
    });
    if (COUNTRIES.includes(resident.country)) setCountry(resident.country);
    setView("quick");
  }

  return (
    <>
      <section className="intro no-print">
        <h1>A week of moments that feel like home</h1>
        <p className="lead">
          When they were born, where they grew up and one thing they loved is enough. Memory Lane finds the songs, films,
          telly, food and places from their youth through Qloo&apos;s cultural taste graph and turns them into a printable
          week of activities.
        </p>
      </section>

      {view === "quick" ? (
        <section className="card no-print" aria-labelledby="quick-h">
          <div className="quick-head">
            <h2 id="quick-h">Quick start</h2>
            <div className="samples">
              <span>Try an example:</span>
              {QUICK_SAMPLES.map((s) => (
                <button key={s.firstName} type="button" className="btn btn-ghost" disabled={busy} onClick={() => tryExample(s)}>
                  {s.firstName} · {s.loved}
                </button>
              ))}
            </div>
          </div>
          <QuickStart value={quick} country={country} onChange={setQuick} onCountry={setCountry} onSubmit={() => build()} busy={busy} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="muted small">
            Care needs, diet and more favourites are optional; add them after the first plan, or{" "}
            <button type="button" className="btn btn-link inline" onClick={openFullForm}>
              use the full form
            </button>
            .
          </p>
        </section>
      ) : (
        <section className="card no-print" id="full-form" aria-labelledby="full-h">
          <div className="quick-head">
            <h2 id="full-h">Full profile</h2>
            <button type="button" className="btn btn-link" onClick={backToQuick}>
              ← Back to Quick start
            </button>
          </div>
          <div className="samples">
            <span>Detailed examples:</span>
            {SAMPLE_RESIDENTS.map((s) => (
              <button key={s.firstName} className="btn btn-ghost" onClick={() => { setResident(s); setPlan(null); }}>
                {s.firstName}, {s.hometown} ({s.birthYear})
              </button>
            ))}
          </div>
          <ResidentForm value={resident} onChange={setResident} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" onClick={() => build()} disabled={busy}>
            {busy ? "Building the week…" : "Build the week’s plan"}
          </button>
        </section>
      )}

      <div id="plan">
        {plan && (
          <>
            {view === "quick" && (
              <SharpenPanel
                profile={{ ...resident, favourites: { ...resident.favourites, loved: payload.favourites.loved } }}
                locked={quick.loved.trim()}
                onChange={setResident}
                onUpdate={() => build()}
                onFullForm={openFullForm}
                dirty={dirty}
                busy={busy}
              />
            )}
            <PlanView plan={plan} />
          </>
        )}
      </div>
    </>
  );
}
