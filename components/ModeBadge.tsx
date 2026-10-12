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
  return (
    <span className={`mode ${s.qloo === "mock" ? "mode-mock" : "mode-live"}`} title="Which data sources are active">
      {s.qloo === "mock" ? "Demo mode · illustrative data" : "Live · Qloo taste graph"} · {s.composer === "gemini" ? "Gemini" : "Template"} wording
    </span>
  );
}
