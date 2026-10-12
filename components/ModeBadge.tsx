"use client";

import { useEffect, useState } from "react";

export default function ModeBadge() {
  const [s, setS] = useState<{ qloo: string; composer: string } | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setS(null));
  }, []);
  if (!s) return null;
  const mock = s.qloo === "mock";
  const wording = s.composer === "gemini" ? "Wording by Gemini." : "Wording from templates.";
  return (
    <span
      className={`mode ${mock ? "mode-mock" : "mode-live"}`}
      title={mock ? `Illustrative data: no Qloo API key is set. ${wording}` : `Recommendations from Qloo's taste graph. ${wording}`}
    >
      <span className="mode-dot" aria-hidden="true" />
      {mock ? "Demo data" : "Live Qloo data"}
    </span>
  );
}
