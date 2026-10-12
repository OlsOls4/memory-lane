"use client";

import { useState } from "react";
import ResidentForm, { EMPTY_RESIDENT, cleanResident } from "@/components/ResidentForm";
import PlanView from "@/components/PlanView";
import { SAMPLE_RESIDENTS } from "@/lib/agent/care";
import type { ResidentProfile, WeekPlan } from "@/lib/types";

export default function Home() {
  const [resident, setResident] = useState<ResidentProfile>(EMPTY_RESIDENT);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resident: cleanResident(resident) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      setPlan(body);
      setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="intro no-print">
        <h1>A week of moments that feel like home</h1>
        <p className="lead">
          Tell us a little about a resident. Memory Lane finds the songs, films, telly, food and places from their youth,
          matched to their own tastes through Qloo&apos;s cultural taste graph, and turns them into a printable week of
          activities.
        </p>
        <div className="samples">
          <span>Try an example:</span>
          {SAMPLE_RESIDENTS.map((s) => (
            <button key={s.firstName} className="btn btn-ghost" onClick={() => { setResident(s); setPlan(null); }}>
              {s.firstName}, {s.hometown} ({s.birthYear})
            </button>
          ))}
        </div>
      </section>

      <section className="card no-print">
        <ResidentForm value={resident} onChange={setResident} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" onClick={build} disabled={busy || !resident.firstName}>
          {busy ? "Building the week…" : "Build the week’s plan"}
        </button>
      </section>

      <div id="plan">{plan && <PlanView plan={plan} />}</div>
    </>
  );
}
