"use client";

import { useEffect, useMemo, useState } from "react";
import ResidentForm, { EMPTY_RESIDENT, cleanResident } from "@/components/ResidentForm";
import AgentProgress from "@/components/AgentProgress";
import { runAgent, type LiveStep } from "@/lib/agentClient";
import PlanView from "@/components/PlanView";
import QuickStart, { COUNTRIES } from "@/components/QuickStart";
import SharpenPanel from "@/components/SharpenPanel";
import { QUICK_SAMPLES, SAMPLE_RESIDENTS, type QuickInput } from "@/lib/agent/care";
import { parseBirth, parseBornText, splitPlace } from "@/lib/validate";
import type { ResidentProfile, WeekPlan } from "@/lib/types";

/** Smooth scrolling only for people who have not asked for reduced motion. */
const scrollBehaviour = (): ScrollBehavior =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

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
    story: q.story?.trim() || undefined,
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
  const [steps, setSteps] = useState<LiveStep[]>([]);
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
      setSteps([]);
      const firstPlan = !plan;
      if (firstPlan) setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: scrollBehaviour(), block: "start" }), 50);
      const out = await runAgent<WeekPlan>("/api/plan", { resident: body }, setSteps);
      setPlan(out);
      setLastSent(sent);
      if (firstPlan) setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: scrollBehaviour() }), 50);
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
    setTimeout(() => document.getElementById("full-form")?.scrollIntoView({ behavior: scrollBehaviour() }), 50);
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
      <section className="intro no-print" aria-labelledby="intro-h">
        <h1 id="intro-h">Tune in to the years they remember.</h1>
        <p className="lead">
          Tell us roughly when they were born and one thing they loved. Memory Lane finds songs, films, telly, food and
          places from their teens and twenties, and sets them out as a week of activities you can print.
        </p>
      </section>

      {view === "quick" ? (
        <section className="sheet sheet-quick no-print" aria-label="Quick start">
          <QuickStart value={quick} country={country} onChange={setQuick} onCountry={setCountry} onSubmit={() => build()} busy={busy} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : (
        <section className="sheet sheet-pad no-print" id="full-form" aria-labelledby="full-h">
          <div className="sheet-head">
            <h2 id="full-h">Full profile</h2>
            <button type="button" className="btn btn-quiet" onClick={backToQuick}>
              Back to quick start
            </button>
          </div>
          <div className="examples examples-inline">
            <span className="examples-label">Start from a detailed example:</span>
            {SAMPLE_RESIDENTS.map((s) => (
              <button key={s.firstName} className="example" onClick={() => { setResident(s); setPlan(null); }}>
                <strong>{s.firstName}</strong>
                <span>
                  {s.hometown}, born {s.birthYear}
                </span>
              </button>
            ))}
          </div>
          <ResidentForm value={resident} onChange={setResident} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-big" onClick={() => build()} disabled={busy} aria-busy={busy}>
            {busy ? "Making the plan…" : "Make a week’s plan"}
          </button>
        </section>
      )}

      {view === "quick" && (
        <div className="below-sheet no-print">
          <div className="examples">
            <span className="examples-label">Or start from an example:</span>
            {QUICK_SAMPLES.map((s) => (
              <button key={s.firstName} type="button" className="example" disabled={busy} onClick={() => tryExample(s)}>
                <strong>{s.firstName}</strong>
                <span>loved {s.loved}</span>
              </button>
            ))}
          </div>
          <p className="muted small">
            Care needs, diet and more favourites can be added once you have a first plan. Prefer to fill everything in now?{" "}
            <button type="button" className="btn-text" onClick={openFullForm}>
              Use the full form
            </button>
            .
          </p>
        </div>
      )}

      <div id="plan">
        {busy && <AgentProgress steps={steps} expected={16} title={plan ? "Updating the plan" : "Building the week"} compact={!!plan} />}
        {plan && (
          <PlanView
            plan={plan}
            rail={
              view === "quick" ? (
                <SharpenPanel
                  profile={{ ...resident, favourites: { ...resident.favourites, loved: payload.favourites.loved } }}
                  locked={quick.loved.trim()}
                  onChange={setResident}
                  onUpdate={() => build()}
                  onFullForm={openFullForm}
                  dirty={dirty}
                  busy={busy}
                />
              ) : undefined
            }
          />
        )}
      </div>
    </>
  );
}
