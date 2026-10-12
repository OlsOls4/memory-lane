import type { ResidentProfile } from "./types";

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [])
    .map((x) => str(x, 80))
    .filter(Boolean)
    .slice(0, 6);
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  allowed.includes(v as T) ? (v as T) : d;

/** Validate untrusted input into a ResidentProfile. Throws a readable message on bad input. */
export function parseResident(raw: any): ResidentProfile {
  const firstName = str(raw?.firstName, 40);
  if (!firstName) throw new Error("First name is required.");
  const birthYear = parseInt(String(raw?.birthYear), 10);
  const now = new Date().getFullYear();
  if (!Number.isFinite(birthYear) || birthYear < 1900 || birthYear > now - 40)
    throw new Error("Birth year should be between 1900 and " + (now - 40) + ".");
  const f = raw?.favourites || {};
  const c = raw?.constraints || {};
  return {
    firstName,
    birthYear,
    hometown: str(raw?.hometown, 60),
    country: str(raw?.country, 60) || "United Kingdom",
    favourites: {
      artists: list(f.artists),
      films: list(f.films),
      tvShows: list(f.tvShows),
      books: list(f.books),
      foods: list(f.foods),
      hobbies: list(f.hobbies),
    },
    constraints: {
      hearing: pick(c.hearing, ["none", "mild", "significant"] as const, "none"),
      vision: pick(c.vision, ["none", "mild", "significant"] as const, "none"),
      dementiaStage: pick(c.dementiaStage, ["none", "early", "moderate", "advanced"] as const, "none"),
      softFoods: !!c.softFoods,
      diabetic: !!c.diabetic,
      otherDietary: str(c.otherDietary, 120) || undefined,
      notes: str(c.notes, 200) || undefined,
    },
  };
}
