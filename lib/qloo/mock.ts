// Mock transport: answers /search, /v2/tags, /v2/insights and /v2/analysis/compare from the
// illustrative fixtures, returning JSON shaped like documented Qloo responses so the same
// normaliser and agent code path runs in mock and live mode. Scores are a toy tag-overlap model.

import { ENTITIES, TAGS, TAG_BY_SLUG, type FixtureEntity } from "./fixtures";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slug = (s: string) => norm(s).replace(/ /g, "_").slice(0, 40) || "item";

const COUNTRY_ALIASES: Record<string, string> = {
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  gb: "GB",
  "united states": "US",
  usa: "US",
  us: "US",
  america: "US",
  "united states of america": "US",
};

function tagIdsFor(ent: FixtureEntity): string[] {
  return ent.tags.map((s) => `urn:tag:mock:${s}`);
}

/** Generated entities for unknown names: infer a couple of tags from keywords so scoring still works. */
const generated = new Map<string, FixtureEntity>();

function inferTags(text: string): string[] {
  const n = ` ${norm(text)} `;
  return TAGS.filter((tg) => tg.keywords.some((k) => n.includes(` ${norm(k)} `))).map((tg) =>
    tg.id.replace("urn:tag:mock:", ""),
  );
}

function lookupEntity(id: string): FixtureEntity | undefined {
  return ENTITIES.find((x) => x.id === id) || generated.get(id);
}

function rawEntity(ent: FixtureEntity, query?: Record<string, unknown>) {
  const props: Record<string, unknown> = {};
  if (ent.year) {
    if (ent.type === "urn:entity:book") props.publication_year = ent.year;
    else props.release_year = ent.year;
  }
  if (ent.dob) props.date_of_birth = ent.dob;
  if (ent.city || ent.country) props.geocode = { city: ent.city, country_code: ent.country };
  if (ent.desc) props.description = ent.desc;
  return {
    name: ent.name,
    entity_id: ent.id,
    type: ent.type,
    types: [ent.type],
    popularity: ent.pop,
    properties: props,
    tags: ent.tags.map((s) => {
      const tg = TAG_BY_SLUG.get(s);
      return { id: `urn:tag:mock:${s}`, name: tg?.name || s, type: "urn:tag:mock" };
    }),
    ...(query ? { query } : {}),
  };
}

function search(params: Record<string, string>) {
  const q = norm(params.query || "");
  const types = (params.types || "").split(",").filter(Boolean);
  const take = parseInt(params.take || "3", 10);
  const pool = ENTITIES.filter((x) => !types.length || types.includes(x.type));
  const hits = pool
    .map((x) => {
      const n = norm(x.name);
      const score = n === q ? 3 : n.includes(q) || q.includes(n) ? 2 : 0;
      return { x, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || b.x.pop - a.x.pop)
    .map((h) => h.x);
  // A cross-type search (Quick start domain inference) returns nothing for an unknown name, like a
  // search with no good match would, so the agent falls back to reading it as a tag.
  if (!hits.length && q && types.length === 1 && types[0] === "urn:entity:locality" && COUNTRY_ALIASES[q]) {
    // A country used as the place anchor (Quick start with no town).
    const id = `mock-gen-locality-${slug(q)}`;
    const ent: FixtureEntity = { id, name: params.query.trim(), type: types[0], country: COUNTRY_ALIASES[q], tags: [], pop: 0.5 };
    generated.set(id, ent);
    hits.push(ent);
  }
  if (!hits.length && q && types.length <= 1) {
    // Unknown name: fabricate a clearly-mock entity so the flow continues.
    const type = types[0] || "urn:entity:artist";
    const id = `mock-gen-${type.split(":").pop()}-${slug(q)}`;
    const ent: FixtureEntity = generated.get(id) || {
      id,
      name: params.query.trim(),
      type,
      tags: inferTags(params.query),
      pop: 0.3,
    };
    generated.set(id, ent);
    hits.push(ent);
  }
  return { results: hits.slice(0, take).map((h) => rawEntity(h)) };
}

function tags(params: Record<string, string>) {
  const q = norm(params["filter.query"] || "");
  const take = parseInt(params.take || "3", 10);
  let found = TAGS.filter((tg) => tg.keywords.some((k) => norm(k).includes(q) || (q.length > 3 && q.includes(norm(k)))));
  // Exact keyword matches first ("ballroom dancing" -> Dancing, not Music Venue).
  found.sort((a, b) => Number(b.keywords.some((k) => norm(k) === q)) - Number(a.keywords.some((k) => norm(k) === q)));
  if (!found.length && q) {
    found = [{ id: `urn:tag:mock:keyword:${slug(q)}`, name: params["filter.query"].trim(), keywords: [q] }];
  }
  return {
    success: true,
    results: { tags: found.slice(0, take).map((tg) => ({ id: tg.id, name: tg.name, type: "urn:tag:mock" })) },
  };
}

function insights(params: Record<string, string>) {
  const type = params["filter.type"];
  const take = parseInt(params.take || "20", 10);
  const list = (k: string) => (params[k] ? params[k].split(",").map((s) => s.trim()).filter(Boolean) : []);
  const seeds = list("signal.interests.entities");
  const signalTags = new Set(list("signal.interests.tags"));
  const exclude = new Set(list("filter.exclude.entities"));
  const yMin = parseInt(params["filter.release_year.min"] || params["filter.publication_year.min"] || "0", 10);
  const yMax = parseInt(params["filter.release_year.max"] || params["filter.publication_year.max"] || "9999", 10);
  const countries = list("filter.release_country").map((c) => COUNTRY_ALIASES[norm(c)] || c.toUpperCase());
  const dobMin = params["filter.date_of_birth.min"];
  const dobMax = params["filter.date_of_birth.max"];
  const locQuery = params["filter.location.query"] ? norm(params["filter.location.query"]) : "";
  const older = (params["signal.demographics.age"] || "").includes("55_and_older");
  const explain = params["feature.explainability"] === "true";

  const seedEnts = seeds.map((id) => lookupEntity(id)).filter(Boolean) as FixtureEntity[];
  const seedTagSet = new Set<string>([...signalTags, ...seedEnts.flatMap(tagIdsFor)]);

  let pool = ENTITIES.filter((x) => x.type === type && !exclude.has(x.id));
  pool = pool.filter((x) => !x.year || (x.year >= yMin && x.year <= yMax));
  if (countries.length) pool = pool.filter((x) => !x.country || countries.includes(x.country));
  if (dobMin) pool = pool.filter((x) => !x.dob || x.dob >= dobMin);
  if (dobMax) pool = pool.filter((x) => !x.dob || x.dob <= dobMax);
  if (locQuery) {
    const cc = COUNTRY_ALIASES[locQuery];
    const local = pool.filter((x) => (x.city && norm(x.city) === locQuery) || (!!cc && x.country === cc));
    const anywhere = pool.filter((x) => !x.city);
    pool = local.length ? [...local, ...anywhere] : anywhere;
  }

  const scored = pool.map((x) => {
    const ids = tagIdsFor(x);
    const overlap = ids.filter((id) => seedTagSet.has(id)).length;
    const frac = ids.length ? overlap / ids.length : 0;
    let aff = seedTagSet.size ? 0.2 + 0.62 * frac + 0.13 * x.pop : 0.3 + 0.6 * x.pop;
    if (older && (x.year ?? 1960) < 1975) aff += 0.04;
    // Toy geography: destinations in the same country as a seeded hometown rank higher.
    const homeCountry = seedEnts.find((s) => s.type === "urn:entity:locality")?.country;
    if (type === "urn:entity:destination" && homeCountry && x.country !== homeCountry) aff -= 0.4;
    aff = Math.min(0.99, Math.round(aff * 1000) / 1000);
    const query: Record<string, unknown> = { affinity: aff };
    if (explain && seedEnts.length) {
      const contrib = seedEnts
        .map((s) => {
          const st = new Set(tagIdsFor(s));
          const c = ids.filter((id) => st.has(id)).length;
          return { entity_id: s.id, name: s.name, score: ids.length ? c / ids.length : 0 };
        })
        .filter((c) => c.score > 0);
      const total = contrib.reduce((a, c) => a + c.score, 0) || 1;
      query.explainability = {
        "signal.interests.entities": contrib.map((c) => ({ ...c, score: Math.round((c.score / total) * 100) / 100 })),
      };
    }
    return { x, aff, query };
  });

  scored.sort((a, b) => b.aff - a.aff);
  return {
    success: true,
    results: { entities: scored.slice(0, take).map((s) => rawEntity(s.x, s.query)) },
    query: { mock: true },
  };
}

function compare(params: Record<string, string>) {
  const a = (params["a.signal.interests.entities"] || "").split(",").filter(Boolean);
  const b = (params["b.signal.interests.entities"] || "").split(",").filter(Boolean);
  const take = parseInt(params.take || "10", 10);
  const count = (ids: string[]) => {
    const m = new Map<string, number>();
    for (const id of ids) for (const tg of lookupEntity(id)?.tags || []) m.set(tg, (m.get(tg) || 0) + 1);
    return m;
  };
  const ca = count(a),
    cb = count(b);
  const shared = [...ca.keys()].filter((k) => cb.has(k));
  const tagsOut = shared
    .map((s) => {
      const affA = Math.min(1, ca.get(s)! / Math.max(1, a.length)),
        affB = Math.min(1, cb.get(s)! / Math.max(1, b.length));
      return {
        tag_id: `urn:tag:mock:${s}`,
        name: TAG_BY_SLUG.get(s)?.name || s,
        subtype: "urn:tag:genre",
        query: { a: { affinity: affA }, b: { affinity: affB }, affinity: Math.round(Math.sqrt(affA * affB) * 100) / 100 },
      };
    })
    .sort((x, y) => y.query.affinity - x.query.affinity)
    .slice(0, take);
  return { success: true, results: { tags: tagsOut } };
}

export class MockTransport {
  readonly mock = true;
  async get(path: string, params: Record<string, string>): Promise<any> {
    await new Promise((r) => setTimeout(r, 15)); // tiny latency so the trace timings look real
    if (path === "/search") return search(params);
    if (path === "/v2/tags") return tags(params);
    if (path === "/v2/insights") {
      if (!params["filter.type"]) throw new Error("Qloo 400 on /v2/insights: filter.type is required");
      return insights(params);
    }
    if (path === "/v2/analysis/compare") return compare(params);
    throw new Error(`Mock: unsupported path ${path}`);
  }
}
