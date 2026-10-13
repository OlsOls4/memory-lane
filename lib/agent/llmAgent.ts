// The LLM side of the agent (Gemini, optional). It never invents the items on a plan:
//  1. planFromStory  - reads staff's free-text notes about a resident and decides what to look up in Qloo.
//  2. reviewCandidates - a care-aware critic that removes Qloo candidates unsuitable for this resident
//     (distressing themes, wrong era, inappropriate for a care home); the agent then backfills from Qloo.
//  3. aiOnlyPicks - for the "with vs without Qloo" comparison: what an LLM suggests on its own.
import type { Domain, QEntity, ResidentProfile } from "../types";
import { geminiEnabled, geminiJSON } from "./gemini";

export { geminiEnabled };

export interface StoryReading {
  favourites: { artists: string[]; films: string[]; tvShows: string[]; books: string[]; foods: string[]; hobbies: string[] };
  hometown?: string;
  country?: string;
  birthYear?: number;
  constraints: { softFoods?: boolean; diabetic?: boolean; hearing?: "mild" | "significant"; vision?: "mild" | "significant"; dementiaStage?: "early" | "moderate" | "advanced" };
  rationale: string[];
}

const arr = (x: any, n = 5) => (Array.isArray(x) ? x.map((s) => String(s).trim()).filter(Boolean).slice(0, n) : []);

export async function planFromStory(story: string, p: ResidentProfile): Promise<StoryReading | null> {
  const prompt = `You are the planning step of an agent that builds reminiscence activities for a care-home resident.
Staff wrote these notes about the resident (born about ${p.birthYear}${p.hometown ? `, grew up in ${p.hometown}` : ""}, ${p.country}):
"""${story.slice(0, 1200)}"""
Decide what to look up in a cultural taste database (Qloo). Extract only what the notes actually say or very strongly imply.
- artists: singers/bands they loved or that a named dance hall, show or scene strongly implies (max 3)
- films, tvShows, books: named or clearly described titles (max 3 each)
- foods: dishes or food memories as short names ("fish and chips")
- hobbies: activities as short Qloo-style tags ("ballroom dancing", "gardening", "football")
- hometown/country only if stated and different from above; birthYear only if stated
- constraints: only care needs stated (soft foods, diabetic, hearing, vision, dementia stage)
- rationale: up to 4 short lines saying what you will look up and why, e.g. "Danced at the Locarno → ballroom dancing tag, big-band artists"
Never include names of people who are not public figures. Return JSON:
{"favourites":{"artists":[],"films":[],"tvShows":[],"books":[],"foods":[],"hobbies":[]},"hometown":"","country":"","birthYear":null,"constraints":{},"rationale":[]}`;
  const out = await geminiJSON<any>(prompt, 20000);
  if (!out || typeof out !== "object") return null;
  const f = out.favourites || {};
  const c = out.constraints || {};
  const lvl = (v: any) => (v === "mild" || v === "significant" ? v : undefined);
  const stage = ["early", "moderate", "advanced"].includes(c.dementiaStage) ? c.dementiaStage : undefined;
  const by = Number(out.birthYear);
  return {
    favourites: { artists: arr(f.artists, 3), films: arr(f.films, 3), tvShows: arr(f.tvShows, 3), books: arr(f.books, 3), foods: arr(f.foods, 3), hobbies: arr(f.hobbies, 4) },
    hometown: typeof out.hometown === "string" && out.hometown.trim() ? out.hometown.trim().slice(0, 60) : undefined,
    country: typeof out.country === "string" && out.country.trim() ? out.country.trim().slice(0, 60) : undefined,
    birthYear: by > 1900 && by < 2010 ? by : undefined,
    constraints: { softFoods: c.softFoods === true || undefined, diabetic: c.diabetic === true || undefined, hearing: lvl(c.hearing), vision: lvl(c.vision), dementiaStage: stage },
    rationale: arr(out.rationale, 4),
  };
}

export interface Review {
  drop: { id: string; name: string; reason: string }[];
}

/** Ask the critic which Qloo candidates to remove. Candidates are passed by id so it cannot add new ones. */
export async function reviewCandidates(p: ResidentProfile, era: { formativeStart: number; formativeEnd: number }, results: Partial<Record<Domain, QEntity[]>>): Promise<Review | null> {
  const list: { id: string; domain: string; name: string; year?: number; about?: string }[] = [];
  for (const [d, xs] of Object.entries(results)) {
    for (const e of (xs || []).slice(0, 8)) list.push({ id: e.id, domain: d, name: e.name, year: e.year, about: e.description?.slice(0, 120) });
  }
  if (!list.length) return { drop: [] };
  const prompt = `You review candidate items for a care-home reminiscence activity plan. The resident was born about ${p.birthYear} (teens and twenties ${era.formativeStart}-${era.formativeEnd}), grew up in ${p.hometown || p.country}, dementia stage: ${p.constraints.dementiaStage}.
Remove a candidate ONLY if it is clearly unsuitable for a reminiscence session with this resident:
- distressing themes for older people or people with dementia (psychiatric hospitals, graphic war or violence, horror, abuse, suicide)
- clearly from the wrong era (a film or TV show made well after ${era.formativeEnd + 15}, or a musician who became famous after ${era.formativeEnd + 15})
- not a real cultural item they could experience (e.g. a brewery in a food list is fine; a hotel or office is not)
Keep everything else; most candidates should be kept. Return JSON {"drop":[{"id":"","reason":"under 12 words"}]}.
CANDIDATES:
${JSON.stringify(list)}`;
  const out = await geminiJSON<any>(prompt, 20000);
  if (!out || !Array.isArray(out.drop)) return null;
  const byId = new Map(list.map((x) => [x.id, x]));
  return {
    drop: out.drop
      .filter((d: any) => d && byId.has(String(d.id)))
      .slice(0, 12)
      .map((d: any) => ({ id: String(d.id), name: byId.get(String(d.id))!.name, reason: String(d.reason || "unsuitable").slice(0, 100) })),
  };
}

export interface AiOnlyPick {
  domain: "music" | "film" | "tv" | "food" | "travel";
  name: string;
  year?: number;
}

export async function aiOnlyPicks(p: ResidentProfile): Promise<AiOnlyPick[] | null> {
  const loved = [...(p.favourites.loved || []), ...p.favourites.artists, ...p.favourites.films, ...p.favourites.hobbies].slice(0, 4).join(", ");
  const prompt = `Suggest reminiscence material for a care-home resident born about ${p.birthYear}, who grew up in ${p.hometown ? `${p.hometown}, ` : ""}${p.country} and loved ${loved || "music"}.
Give 4 music artists, 3 films, 3 TV shows, 3 local places to eat in their hometown, and 3 places to visit, each with the year it was released or first famous where relevant.
Return JSON {"picks":[{"domain":"music|film|tv|food|travel","name":"","year":1960}]}.`;
  const out = await geminiJSON<any>(prompt, 20000);
  if (!out || !Array.isArray(out.picks)) return null;
  const ok = new Set(["music", "film", "tv", "food", "travel"]);
  return out.picks
    .filter((x: any) => x && ok.has(x.domain) && typeof x.name === "string")
    .slice(0, 16)
    .map((x: any) => ({ domain: x.domain, name: x.name.slice(0, 80), year: Number(x.year) > 1800 ? Number(x.year) : undefined }));
}
