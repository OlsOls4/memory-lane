// "How did it go?" → next week's plan.
// Staff mark each day loved / some of it / didn't land, with an optional note. Nemotron 3 Super (short
// reasoning budget) reads that and decides what to keep, what to drop, what new favourites the notes
// reveal ("she sang every word of Moon River") and what to steer clear of. The changes feed the next
// build: kept items become favourites (re-resolved in Qloo), dropped ones are excluded, and the Ultra
// planner gets the summary. Without a key a deterministic reading of the reactions does the same job.

import type { Adaptation, DayFeedback, ModelUse, ResidentProfile } from "../types";
import type { QlooService } from "../qloo/client";
import { nemotronEnabled, nemotronJSON, shortModel } from "../nemotron/client";

export interface FeedbackOutcome {
  profile: ResidentProfile;
  adaptation: Adaptation;
  /** Normalised names to keep out of next week. */
  exclude: Set<string>;
  /** Everything used last week (the planner prefers fresh picks). */
  lastWeek: string[];
  /** Text summary handed to the planner. */
  forPlanner: string;
}

export const normTitle = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/^the /, "").trim();
const arr = (x: any, n: number) => (Array.isArray(x) ? x.map((s) => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, n) : []);
const WORD: Record<DayFeedback["reaction"], string> = { loved: "loved it", some: "some of it landed", no: "didn't land" };

function deterministic(fb: DayFeedback[]): Omit<Adaptation, "model"> & { newLoved: string[]; avoid: string[] } {
  const keep = fb.filter((d) => d.reaction === "loved").flatMap((d) => d.items.slice(0, 1));
  const drop = fb.filter((d) => d.reaction === "no").flatMap((d) => d.items.slice(0, 3));
  const loved = fb.filter((d) => d.reaction === "loved").map((d) => d.domain);
  const flat = fb.filter((d) => d.reaction === "no").map((d) => d.domain);
  const changes = [
    ...(keep.length ? [`Keeping ${keep.join(", ")} as anchors`] : []),
    ...(drop.length ? [`Swapping out ${drop.join(", ")}`] : []),
    ...(loved.length ? [`More of what worked: ${[...new Set(loved)].join(", ")}`] : []),
    ...(flat.length ? [`Fresh picks for ${[...new Set(flat)].join(", ")}`] : []),
  ];
  return {
    summary: keep.length || drop.length ? "Next week builds on what sparked joy and swaps out what didn't." : "Next week keeps the same shape with fresh picks.",
    changes: changes.length ? changes : ["Fresh picks across the week"],
    keep,
    drop,
    newLoved: [],
    avoid: [],
  };
}

export async function applyFeedback(svc: QlooService, profile: ResidentProfile, fb: DayFeedback[], models: ModelUse[]): Promise<FeedbackOutcome> {
  const lastWeek = [...new Set(fb.flatMap((d) => d.items))];
  let read = deterministic(fb);
  let model: string | undefined;
  if (nemotronEnabled()) {
    const step = svc.begin("llm.feedback", "Nemotron reads last week's “how did it go” and adapts the plan");
    const lines = fb.map((d) => `${d.day} (${d.domain}): ${WORD[d.reaction]}. Items: ${d.items.join(", ") || "none"}.${d.note ? ` Staff note: "${d.note}"` : ""}`);
    const prompt = `Care-home staff ran last week's reminiscence plan for a resident born about ${profile.birthYear} (dementia: ${profile.constraints.dementiaStage}). Their feedback:
${lines.join("\n")}
Decide how next week should change. Rules:
- keep: up to 3 item names from the lists above that clearly landed (exact names as written)
- drop: item names that did not land or upset them (exact names)
- newLoved: up to 3 songs, singers, films, shows, foods or pastimes the NOTES mention they responded to that are not in the lists (short names, public culture only, no people they know)
- avoid: up to 3 short phrases for subjects that upset them, from the notes only
- changes: 2-4 short lines for staff saying what will be different next week
- summary: one warm sentence for staff
Return JSON {"summary":"","changes":[],"keep":[],"drop":[],"newLoved":[],"avoid":[]}`;
    const r = await nemotronJSON<any>("feedback", prompt, { think: true, maxTokens: 3000, timeoutMs: 25000 });
    if (r?.data && typeof r.data === "object") {
      const names = new Set(lastWeek.map(normTitle));
      const known = (xs: string[]) => xs.filter((x) => names.has(normTitle(x)));
      read = {
        summary: String(r.data.summary || read.summary).slice(0, 240),
        changes: arr(r.data.changes, 4).length ? arr(r.data.changes, 4) : read.changes,
        keep: known(arr(r.data.keep, 3)),
        drop: known(arr(r.data.drop, 8)),
        newLoved: arr(r.data.newLoved, 3),
        avoid: arr(r.data.avoid, 3),
      };
      model = r.meta.model;
      step.model = r.meta.model;
      step.reasoningTokens = r.meta.reasoningTokens;
      step.ms = r.meta.ms;
      step.summary = [read.summary, ...read.changes.slice(0, 3)];
      models.push({ role: "feedback", label: "Reads the feedback", model: r.meta.model, ms: r.meta.ms, reasoningTokens: r.meta.reasoningTokens });
    } else {
      step.error = "feedback reader unavailable";
      step.summary = ["Used the reactions directly instead"];
    }
    svc.end(step);
  } else {
    svc.note("llm.feedback", "Last week's feedback read from the reactions (no Nemotron key)", [read.summary, ...read.changes.slice(0, 3)]);
  }

  const f = profile.favourites;
  const loved = Array.from(new Set([...(f.loved || []), ...read.keep, ...read.newLoved].map((x) => x.trim()).filter(Boolean))).slice(0, 6);
  const avoid = [profile.constraints.avoid, ...read.avoid].filter(Boolean).join("; ").slice(0, 200) || undefined;
  const next: ResidentProfile = { ...profile, favourites: { ...f, loved }, constraints: { ...profile.constraints, avoid } };
  const forPlanner = [
    read.summary,
    read.keep.length ? `Landed: ${read.keep.join(", ")}.` : "",
    read.drop.length ? `Did not land: ${read.drop.join(", ")}.` : "",
    fb.filter((d) => d.note).map((d) => `${d.day}: "${d.note}"`).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    profile: next,
    adaptation: {
      summary: read.summary,
      changes: [...read.changes, ...(read.newLoved.length ? [`New favourites from your notes: ${read.newLoved.join(", ")}`] : []), ...(read.avoid.length ? [`Now steering clear of: ${read.avoid.join(", ")}`] : [])].slice(0, 6),
      keep: read.keep,
      drop: read.drop,
      model: model ? shortModel(model) : undefined,
    },
    exclude: new Set(read.drop.map(normTitle)),
    lastWeek,
    forPlanner,
  };
}
