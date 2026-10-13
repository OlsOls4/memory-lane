// Composes the weekly plan. Items are ALWAYS Qloo entities. With NEBIUS_API_KEY set, NVIDIA Nemotron
// (via Nebius Token Factory) plans and words the week:
//   Nano reads staff notes → Qloo gathers candidates → guards → Ultra picks/orders/flags (with Qloo tool calls)
//   → Super writes the wording and Nano the prompts, in parallel.
// With no key (or if any call fails) deterministic code and a template composer do each job, so the
// app always runs end to end.

import type { DayFeedback, DayPlan, Domain, GroupSession, LocalHook, ModelUse, PlanItem, ResidentProfile, WeekPlan } from "../types";
import { QlooService, type StepListener } from "../qloo/client";
import { adaptationsFor, eraFor, isUK } from "./care";
import { gatherResident, toItem, type ResidentContext } from "./orchestrator";
import { lastNemotronError, nemotronEnabled, nemotronJSON, shortModel } from "../nemotron/client";
import { planFromStory, reviewCandidates } from "./llmAgent";
import { runPlanner, type ThemeKey } from "./planner";
import { applyFeedback, normTitle } from "./feedback";
import { localHistory } from "./localHistory";
import { displayName } from "../validate";

const take = <X>(xs: X[], n: number) => xs.slice(0, n);

function itemsFor(ctx: ResidentContext, d: Domain, fav: { id: string; name: string; year?: number; tags: any[]; type: string }[], n: number) {
  const picked = ctx.pickedFavs ? fav.filter((e) => ctx.pickedFavs!.has(e.id)).slice(0, 2) : [];
  const favItems = (picked.length ? picked : fav.slice(0, 1)).map((e) => toItem(ctx, e as any, d, true));
  const recs = ctx.results[d].filter((e) => !fav.some((f) => f.id === e.id)).map((e) => toItem(ctx, e, d));
  return [...favItems, ...take(recs, n - favItems.length)];
}

function names(items: PlanItem[], n = 3) {
  const xs = items.slice(0, n).map((i) => i.name);
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function sessionLength(p: ResidentProfile, base: number) {
  if (p.constraints.dementiaStage === "advanced") return Math.min(base, 15);
  if (p.constraints.dementiaStage === "moderate") return Math.min(base, 30);
  return base;
}

function templateDays(ctx: ResidentContext): DayPlan[] {
  const p = ctx.profile;
  const n = displayName(p);
  const uk = isUK(p.country);
  const { formativeStart: s, formativeEnd: e } = ctx.era;
  const adv = p.constraints.dementiaStage === "advanced" || p.constraints.dementiaStage === "moderate";
  const ask = (open: string, closed: string) => (adv ? closed : open);

  const music = itemsFor(ctx, "music", ctx.seeds.artists, 4);
  const film = itemsFor(ctx, "film", ctx.seeds.films, 3);
  const tv = itemsFor(ctx, "tv", ctx.seeds.tv, 3);
  const books = itemsFor(ctx, "books", ctx.seeds.books, 2);
  const audio = take(ctx.results.audio.map((x) => toItem(ctx, x, "audio")), 2);
  const food = take(ctx.results.food.map((x) => toItem(ctx, x, "food")), 3);
  const travel = take(ctx.results.travel.map((x) => toItem(ctx, x, "travel")), 3);
  const dishes = ctx.foodTags.map((t) => t.name);
  const dishText = dishes.length ? dishes.join(" and ") : p.favourites.foods.join(" and ") || "a favourite dish from home";
  const hometown = p.hometown || "home";

  const days: DayPlan[] = [
    {
      day: "Monday",
      theme: "Songs of my youth",
      domain: "music",
      title: `${displayName(p, true)}'s hit parade`,
      intro: `Music from ${s}–${e}, chosen from ${n}'s own favourites and the artists Qloo's taste graph links to them.`,
      durationMins: sessionLength(p, 30),
      steps: [
        `Start with ${music[0]?.name || "a favourite song"} — something ${n} already loves.`,
        `Move on to ${names(music.slice(1), 3) || "similar artists from the same years"}.`,
        "Pause between songs. Invite humming, clapping or tapping along.",
        "Note which songs got the biggest reaction for next week.",
      ],
      items: music,
      prompts: [
        ask(`Where were you when you first heard ${music[0]?.name || "this"}?`, `Do you remember this song?`),
        ask("Who did you go dancing with?", "Did you like to dance to this?"),
        ask(`What was a night out in ${hometown} like around ${s + 5}?`, `Is this a happy song for you?`),
      ],
      adaptations: [],
    },
    {
      day: "Tuesday",
      theme: "Matinee at the pictures",
      domain: "film",
      title: uk ? "An afternoon at the pictures" : "A matinee at the movies",
      intro: `Short clips from films that were on ${uk ? "at the pictures" : "at the movies"} when ${n} was young.`,
      durationMins: sessionLength(p, 40),
      steps: [
        `Show a 5–10 minute clip from ${film[0]?.name || "a favourite film"} (subtitles on).`,
        `Offer a second clip: ${names(film.slice(1), 2) || "another film from the era"}.`,
        uk ? "Hand round a choc-ice or a paper bag of sweets, if the care plan allows." : "Pass round popcorn or a soda float, if the care plan allows.",
        "Chat about the stars and where they used to watch films.",
      ],
      items: film,
      prompts: [
        ask("Which cinema did you go to, and who did you go with?", "Did you go to the pictures on a Saturday?"),
        ask(`Who was your favourite film star?`, `Do you like this actress?`),
        ask("What did a ticket cost?", "Was it a big cinema?"),
      ],
      adaptations: [],
    },
    {
      day: "Wednesday",
      theme: "A taste of home",
      domain: "food",
      title: `A taste of ${hometown}`,
      intro: `Food memories built around ${dishText}, with places from ${hometown} as conversation anchors.`,
      durationMins: sessionLength(p, 40),
      steps: [
        `Prepare a small tasting of ${dishText}, adapted to the diet notes below.`,
        "Start with smell: let the aroma do the work before tasting.",
        food.length ? `Show photos or talk about places like ${names(food, 2)}.` : `Talk about where the family bought or ate it in ${hometown}.`,
        "Invite the recipe: who made it, what went in it, what day of the week it was.",
      ],
      items: food,
      prompts: [
        ask(`Who made the best ${dishes[0] || "food"} in your family?`, `Does this smell like home?`),
        ask("What was Sunday dinner like growing up?", "Did you like this when you were young?"),
        ask(`Where did you go for a treat in ${hometown}?`, `Was there a café you liked?`),
      ],
      adaptations: [],
    },
    {
      day: "Thursday",
      theme: uk ? "Telly night" : "TV night",
      domain: "tv",
      title: uk ? "In front of the telly" : "Gathered round the TV",
      intro: `Programmes first broadcast in ${p.country} during ${n}'s formative years.`,
      durationMins: sessionLength(p, 30),
      steps: [
        `Play the theme tune of ${tv[0]?.name || "a favourite programme"} first — theme tunes are powerful cues.`,
        `Watch a short clip, then try ${names(tv.slice(1), 2) || "another show from the era"}.`,
        "Talk about the family telly: who controlled it, what night things were on.",
      ],
      items: tv,
      prompts: [
        ask("Who did you watch this with?", "Do you know this tune?"),
        ask("What did your family watch on a Sunday night?", "Did you have a television at home?"),
        ask("Who was your favourite character?", "Was this funny?"),
      ],
      adaptations: [],
    },
    {
      day: "Friday",
      theme: "Postcards from…",
      domain: "travel",
      title: `Postcards from ${hometown} and beyond`,
      intro: `Armchair travel to ${hometown} and to places Qloo associates with it and with ${n}'s tastes.`,
      durationMins: sessionLength(p, 30),
      steps: [
        `Look at old photos or postcards of ${hometown}.`,
        travel.length ? `"Visit" ${names(travel, 3)} with pictures and a little background music.` : "Visit a seaside or countryside spot through pictures.",
        "Make a simple postcard together and display it in the room.",
      ],
      items: travel,
      prompts: [
        ask("Where did you go on holiday as a child?", "Did you like the seaside?"),
        ask(`What street did you live on in ${hometown}?`, `Is this ${hometown}?`),
        ask("How did you travel — train, coach, car?", "Did you go on the train?"),
      ],
      adaptations: [],
    },
    {
      day: "Saturday",
      theme: uk ? "Stories and the wireless" : "Stories and the radio",
      domain: books.length ? "books" : "audio",
      title: "Stories and voices",
      intro: audio.length ? "A gentle read-aloud and a listen, chosen from books and audio that echo their tastes." : "A gentle read-aloud from books of their era that echo their tastes, then a listen to old radio.",
      durationMins: sessionLength(p, 30),
      steps: [
        books[0] ? `Read a short passage from ${books[0].name} aloud.` : "Read a short, familiar passage aloud.",
        audio[0] ? `Listen to a few minutes of ${audio[0].name}.` : `Play a few minutes of old-time ${uk ? "wireless" : "radio"}.`,
        "Let them close their eyes and just listen if they prefer.",
      ],
      items: [...books, ...audio],
      prompts: [
        ask("What did you like to read?", "Do you like this story?"),
        ask(`Which ${uk ? "wireless" : "radio"} programmes did your family listen to?`, "Shall we listen to some more?"),
      ],
      adaptations: [],
    },
    {
      day: "Sunday",
      theme: "Memory box sing-along",
      domain: "music",
      title: "The best of the week",
      intro: `Bring back whatever sparked the most joy this week, and build ${n}'s memory box.`,
      durationMins: sessionLength(p, 30),
      steps: [
        `Replay the week's favourite: start with ${music[0]?.name || "the best-loved song"}.`,
        "Add one item to a memory box: a printed record sleeve, a postcard, a recipe card.",
        "Finish with a sing-along everyone knows.",
        "Write down what worked in the care notes and share it with family.",
      ],
      items: [music[0], film[0], tv[0]].filter(Boolean) as PlanItem[],
      prompts: [
        ask("What has been your favourite thing this week?", "Did you enjoy the music this week?"),
        ask("Is there a song you'd like to hear again?", "Shall we sing this one?"),
      ],
      adaptations: [],
    },
  ];
  return days;
}

/** Nemotron Super (reasoning off) rewrites titles, intros and steps. Items stay exactly as chosen. */
async function writerPolish(days: DayPlan[], ctx: ResidentContext, models: ModelUse[]): Promise<{ days: DayPlan[]; model: string; ms: number } | null> {
  const p = ctx.profile;
  const brief = {
    resident: {
      firstName: p.firstName || "(not given: say 'the resident')",
      birthYear: p.birthYear,
      hometown: p.hometown,
      country: p.country,
      dementiaStage: p.constraints.dementiaStage,
      hearing: p.constraints.hearing,
      vision: p.constraints.vision,
      steerClearOf: p.constraints.avoid || undefined,
    },
    formativeYears: `${ctx.era.formativeStart}-${ctx.era.formativeEnd}`,
    days: days.map((d) => ({
      day: d.day,
      theme: d.theme,
      durationMins: d.durationMins,
      items: d.items.map((i) => ({ name: i.name, year: i.year, why: i.landing || i.why })),
    })),
  };
  const prompt = `You write reminiscence activity plans for care-home activity staff in ${p.country}.
Use warm, plain ${p.country === "United States" ? "American" : "British"} English. Write for staff, not the resident.
For each day, write: title (max 8 words), intro (1-2 sentences), steps (3-5 short imperative steps that use ONLY the listed items by name; never invent other songs, films, shows, books or places).
Never give medical advice. Return JSON: {"days":[{"day":"Monday","title":"","intro":"","steps":[""]}]} with exactly ${days.length} days in the same order.
DATA:
${JSON.stringify(brief)}`;
  const r = await nemotronJSON<any>("writer", prompt, { timeoutMs: 25000, maxTokens: 3000 });
  const got = dayList(r?.data);
  if (!r || got.length < Math.ceil(days.length / 2)) return null;
  models.push({ role: "writer", label: "Writes the week", model: r.meta.model, ms: r.meta.ms });
  return {
    model: r.meta.model,
    ms: r.meta.ms,
    days: days.map((d, i) => {
      const g = matchDay(got, d.day, i);
      const ok = g && typeof g.title === "string" && Array.isArray(g.steps) && g.steps.length;
      return ok ? { ...d, title: String(g.title).slice(0, 80) || d.title, intro: String(g.intro || d.intro).slice(0, 400), steps: g.steps.map(String).slice(0, 6) } : d;
    }),
  };
}

/** Models sometimes return {"days":[...]}, a bare array, or an object keyed by day name. */
function dayList(x: any): any[] {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.days)) return x.days;
  if (x.days && typeof x.days === "object") return Object.entries(x.days).map(([day, v]: [string, any]) => ({ day, ...v }));
  const keyed = Object.entries(x).filter(([k]) => /day$/i.test(k));
  return keyed.map(([day, v]: [string, any]) => ({ day, ...v }));
}

function matchDay(xs: any[], day: string, i: number) {
  return xs.find((x) => String(x?.day || "").toLowerCase().startsWith(day.toLowerCase().slice(0, 3))) || (xs.length === 7 ? xs[i] : undefined);
}

/** Nemotron Nano (reasoning off): conversation prompts and "if they light up" follow-ups for each day. */
async function promptsFor(days: DayPlan[], ctx: ResidentContext, models: ModelUse[]): Promise<{ prompts: string[][]; followUps: string[][]; model: string; ms: number } | null> {
  const p = ctx.profile;
  const stage = p.constraints.dementiaStage;
  const style =
    stage === "moderate" || stage === "advanced"
      ? "Use recognition, yes/no or either/or questions (no open recall). Very short."
      : "Use open, inviting questions that let them tell a story.";
  const prompt = `Write conversation prompts for a care-home reminiscence session with a resident born about ${p.birthYear}, who grew up in ${p.hometown || p.country}. Dementia stage: ${stage}. ${style}
${p.constraints.avoid ? `Do not touch on: ${p.constraints.avoid}.` : ""}
For each day give 3 "prompts" staff can ask about the listed items, and 2 "followUps" to ask if the resident lights up (going one step deeper into their own memories). Refer to items by name. No medical advice.
Return JSON {"days":[{"day":"Monday","prompts":["","",""],"followUps":["",""]}]} with exactly ${days.length} days in order.
DAYS:
${days.map((d) => `${d.day} — ${d.theme}: ${d.items.map((i) => `${i.name}${i.year ? ` (${i.year})` : ""}`).join(", ") || "no items"}`).join("\n")}`;
  const r = await nemotronJSON<any>("prompts", prompt, { timeoutMs: 20000, maxTokens: 2200 });
  const got = dayList(r?.data);
  if (!r || got.length < Math.ceil(days.length / 2)) return null;
  models.push({ role: "prompts", label: "Prompts & follow-ups", model: r.meta.model, ms: r.meta.ms });
  const xs = days.map((d, i) => matchDay(got, d.day, i));
  return {
    model: r.meta.model,
    ms: r.meta.ms,
    prompts: xs.map((x, i) => (Array.isArray(x?.prompts) && x.prompts.length ? x.prompts.map(String).slice(0, 4) : days[i].prompts)),
    followUps: xs.map((x) => (Array.isArray(x?.followUps) ? x.followUps.map(String).slice(0, 3) : [])),
  };
}

/** Nemotron Nano reads staff's free-text notes into things to look up in Qloo. The notes never go to Qloo. */
async function applyStory(svc: QlooService, profile: ResidentProfile, models: ModelUse[]): Promise<ResidentProfile> {
  if (!profile.story || !nemotronEnabled()) return profile;
  const step = svc.begin("llm.read", "Nemotron reads the staff notes and decides what to look up in Qloo");
  const r = await planFromStory(profile.story, profile).catch(() => null);
  if (!r) {
    step.summary = ["Could not read the notes; using the quick-start answers only"];
    step.error = "notes reader unavailable";
    svc.end(step);
    return profile;
  }
  step.model = r.meta.model;
  step.ms = r.meta.ms;
  models.push({ role: "reader", label: "Reads staff notes", model: r.meta.model, ms: r.meta.ms });
  const merge = (a: string[], b: string[]) => Array.from(new Set([...a, ...b].map((x) => x.trim()).filter(Boolean))).slice(0, 5);
  const f = profile.favourites;
  const next: ResidentProfile = {
    ...profile,
    hometown: profile.hometown || r.hometown || "",
    country: profile.hometown ? profile.country : r.country || profile.country,
    favourites: {
      ...f,
      artists: merge(f.artists, r.favourites.artists),
      films: merge(f.films, r.favourites.films),
      tvShows: merge(f.tvShows, r.favourites.tvShows),
      books: merge(f.books, r.favourites.books),
      foods: merge(f.foods, r.favourites.foods),
      hobbies: merge(f.hobbies, r.favourites.hobbies),
    },
    constraints: {
      ...profile.constraints,
      softFoods: profile.constraints.softFoods || !!r.constraints.softFoods,
      diabetic: profile.constraints.diabetic || !!r.constraints.diabetic,
      hearing: profile.constraints.hearing !== "none" ? profile.constraints.hearing : r.constraints.hearing || "none",
      vision: profile.constraints.vision !== "none" ? profile.constraints.vision : r.constraints.vision || "none",
      dementiaStage: profile.constraints.dementiaStage !== "none" ? profile.constraints.dementiaStage : r.constraints.dementiaStage || "none",
      avoid: [profile.constraints.avoid, ...r.avoid].filter(Boolean).join("; ").slice(0, 200) || undefined,
    },
  };
  const found = Object.entries(r.favourites).flatMap(([k, v]) => (v.length ? [`${k}: ${v.join(", ")}`] : []));
  step.summary = [
    ...(r.rationale.length ? r.rationale : found).slice(0, 4),
    ...(r.avoid.length ? [`Steer clear of: ${r.avoid.join(", ")}`] : []),
    ...(found.length ? [] : ["Nothing new to look up in the notes"]),
  ];
  svc.end(step);
  return next;
}

// Words that, when staff ask to avoid a subject, widen into the vocabulary Qloo uses for it.
const AVOID_EXPANSIONS: [RegExp, string[]][] = [
  [/\b(war|wars|wartime|military|army|soldier|battle|blitz|evacuat)/i, ["war", "wartime", "world war", "war film", "battle", "military", "army", "soldier", "nazi", "blitz", "commando", "prisoner of war", "dunkirk", "d-day", "bomber"]],
  [/\b(horror|scary|frighten)/i, ["horror", "slasher", "monster", "haunted", "zombie"]],
  [/\b(hospital|asylum|illness|cancer|nurse)/i, ["hospital", "asylum", "psychiatric", "cancer"]],
  [/\b(death|grief|funeral|bereave|widow|late (husband|wife))/i, ["death", "funeral", "grief", "bereavement", "widow"]],
  [/\b(sea|drown|ship|boat)/i, ["shipwreck", "drowning", "titanic"]],
];
const STOP = new Set(["about", "anything", "films", "film", "music", "songs", "talk", "their", "with", "from", "that", "this", "please", "avoid", "steer", "clear", "dont", "don't", "very", "makes", "upset", "upsets", "content", "stuff", "things"]);

function avoidTerms(avoid: string): string[] {
  const out = new Set<string>();
  for (const [re, xs] of AVOID_EXPANSIONS) if (re.test(avoid)) xs.forEach((x) => out.add(x));
  for (const w of avoid.toLowerCase().split(/[^a-z'-]+/)) if (w.length >= 5 && !STOP.has(w)) out.add(w);
  return [...out];
}

/**
 * Deterministic guards (always on, with or without Nemotron):
 *  - era guard: no film, TV or book dated 20+ years after their formative years
 *  - avoid guard: drop candidates whose name, tags or description touch what staff asked to steer clear of
 *  - feedback guard: drop what didn't land last week
 * The resident's own favourites are never removed.
 */
function applyGuards(svc: QlooService, ctx: ResidentContext, exclude: Set<string>): { name: string; reason: string; by: "guard" }[] {
  const flagged: { name: string; reason: string; by: "guard" }[] = [];
  const domains: Domain[] = ["music", "film", "tv", "books", "audio", "food", "travel"];
  const late = ctx.era.formativeEnd + 20;
  for (const d of ["film", "tv", "books"] as Domain[]) {
    const kept = ctx.results[d].filter((e) => !e.year || e.year <= late);
    const tooLate = ctx.results[d].filter((e) => e.year && e.year > late);
    ctx.results[d] = kept.length >= 2 ? kept : [...kept, ...tooLate];
  }
  // A favourite read from free text can resolve in Qloo to a same-named title from the wrong decades
  // ("variety shows" → a 2016 drama). Drop those seeds rather than anchor a day on them.
  for (const key of ["films", "tv", "books"] as const) {
    const seeds = ctx.seeds[key];
    const bad = seeds.filter((e) => e.year && (e.year > late || e.year < ctx.era.formativeStart - 40));
    if (bad.length) {
      ctx.seeds[key] = seeds.filter((e) => !bad.includes(e));
      bad.forEach((e) => flagged.push({ name: `${e.name} (${e.year})`, reason: "Qloo matched a favourite to this title, but it is from the wrong years", by: "guard" }));
    }
  }
  const terms = ctx.profile.constraints.avoid ? avoidTerms(ctx.profile.constraints.avoid) : [];
  // Whole words only (so "war" never matches "Warwick"), on names and Qloo tags. Descriptions are left
  // to the Nemotron planner, which can tell a war film from a film set after the war.
  const re = terms.length ? new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})s?\\b`, "i") : null;
  for (const d of domains) {
    ctx.results[d] = ctx.results[d].filter((e) => {
      if (exclude.has(normTitle(e.name))) {
        flagged.push({ name: e.name, reason: "Didn't land last week", by: "guard" });
        return false;
      }
      if (re) {
        const hay = `${e.name} | ${e.tags.map((t) => t.name).join(" | ")}`;
        const m = hay.match(re);
        if (m) {
          flagged.push({ name: e.name, reason: `Touches “${m[1].toLowerCase()}”, which staff asked to avoid`, by: "guard" });
          return false;
        }
      }
      return true;
    });
  }
  if (re || exclude.size)
    svc.note("agent.plan", "Safety guard: leave out what staff asked to avoid", flagged.length ? flagged.slice(0, 5).map((f) => `Left out ${f.name}: ${f.reason}`) : ["Nothing in Qloo's candidates touched it"]);
  return flagged;
}

/** Fallback critic when the Ultra planner is unavailable: Nemotron Super removes unsuitable candidates. */
async function applyReview(svc: QlooService, ctx: ResidentContext, models: ModelUse[]): Promise<{ name: string; reason: string; by: "nemotron" }[]> {
  if (!nemotronEnabled()) return [];
  const domains: Domain[] = ["music", "film", "tv", "books", "food", "travel"];
  const step = svc.begin("llm.review", "Nemotron care review of Qloo's candidates (planner fallback)");
  const subset = Object.fromEntries(domains.map((d) => [d, ctx.results[d]]));
  const r = await reviewCandidates(ctx.profile, ctx.era, subset).catch(() => null);
  if (!r) {
    step.summary = ["Review unavailable; Qloo order kept"];
    step.error = `review unavailable: ${lastNemotronError.slice(-160)}`;
    svc.end(step);
    return [];
  }
  if (r.meta) {
    step.model = r.meta.model;
    step.ms = r.meta.ms;
    models.push({ role: "review", label: "Care review", model: r.meta.model, ms: r.meta.ms });
  }
  const drop = new Set(r.drop.map((d) => d.id));
  const favIds = new Set([...ctx.seeds.artists, ...ctx.seeds.films, ...ctx.seeds.tv, ...ctx.seeds.books].map((e) => e.id));
  for (const d of domains) {
    const kept = ctx.results[d].filter((e) => !drop.has(e.id) || favIds.has(e.id));
    if (kept.length >= 2 || ctx.results[d].length < 2) ctx.results[d] = kept;
  }
  step.summary = r.drop.length ? r.drop.slice(0, 5).map((d) => `Removed ${d.name}: ${d.reason}`) : ["All candidates suitable; nothing removed"];
  svc.end(step);
  return r.drop.map((d) => ({ name: d.name, reason: d.reason, by: "nemotron" as const }));
}

const THEME_INDEX: Record<ThemeKey, number> = { music: 0, film: 1, food: 2, tv: 3, travel: 4, stories: 5 };
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface BuildOptions {
  /** Last week's "how did it go", to adapt this week. */
  feedback?: DayFeedback[];
}

export async function buildWeekPlan(input: ResidentProfile, onStep?: StepListener, opts: BuildOptions = {}): Promise<WeekPlan> {
  const svc = new QlooService(undefined, onStep);
  const models: ModelUse[] = [];
  let profile = input;
  let fb: Awaited<ReturnType<typeof applyFeedback>> | null = null;
  if (opts.feedback?.length) {
    fb = await applyFeedback(svc, profile, opts.feedback, models);
    profile = fb.profile;
  }
  profile = await applyStory(svc, profile, models);
  const era0 = eraFor(profile.birthYear);
  // Local history (Tavily, optional) runs alongside the Qloo phases.
  const historyJob = localHistory(svc, profile, era0, models).catch(() => [] as LocalHook[]);
  const ctx = await gatherResident(svc, profile);
  const flagged: WeekPlan["flagged"] = applyGuards(svc, ctx, fb?.exclude || new Set());
  // Last week's items that weren't loved go to the back of the queue.
  if (fb) {
    const kept = new Set(fb.adaptation.keep.map(normTitle));
    const used = new Set(fb.lastWeek.map(normTitle));
    for (const d of Object.keys(ctx.results) as Domain[]) {
      const xs = ctx.results[d];
      ctx.results[d] = [...xs.filter((e) => !used.has(normTitle(e.name)) || kept.has(normTitle(e.name))), ...xs.filter((e) => used.has(normTitle(e.name)) && !kept.has(normTitle(e.name)))];
    }
  }

  // ---- Nemotron 3 Ultra plans the week (tool calls into Qloo), else deterministic ------------
  let planner: WeekPlan["planner"] = "deterministic";
  let outcome = null as Awaited<ReturnType<typeof runPlanner>> | null;
  if (nemotronEnabled()) {
    outcome = await runPlanner(svc, ctx, { feedback: fb?.forPlanner, lastWeek: fb?.lastWeek, models }).catch((e) => {
      console.error("planner failed", e);
      return null;
    });
    if (outcome?.ok) {
      planner = "nemotron";
      flagged.push(...outcome.flagged.map((f) => ({ ...f, by: "nemotron" as const })));
    } else {
      svc.note("agent.plan", "Planner fallback: Qloo order with a Nemotron care review", [outcome?.error || "planner unavailable"]);
      flagged.push(...(await applyReview(svc, ctx, models)));
    }
  } else {
    svc.note("agent.plan", "No NEBIUS_API_KEY: deterministic planner (Qloo order, era-verified first)", ["Items, years and reasons all come from Qloo results"]);
  }

  let days = templateDays(ctx);
  // "Why this will land" from the planner, then its theme order for Monday to Saturday.
  if (outcome?.ok) {
    days = days.map((d) => ({ ...d, items: d.items.map((i) => (outcome!.landing.has(i.entityId) ? { ...i, landing: outcome!.landing.get(i.entityId) } : i)) }));
    const six = outcome.order.map((k) => days[THEME_INDEX[k]]);
    days = [...six.map((d, i) => ({ ...d, day: WEEKDAYS[i] })), days[6]];
  }

  // ---- Wording (Super) and prompts (Nano) in parallel; templates if either fails -------------
  let composer: WeekPlan["composer"] = "template";
  if (nemotronEnabled()) {
    const wStep = svc.begin("llm.compose", "Nemotron writes the wording around the chosen items");
    const pStep = svc.begin("llm.prompts", "Nemotron writes conversation prompts and follow-up questions");
    const [w, pr] = await Promise.all([
      writerPolish(days, ctx, models).catch(() => null).finally(() => {}),
      promptsFor(days, ctx, models).catch(() => null),
    ]);
    if (w) {
      days = w.days;
      composer = "nemotron";
      Object.assign(wStep, { model: w.model, ms: w.ms, summary: ["7 days written; items untouched", shortModel(w.model)] });
    } else Object.assign(wStep, { tool: "template.compose", error: "writer unavailable", summary: ["template wording used"] });
    if (pr) {
      days = days.map((d, i) => ({ ...d, prompts: pr.prompts[i], followUps: pr.followUps[i] }));
      composer = "nemotron";
      Object.assign(pStep, { model: pr.model, ms: pr.ms, summary: [`${pr.prompts.flat().length} prompts, ${pr.followUps.flat().length} follow-ups`, shortModel(pr.model)] });
    } else Object.assign(pStep, { error: "prompt writer unavailable", summary: ["template prompts used"] });
    svc.end(wStep);
    svc.end(pStep);
  } else {
    svc.note("template.compose", "No NEBIUS_API_KEY: deterministic template composer wrote the wording", ["Items, years and reasons all come from Qloo results"]);
  }

  const general = adaptationsFor(profile.constraints, displayName(profile));
  if (profile.constraints.avoid) general.unshift(`Steer clear of: ${profile.constraints.avoid}. If it comes up, gently change the subject.`);
  const dietLines = general.filter((l) => /diet|Diabetic|IDDSI/i.test(l));
  const senseLines = general.filter((l) => /^(Hearing|Vision)/.test(l));
  const history = await historyJob;
  days = days.map((d) => ({
    ...d,
    adaptations: d.domain === "food" ? dietLines : ["music", "film", "tv"].includes(d.domain) ? senseLines : [],
    localHistory: d.domain === "travel" && history.length ? history : undefined,
  }));

  return {
    resident: profile,
    era: ctx.era,
    days,
    generalAdaptations: general,
    composer,
    planner,
    strategy: outcome?.ok ? outcome.strategy : undefined,
    flagged: dedupeFlags(flagged),
    adapted: fb?.adaptation,
    models,
    qlooMode: svc.mock ? "mock" : "live",
    trace: svc.trace,
    warnings: ctx.warnings,
    understood: ctx.understood,
    generatedAt: new Date().toISOString(),
  };
}

function dedupeFlags(xs: WeekPlan["flagged"]) {
  const seen = new Set<string>();
  // Planner flags first (they carry a reason specific to this person), then guard flags.
  const ordered = [...xs.filter((x) => x.by === "nemotron"), ...xs.filter((x) => x.by !== "nemotron")];
  return ordered.filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true))).slice(0, 14);
}

// ---------------------------------------------------------------------------
// Group session
// ---------------------------------------------------------------------------

export async function buildGroupSession(residents: ResidentProfile[], onStep?: StepListener): Promise<GroupSession> {
  const svc = new QlooService(undefined, onStep);
  const models: ModelUse[] = [];
  const group = residents.slice(0, 6);
  svc.note("agent.plan", `Group session for ${group.map((r) => r.firstName).join(", ")}`, [
    "Resolve each resident's favourites and run music/film/TV insights individually",
    "Compare taste between each pair with /v2/analysis/compare",
    "Blend everyone's signals into one insights call per domain, inside the shared era window",
  ]);

  const ctxs = await Promise.all(group.map((r) => gatherResident(svc, r, { domains: ["music", "film", "tv"] })));
  const starts = ctxs.map((c) => c.era.formativeStart),
    ends = ctxs.map((c) => c.era.formativeEnd);
  let window = { start: Math.max(...starts), end: Math.min(...ends), overlap: true };
  if (window.start > window.end) window = { start: Math.min(...starts), end: Math.max(...ends), overlap: false };

  const seedIds = (c: ResidentContext) =>
    [...c.seeds.artists, ...c.seeds.films, ...c.seeds.tv, ...c.seeds.books].map((x) => x.id);

  // Pairwise compare (cap pairs to keep within rate limits)
  const pairs: [number, number][] = [];
  for (let i = 0; i < ctxs.length; i++) for (let j = i + 1; j < ctxs.length; j++) pairs.push([i, j]);
  const themeScores = new Map<string, { tag: string; score: number; between: Set<string> }>();
  await Promise.all(
    pairs.slice(0, 6).map(async ([i, j]) => {
      const a = seedIds(ctxs[i]),
        b = seedIds(ctxs[j]);
      if (!a.length || !b.length) return;
      const shared = await svc.compare(a, b, `Shared taste: ${group[i].firstName} vs ${group[j].firstName}`, 8);
      for (const s of shared) {
        const cur = themeScores.get(s.tagId) || { tag: s.name, score: 0, between: new Set<string>() };
        cur.score += s.score;
        cur.between.add(group[i].firstName).add(group[j].firstName);
        themeScores.set(s.tagId, cur);
      }
    }),
  );
  const themes = [...themeScores.entries()].sort((x, y) => y[1].score - x[1].score);
  const topThemeIds = themes.slice(0, 5).map(([id]) => id);

  // Blended group insights
  const allSeeds = [...new Set(ctxs.flatMap(seedIds))].slice(0, 25).join(",") || undefined;
  const common = {
    "signal.interests.entities": allSeeds,
    // Shared themes first, then interests read from quick-add favourites (e.g. "dancing", "afternoon tea").
    "signal.interests.tags":
      [...new Set([...topThemeIds, ...ctxs.flatMap((c) => [...c.hobbyTags, ...c.foodTags].map((t) => t.id))])].slice(0, 10).join(",") ||
      undefined,
    "signal.demographics.age": "55_and_older",
    "feature.explainability": true,
    take: 12,
  };
  const [gMusic, gFilm, gTv] = await Promise.all([
    svc.insights({ "filter.type": "urn:entity:artist", ...common }, "Group music: everyone's favourites blended"),
    svc.insights(
      { "filter.type": "urn:entity:movie", ...common, "filter.release_year.min": window.start - 3, "filter.release_year.max": window.end },
      `Group film inside the shared window ${window.start}–${window.end}`,
    ),
    svc.insights(
      { "filter.type": "urn:entity:tv_show", ...common, "filter.release_year.min": window.start - 3, "filter.release_year.max": window.end + 5 },
      `Group TV inside the shared window`,
    ),
  ]);

  // Who does each pick appeal to? Individual results, seeds, or tag overlap with their seeds.
  const appeal = (id: string, tags: string[]) =>
    group
      .filter((_, k) => {
        const c = ctxs[k];
        const top = (xs: { id: string }[]) => xs.slice(0, 5);
        const own = [...top(c.results.music), ...top(c.results.film), ...top(c.results.tv), ...c.seeds.artists, ...c.seeds.films, ...c.seeds.tv];
        if (own.some((x) => x.id === id)) return true;
        // Otherwise require at least two taste tags in common with this resident's own favourites.
        const seedTags = new Set([...c.seeds.artists, ...c.seeds.films, ...c.seeds.tv].flatMap((x) => x.tags.map((t) => t.id)));
        if (tags.filter((t) => seedTags.has(t)).length >= 2) return true;
        // Quick-add residents may only have an interest tag: one direct tag match counts for them.
        return [...c.hobbyTags, ...c.foodTags].some((h) => tags.includes(h.id));
      })
      .map((r) => r.firstName);

  const toGroupItem = (e: any, domain: Domain): PlanItem => {
    const who = appeal(e.id, e.tags.map((t: any) => t.id));
    const signals = [`appeals to ${who.length}/${group.length}`];
    if (e.affinity !== undefined) signals.push(`affinity ${e.affinity.toFixed(2)}`);
    const dated = domain !== "music" ? e.year : undefined; // artist "years" can be birth years
    if (dated) signals.push(String(dated));
    return {
      entityId: e.id,
      name: e.name,
      domain,
      year: dated,
      affinity: e.affinity,
      why: `Blended Qloo signals from all ${group.length} residents${dated ? `; from ${dated}` : ""}. Likely to land with ${who.join(", ") || "the group"}.`,
      signals,
      appealsTo: who,
    };
  };
  const rank = (xs: PlanItem[]) =>
    xs.sort((a, b) => (b.appealsTo?.length || 0) - (a.appealsTo?.length || 0) || (b.affinity || 0) - (a.affinity || 0));
  const music = rank(gMusic.map((e) => toGroupItem(e, "music"))).slice(0, 4);
  const film = rank(gFilm.map((e) => toGroupItem(e, "film"))).slice(0, 2);
  const tv = rank(gTv.map((e) => toGroupItem(e, "tv"))).slice(0, 2);

  const strictest = group.reduce(
    (acc, r) => {
      const order = ["none", "early", "moderate", "advanced"];
      if (order.indexOf(r.constraints.dementiaStage) > order.indexOf(acc.dementiaStage)) acc.dementiaStage = r.constraints.dementiaStage;
      if (r.constraints.hearing !== "none") acc.hearing = r.constraints.hearing === "significant" ? "significant" : acc.hearing === "significant" ? "significant" : "mild";
      if (r.constraints.vision !== "none") acc.vision = r.constraints.vision === "significant" ? "significant" : acc.vision === "significant" ? "significant" : "mild";
      acc.softFoods ||= r.constraints.softFoods;
      acc.diabetic ||= r.constraints.diabetic;
      return acc;
    },
    { hearing: "none", vision: "none", dementiaStage: "none", softFoods: false, diabetic: false } as ResidentProfile["constraints"],
  );

  const themeNames = themes.slice(0, 3).map(([, v]) => v.tag);
  let outline = [
    { minutes: 5, segment: "Welcome", detail: `Greet everyone by name. Play ${music[0]?.name || "a familiar song"} quietly as people settle.` },
    { minutes: 10, segment: "Music round", detail: `Play ${music.slice(0, 3).map((m) => m.name).join(", ") || "era favourites"}. Invite clapping and humming.` },
    { minutes: 10, segment: "Picture show", detail: `A short clip from ${film[0]?.name || "a film from the shared years"} with subtitles on.` },
    { minutes: 10, segment: "Common ground chat", detail: themeNames.length ? `Talk about what the group shares: ${themeNames.join(", ")}.` : "Talk about growing up, first jobs and dances." },
    { minutes: 10, segment: "Sing-along finale", detail: `Finish with ${music[1]?.name || music[0]?.name || "a song everyone knows"}${tv[0] ? `, then the theme tune from ${tv[0].name}` : ""}.` },
  ];
  let prompts = [
    `Who remembers ${music[0]?.name || "this song"}? Hands up!`,
    film[0] ? `Did anyone see ${film[0].name} at the pictures?` : "Who went to the pictures on a Saturday?",
    themeNames[0] ? `${themeNames[0]} comes up for several of you. What does it remind you of?` : "What did you do on a Saturday night?",
    "Where did you grow up? Has anyone been there?",
  ];
  let composer: GroupSession["composer"] = "template";

  if (nemotronEnabled()) {
    const step = svc.begin("llm.compose", "Nemotron writes the session running order around Qloo's picks");
    const r = await nemotronJSON<{ outline: { minutes: number; segment: string; detail: string }[]; prompts: string[] }>(
      "writer",
      `Write a 45-minute group reminiscence session for care-home staff. Residents: ${group
        .map((r) => `${r.firstName} (b.${r.birthYear}, ${r.hometown || r.country})`)
        .join("; ")}. Use ONLY these items by name: ${[...music, ...film, ...tv]
        .map((i) => `${i.name}${i.year ? ` (${i.year})` : ""}${i.appealsTo?.length ? ` [reaches ${i.appealsTo.join(", ")}]` : ""}`)
        .join(", ")}. Shared themes: ${themeNames.join(", ") || "none found"}. Strictest dementia stage: ${strictest.dementiaStage}.${
        group.some((r) => r.constraints.avoid) ? ` Steer clear of: ${group.map((r) => r.constraints.avoid).filter(Boolean).join("; ")}.` : ""
      }
Return JSON {"outline":[{"minutes":5,"segment":"","detail":""}],"prompts":[""]} with 4-6 segments totalling 45 minutes and 4 prompts that draw in quieter residents by name. No medical advice.`,
      { timeoutMs: 25000, maxTokens: 2000 },
    ).catch(() => null);
    const out = r?.data;
    if (r && out?.outline?.length && Array.isArray(out.prompts)) {
      outline = out.outline.slice(0, 6).map((o) => ({ minutes: Number(o.minutes) || 5, segment: String(o.segment), detail: String(o.detail) }));
      prompts = out.prompts.map(String).slice(0, 5);
      composer = "nemotron";
      models.push({ role: "writer", label: "Writes the session", model: r.meta.model, ms: r.meta.ms });
      Object.assign(step, { model: r.meta.model, ms: r.meta.ms, summary: ["outline + prompts", shortModel(r.meta.model)] });
    } else Object.assign(step, { error: "writer unavailable", summary: ["template outline used"] });
    svc.end(step);
  }
  if (composer === "template") svc.note("template.compose", "Template composer wrote the group outline", ["picks and shared themes come from Qloo"]);

  return {
    residents: group.map((r) => ({ firstName: r.firstName, birthYear: r.birthYear, hometown: r.hometown })),
    sharedWindow: window,
    sharedThemes: themes.slice(0, 6).map(([, v]) => ({ tag: v.tag, score: Math.round(v.score * 100) / 100, between: [...v.between].join(" & ") })),
    picks: [...music, ...film, ...tv],
    outline,
    prompts,
    adaptations: adaptationsFor(strictest, "each resident"),
    composer,
    models,
    qlooMode: svc.mock ? "mock" : "live",
    trace: svc.trace,
    warnings: [
      ...(window.overlap ? [] : ["These residents' formative years don't overlap; using the combined window instead."]),
      ...ctxs.flatMap((c) => c.warnings),
    ],
    generatedAt: new Date().toISOString(),
  };
}
