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

export async function gatherResident(
  svc: QlooService,
  p: ResidentProfile,
  opts: { domains?: Domain[] } = {},
): Promise<ResidentContext> {
  const era = eraFor(p.birthYear);
  const want = new Set<Domain>(opts.domains || ["music", "film", "tv", "books", "audio", "food", "travel"]);
  const warnings: string[] = [];
  const releaseCountry = countryForRelease(p.country);

  svc.note("agent.plan", `Plan for ${p.firstName} (born ${p.birthYear}, grew up in ${p.hometown})`, [
    `Formative window ${era.formativeStart}–${era.formativeEnd} (ages 10–25, the 'reminiscence bump')`,
    `Resolve ${p.favourites.artists.length + p.favourites.films.length + p.favourites.tvShows.length + p.favourites.books.length} favourites + hometown via /search; hobbies & foods via /v2/tags`,
    `Then /v2/insights for: ${[...want].join(", ")}, era-filtered where the entity type supports it`,
    "Artists have no release-year filter, so music is era-checked against performers born " +
      `${era.performerDobMin.slice(0, 4)}–${era.performerDobMax.slice(0, 4)} (person type, filter.date_of_birth)`,
  ]);

  // ---- Phase 1: resolve -------------------------------------------------------------
  const f = p.favourites;
  const [artists, films, tv, books, hometownHits, hobbyTagLists, foodTagLists] = await Promise.all([
    resolveAll(svc, f.artists, T.artist, "artist"),
    resolveAll(svc, f.films, T.movie, "film"),
    resolveAll(svc, f.tvShows, T.tv, "TV show"),
    resolveAll(svc, f.books, T.book, "book"),
    p.hometown.trim()
      ? svc.search(p.hometown.trim(), [T.locality], `Resolve hometown "${p.hometown}" to a locality`, 1)
      : Promise.resolve([] as QEntity[]),
    Promise.all(f.hobbies.filter(Boolean).slice(0, 5).map((h) => svc.tags(h, `Find a Qloo tag for the hobby "${h}"`, undefined, 1))),
    Promise.all(f.foods.filter(Boolean).slice(0, 5).map((h) => svc.tags(h, `Find a cuisine/dish tag for "${h}"`, undefined, 1))),
  ]);
  const hometown = hometownHits[0] || null;
  const hobbyTags = hobbyTagLists.map((l) => l[0]).filter(Boolean);
  const foodTags = foodTagLists.map((l) => l[0]).filter(Boolean);
  const allSeeds = [...artists, ...films, ...tv, ...books];
  if (!allSeeds.length) warnings.push("No favourites resolved: recommendations lean on era, age and hobby signals only.");

  const age = era.ageBucket;
  // One era block is offered to every domain; sanitizeInsightsParams strips it for entity types
  // that don't support release-year filtering (artist, podcast), and the trace shows that it did.
  const eraBlock = {
    "filter.release_year.min": era.formativeStart - 3,
    "filter.release_year.max": era.formativeEnd,
  };
  const hobbyCsv = csv(hobbyTags.map((t) => t.id));
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
        "signal.interests.tags": hobbyCsv,
        "signal.demographics.age": age,
        "filter.exclude.entities": csv(ids(artists)),
        "feature.explainability": true,
        take: 15,
      },
      `Artists with taste affinity to ${p.firstName}'s favourites, weighted to the 55+ audience`,
    );

  let performers: QEntity[] = [];
  if (want.has("music"))
    jobs.push(
      svc
        .insights(
          {
            "filter.type": T.person,
            "signal.interests.entities": csv(ids(artists)),
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
        "signal.interests.entities": csv(ids([...books, ...films, ...tv])),
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
        "signal.interests.tags": hobbyCsv,
        "signal.demographics.age": age,
        "feature.explainability": true,
        take: 5,
      },
      "Radio-style podcasts and programmes that echo these tastes",
    );

  if (want.has("food") && (foodTags.length || p.hometown))
    jobs.push(
      (async () => {
        const base = {
          "filter.type": T.place,
          "signal.interests.tags": csv(foodTags.map((t) => t.id)),
          "signal.interests.entities": csv(ids(allSeeds)),
          "signal.demographics.age": age,
          take: 6,
        };
        let r = await svc.insights(
          { ...base, "filter.location.query": p.hometown || undefined },
          `Taste of home: food places in ${p.hometown} matching ${foodTags.map((t) => t.name).join(", ") || "their tastes"}`,
        );
        if (!r.length) {
          warnings.push(`No hometown food places found for ${p.hometown}; widened the search beyond the town.`);
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
        "signal.interests.entities": csv(ids([hometown, ...allSeeds])),
        "signal.interests.tags": hobbyCsv,
        "signal.demographics.age": age,
        "filter.exclude.entities": csv(ids([hometown])),
        "feature.explainability": true,
        take: 5,
      },
      `Armchair travel: destinations with affinity to ${p.hometown || "their tastes"}`,
    );

  await Promise.all(jobs);

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

  return { profile: p, era, seeds: { artists, films, tv, books, hometown }, hobbyTags, foodTags, results, performers, warnings };
}

// ---------------------------------------------------------------------------
// Turning entities into explained plan items
// ---------------------------------------------------------------------------

export function toItem(ctx: ResidentContext, e: QEntity, domain: Domain, isFavourite = false): PlanItem {
  const { era, profile } = ctx;
  const seedNames = new Map(
    [...ctx.seeds.artists, ...ctx.seeds.films, ...ctx.seeds.tv, ...ctx.seeds.books, ctx.seeds.hometown]
      .filter(Boolean)
      .map((s) => [s!.id, s!.name]),
  );
  const signals: string[] = [];
  const parts: string[] = [];
  if (isFavourite) {
    parts.push(`One of ${profile.firstName}'s own favourites, used as a familiar anchor`);
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
      parts.push(`High taste affinity with ${profile.firstName}'s favourites`);
    }
    if (e.affinity !== undefined) signals.push(`affinity ${e.affinity.toFixed(2)}`);
  }
  if (e.year) {
    const inBump = e.year >= era.formativeStart && e.year <= era.formativeEnd;
    parts.push(
      inBump
        ? `from ${e.year}, when ${profile.firstName} was about ${e.year - profile.birthYear}`
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
