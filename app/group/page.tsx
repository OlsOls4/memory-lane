"use client";

import { useState } from "react";
import ResidentForm, { EMPTY_RESIDENT, cleanResident } from "@/components/ResidentForm";
import ItemCard from "@/components/ItemCard";
import TraceView from "@/components/TraceView";
import AgentProgress from "@/components/AgentProgress";
import { runAgent, type LiveStep } from "@/lib/agentClient";
import TuningDial from "@/components/TuningDial";
import { QUICK_SAMPLES, SAMPLE_RESIDENTS, eraFor } from "@/lib/agent/care";
import { parseBirth, parseBornText } from "@/lib/validate";
import type { GroupSession, ResidentProfile } from "@/lib/types";

export default function GroupPage() {
  const [residents, setResidents] = useState<ResidentProfile[]>([]);
  const [draft, setDraft] = useState<ResidentProfile>(EMPTY_RESIDENT);
  const [session, setSession] = useState<GroupSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [qa, setQa] = useState({ firstName: "", born: "", loved: "" });
  const qaBorn = parseBornText(qa.born);
  let qaYear: number | null = null;
  try {
    qaYear = qaBorn ? parseBirth(qaBorn).year : null;
  } catch {
    qaYear = null;
  }
  const label = (r: ResidentProfile, i: number) => r.firstName || `Resident ${i + 1}`;

  const add = () => {
    setResidents((rs) => {
      const r = cleanResident(draft);
      return [...rs, { ...r, firstName: r.firstName || `Resident ${rs.length + 1}` }].slice(0, 6);
    });
    setDraft(EMPTY_RESIDENT);
    setSession(null);
  };

  // Quick add: just born + one favourite (name optional). Country defaults to the UK; use full details to change it.
  const quickAdd = () => {
    if (!qaYear || !qa.loved.trim()) return;
    setResidents((rs) =>
      [
        ...rs,
        {
          ...EMPTY_RESIDENT,
          firstName: qa.firstName.trim() || `Resident ${rs.length + 1}`,
          birthYear: qaYear!,
          birthYearApprox: !qaBorn?.birthYear || undefined,
          favourites: { ...EMPTY_RESIDENT.favourites, loved: [qa.loved.trim()] },
        },
      ].slice(0, 6),
    );
    setQa({ firstName: "", born: "", loved: "" });
    setSession(null);
  };

  async function build() {
    setBusy(true);
    setError(null);
    try {
      setSteps([]);
      setSession(null);
      setTimeout(() => document.getElementById("group-progress")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      const body = await runAgent<GroupSession>("/api/group", { residents }, setSteps);
      setSession(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const dialRows = residents.map((r, i) => {
    const e = eraFor(r.birthYear);
    return { label: label(r, i), birthYear: r.birthYear, start: e.formativeStart, end: e.formativeEnd, approx: r.birthYearApprox };
  });
  // Preview of the years everyone shares, before Qloo is asked (the session result confirms it).
  const preview =
    dialRows.length > 1
      ? (() => {
          const start = Math.max(...dialRows.map((r) => r.start));
          const end = Math.min(...dialRows.map((r) => r.end));
          return start <= end ? { start, end, overlap: true } : { start: Math.min(...dialRows.map((r) => r.start)), end: Math.max(...dialRows.map((r) => r.end)), overlap: false };
        })()
      : null;
  const shared = session ? session.sharedWindow : preview;
  const full = residents.length >= 6;

  return (
    <>
      <section className="intro no-print" aria-labelledby="intro-h">
        <h1 id="intro-h">Find the years they share.</h1>
        <p className="lead">
          Add two to six residents. Memory Lane compares their tastes with Qloo, finds the years and themes they have in
          common, and plans a 45-minute session everyone can join in with.
        </p>
      </section>

      <section className="sheet sheet-quick no-print" aria-labelledby="roster-h">
        <TuningDial
          rows={dialRows}
          shared={shared}
          idle="Add residents and the dial shows each person’s memory years, and where they overlap."
          caption={
            dialRows.length === 1 ? (
              <>Add at least one more resident to find the years they share.</>
            ) : shared ? (
              shared.overlap ? (
                <>
                  Years they all share: <strong>{shared.start} to {shared.end}</strong>
                </>
              ) : (
                <>
                  No years in common, so the session spans <strong>{shared.start} to {shared.end}</strong>
                </>
              )
            ) : undefined
          }
        />
        <div className="quick-body">
          <div className="sheet-head">
            <h2 id="roster-h">
              {residents.length === 0 ? "Who’s joining?" : `${residents.length} ${residents.length === 1 ? "resident" : "residents"} joining`}
            </h2>
            {residents.length === 0 && (
              <div className="examples examples-inline">
                <button
                  type="button"
                  className="example"
                  onClick={() => {
                    setResidents(
                      QUICK_SAMPLES.map((q) => {
                        const b = parseBornText(q.born) || {};
                        return { ...EMPTY_RESIDENT, firstName: q.firstName, birthYear: parseBirth(b).year, favourites: { ...EMPTY_RESIDENT.favourites, loved: [q.loved] } };
                      }),
                    );
                    setSession(null);
                  }}
                >
                  <strong>Try an example</strong>
                  <span>Margaret, Walter and Dorothy</span>
                </button>
                <button type="button" className="example" onClick={() => { setResidents(SAMPLE_RESIDENTS); setSession(null); }}>
                  <strong>Detailed example</strong>
                  <span>Three full profiles</span>
                </button>
              </div>
            )}
          </div>

          {residents.length > 0 && (
            <ul className="roster">
              {residents.map((r, i) => (
                <li key={r.firstName + i}>
                  <span className="roster-name">{label(r, i)}</span>
                  <span className="roster-detail">
                    Born {r.birthYearApprox ? "around " : ""}
                    {r.birthYear}
                    {r.hometown ? ` in ${r.hometown}` : ""}
                    {(r.favourites.loved || []).length > 0 && `, loved ${(r.favourites.loved || []).join(", ")}`}
                  </span>
                  <button
                    className="btn btn-quiet"
                    onClick={() => {
                      setResidents((rs) => rs.filter((_, k) => k !== i));
                      setSession(null);
                    }}
                    aria-label={`Remove ${label(r, i)}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="quick-add"
            onSubmit={(e) => {
              e.preventDefault();
              quickAdd();
            }}
            aria-label="Add a resident"
          >
            <label className="field">
              <span className="field-label">Born</span>
              <input value={qa.born} onChange={(e) => setQa({ ...qa, born: e.target.value })} placeholder="1946 or 1940s" autoComplete="off" />
            </label>
            <label className="field">
              <span className="field-label">One thing they loved</span>
              <input value={qa.loved} onChange={(e) => setQa({ ...qa, loved: e.target.value })} placeholder="Elvis" autoComplete="off" />
            </label>
            <label className="field">
              <span className="field-label">
                Name <span className="opt">(optional)</span>
              </span>
              <input value={qa.firstName} onChange={(e) => setQa({ ...qa, firstName: e.target.value })} placeholder="Ivy" autoComplete="off" />
            </label>
            <button type="submit" className="btn btn-secondary" disabled={!qaYear || !qa.loved.trim() || full}>
              Add resident
            </button>
          </form>
          {full && <p className="hint">Six residents is the most for one session.</p>}
          <details className="add">
            <summary>Add a resident with full details</summary>
            <ResidentForm value={draft} onChange={setDraft} compact />
            <button className="btn btn-secondary" onClick={add} disabled={full}>
              Add resident
            </button>
          </details>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-big" onClick={build} disabled={busy || residents.length < 2} aria-busy={busy}>
            {busy ? "Finding common ground…" : "Plan the group session"}
          </button>
          {residents.length < 2 && <p className="hint ready-hint">Add at least two residents to plan a session.</p>}
        </div>
      </section>

      <div id="group-progress">
        {busy && <AgentProgress steps={steps} expected={residents.length * 13 + 6} title="Finding common ground" />}
      </div>

      {session && (
        <section className="plan" aria-labelledby="session-h" aria-live="polite">
          <header className="plan-head">
            <div className="plan-title">
              <h2 id="session-h">{session.residents.map((r) => r.firstName).join(", ").replace(/, ([^,]*)$/, " and $1")}</h2>
              <p className="plan-sub">
                A 45-minute group session built around {session.sharedWindow.overlap ? "the years they share" : "their combined years"},{" "}
                {session.sharedWindow.start} to {session.sharedWindow.end}.
              </p>
            </div>
            <button className="btn btn-secondary no-print" onClick={() => window.print()}>
              Print this session
            </button>
          </header>

          {session.warnings.length > 0 && (
            <div className="notice no-print" role="status">
              {session.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}

          <div className="plan-layout">
            <aside className="rail">
              {session.sharedThemes.length > 0 && (
                <div className="care-notes common">
                  <h3>What they have in common</h3>
                  {(() => {
                    const top = [...session.sharedThemes].sort((a, b) => b.score - a.score).slice(0, 8);
                    const max = Math.max(...top.map((t) => t.score), 0.01);
                    const common = Math.round((top.slice(0, 5).reduce((n, t) => n + t.score, 0) / Math.min(5, top.length)) * 100);
                    return (
                      <>
                        <p className="common-score" aria-label={`Common ground score ${common} out of 100`}>
                          <b>{common}</b>
                          <span>common-ground score, from Qloo compare</span>
                        </p>
                        <ul className="theme-bars">
                          {top.map((t) => (
                            <li key={t.tag + t.between}>
                              <span className="theme-bar-label">
                                <strong>{t.tag}</strong> <span>{t.score.toFixed(2)}</span>
                              </span>
                              <span className="theme-bar" aria-hidden="true">
                                <span style={{ width: `${Math.max(6, (t.score / max) * 100)}%` }} />
                              </span>
                              <small>{t.between}</small>
                            </li>
                          ))}
                        </ul>
                      </>
                    );
                  })()}
                  <p className="understood-note">Found with Qloo compare.</p>
                </div>
              )}
              <div className="care-notes">
                <h3>For everyone</h3>
                <ul>
                  {session.adaptations.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </aside>

            <div className="days">
              <article className="day">
                <header className="day-head">
                  <p className="day-name">Running order</p>
                  <p className="day-mins">45 minutes</p>
                </header>
                <ol className="running">
                  {session.outline.map((o, i) => (
                    <li key={i}>
                      <span className="running-min">{o.minutes} min</span>
                      <span className="running-body">
                        <strong>{o.segment}</strong>
                        <span>{o.detail}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
              <article className="day">
                <header className="day-head">
                  <h3>Picks for the group</h3>
                </header>
                <ul className="items">
                  {session.picks.map((p) => (
                    <ItemCard key={p.entityId} item={p} />
                  ))}
                </ul>
                <h4>Things to ask the group</h4>
                <ul className="prompts">
                  {session.prompts.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
          <TraceView trace={session.trace} composer={session.composer} />
        </section>
      )}
    </>
  );
}
