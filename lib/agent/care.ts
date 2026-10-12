// Era maths, country handling and care adaptations (deterministic, no external calls).

import type { EraInfo, ResidentConstraints, ResidentProfile } from "../types";

/** The "reminiscence bump": memories from roughly age 10–25 are the most vivid and best recalled. */
export function eraFor(birthYear: number): EraInfo {
  const formativeStart = birthYear + 10;
  const formativeEnd = birthYear + 25;
  // Performers someone loved at 10–25 were typically 16–40 at the time.
  return {
    formativeStart,
    formativeEnd,
    ageBucket: "55_and_older", // Qloo's oldest documented age bucket
    performerDobMin: `${formativeStart - 40}-01-01`,
    performerDobMax: `${formativeEnd - 16}-12-31`,
  };
}

export function countryForRelease(country: string): string {
  const c = country.trim().toLowerCase();
  if (["uk", "united kingdom", "england", "scotland", "wales", "northern ireland", "great britain", "gb"].includes(c))
    return "United Kingdom";
  if (["us", "usa", "united states", "united states of america", "america"].includes(c)) return "United States";
  return country.trim();
}

export function isUK(country: string) {
  return countryForRelease(country) === "United Kingdom";
}

export function adaptationsFor(c: ResidentConstraints, name: string): string[] {
  const out: string[] = [];
  if (c.hearing === "mild") out.push(`Hearing: sit facing ${name}, reduce background noise, turn subtitles on for any clip.`);
  if (c.hearing === "significant")
    out.push(
      `Hearing: use a hearing loop or headphones for music, always subtitles, lean on photos, record sleeves and objects ${name} can hold.`,
    );
  if (c.vision === "mild") out.push("Vision: large-print song sheets (24pt+), good lighting, high-contrast photos.");
  if (c.vision === "significant")
    out.push("Vision: make sessions audio-led. Describe pictures aloud and offer tactile objects (a record, a tea towel, a programme).");
  switch (c.dementiaStage) {
    case "early":
      out.push("Early-stage dementia: open questions and gentle quizzes work well. Invite stories and let them lead.");
      break;
    case "moderate":
      out.push(
        "Moderate dementia: favour recognition over recall. Play the song first, show the picture, ask yes/no or either/or questions. Keep sessions to 20–30 minutes.",
      );
      break;
    case "advanced":
      out.push(
        "Advanced dementia: sensory-first. Short familiar song snippets, smells and textures, hand-holding and humming along. 10–15 minutes, watch for signs of fatigue or distress.",
      );
      break;
  }
  if (c.softFoods)
    out.push("Soft / texture-modified diet: check the IDDSI level in the care plan with the kitchen before any tasting. Use the dish as a smell and conversation prompt if needed.");
  if (c.diabetic) out.push("Diabetic: use sugar-free or reduced-sugar versions for any sweet treat and agree portions with the care plan.");
  if (c.otherDietary) out.push(`Dietary note: ${c.otherDietary}.`);
  out.push("Always: stop if a memory brings distress, and record what sparked joy in the care notes for next time.");
  return out;
}

export const SAMPLE_RESIDENTS: ResidentProfile[] = [
  {
    firstName: "Margaret",
    birthYear: 1946,
    hometown: "Liverpool",
    country: "United Kingdom",
    favourites: {
      artists: ["Cilla Black", "The Beatles"],
      films: ["The Sound of Music"],
      tvShows: ["Coronation Street"],
      books: [],
      foods: ["fish and chips", "scouse"],
      hobbies: ["dancing", "football"],
    },
    constraints: { hearing: "mild", vision: "none", dementiaStage: "moderate", softFoods: true, diabetic: false },
  },
  {
    firstName: "Walter",
    birthYear: 1938,
    hometown: "Chicago",
    country: "United States",
    favourites: {
      artists: ["Frank Sinatra", "Nat King Cole"],
      films: ["Casablanca"],
      tvShows: ["I Love Lucy"],
      books: ["To Kill a Mockingbird"],
      foods: ["deep dish pizza", "diner"],
      hobbies: ["baseball", "jazz"],
    },
    constraints: { hearing: "none", vision: "significant", dementiaStage: "early", softFoods: false, diabetic: true },
  },
  {
    firstName: "Dorothy",
    birthYear: 1944,
    hometown: "Glasgow",
    country: "United Kingdom",
    favourites: {
      artists: ["Lulu", "Dusty Springfield"],
      films: ["The Sound of Music"],
      tvShows: ["The White Heather Club"],
      books: [],
      foods: ["afternoon tea", "shortbread"],
      hobbies: ["knitting", "dancing", "singing"],
    },
    constraints: { hearing: "significant", vision: "mild", dementiaStage: "advanced", softFoods: true, diabetic: true },
  },
];

/** One-tap Quick start examples: the minimum a carer might know (born, where, one thing they loved). */
export interface QuickInput {
  firstName: string;
  born: string; // "1946", "1940s" or "age 82"
  place: string; // town, optionally ", Country"
  loved: string;
}

export const QUICK_SAMPLES: QuickInput[] = [
  { firstName: "Margaret", born: "1940s", place: "Liverpool", loved: "Cilla Black" },
  { firstName: "Walter", born: "1938", place: "Chicago, USA", loved: "Frank Sinatra" },
  { firstName: "Dorothy", born: "age 82", place: "Glasgow", loved: "afternoon tea" },
];
