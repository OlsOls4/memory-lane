// The Memory Lane agent: plans Qloo tool calls for a resident, executes them in phases,
// recovers from failures, and returns a grounded context for the composer.
//
// Phase 1  resolve: /search (favourites, hometown locality) and /v2/tags (hobbies, foods)
// Phase 2  insights: /v2/insights per domain, era-filtered with the params each type supports
// Phase 3  verify: cross-check music against performers born in the right window (person type)
// Group    compare: /v2/analysis/compare between residents + a blended group insights call

import type { EraInfo, PlanItem, QEntity, QTag, ResidentProfile, Domain } from "../types";
import { QlooService } from "../qloo/client";
import { countryForRelease, eraFor } from "./care";
import { displayName } from "../validate";

export interface ResidentContext {
  profile: ResidentProfile;
  era: EraInfo;
  seeds: {
    artists: QEntity[];
    films: QEntity[];
    tv: QEntity[];
    books: QEntity[];
    hometown: QEntity | null;
  };
  hobbyTags: QTag[];
  foodTags: QTag[];
  results: Record<Domain, QEntity[]>;
  performers: QEntity[];
  warnings: string[];
  /** How each free-text "loved" item was read (Quick start). */
  understood: string[];
}

const T = {
  artist: "urn:entity:artist",
  movie: "urn:entity:movie",
  tv: "urn:entity:tv_show",
  book: "urn:entity:book",
  podcast: "urn:entity:podcast",
  place: "urn:entity:place",
  destination: "urn:entity:destination",
  person: "urn:entity:person",
  locality: "urn:entity:locality",
};

const ids = (xs: (QEntity | null | undefined)[]) => xs.filter(Boolean).map((x) => x!.id);
const uniq = <X>(xs: X[]) => [...new Set(xs)];
const csv = (xs: string[]) => (xs.length ? uniq(xs).slice(0, 25).join(",") : undefined);

async function resolveAll(svc: QlooService, names: string[], type: string, label: string): Promise<QEntity[]> {
  const found = await Promise.all(
    names
      .filter((n) => n.trim())
      .slice(0, 5)
      .map((n) => svc.search(n.trim(), [type], `Resolve ${label} "${n.trim()}" to a Qloo entity ID`, 1)),
  );
  return found.map((r) => r[0]).filter(Boolean);
}

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^the /, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const TYPE_LABEL: Record<string, string> = {
  [T.artist]: "singer/band",
  [T.movie]: "film",
  [T.tv]: "TV show",
  [T.book]: "book",
};

const FOODISH =
  /\b(food|dish|cuisine|tea|cake|cakes|pie|pies|chips|pizza|stew|roast|bread|biscuits?|curry|soup|pudding|sweets|chocolate|ice cream|scouse|diner|caf[eé]|bak(e|ing)|cook(ing)?|scones?|shortbread|fish|sandwich(es)?|jam|toffee|trifle|dinner|breakfast)\b/i;

export interface LovedReading {
  input: string;
  seed?: QEntity; // resolved to an entity of an inferred type
  tag?: QTag; // or read as a taste tag (hobby, food, theme)
  asFood?: boolean;
}

/**
 * Quick start: one free-text "thing they loved" in ANY domain. The agent searches across entity types
 * with a single /search call (artist, movie, tv_show, book) and asks /v2/tags in parallel, then decides:
 *   exact entity name match  >  exact (real) tag match  >  partial entity match  >  any tag.
 * This lets "Elvis", "Coronation Street", "fish and chips" or "ballroom dancing" all work from one box.
 */
export async function readLoved(svc: QlooService, input: string): Promise<LovedReading> {
  const q = normName(input);
  const [hits, tags] = await Promise.all([
    svc.search(input, [T.artist, T.movie, T.tv, T.book], `Infer what "${input}" is: search across artists, films, TV and books`, 3),
    svc.tags(input, `Infer "${input}" as a taste tag (hobby, food, theme)`, undefined, 1),
  ]);
  const hit = hits.find((h) => TYPE_LABEL[h.type]) || hits[0];
  const tag = tags[0];
  const hn = hit ? normName(hit.name) : "";
  const tn = tag ? normName(tag.name) : "";
  const realTag = tag && !tag.id.startsWith("urn:tag:mock:keyword:"); // mock placeholder tags are not evidence
  const asFood = FOODISH.test(input) || (!!tag && /cuisine|dish|food|restaurant/i.test(`${tag.type || ""} ${tag.id}`));
  const words = (x: string) => new Set(x.split(" ").filter((w) => w.length > 2));
  const overlap = (a: string, b: string) => {
    const A = words(a), B = words(b);
    if (!A.size || !B.size) return false;
    const inter = [...A].filter((w) => B.has(w)).length;
    return inter / Math.min(A.size, B.size) >= 0.6;
  };
  const loose = hit && hn && (hn.includes(q) || q.includes(hn) || overlap(hn, q));
  // An exact entity match wins outright: a same-named tag (e.g. a dish called "Frank Sinatra")
  // would only add noise to the taste signal.
  if (hit && hn === q) return { input, seed: hit, asFood: false };
  if (realTag && tn === q) return { input, tag, asFood };
  if (loose && !asFood) return { input, seed: hit };
  if (tag) return { input, tag, asFood };
  if (loose) return { input, seed: hit };
  return { input };
}

export async function gatherResident(
  svc: QlooService,
  p: ResidentProfile,
  opts: { domains?: Domain[] } = {},
): Promise<ResidentContext> {
  const era = eraFor(p.birthYear);
  const want = new Set<Domain>(opts.domains || ["music", "film", "tv", "books", "food", "travel"]);
  const warnings: string[] = [];
  const releaseCountry = countryForRelease(p.country);

  const who = displayName(p);
  const loved = p.favourites.loved || [];
  svc.note("agent.plan", `Plan for ${displayName(p)} (born ${p.birthYearApprox ? "about " : ""}${p.birthYear}${p.hometown ? `, grew up in ${p.hometown}` : `, ${p.country}`})`, [
    `Formative window ${era.formativeStart}–${era.formativeEnd} (ages 10–25, the 'reminiscence bump')`,
    ...(loved.length
      ? [`Quick start: infer the domain of ${loved.map((x) => `"${x}"`).join(", ")} with a cross-type /search plus /v2/tags`]
      : []),
    `Resolve ${p.favourites.artists.length + p.favourites.films.length + p.favourites.tvShows.length + p.favourites.books.length} favourites + hometown via /search; hobbies & foods via /v2/tags`,
    `Then /v2/insights for: ${[...want].join(", ")}, era-filtered where the entity type supports it`,
    "Artists have no release-year filter, so music is era-checked against performers born " +
      `${era.performerDobMin.slice(0, 4)}–${era.performerDobMax.slice(0, 4)} (person type, filter.date_of_birth)`,
  ]);

  // ---- Phase 1: resolve -------------------------------------------------------------
  const f = p.favourites;
  const [artists, films, tv, books, hometownHits, hobbyTagLists, foodTagLists, lovedReadings] = await Promise.all([
    resolveAll(svc, f.artists, T.artist, "artist"),
    resolveAll(svc, f.films, T.movie, "film"),
    resolveAll(svc, f.tvShows, T.tv, "TV show"),
    resolveAll(svc, f.books, T.book, "book"),
    p.hometown.trim()
      ? svc.search(p.hometown.trim(), [T.locality], `Resolve hometown "${p.hometown}" to a locality`, 1)
      : svc.search(p.country, [T.locality], `No hometown given: resolve the country "${p.country}" as the place anchor`, 1),
    Promise.all(f.hobbies.filter(Boolean).slice(0, 5).map((h) => svc.tags(h, `Find a Qloo tag for the hobby "${h}"`, undefined, 1))),
    Promise.all(f.foods.filter(Boolean).slice(0, 5).map((h) => svc.tags(h, `Find a cuisine/dish tag for "${h}"`, undefined, 1))),
    Promise.all(loved.filter(Boolean).slice(0, 5).map((x) => readLoved(svc, x))),
  ]);
  // Fold the inferred "loved" items into the right buckets.
  const understood: string[] = [];
  const bucket: Record<string, QEntity[]> = { [T.artist]: artists, [T.movie]: films, [T.tv]: tv, [T.book]: books };
  const lovedHobbyTags: QTag[] = [], lovedFoodTags: QTag[] = [];
  for (const r of lovedReadings) {
    if (r.seed && bucket[r.seed.type]) {
      if (!bucket[r.seed.type].some((x) => x.id === r.seed!.id)) bucket[r.seed.type].unshift(r.seed);
      understood.push(`"${r.input}" → ${TYPE_LABEL[r.seed.type]}: ${r.seed.name}${r.seed.year ? ` (${r.seed.year})` : ""}`);
    }
    if (r.tag) {
      (r.asFood ? lovedFoodTags : lovedHobbyTags).push(r.tag);
      if (!r.seed) understood.push(`"${r.input}" → ${r.asFood ? "food / taste of home" : "interest"}: ${r.tag.name}`);
    }
    if (!r.seed && !r.tag) {
      understood.push(`"${r.input}" → not recognised; the plan leans on their era and where they grew up`);
    }
  }
  if (understood.length) svc.note("agent.plan", "Quick start: how the free-text favourite was read", understood);
  const hometown = hometownHits[0] || null;
  const hobbyTags = [...hobbyTagLists.map((l) => l[0]).filter(Boolean), ...lovedHobbyTags];
  const foodTags = [...foodTagLists.map((l) => l[0]).filter(Boolean), ...lovedFoodTags];
  const allSeeds = [...artists, ...films, ...tv, ...books];
  if (!allSeeds.length)
    warnings.push(
      hobbyTags.length || foodTags.length
        ? "No specific songs, films or shows yet: picks lean on their era, where they grew up and their interests. Add a favourite singer or film to sharpen this."
        : "No favourites resolved: recommendations lean on era, age and hometown only.",
    );
  if (p.birthYearApprox)
    warnings.push(`Birth year estimated as ${p.birthYear}; add the exact year to tighten the era filters.`);

  const age = era.ageBucket;
  // One era block is offered to every domain; sanitizeInsightsParams strips it for entity types
  // that don't support release-year filtering (artist, podcast), and the trace shows that it did.
  const eraBlock = {
    "filter.release_year.min": era.formativeStart - 3,
    "filter.release_year.max": era.formativeEnd,
  };
  const hobbyCsv = csv(hobbyTags.map((t) => t.id));
  // Era sound: Qloo music-genre tags for the decades of their reminiscence bump. These give the
  // artist and performer queries a period signal even when no favourite singer was named.
  const genreCsv = csv(eraGenreTags(era.formativeStart, era.formativeEnd, releaseCountry !== "United States"));
  const results: Record<Domain, QEntity[]> = { music: [], film: [], tv: [], books: [], audio: [], food: [], travel: [] };

  // ---- Phase 2: insights per domain (parallel) ---------------------------------------
  const jobs: Promise<void>[] = [];
  const run = (d: Domain, params: Record<string, string | number | boolean | undefined>, purpose: string) =>
    jobs.push(
      svc.insights(params, purpose).then((r) => {
        results[d] = r;
      }),
    );

  if (want.has("music"))
    run(
      "music",
      {
        "filter.type": T.artist,
        ...eraBlock,
        "signal.interests.entities": csv(ids([...artists, ...films, ...tv])),
        // Mixed entity/hobby + genre signals can stall Qloo, so era genres stand in only when no favourite artist is known.
        "signal.interests.tags": artists.length ? undefined : genreCsv,
        "signal.demographics.age": age,
        "filter.exclude.entities": csv(ids(artists)),
        "feature.explainability": true,
        take: 15,
      },
      `Artists with taste affinity to ${who}'s favourites, weighted to the 55+ audience`,
    );

  let performers: QEntity[] = [];
  if (want.has("music"))
    jobs.push(
      svc
        .insights(
          {
            "filter.type": T.person,
            // Era-genre signal + musician tag + birth-date window: who was actually singing then.
            "signal.interests.tags": genreCsv,
            "filter.tags": "urn:tag:genre:person:musician",
            "signal.demographics.age": age,
            "filter.date_of_birth.min": era.performerDobMin,
            "filter.date_of_birth.max": era.performerDobMax,
            take: 30,
          },
          `Era check: performers born ${era.performerDobMin.slice(0, 4)}–${era.performerDobMax.slice(0, 4)} who fit this taste`,
        )
        .then((r) => {
          performers = r;
        }),
    );

  if (want.has("film"))
    run(
      "film",
      {
        "filter.type": T.movie,
        "signal.interests.entities": csv(ids([...films, ...artists, ...tv])),
        "signal.interests.tags": hobbyCsv,
        "signal.demographics.age": age,
        ...eraBlock,
        "filter.exclude.entities": csv(ids(films)),
        "feature.explainability": true,
        take: 10,
      },
      `Films released ${era.formativeStart - 3}–${era.formativeEnd} (UK and US cinema both count)`,
    );

  if (want.has("tv"))
    run(
      "tv",
      {
        "filter.type": T.tv,
        "signal.interests.entities": csv(ids([...tv, ...films, ...artists])),
        "signal.interests.tags": hobbyCsv,
        "signal.demographics.age": age,
        "filter.release_year.min": era.formativeStart - 3,
        "filter.release_year.max": era.formativeEnd + 5,
        "filter.release_country": releaseCountry,
        "filter.exclude.entities": csv(ids(tv)),
        "feature.explainability": true,
        take: 10,
      },
      `TV first broadcast in ${releaseCountry} around ${era.formativeStart}–${era.formativeEnd + 5}`,
    );

  if (want.has("books"))
    run(
      "books",
      {
        "filter.type": T.book,
        "signal.interests.entities": csv(ids([...books, ...films, ...tv, ...artists])),
        "signal.interests.tags": hobbyCsv,
        "signal.demographics.age": age,
        "filter.publication_year.min": era.formativeStart - 20,
        "filter.publication_year.max": era.formativeEnd,
        "filter.exclude.entities": csv(ids(books)),
        "feature.explainability": true,
        take: 6,
      },
      `Books published up to ${era.formativeEnd}, for read-aloud sessions`,
    );

  if (want.has("audio"))
    run(
      "audio",
      {
        "filter.type": T.podcast,
        ...eraBlock,
        "signal.interests.entities": csv(ids([...artists, ...tv])),
        "signal.interests.tags": artists.length || tv.length || hobbyCsv ? hobbyCsv : genreCsv,
        "signal.demographics.age": age,
        "feature.explainability": true,
        take: 5,
      },
      "Radio-style podcasts and programmes that echo these tastes",
    );

  const place = p.hometown.trim() || p.country; // Quick start: fall back to the country when no town is given
  // Qloo's location lookup is ambiguous without a country ("Glasgow" can resolve to Kentucky).
  const placeQuery = p.hometown.trim()
    ? p.hometown.includes(",") ? p.hometown.trim() : `${p.hometown.trim()}, ${p.country}`
    : p.country;
  if (want.has("food"))
    jobs.push(
      (async () => {
        const base = {
          "filter.type": T.place,
          "filter.tags": "urn:tag:genre:place:restaurant",
          "filter.exclude.tags": "urn:tag:genre:place:hotel",
          "signal.interests.tags": csv(foodTags.map((t) => t.id)),
          "signal.interests.entities": csv(ids(allSeeds)),
          "signal.demographics.age": age,
          take: 6,
        };
        let r = await svc.insights(
          { ...base, "filter.location.query": placeQuery },
          `Taste of home: food places in ${place} matching ${foodTags.map((t) => t.name).join(", ") || "their tastes"}`,
        );
        if (!r.length) {
          warnings.push(`No food places found for ${place}; widened the search beyond it.`);
          r = await svc.insights(base, "Recovery: same food signals without the hometown filter");
        }
        results.food = r;
      })(),
    );

  if (want.has("travel") && (hometown || allSeeds.length))
    run(
      "travel",
      {
        "filter.type": T.destination,
        "signal.location.query": placeQuery,
        "signal.interests.entities": csv(ids(allSeeds)),
        "signal.interests.tags": hobbyCsv,
        "signal.demographics.age": age,
        "feature.explainability": true,
        take: 6,
      },
      `Armchair travel: destinations with affinity to ${place} and their tastes`,
    );

  await Promise.all(jobs);
  // The hometown itself is the anchor, not a destination to suggest.
  const homeName = (hometown?.name || p.hometown.split(",")[0] || "").trim().toLowerCase();
  if (homeName) results.travel = results.travel.filter((d) => d.name.trim().toLowerCase() !== homeName).slice(0, 5);

  // ---- Phase 3: verify ---------------------------------------------------------------
  if (want.has("music")) {
    const performerNames = new Set(performers.map((x) => x.name.toLowerCase()));
    const verifiedNames = new Set<string>();
    for (const a of [...results.music, ...artists]) {
      const inWindow = a.year !== undefined && a.year >= era.formativeStart - 5 && a.year <= era.formativeEnd + 3;
      if (performerNames.has(a.name.toLowerCase()) || inWindow) {
        (a as QEntity & { eraVerified?: boolean }).eraVerified = true;
        verifiedNames.add(a.name);
      }
    }
    // Re-rank: era-verified artists first, then affinity.
    results.music.sort(
      (x: any, y: any) => Number(!!y.eraVerified) - Number(!!x.eraVerified) || (y.affinity || 0) - (x.affinity || 0),
    );
    svc.note("agent.plan", "Era verification for music", [
      `${verifiedNames.size} artist(s) confirmed as era-appropriate via performer birth dates or release years`,
      "Unverified artists are kept lower in the list rather than dropped",
    ]);
  }

  return { profile: p, era, seeds: { artists, films, tv, books, hometown }, hobbyTags, foodTags, results, performers, warnings, understood };
}

// ---------------------------------------------------------------------------
// Turning entities into explained plan items
// ---------------------------------------------------------------------------

export function toItem(ctx: ResidentContext, e: QEntity, domain: Domain, isFavourite = false): PlanItem {
  const { era, profile } = ctx;
  const who = displayName(profile);
  const seedNames = new Map(
    [...ctx.seeds.artists, ...ctx.seeds.films, ...ctx.seeds.tv, ...ctx.seeds.books, ctx.seeds.hometown]
      .filter(Boolean)
      .map((s) => [s!.id, s!.name]),
  );
  const signals: string[] = [];
  const parts: string[] = [];
  if (isFavourite) {
    parts.push(`One of ${who}'s own favourites, used as a familiar anchor`);
    signals.push("favourite");
  } else {
    const drivers = (e.explain || [])
      .map((x) => x.name || seedNames.get(x.entityId))
      .filter(Boolean)
      .slice(0, 3) as string[];
    if (drivers.length) {
      parts.push(`Qloo links it most strongly to ${drivers.join(", ")}`);
      drivers.forEach((d) => signals.push(`because: ${d}`));
    } else if (ctx.seeds.artists.length || ctx.seeds.films.length) {
      parts.push(`High taste affinity with ${who}'s favourites`);
    }
    if (e.affinity !== undefined) signals.push(`affinity ${e.affinity.toFixed(2)}`);
  }
  // Artist/person "years" in Qloo data can be a birth year, so only dated works get a year in the reason.
  if (e.year && e.type !== T.artist && e.type !== T.person) {
    const inBump = e.year >= era.formativeStart && e.year <= era.formativeEnd;
    parts.push(
      inBump
        ? `from ${e.year}, when ${who} was about ${e.year - profile.birthYear}`
        : `from ${e.year}`,
    );
    signals.push(`${e.year}`);
  }
  if ((e as any).eraVerified) signals.push("era-verified");
  const shared = e.tags.filter((t) => [...ctx.hobbyTags, ...ctx.foodTags].some((h) => h.id === t.id)).map((t) => t.name);
  if (shared.length) {
    parts.push(`shares ${shared.slice(0, 2).join(" & ")} with their interests`);
    shared.slice(0, 2).forEach((s) => signals.push(`tag: ${s}`));
  }
  return {
    entityId: e.id,
    name: e.name,
    domain,
    year: e.year,
    isFavourite,
    affinity: e.affinity,
    eraVerified: !!(e as any).eraVerified,
    why: parts.join("; ") + ".",
    signals,
    location: e.location,
  };
}

/** Qloo music-genre tag IDs for the decades a person spent aged roughly 10–25. */
function eraGenreTags(start: number, end: number, british: boolean): string[] {
  const g = (x: string) => `urn:tag:genre:music:${x}`;
  const byDecade: Record<number, string[]> = {
    1920: ["jazz", "swing", "crooner"],
    1930: ["swing", "big_band", "crooner"],
    1940: ["big_band", "swing", "crooner", "traditional_pop"],
    1950: ["traditional_pop", "rock", "doo_wop", "crooner", ...(british ? ["skiffle"] : [])],
    1960: ["traditional_pop", "motown", ...(british ? ["merseybeat"] : ["folk"])],
    1970: ["glam_rock", "disco", "folk", ...(british ? ["northern_soul"] : [])],
    1980: ["disco", "pop"],
  };
  const out: string[] = [];
  for (let d = Math.floor(start / 10) * 10; d <= end; d += 10) for (const t of byDecade[Math.min(Math.max(d, 1920), 1980)] || []) if (!out.includes(t)) out.push(t);
  return out.slice(0, 6).map(g);
}
