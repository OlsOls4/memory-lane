// Composes the weekly plan. Items are ALWAYS chosen from Qloo results by deterministic code;
// the LLM (Gemini, optional) only writes the human wording around them. With no key, a
// template composer writes the wording instead, so the app runs with zero keys.

import type { DayPlan, Domain, GroupSession, PlanItem, ResidentProfile, WeekPlan } from "../types";
import { QlooService } from "../qloo/client";
import { adaptationsFor, isUK } from "./care";
import { gatherResident, toItem, type ResidentContext } from "./orchestrator";
import { geminiEnabled, geminiJSON } from "./gemini";
import { displayName } from "../validate";

const take = <X>(xs: X[], n: number) => xs.slice(0, n);

function itemsFor(ctx: ResidentContext, d: Domain, fav: { id: string; name: string; year?: number; tags: any[]; type: string }[], n: number) {
  const favItems = fav.slice(0, 1).map((e) => toItem(ctx, e as any, d, true));
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
      intro: "A gentle read-aloud and a listen, chosen from books and audio that echo their tastes.",
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

/** Ask Gemini to rewrite titles/intros/steps/prompts. Items stay exactly as Qloo chose them. */
async function geminiPolish(days: DayPlan[], ctx: ResidentContext): Promise<DayPlan[] | null> {
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
    },
    formativeYears: `${ctx.era.formativeStart}-${ctx.era.formativeEnd}`,
    days: days.map((d) => ({
      day: d.day,
      theme: d.theme,
      durationMins: d.durationMins,
      items: d.items.map((i) => ({ name: i.name, year: i.year, why: i.why })),
    })),
  };
  const prompt = `You write reminiscence activity plans for care-home activity staff in ${p.country}.
Use warm, plain ${p.country === "United States" ? "American" : "British"} English. Write for staff, not the resident.
For each day, write: title (max 8 words), intro (1-2 sentences), steps (3-5 short imperative steps that use ONLY the listed items by name; never invent other songs, films, shows, books or places), prompts (3 conversation prompts suited to dementia stage "${p.constraints.dementiaStage}": for moderate/advanced use recognition, yes/no or either/or questions).
Never give medical advice. Return JSON: {"days":[{"day":"Monday","title":"","intro":"","steps":[""],"prompts":[""]}]} with exactly ${days.length} days in the same order.
DATA:
${JSON.stringify(brief)}`;
  const out = await geminiJSON<{ days: { day: string; title: string; intro: string; steps: string[]; prompts: string[] }[] }>(prompt);
  if (!out || !Array.isArray(out.days) || out.days.length !== days.length) return null;
  return days.map((d, i) => {
    const g = out.days[i];
    const ok = g && typeof g.title === "string" && Array.isArray(g.steps) && Array.isArray(g.prompts);
    return ok
      ? {
          ...d,
          title: g.title.slice(0, 80) || d.title,
          intro: String(g.intro || d.intro).slice(0, 400),
          steps: g.steps.map(String).slice(0, 6),
          prompts: g.prompts.map(String).slice(0, 4),
        }
      : d;
  });
}

export async function buildWeekPlan(profile: ResidentProfile): Promise<WeekPlan> {
  const svc = new QlooService();
  const ctx = await gatherResident(svc, profile);
  let days = templateDays(ctx);
  let composer: WeekPlan["composer"] = "template";

  if (geminiEnabled()) {
    const started = Date.now();
    const polished = await geminiPolish(days, ctx).catch(() => null);
    if (polished) {
      days = polished;
      composer = "gemini";
      svc.trace.push({
        n: svc.trace.length + 1,
        tool: "llm.compose",
        purpose: "Gemini writes the wording around the Qloo-chosen items",
        summary: ["7 days rewritten; items untouched", `model ${process.env.GEMINI_MODEL || "gemini-2.5-flash"}`],
        ms: Date.now() - started,
        mock: false,
      });
    } else {
      svc.trace.push({
        n: svc.trace.length + 1,
        tool: "template.compose",
        purpose: "Gemini failed or returned invalid JSON; fell back to the template composer",
        summary: ["template wording used"],
        ms: Date.now() - started,
        mock: false,
      });
    }
  } else {
    svc.note("template.compose", "No GEMINI_API_KEY: deterministic template composer wrote the wording", [
      "Items, years and reasons all come from Qloo results",
    ]);
  }

  const general = adaptationsFor(profile.constraints, displayName(profile));
  const dietLines = general.filter((l) => /diet|Diabetic|IDDSI/i.test(l));
  const senseLines = general.filter((l) => /^(Hearing|Vision)/.test(l));
  days = days.map((d) => ({
    ...d,
    adaptations: d.domain === "food" ? dietLines : ["music", "film", "tv"].includes(d.domain) ? senseLines : [],
  }));

  return {
    resident: profile,
    era: ctx.era,
    days,
    generalAdaptations: general,
    composer,
    qlooMode: svc.mock ? "mock" : "live",
    trace: svc.trace,
    warnings: ctx.warnings,
    understood: ctx.understood,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Group session
// ---------------------------------------------------------------------------

export async function buildGroupSession(residents: ResidentProfile[]): Promise<GroupSession> {
  const svc = new QlooService();
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
    if (e.year) signals.push(String(e.year));
    return {
      entityId: e.id,
      name: e.name,
      domain,
      year: e.year,
      affinity: e.affinity,
      why: `Blended Qloo signals from all ${group.length} residents${e.year ? `; from ${e.year}` : ""}. Likely to land with ${who.join(", ") || "the group"}.`,
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

  if (geminiEnabled()) {
    const started = Date.now();
    const out = await geminiJSON<{ outline: { minutes: number; segment: string; detail: string }[]; prompts: string[] }>(
      `Write a 45-minute group reminiscence session for care-home staff. Residents: ${group
        .map((r) => `${r.firstName} (b.${r.birthYear}, ${r.hometown}, ${r.country})`)
        .join("; ")}. Use ONLY these items by name: ${[...music, ...film, ...tv]
        .map((i) => `${i.name}${i.year ? ` (${i.year})` : ""}`)
        .join(", ")}. Shared themes: ${themeNames.join(", ") || "none found"}. Strictest dementia stage: ${strictest.dementiaStage}.
Return JSON {"outline":[{"minutes":5,"segment":"","detail":""}],"prompts":[""]} with 4-6 segments totalling 45 minutes and 4 prompts. No medical advice.`,
    ).catch(() => null);
    if (out?.outline?.length && Array.isArray(out.prompts)) {
      outline = out.outline.slice(0, 6).map((o) => ({ minutes: Number(o.minutes) || 5, segment: String(o.segment), detail: String(o.detail) }));
      prompts = out.prompts.map(String).slice(0, 5);
      composer = "gemini";
      svc.trace.push({ n: svc.trace.length + 1, tool: "llm.compose", purpose: "Gemini writes the session outline around Qloo picks", summary: ["outline + prompts"], ms: Date.now() - started, mock: false });
    }
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
    qlooMode: svc.mock ? "mock" : "live",
    trace: svc.trace,
    warnings: [
      ...(window.overlap ? [] : ["These residents' formative years don't overlap; using the combined window instead."]),
      ...ctxs.flatMap((c) => c.warnings),
    ],
    generatedAt: new Date().toISOString(),
  };
}
