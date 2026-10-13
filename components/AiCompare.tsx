"use client";
import { useEffect, useState } from "react";
import type { AiComparison, CheckedPick } from "@/lib/agent/compareAi";
import type { WeekPlan } from "@/lib/types";

const LABEL: Record<CheckedPick["status"], string> = { verified: "Checks out", "wrong-era": "Wrong years", "not-found": "Can’t verify" };
const DOMAIN: Record<string, string> = { music: "Music", film: "Film", tv: "TV", food: "Places to eat", travel: "Places" };

/** Side-by-side: what an AI alone suggests vs the Qloo-grounded plan. Shown only when Gemini is configured. */
export default function AiCompare({ plan }: { plan: WeekPlan }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<AiComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setEnabled(s.composer === "gemini"))
      .catch(() => {});
  }, []);
  useEffect(() => setOut(null), [plan.generatedAt]);
  if (!enabled) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/compare-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resident: plan.resident }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setOut(body);
    } catch (e: any) {
      setError(e.message || "The comparison could not be made.");
    } finally {
      setBusy(false);
    }
  }

  const qlooItems = plan.days.flatMap((d) => d.items).filter((i) => ["music", "film", "tv", "food", "travel"].includes(i.domain));
  const verifiedPlan = qlooItems.length;
  const bad = out ? out.counts["wrong-era"] + out.counts["not-found"] : 0;

  return (
    <section className="ai-compare no-print" aria-labelledby="ai-compare-h">
      <div className="ai-compare-head">
        <div>
          <h3 id="ai-compare-h">Why not just ask a chatbot?</h3>
          <p className="muted small">Ask an AI for the same resident without Qloo, then check every suggestion against Qloo’s taste graph.</p>
        </div>
        {!out && (
          <button className="btn btn-secondary" onClick={run} disabled={busy} aria-busy={busy}>
            {busy ? "Asking and checking…" : "Compare with an AI-only plan"}
          </button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {out && (
        <>
          <div className="ai-compare-score">
            <div className="ai-score ai-score-qloo">
              <b>{verifiedPlan}/{verifiedPlan}</b>
              <span>Memory Lane picks are real Qloo entities, chosen for {out.window.start}–{out.window.end}</span>
            </div>
            <div className={`ai-score ${bad ? "ai-score-bad" : ""}`}>
              <b>{out.counts.verified}/{out.picks.length}</b>
              <span>AI-only picks check out{bad ? `; ${bad} wrong-era or unverifiable` : ""}</span>
            </div>
          </div>
          <ul className="ai-picks">
            {out.picks.map((p, i) => (
              <li key={i} className={`ai-pick ai-${p.status}`}>
                <span className="ai-pick-domain">{DOMAIN[p.domain]}</span>
                <span className="ai-pick-name">
                  {p.name}
                  {p.year ? ` (${p.year})` : ""}
                </span>
                <span className="ai-pick-status">{LABEL[p.status]}</span>
                <span className="ai-pick-note">{p.note}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">An AI on its own guesses from memory: it leans on the obvious hits, can misdate things and can’t show why a pick suits this person. Memory Lane only uses what Qloo’s graph returns, with the signal behind each pick.</p>
        </>
      )}
    </section>
  );
}
