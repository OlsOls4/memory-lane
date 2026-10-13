// The Nemotron 3 Ultra planning agent.
//
// It reasons over the resident's profile (never their name) and the Qloo candidates the orchestrator
// gathered, and decides which items go on the week, in what order, and why each one should land.
// It flags candidates that clash with the resident's sensitivities, and it can call back into the
// Qloo client through tools when a theme runs thin or it wants to check a specific title:
//
//   qloo_search(query, kind)   → GET /search, era-checked; a hit becomes a new candidate
//   qloo_more(theme, reason)   → one more era-filtered GET /v2/insights for that theme, excluding seen ids
//   submit_week(...)           → the final answer: theme order, picks with "why this will land", flags
//
// Grounding: candidates are shown to the model as short aliases (m1, f2, …). Only aliases that exist
// in the table (from Qloo results or Qloo tool results) are accepted, so it cannot invent an item.

import type { Domain, ModelUse, QEntity, ResidentProfile } from "../types";
import type { QlooService } from "../qloo/client";
import { chat, nemotronEnabled, parseJSONLoose, shortModel, type ChatMessage, type ToolSpec } from "../nemotron/client";
import { moreCandidates, T, type ResidentContext } from "./orchestrator";

export type ThemeKey = "music" | "film" | "food" | "tv" | "travel" | "stories";
export const DEFAULT_ORDER: ThemeKey[] = ["music", "film", "food", "tv", "travel", "stories"];

const PREFIX: Record<Domain, string> = { music: "m", film: "f", tv: "t", books: "b", audio: "a", food: "e", travel: "p" };
const THEME_OF: Record<Domain, ThemeKey> = { music: "music", film: "film", tv: "tv", books: "stories", audio: "stories", food: "food", travel: "travel" };
const MAX: Record<Domain, number> = { music: 4, film: 3, tv: 3, books: 2, audio: 2, food: 3, travel: 3 };
const KIND_TYPE: Record<string, { type: string; domain: Domain }> = {
  artist: { type: T.artist, domain: "music" },
  film: { type: T.movie, domain: "film" },
  tv: { type: T.tv, domain: "tv" },
  book: { type: T.book, domain: "books" },
};

interface Cand {
  alias: string;
  domain: Domain;
  entity: QEntity;
  fav: boolean;
  source: "qloo" | "tool";
}

export interface PlannerOutcome {
  ok: boolean;
  strategy?: string;
  order: ThemeKey[];
  /** entityId → why this will land */
  landing: Map<string, string>;
  flagged: { name: string; reason: string }[];
  toolCalls: number;
  model?: string;
  error?: string;
}

const clip = (s: string | undefined, n: number) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);

function residentBrief(p: ResidentProfile, ctx: ResidentContext, extra: { feedback?: string; lastWeek?: string[] }) {
  const c = p.constraints;
  const lines = [
    `Born ${p.birthYearApprox ? "about " : ""}${p.birthYear}; memory years (ages 10-25) ${ctx.era.formativeStart}-${ctx.era.formativeEnd}.`,
    `Grew up in ${p.hometown ? `${p.hometown}, ` : ""}${p.country}.`,
    `Dementia stage: ${c.dementiaStage}. Hearing: ${c.hearing}. Vision: ${c.vision}.${c.softFoods ? " Soft/IDDSI diet." : ""}${c.diabetic ? " Diabetic." : ""}`,
  ];
  if (ctx.understood.length) lines.push(`What staff typed was read as: ${ctx.understood.join("; ")}.`);
  const favs = [...ctx.seeds.artists, ...ctx.seeds.films, ...ctx.seeds.tv, ...ctx.seeds.books].map((e) => e.name);
  if (favs.length) lines.push(`Known favourites: ${favs.join(", ")}.`);
  const interests = [...ctx.hobbyTags, ...ctx.foodTags].map((t) => t.name);
  if (interests.length) lines.push(`Interests / tastes of home: ${interests.join(", ")}.`);
  if (c.avoid) lines.push(`STAFF SAY STEER CLEAR OF: ${clip(c.avoid, 200)}.`);
  if (p.story) lines.push(`Staff notes (do not repeat personal details): ${clip(p.story, 600)}`);
  if (extra.feedback) lines.push(`LAST WEEK'S FEEDBACK: ${clip(extra.feedback, 600)}`);
  if (extra.lastWeek?.length) lines.push(`Used last week (prefer fresh picks unless they were loved): ${extra.lastWeek.slice(0, 20).join(", ")}.`);
  return lines.join("\n");
}

function candLine(c: Cand, ctx: ResidentContext): string {
  const e = c.entity;
  const dated = c.domain !== "music" && e.year ? ` (${e.year})` : "";
  const tags = e.tags.slice(0, 4).map((t) => t.name).join(", ");
  const why = (e.explain || []).map((x) => x.name).filter(Boolean).slice(0, 2).join(", ");
  const era = (e as any).eraVerified ? " era-verified" : "";
  const parts = [`${c.alias}: ${e.name}${dated}`];
  if (c.fav) parts.push("THEIR FAVOURITE");
  if (e.affinity !== undefined) parts.push(`affinity ${e.affinity.toFixed(2)}${era}`);
  else if (era) parts.push(era.trim());
  if (tags) parts.push(`tags: ${tags}`);
  if (why) parts.push(`Qloo links to: ${why}`);
  if (e.location && c.domain === "food") parts.push(clip(e.location, 50));
  if (e.description && (c.domain === "film" || c.domain === "tv" || c.domain === "books")) parts.push(`about: ${clip(e.description, 110)}`);
  return parts.join(" | ");
}

const TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "qloo_search",
      description:
        "Look up one specific artist, film, TV show or book in Qloo's taste graph. Use it only for a title you are confident this resident would know from their memory years. If found (and from the right era) it is added as a new candidate with an id you can pick.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Exact title or artist name" }, kind: { type: "string", enum: ["artist", "film", "tv", "book"], description: "Radio programmes are not in Qloo; do not search for them" } },
        required: ["query", "kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "qloo_more",
      description:
        "Ask Qloo for up to 8 more era-filtered candidates for one theme, excluding everything already listed. Use when a theme has fewer than 2 suitable candidates after leaving out sensitive ones.",
      parameters: {
        type: "object",
        properties: {
          theme: { type: "string", enum: ["music", "film", "tv", "books", "food", "travel"] },
          reason: { type: "string", description: "Why you need more (shown to staff)" },
        },
        required: ["theme", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_week",
      description: "Submit the final week. Call exactly once, when you are done.",
      parameters: {
        type: "object",
        properties: {
          strategy: { type: "string", description: "One sentence for staff: the idea behind this week (max 30 words)" },
          order: {
            type: "array",
            items: { type: "string", enum: DEFAULT_ORDER },
            description: "Monday to Saturday theme order, each of the six themes once (Sunday is always a recap). Put what is most likely to engage first.",
          },
          picks: {
            type: "array",
            description: "Chosen candidates, best first within each theme: music 3-4, film 2-3, tv 2-3, food 2-3, travel 2-3, books+audio 2-3.",
            items: {
              type: "object",
              properties: { id: { type: "string" }, why: { type: "string", description: "Why this will land with them, max 22 words, concrete" } },
              required: ["id", "why"],
            },
          },
          flagged: {
            type: "array",
            description: "Candidates you deliberately left out because they could distress or are unsuitable, with a short reason.",
            items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] },
          },
        },
        required: ["strategy", "order", "picks", "flagged"],
      },
    },
  },
];

const SYSTEM = `You are the planning agent inside Memory Lane, which builds a week of reminiscence activities for one care-home resident.
You choose items ONLY from the candidate list (ids like m1, f2) or from ids returned by your tools. Never invent songs, films, shows, books or places.
Your job:
1. Pick the items most likely to spark recognition and joy for THIS person, given their memory years, where they grew up, their favourites and dementia stage (recognition over recall for moderate/advanced: lean on the best-known, most familiar picks; their own favourites first).
2. Leave out anything that could distress them. What staff ask to steer clear of applies to EVERY theme, not just the medium they named: "avoid war films" also rules out war novels, war-time dramas and war songs (check each candidate's "about" and tags; when unsure, leave it out). Also leave out graphic war or violence, horror, asylums, abuse, grief themes, and anything clearly from the wrong era. List in "flagged" ONLY candidates you left out because they could upset this person or are clearly unsuitable (not ones you simply did not choose), with a short reason. Never flag their own favourites unless staff explicitly asked to avoid that subject.
3. Order the six Monday-Saturday themes so the strongest engagement comes first (e.g. music first for advanced dementia).
4. For each pick write "why" for staff: a concrete reason it should land (the year and their age then, a link to a favourite, where they grew up). Max 22 words. No medical advice.
Tools: if the candidates are good enough, call submit_week straight away. Otherwise make ALL the tool calls you need together in ONE turn (parallel calls, at most 3), then submit. Never spend more than one turn on tools. Think briefly.`;

export async function runPlanner(
  svc: QlooService,
  ctx: ResidentContext,
  opts: { feedback?: string; lastWeek?: string[]; budgetMs?: number; models: ModelUse[] },
): Promise<PlannerOutcome> {
  const empty: PlannerOutcome = { ok: false, order: DEFAULT_ORDER, landing: new Map(), flagged: [], toolCalls: 0 };
  if (!nemotronEnabled()) return { ...empty, error: "no NEBIUS_API_KEY" };

  // ---- candidate table ---------------------------------------------------------------
  const cands = new Map<string, Cand>();
  const byEntity = new Map<string, string>();
  const counter: Record<string, number> = {};
  const add = (domain: Domain, e: QEntity, fav: boolean, source: Cand["source"]) => {
    if (byEntity.has(e.id)) return byEntity.get(e.id)!;
    const pre = PREFIX[domain];
    counter[pre] = (counter[pre] || 0) + 1;
    const alias = `${pre}${counter[pre]}`;
    cands.set(alias, { alias, domain, entity: e, fav, source });
    byEntity.set(e.id, alias);
    return alias;
  };
  const favSeeds: [Domain, QEntity[]][] = [["music", ctx.seeds.artists], ["film", ctx.seeds.films], ["tv", ctx.seeds.tv], ["books", ctx.seeds.books]];
  for (const [d, xs] of favSeeds) for (const e of xs.slice(0, 5)) add(d, e, true, "qloo");
  // Only mark real favourites: the guards already removed seeds that Qloo matched to a title from the wrong era.
  for (const d of Object.keys(PREFIX) as Domain[]) for (const e of ctx.results[d].slice(0, 10)) add(d, e, false, "qloo");
  if (cands.size < 4) return { ...empty, error: "too few Qloo candidates to plan with" };

  const table = () => {
    const out: string[] = [];
    for (const d of Object.keys(PREFIX) as Domain[]) {
      const xs = [...cands.values()].filter((c) => c.domain === d);
      out.push(`## ${d} (${xs.length})`, ...(xs.length ? xs.map((c) => candLine(c, ctx)) : ["(none)"]));
    }
    return out.join("\n");
  };

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `RESIDENT (name withheld)\n${residentBrief(ctx.profile, ctx, opts)}\n\nCANDIDATES FROM QLOO'S TASTE GRAPH\n${table()}\n\nPlan the week now.`,
    },
  ];

  // ---- tools -------------------------------------------------------------------------
  let toolCalls = 0;
  const lo = ctx.era.formativeStart - 8;
  const hi = ctx.era.formativeEnd + 15;
  async function runTool(name: string, args: any): Promise<unknown> {
    toolCalls++;
    if (name === "qloo_search") {
      const k = KIND_TYPE[String(args?.kind)] || KIND_TYPE.artist;
      const q = clip(String(args?.query || ""), 80);
      if (!q) return { error: "empty query" };
      const hits = await svc.search(q, [k.type], `Nemotron planner tool call: qloo_search("${q}", ${args?.kind || "artist"})`, 3);
      const hit = hits[0];
      if (!hit) return { found: false };
      if (k.domain !== "music" && hit.year && (hit.year < lo - 20 || hit.year > hi)) return { found: true, rejected: `Qloo dates "${hit.name}" ${hit.year}, outside their era` };
      const alias = add(k.domain, hit, false, "tool");
      return { found: true, id: alias, name: hit.name, year: k.domain !== "music" ? hit.year : undefined };
    }
    if (name === "qloo_more") {
      const d = (["music", "film", "tv", "books", "food", "travel"] as Domain[]).includes(args?.theme) ? (args.theme as Domain) : "music";
      const seen = [...cands.values()].filter((c) => c.domain === d).map((c) => c.entity.id);
      const reason = clip(String(args?.reason || "more choice"), 80);
      const more = await moreCandidates(svc, ctx, d, seen, `Nemotron planner tool call: qloo_more(${d}): ${reason}`);
      const fresh = more.filter((e) => !(d === "film" || d === "tv") || !e.year || (e.year >= lo && e.year <= hi)).slice(0, 8);
      const added = fresh.map((e) => add(d, e, false, "tool"));
      return { added: added.map((a) => candLine(cands.get(a)!, ctx)) };
    }
    return { error: `unknown tool ${name}` };
  }

  // ---- loop --------------------------------------------------------------------------
  const deadline = Date.now() + (opts.budgetMs ?? Number(process.env.NEMOTRON_PLANNER_BUDGET_MS || 60000));
  let submitted: any = null;
  let model = "";
  let toolRounds = 0;
  for (let turn = 0; turn < 4 && !submitted; turn++) {
    const left = deadline - Date.now();
    if (left < 4000) break;
    // One round of tools at most (two if the first was a single quick call), then it must submit.
    const lastTurn = turn === 3 || left < 25000 || toolRounds >= 2 || toolCalls >= 3;
    if (lastTurn && turn > 0) messages.push({ role: "user", content: "Call submit_week now with your final plan, using the candidates and tool results above." });
    const step = svc.begin("llm.plan", turn === 0 ? "Nemotron planner reasons over the profile and Qloo's candidates" : `Nemotron planner, turn ${turn + 1}: reads the tool results`);
    const r = await chat("planner", {
      messages,
      tools: lastTurn ? TOOLS.filter((t) => t.function.name === "submit_week") : TOOLS,
      // The first turn reasons in full; a forced submit after tool results runs with reasoning off when time is short.
      think: turn === 0 || left > 35000,
      maxTokens: 9000,
      temperature: 0.4,
      timeoutMs: left,
    });
    if (!r) {
      step.error = "planner unavailable";
      step.summary = ["Nemotron did not answer in time; falling back"];
      svc.end(step);
      break;
    }
    model = r.model;
    step.model = r.model;
    step.reasoningTokens = r.reasoningTokens;
    opts.models.push({ role: "planner", label: turn === 0 ? "Plans the week" : `Planner turn ${turn + 1}`, model: r.model, ms: r.ms, reasoningTokens: r.reasoningTokens, toolCalls: r.toolCalls.length });
    const calls = r.toolCalls;
    messages.push({ role: "assistant", content: r.content || "", tool_calls: calls.length ? calls : undefined });
    if (!calls.length) {
      // Some turns answer in plain JSON instead of calling submit_week.
      const j = parseJSONLoose<any>(r.content);
      if (j && Array.isArray(j.picks)) submitted = j;
      step.summary = [submitted ? "Answered with a plan" : "No tool call; asking it to submit", `${shortModel(r.model)} · ${r.reasoningTokens ?? "?"} reasoning tokens`];
      step.ms = r.ms;
      svc.end(step);
      if (!submitted) messages.push({ role: "user", content: "Please call submit_week with your plan." });
      continue;
    }
    step.summary = [
      ...calls.map((c) => `→ ${c.function.name}(${clip(c.function.arguments, 70)})`),
      `${shortModel(r.model)} · ${r.reasoningTokens ?? "?"} reasoning tokens${r.fellBackFrom.length ? ` · fell back from ${r.fellBackFrom.join(", ")}` : ""}`,
    ].slice(0, 5);
    step.ms = r.ms;
    svc.end(step);
    if (calls.some((c) => c.function.name !== "submit_week")) toolRounds++;
    // Run this turn's tool calls in parallel (the Qloo client throttles to its rate limit itself).
    const results = await Promise.all(
      calls.map(async (c) => {
        if (c.function.name === "submit_week") return null;
        let args: any = {};
        try {
          args = JSON.parse(c.function.arguments || "{}");
        } catch {}
        return runTool(c.function.name, args).catch((e) => ({ error: String(e?.message || e) }));
      }),
    );
    for (const [i, c] of calls.entries()) {
      let args: any = {};
      try {
        args = JSON.parse(c.function.arguments || "{}");
      } catch {}
      if (c.function.name === "submit_week") {
        submitted = args;
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ ok: true }) });
        continue;
      }
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(results[i]).slice(0, 2500) });
    }
  }
  if (!submitted) return { ...empty, toolCalls, model, error: "planner did not submit a week" };

  // ---- validate and apply ------------------------------------------------------------
  const picks: { c: Cand; why: string }[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(submitted.picks) ? submitted.picks : []) {
    const c = cands.get(String(p?.id || "").trim());
    if (!c || seen.has(c.alias)) continue;
    seen.add(c.alias);
    picks.push({ c, why: clip(String(p?.why || ""), 180) });
  }
  if (picks.length < 4) return { ...empty, toolCalls, model, error: "plan had too few valid picks" };
  const flagged: { name: string; reason: string }[] = [];
  const flaggedIds = new Set<string>();
  for (const f of Array.isArray(submitted.flagged) ? submitted.flagged : []) {
    const c = cands.get(String(f?.id || "").trim());
    if (!c || seen.has(c.alias)) continue;
    if (c.fav && !ctx.profile.constraints.avoid) continue; // never drop a favourite unless staff asked
    flaggedIds.add(c.entity.id);
    flagged.push({ name: c.entity.name, reason: clip(String(f?.reason || "unsuitable"), 120) });
  }

  // Rewrite each domain's Qloo results as: planner picks (in its order), then the rest of Qloo's list
  // as backfill, minus anything flagged. Favourites stay as seeds (the composer shows them first).
  const landing = new Map<string, string>();
  for (const d of Object.keys(PREFIX) as Domain[]) {
    const chosen = picks.filter((p) => p.c.domain === d).slice(0, MAX[d]);
    chosen.forEach((p) => p.why && landing.set(p.c.entity.id, p.why));
    if (!chosen.length) {
      ctx.results[d] = ctx.results[d].filter((e) => !flaggedIds.has(e.id));
      continue;
    }
    const chosenIds = new Set(chosen.map((p) => p.c.entity.id));
    const nonFav = chosen.filter((p) => !p.c.fav).map((p) => p.c.entity);
    // Respect the planner's choice: no Qloo backfill for a theme it picked for (backfill only if it picked
    // nothing but favourites, so the day still has something beyond the anchor).
    const rest = nonFav.length ? [] : ctx.results[d].filter((e) => !chosenIds.has(e.id) && !flaggedIds.has(e.id)).slice(0, 2);
    ctx.results[d] = [...nonFav, ...rest];
    // A favourite the planner did not pick first should not be forced to the top: reorder seeds to match.
    const seedKey = d === "music" ? "artists" : d === "film" ? "films" : d === "tv" ? "tv" : d === "books" ? "books" : null;
    if (seedKey) {
      const seeds = (ctx.seeds as any)[seedKey] as QEntity[];
      const favPicked = chosen.filter((p) => p.c.fav).map((p) => p.c.entity.id);
      (ctx.seeds as any)[seedKey] = [...favPicked.map((id) => seeds.find((s) => s.id === id)!).filter(Boolean), ...seeds.filter((s) => !favPicked.includes(s.id))];
      ctx.pickedFavs = new Set([...(ctx.pickedFavs || []), ...favPicked]);
    }
  }
  // Drop flagged items from every domain (a flagged film can also appear as a book tie-in etc.).
  for (const d of Object.keys(PREFIX) as Domain[]) ctx.results[d] = ctx.results[d].filter((e) => !flaggedIds.has(e.id));

  const rawOrder = Array.isArray(submitted.order) ? submitted.order.map(String) : [];
  const order = rawOrder.filter((x: string, i: number) => (DEFAULT_ORDER as string[]).includes(x) && rawOrder.indexOf(x) === i) as ThemeKey[];
  const finalOrder = order.length === 6 ? order : [...order, ...DEFAULT_ORDER.filter((x) => !order.includes(x))];

  svc.note("llm.plan", "Nemotron planner's week", [
    clip(submitted.strategy, 160) || "Plan submitted",
    `Order: ${finalOrder.join(" → ")}`,
    `${picks.length} picks${picks.some((p) => p.c.source === "tool") ? ` (${picks.filter((p) => p.c.source === "tool").length} found with its own Qloo tool calls)` : ""}; ${flagged.length} flagged`,
    ...flagged.slice(0, 3).map((f) => `Left out ${f.name}: ${f.reason}`),
  ], { model });

  return { ok: true, strategy: clip(submitted.strategy, 220) || undefined, order: finalOrder, landing, flagged, toolCalls, model };
}

export { THEME_OF };
