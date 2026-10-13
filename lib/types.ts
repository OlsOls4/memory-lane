// Shared types for Memory Lane.

export type DementiaStage = "none" | "early" | "moderate" | "advanced";

export interface ResidentConstraints {
  hearing: "none" | "mild" | "significant";
  vision: "none" | "mild" | "significant";
  dementiaStage: DementiaStage;
  softFoods: boolean;
  diabetic: boolean;
  otherDietary?: string;
  notes?: string;
}

export interface ResidentFavourites {
  artists: string[];
  films: string[];
  tvShows: string[];
  books: string[];
  foods: string[]; // dishes, cafés, places to eat
  hobbies: string[];
  /** Quick start: free-text "things they loved" in any domain. The agent infers the domain via Qloo /search + /v2/tags. */
  loved?: string[];
}

export interface ResidentProfile {
  firstName: string; // optional in Quick start: "" means not given
  /** Set when birthYear was estimated from a decade or an age rather than typed exactly. */
  birthYearApprox?: boolean;
  birthYear: number;
  hometown: string; // town / city
  country: string; // e.g. "United Kingdom", "United States"
  favourites: ResidentFavourites;
  constraints: ResidentConstraints;
  /** Optional free-text notes from staff. Read only by the LLM planner (never sent to Qloo). */
  story?: string;
}

/** Normalised Qloo entity as used inside the app (mapped from the raw API shape). */
export interface QEntity {
  id: string;
  name: string;
  type: string; // urn:entity:*
  year?: number;
  popularity?: number;
  affinity?: number;
  tags: { id: string; name: string }[];
  description?: string;
  imageUrl?: string;
  location?: string;
  /** From feature.explainability: which input signals pushed this result up. */
  explain?: { entityId: string; name?: string; score: number }[];
}

export interface QTag {
  id: string;
  name: string;
  type?: string;
}

export type ToolName =
  | "agent.plan"
  | "qloo.search"
  | "qloo.tags"
  | "qloo.insights"
  | "qloo.compare"
  | "llm.plan"
  | "llm.review"
  | "llm.compose"
  | "template.compose";

export interface TraceStep {
  n: number;
  tool: ToolName;
  purpose: string;
  request?: { method: "GET" | "POST"; path: string; params: Record<string, string> };
  droppedParams?: string[]; // params removed because the filter.type doesn't support them
  summary: string[];
  ms: number;
  mock: boolean;
  error?: string;
}

export type Domain = "music" | "film" | "tv" | "books" | "audio" | "food" | "travel";

export interface PlanItem {
  entityId: string;
  name: string;
  domain: Domain;
  year?: number;
  isFavourite?: boolean;
  affinity?: number;
  eraVerified?: boolean;
  why: string; // human-readable reason, grounded in Qloo signals
  signals: string[]; // compact signal chips e.g. "seed: Cilla Black", "release 1951–1966"
  location?: string;
  appealsTo?: string[]; // group mode
}

export interface DayPlan {
  day: string;
  theme: string;
  domain: Domain;
  title: string;
  intro: string;
  durationMins: number;
  steps: string[];
  items: PlanItem[];
  prompts: string[];
  adaptations: string[];
}

export interface EraInfo {
  formativeStart: number;
  formativeEnd: number;
  ageBucket: string;
  performerDobMin: string;
  performerDobMax: string;
}

export interface WeekPlan {
  resident: ResidentProfile;
  era: EraInfo;
  days: DayPlan[];
  generalAdaptations: string[];
  composer: "gemini" | "template";
  qlooMode: "live" | "mock";
  trace: TraceStep[];
  warnings: string[];
  /** How the agent read each free-text "loved" item, e.g. 'Elvis → singer/band (Qloo artist)'. */
  understood?: string[];
  generatedAt: string;
}

export interface GroupSession {
  residents: { firstName: string; birthYear: number; hometown: string }[];
  sharedWindow: { start: number; end: number; overlap: boolean };
  sharedThemes: { tag: string; score: number; between: string }[];
  picks: PlanItem[];
  outline: { minutes: number; segment: string; detail: string }[];
  prompts: string[];
  adaptations: string[];
  composer: "gemini" | "template";
  qlooMode: "live" | "mock";
  trace: TraceStep[];
  warnings: string[];
  generatedAt: string;
}
