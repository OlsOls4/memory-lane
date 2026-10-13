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
  /** Things to steer clear of ("war films", "his late wife"). Read by the planner and a keyword guard; never sent to Qloo. */
  avoid?: string;
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
  | "llm.read"
  | "llm.plan"
  | "llm.tool"
  | "llm.review"
  | "llm.compose"
  | "llm.prompts"
  | "llm.feedback"
  | "web.history"
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
  /** Nemotron model that ran this step (LLM steps only). */
  model?: string;
  /** Reasoning tokens Nemotron spent before answering (planner/feedback steps). */
  reasoningTokens?: number;
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
  /** Nemotron planner: why this item should land with this resident. */
  landing?: string;
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
  /** Nemotron Nano: "if they light up, ask…" follow-ups. */
  followUps?: string[];
  adaptations: string[];
  /** Local history hooks for this day (Tavily web search, optional). */
  localHistory?: LocalHook[];
}

export interface LocalHook {
  title: string;
  detail: string;
  url?: string;
  year?: number;
}

export type Reaction = "loved" | "some" | "no";

/** Staff's "how did it go" for one day of last week's plan. */
export interface DayFeedback {
  day: string;
  domain: Domain;
  items: string[];
  reaction: Reaction;
  note?: string;
}

export interface Adaptation {
  summary: string;
  changes: string[];
  keep: string[];
  drop: string[];
  model?: string;
}

/** One Nemotron call as shown in the "AI layer" strip. */
export interface ModelUse {
  role: "planner" | "writer" | "feedback" | "reader" | "prompts" | "script" | "review";
  label: string;
  model: string;
  ms: number;
  reasoningTokens?: number;
  toolCalls?: number;
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
  composer: "nemotron" | "template";
  /** Who chose and ordered the items: the Nemotron Ultra agent, or deterministic code. */
  planner: "nemotron" | "deterministic";
  /** Planner's one-line strategy for the week. */
  strategy?: string;
  /** Candidates left out for this resident's sensitivities, with the reason. */
  flagged: { name: string; reason: string; by: "nemotron" | "guard" }[];
  /** What changed from last week's feedback, if this plan was adapted. */
  adapted?: Adaptation;
  models: ModelUse[];
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
  composer: "nemotron" | "template";
  models: ModelUse[];
  qlooMode: "live" | "mock";
  trace: TraceStep[];
  warnings: string[];
  generatedAt: string;
}
