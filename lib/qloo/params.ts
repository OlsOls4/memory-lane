// Which /v2/insights parameters each filter.type supports.
// Source: https://docs.qloo.com/reference/available-parameters-by-entity-type (checked Oct 2026).
// Qloo silently ignores unsupported params, so we strip them ourselves and surface what was
// dropped in the agent trace. That keeps every request honest about what actually shaped it.

export type EntityType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:destination"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:video_game";

const COMMON = [
  "filter.type",
  "bias.trends",
  "filter.exclude.entities",
  "filter.exclude.tags",
  "operator.exclude.tags",
  "filter.external.exists",
  "operator.filter.external.exists",
  "filter.parents.types",
  "filter.popularity.min",
  "filter.popularity.max",
  "filter.results.entities",
  "filter.results.entities.query",
  "filter.tags",
  "operator.filter.tags",
  "offset",
  "take",
  "page",
  "signal.demographics.age",
  "signal.demographics.audiences",
  "signal.demographics.audiences.weight",
  "signal.demographics.gender",
  "signal.interests.entities",
  "signal.interests.tags",
  // Documented on the Insights deep dive as global request options:
  "feature.explainability",
  "signal.interests.entities.weight",
  "signal.interests.tags.weight",
  "signal.demographics.age.weight",
];

const GEO = [
  "filter.geocode.name",
  "filter.geocode.admin1_region",
  "filter.geocode.admin2_region",
  "filter.geocode.country_code",
  "filter.location",
  "filter.location.query",
  "filter.location.radius",
  "filter.location.geohash",
  "filter.exclude.location.geohash",
];

export const SUPPORTED: Record<EntityType, Set<string>> = {
  "urn:entity:artist": new Set(COMMON),
  "urn:entity:book": new Set([...COMMON, "filter.publication_year.min", "filter.publication_year.max"]),
  "urn:entity:brand": new Set(COMMON),
  "urn:entity:destination": new Set([...COMMON, ...GEO]),
  "urn:entity:movie": new Set([
    ...COMMON,
    "filter.content_rating",
    "filter.release_year.min",
    "filter.release_year.max",
    "filter.release_country",
    "operator.filter.release_country",
    "filter.rating.min",
    "filter.rating.max",
  ]),
  "urn:entity:person": new Set([
    ...COMMON,
    "filter.date_of_birth.min",
    "filter.date_of_birth.max",
    "filter.date_of_death.min",
    "filter.date_of_death.max",
    "filter.gender",
  ]),
  "urn:entity:place": new Set([
    ...COMMON,
    ...GEO,
    "bias.quality",
    "filter.address",
    "filter.hours",
    "filter.price_level.min",
    "filter.price_level.max",
    "sort_by",
  ]),
  "urn:entity:podcast": new Set(COMMON),
  "urn:entity:tv_show": new Set([
    ...COMMON,
    "filter.content_rating",
    "filter.finale_year.min",
    "filter.finale_year.max",
    "filter.latest_known_year.min",
    "filter.latest_known_year.max",
    "filter.release_year.min",
    "filter.release_year.max",
    "filter.release_country",
    "operator.filter.release_country",
    "filter.rating.min",
    "filter.rating.max",
  ]),
  "urn:entity:video_game": new Set(COMMON),
};

/** Valid values for signal.demographics.age (from the Insights deep dive). */
export const AGE_BUCKETS = [
  "24_and_younger",
  "25_to_29",
  "30_to_34",
  "35_to_44",
  "45_to_54",
  "55_and_older",
] as const;

export function sanitizeInsightsParams(params: Record<string, string | number | boolean | undefined>): {
  clean: Record<string, string>;
  dropped: string[];
} {
  const type = String(params["filter.type"]) as EntityType;
  const allowed = SUPPORTED[type];
  const clean: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    if (!allowed || allowed.has(k)) clean[k] = String(v);
    else dropped.push(k);
  }
  return { clean, dropped };
}
