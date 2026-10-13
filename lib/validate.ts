import type { ResidentProfile } from "./types";

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [])
    .map((x) => str(x, 80))
    .filter(Boolean)
    .slice(0, 6);
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  allowed.includes(v as T) ? (v as T) : d;

/** The name to use in wording when no first name was given (Quick start makes the name optional). */
export function displayName(p: { firstName: string }, capital = false): string {
  if (p.firstName) return p.firstName;
  return capital ? "This resident" : "this resident";
}

/**
 * Birth year from whichever the carer knows: an exact year, a decade ("1940s", 1940) or a current age.
 * Decades map to the middle of the decade (1940s -> 1945). Returns { year, approx }.
 */
export function parseBirth(raw: any): { year: number; approx: boolean } {
  const now = new Date().getFullYear();
  const max = now - 40;
  const exact = parseInt(String(raw?.birthYear ?? ""), 10);
  if (Number.isFinite(exact) && exact > 0) {
    if (exact < 1900 || exact > max) throw new Error("Birth year should be between 1900 and " + max + ".");
    return { year: exact, approx: false };
  }
  const decRaw = String(raw?.birthDecade ?? "").trim();
  const dec = parseInt(decRaw.replace(/[^0-9]/g, ""), 10);
  if (Number.isFinite(dec) && dec > 0) {
    const d = dec < 100 ? 1900 + dec : dec; // "40s" -> 1940
    const start = Math.floor(d / 10) * 10;
    const year = Math.min(start + 5, max);
    if (start < 1900 || start > max) throw new Error("Decade of birth should be between the 1900s and the " + Math.floor(max / 10) * 10 + "s.");
    return { year, approx: true };
  }
  const age = parseInt(String(raw?.age ?? ""), 10);
  if (Number.isFinite(age) && age > 0) {
    if (age < 40 || age > 120) throw new Error("Age should be between 40 and 120.");
    return { year: now - age, approx: true };
  }
  throw new Error("Add a birth year, a decade (e.g. 1940s) or their age.");
}

/** Validate untrusted input into a ResidentProfile. Throws a readable message on bad input. */
export function parseResident(raw: any): ResidentProfile {
  const firstName = str(raw?.firstName, 40); // optional
  const { year: birthYear, approx } = parseBirth(raw);
  const f = raw?.favourites || {};
  const c = raw?.constraints || {};
  // Quick start may send a single free-text favourite at the top level as `loved`.
  const loved = list([...(Array.isArray(f.loved) ? f.loved : list(f.loved)), ...list(raw?.loved)]);
  const profile: ResidentProfile = {
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
      loved,
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
  if (approx) profile.birthYearApprox = true;
  const story = str(raw?.story, 1200);
  if (story) profile.story = story;
  return profile;
}

/**
 * Quick start "Born" box: accepts "1946", "1940s", "40s", "age 82" or just "82".
 * Returns the request fields for parseBirth, or null if it can't be read.
 */
export function parseBornText(text: string): { birthYear?: number; birthDecade?: string; age?: number } | null {
  const t = text.trim().toLowerCase().replace(/^born\s+/, "").replace(/^(around|about|c\.?|circa)\s*/, "");
  if (!t) return null;
  let m = t.match(/^(\d{4})$/);
  if (m) return { birthYear: parseInt(m[1], 10) };
  m = t.match(/^(?:the\s+)?(\d{4})['’]?s$/) || t.match(/^['’]?(\d0)['’]?s$/);
  if (m) return { birthDecade: m[1].length === 2 ? `19${m[1]}s` : `${m[1]}s` };
  m = t.match(/^(?:age[d]?\s*)?(\d{2,3})(?:\s*(?:years?(?: old)?|yo))?$/);
  if (m) return { age: parseInt(m[1], 10) };
  return null;
}

const COUNTRY_WORDS: Record<string, string> = {
  uk: "United Kingdom", "united kingdom": "United Kingdom", england: "United Kingdom", scotland: "United Kingdom",
  wales: "United Kingdom", "northern ireland": "United Kingdom", britain: "United Kingdom", "great britain": "United Kingdom",
  us: "United States", usa: "United States", "united states": "United States", america: "United States",
  ireland: "Ireland", canada: "Canada", australia: "Australia", "new zealand": "New Zealand", india: "India",
  jamaica: "Jamaica", "south africa": "South Africa",
};

/** "Chicago, USA" -> { hometown: "Chicago", country: "United States" }; otherwise keeps the default country. */
export function splitPlace(text: string, defaultCountry: string): { hometown: string; country: string } {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const c = COUNTRY_WORDS[parts[parts.length - 1].toLowerCase().replace(/\./g, "")];
    if (c) return { hometown: parts.slice(0, -1).join(", "), country: c };
  }
  if (parts.length === 1 && COUNTRY_WORDS[parts[0].toLowerCase()]) return { hometown: "", country: COUNTRY_WORDS[parts[0].toLowerCase()] };
  return { hometown: text.trim(), country: defaultCountry };
}
