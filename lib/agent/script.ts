// On-demand session script: a word-for-word running script for one day, so a new or agency carer can
// pick up the sheet and run the session. Nemotron 3.5 Lightning (reasoning off) for speed; a template
// built from the day's steps and prompts when no key is set or the call fails.

import type { DayPlan, DementiaStage } from "../types";
import { nemotronEnabled, nemotronJSON, shortModel } from "../nemotron/client";

export interface ScriptLine {
  cue: string; // what staff do
  say: string; // what staff say
}

export interface SessionScript {
  lines: ScriptLine[];
  model?: string;
  modelName?: string;
  ms: number;
  source: "nemotron" | "template";
}

export interface ScriptInput {
  day: Pick<DayPlan, "day" | "title" | "theme" | "durationMins" | "steps" | "prompts" | "followUps"> & { items: { name: string; year?: number }[] };
  firstName?: string;
  dementiaStage: DementiaStage;
  hearing: string;
  vision: string;
  country: string;
  avoid?: string;
}

function template(x: ScriptInput): SessionScript {
  const n = x.firstName || "there";
  const lines: ScriptLine[] = [
    { cue: "Sit at eye level, smile, and say their name.", say: `Hello ${n}, it's lovely to see you. Shall we spend a little time with ${x.day.items[0]?.name || "something you love"}?` },
    ...x.day.steps.slice(0, 4).map((s, i) => ({ cue: s, say: x.day.prompts[i] || "How does that feel?" })),
    ...(x.day.followUps || []).slice(0, 1).map((f) => ({ cue: "If they light up, go one step deeper.", say: f })),
    { cue: "Close gently and note what sparked joy.", say: `Thank you, ${n}. I really enjoyed that. Shall we do it again soon?` },
  ];
  return { lines, ms: 0, source: "template" };
}

export async function sessionScript(x: ScriptInput): Promise<SessionScript> {
  if (!nemotronEnabled()) return template(x);
  const style = x.dementiaStage === "moderate" || x.dementiaStage === "advanced" ? "short sentences, recognition and yes/no questions, lots of reassurance" : "warm, open invitations to tell stories";
  const r = await nemotronJSON<{ lines: ScriptLine[] }>(
    "script",
    `Write a word-for-word script a care-home carer can read from while running this ${x.day.durationMins}-minute reminiscence session with ${x.firstName || "a resident"} (dementia stage: ${x.dementiaStage}; hearing: ${x.hearing}; vision: ${x.vision}). Style: ${style}. ${x.country === "United States" ? "American" : "British"} English.
${x.avoid ? `Never mention: ${x.avoid}.` : ""}
Session: ${x.day.title} (${x.day.theme}). Items, use ONLY these by name: ${x.day.items.map((i) => `${i.name}${i.year ? ` (${i.year})` : ""}`).join(", ") || "none"}.
Steps: ${x.day.steps.join(" | ")}
8-12 lines, opening to close. Each line: "cue" (what the carer does, max 14 words) and "say" (what the carer says aloud, max 30 words). Include one line on what to do if they become upset or tired. No medical advice.
Return JSON {"lines":[{"cue":"","say":""}]}`,
    { timeoutMs: 15000, maxTokens: 1800 },
  ).catch(() => null);
  const lines = Array.isArray(r?.data?.lines) ? r!.data.lines.filter((l) => l && l.say).map((l) => ({ cue: String(l.cue || "").slice(0, 140), say: String(l.say).slice(0, 300) })) : [];
  if (!r || lines.length < 3) return template(x);
  return { lines: lines.slice(0, 14), model: r.meta.model, modelName: shortModel(r.meta.model), ms: r.meta.ms, source: "nemotron" };
}
