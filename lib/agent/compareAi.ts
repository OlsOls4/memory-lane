// "With vs without Qloo": ask the LLM for picks on its own, then check every one against Qloo's
// graph. Shows judges and staff what cultural grounding adds: real entities, right era, real places.
import type { ResidentProfile, TraceStep } from "../types";
import { QlooService, type StepListener } from "../qloo/client";
import { eraFor } from "./care";
import { aiOnlyPicks, type AiOnlyPick } from "./llmAgent";

export type CheckStatus = "verified" | "wrong-era" | "not-found";
export interface CheckedPick extends AiOnlyPick {
  status: CheckStatus;
  note: string;
  qlooName?: string;
}
export interface AiComparison {
  picks: CheckedPick[];
  counts: Record<CheckStatus, number>;
  window: { start: number; end: number };
  trace: TraceStep[];
}

const TYPES: Record<AiOnlyPick["domain"], string> = {
  music: "urn:entity:artist",
  film: "urn:entity:movie",
  tv: "urn:entity:tv_show",
  food: "urn:entity:place",
  travel: "urn:entity:destination",
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/^the /, "").trim();

export async function compareWithAiOnly(profile: ResidentProfile, onStep?: StepListener): Promise<AiComparison | null> {
  const picks = await aiOnlyPicks(profile);
  if (!picks) return null;
  const svc = new QlooService(undefined, onStep);
  const era = eraFor(profile.birthYear);
  const lo = era.formativeStart - 5;
  const hi = era.formativeEnd + 10;
  const checked = await Promise.all(
    picks.map(async (p): Promise<CheckedPick> => {
      const local = p.domain === "food" && profile.hometown ? `${p.name} ${profile.hometown}` : p.name;
      const types = p.domain === "travel" ? [TYPES.travel, "urn:entity:place"] : [TYPES[p.domain]];
      const res = await svc.search(local, types, `Check the AI-only pick "${p.name}" exists in Qloo`, 3);
      const want = norm(p.name);
      const hit = res.find((e) => norm(e.name) === want) || res.find((e) => norm(e.name).includes(want) || want.includes(norm(e.name)));
      if (!hit) return { ...p, status: "not-found", note: p.domain === "food" ? "Couldn't be matched to a real place in Qloo" : "Couldn't be matched in Qloo's graph" };
      if ((p.domain === "film" || p.domain === "tv") && hit.year && (hit.year < lo || hit.year > hi))
        return { ...p, status: "wrong-era", qlooName: hit.name, note: `Qloo dates it ${hit.year}, outside ${era.formativeStart}–${era.formativeEnd}` };
      if ((p.domain === "film" || p.domain === "tv") && p.year && hit.year && Math.abs(p.year - hit.year) > 2)
        return { ...p, status: "verified", qlooName: hit.name, note: `Real, but the AI said ${p.year}; Qloo says ${hit.year}` };
      return { ...p, status: "verified", qlooName: hit.name, note: hit.year ? `In Qloo (${hit.year})` : "In Qloo" };
    }),
  );
  const counts = { verified: 0, "wrong-era": 0, "not-found": 0 } as Record<CheckStatus, number>;
  checked.forEach((c) => counts[c.status]++);
  return { picks: checked, counts, window: { start: era.formativeStart, end: era.formativeEnd }, trace: svc.trace };
}
