"use client";

import { useEffect, useState } from "react";

interface Status {
  qloo: string;
  composer: string;
  llm?: { provider: string; roles: { role: string; name: string; does: string }[] } | null;
}

export default function ModeBadge() {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setS(null));
  }, []);
  if (!s) return null;
  const mock = s.qloo === "mock";
  const wording = s.composer === "nemotron" ? "Planned and written by NVIDIA Nemotron on Nebius Token Factory." : "Wording from templates.";
  return (
    <span className="modes">
      <span
        className={`mode ${mock ? "mode-mock" : "mode-live"}`}
        title={mock ? `Illustrative data: no Qloo API key is set. ${wording}` : `Recommendations from Qloo's taste graph. ${wording}`}
      >
        <span className="mode-dot" aria-hidden="true" />
        {mock ? "Demo data" : "Live Qloo data"}
      </span>
      {s.llm && (
        <span className="mode mode-nv" title={`${s.llm.provider}: ${s.llm.roles.map((r) => `${r.name}: ${r.does}`).join(" · ")}`}>
          <span className="nv-mark" aria-hidden="true" />
          Nemotron
        </span>
      )}
    </span>
  );
}
