"use client";

import { useState } from "react";
import ResidentForm, { EMPTY_RESIDENT, cleanResident } from "@/components/ResidentForm";
import ItemCard from "@/components/ItemCard";
import TraceView from "@/components/TraceView";
import { SAMPLE_RESIDENTS } from "@/lib/agent/care";
import type { GroupSession, ResidentProfile } from "@/lib/types";

export default function GroupPage() {
  const [residents, setResidents] = useState<ResidentProfile[]>([]);
  const [draft, setDraft] = useState<ResidentProfile>(EMPTY_RESIDENT);
  const [session, setSession] = useState<GroupSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    if (!draft.firstName) return;
    setResidents((rs) => [...rs, cleanResident(draft)].slice(0, 6));
    setDraft(EMPTY_RESIDENT);
  };

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residents }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      setSession(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="intro no-print">
        <h1>Find the common ground</h1>
        <p className="lead">
          Add two to six residents. Memory Lane compares their tastes with Qloo, finds the years and themes they share, and
          plans a 45-minute group session everyone can join in with.
        </p>
        <button className="btn btn-ghost" onClick={() => { setResidents(SAMPLE_RESIDENTS); setSession(null); }}>
          Load three example residents
        </button>
      </section>

      <section className="card no-print">
        <h2>Residents in this session ({residents.length})</h2>
        {residents.length > 0 ? (
          <ul className="roster">
            {residents.map((r, i) => (
              <li key={r.firstName + i}>
                <strong>{r.firstName}</strong> · born {r.birthYear} · {r.hometown || r.country}
                <button className="btn btn-link" onClick={() => setResidents((rs) => rs.filter((_, k) => k !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No one added yet.</p>
        )}
        <details className="add">
          <summary>Add a resident</summary>
          <ResidentForm value={draft} onChange={setDraft} compact />
          <button className="btn btn-secondary" onClick={add} disabled={!draft.firstName || residents.length >= 6}>
            Add to session
          </button>
        </details>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" onClick={build} disabled={busy || residents.length < 2}>
          {busy ? "Finding common ground…" : "Plan the group session"}
        </button>
      </section>

      {session && (
        <section className="plan">
          <header className="plan-head">
            <div>
              <p className="eyebrow">Group session · 45 minutes</p>
              <h2>{session.residents.map((r) => r.firstName).join(", ")}</h2>
              <p className="muted">
                {session.sharedWindow.overlap ? "Shared formative years" : "Combined years"} {session.sharedWindow.start}–
                {session.sharedWindow.end} · {session.qlooMode === "mock" ? "Demo data (mock Qloo)" : "Live Qloo"}
              </p>
            </div>
            <button className="btn btn-secondary no-print" onClick={() => window.print()}>
              Print session
            </button>
          </header>

          {session.warnings.length > 0 && (
            <div className="notice no-print">
              {session.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}

          {session.sharedThemes.length > 0 && (
            <div className="care-box">
              <h3>What they have in common (Qloo compare)</h3>
              <ul className="themes">
                {session.sharedThemes.map((t) => (
                  <li key={t.tag + t.between}>
                    <strong>{t.tag}</strong> <span className="muted">· {t.between}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <article className="day">
            <h3>Running order</h3>
            <ol className="steps">
              {session.outline.map((o, i) => (
                <li key={i}>
                  <strong>
                    {o.segment} ({o.minutes} min):
                  </strong>{" "}
                  {o.detail}
                </li>
              ))}
            </ol>
            <h4>Picks for the group</h4>
            <ul className="items">
              {session.picks.map((p) => (
                <ItemCard key={p.entityId} item={p} />
              ))}
            </ul>
            <h4>Things to ask the group</h4>
            <ul className="prompts">
              {session.prompts.map((p, i) => (
                <li key={i}>“{p}”</li>
              ))}
            </ul>
            <div className="adapt">
              {session.adaptations.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </div>
          </article>
          <TraceView trace={session.trace} />
        </section>
      )}
    </>
  );
}
