// Qloo client: a thin transport (live HTTP or mock) plus a traced, normalising service layer.
// Server-only. The API key never leaves the server.

import type { QEntity, QTag, TraceStep, ToolName } from "../types";
import { sanitizeInsightsParams } from "./params";
import { MockTransport } from "./mock";

export const QLOO_BASE_URL = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";

export interface QlooTransport {
  readonly mock: boolean;
  get(path: string, params: Record<string, string>): Promise<any>;
}

class HttpTransport implements QlooTransport {
  readonly mock = false;
  constructor(private apiKey: string, private baseUrl: string) {}
  async get(path: string, params: Record<string, string>): Promise<any> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const msg = body?.error?.message || body?.message || body?.errors?.[0]?.message || text.slice(0, 200);
      throw new Error(`Qloo ${res.status} on ${path}: ${msg}`);
    }
    return body;
  }
}

export function qlooMode(): "live" | "mock" {
  return process.env.QLOO_API_KEY ? "live" : "mock";
}

export function createTransport(): QlooTransport {
  const key = process.env.QLOO_API_KEY;
  return key ? new HttpTransport(key, QLOO_BASE_URL) : new MockTransport();
}

// ---------------------------------------------------------------------------
// Normalisation of documented response shapes
// ---------------------------------------------------------------------------

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function yearFrom(p: any): number | undefined {
  if (!p) return undefined;
  const direct = num(p.release_year) ?? num(p.publication_year) ?? num(p.year);
  if (direct) return direct;
  const dateLike = p.release_date || p.publication_date || p.date_of_birth;
  if (typeof dateLike === "string") {
    const m = dateLike.match(/(\d{4})/);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

function explainFrom(raw: any): QEntity["explain"] {
  const ex = raw?.query?.explainability;
  if (!ex || typeof ex !== "object") return undefined;
  // Expected: { "signal.interests.entities": [{ entity_id, score }...], ... } — parse defensively.
  const out: { entityId: string; name?: string; score: number }[] = [];
  for (const val of Object.values(ex)) {
    if (!Array.isArray(val)) continue;
    for (const e of val as any[]) {
      const id = e?.entity_id || e?.id || e?.tag_id;
      const score = num(e?.score) ?? num(e?.value);
      if (id && score !== undefined) out.push({ entityId: String(id), name: e?.name, score });
    }
  }
  return out.length ? out.sort((a, b) => b.score - a.score) : undefined;
}

export function normaliseEntity(raw: any, fallbackType = ""): QEntity {
  const p = raw?.properties || {};
  const tags: { id: string; name: string }[] = Array.isArray(raw?.tags)
    ? raw.tags
        .map((t: any) => ({ id: String(t?.id || t?.tag_id || ""), name: String(t?.name || "") }))
        .filter((t: any) => t.id && t.name)
    : [];
  const geo = p.geocode || {};
  return {
    id: String(raw?.entity_id || raw?.id || ""),
    name: String(raw?.name || "Unknown"),
    type: String(raw?.type || raw?.types?.[0] || fallbackType),
    year: yearFrom(p),
    popularity: num(raw?.popularity),
    affinity: num(raw?.query?.affinity),
    tags,
    description: typeof p.description === "string" ? p.description : undefined,
    imageUrl: typeof p.image?.url === "string" ? p.image.url : undefined,
    location: [geo.city || geo.name, geo.country_code].filter(Boolean).join(", ") || p.address || undefined,
    explain: explainFrom(raw),
  };
}

// ---------------------------------------------------------------------------
// Traced service used by the agent
// ---------------------------------------------------------------------------

export class QlooService {
  readonly trace: TraceStep[] = [];
  constructor(private t: QlooTransport = createTransport()) {}

  get mock() {
    return this.t.mock;
  }

  note(tool: ToolName, purpose: string, summary: string[], extra: Partial<TraceStep> = {}) {
    this.trace.push({ n: this.trace.length + 1, tool, purpose, summary, ms: 0, mock: this.t.mock, ...extra });
  }

  private async call(
    tool: ToolName,
    purpose: string,
    path: string,
    params: Record<string, string>,
    summarise: (body: any) => string[],
    dropped?: string[],
  ): Promise<any | null> {
    const started = Date.now();
    const step: TraceStep = {
      n: this.trace.length + 1,
      tool,
      purpose,
      request: { method: "GET", path, params },
      droppedParams: dropped && dropped.length ? dropped : undefined,
      summary: [],
      ms: 0,
      mock: this.t.mock,
    };
    this.trace.push(step);
    try {
      const body = await this.t.get(path, params);
      step.summary = summarise(body);
      return body;
    } catch (e: any) {
      step.error = String(e?.message || e);
      return null;
    } finally {
      step.ms = Date.now() - started;
    }
  }

  /** GET /search — resolve a free-text name to Qloo entities. */
  async search(query: string, types: string[], purpose: string, take = 3): Promise<QEntity[]> {
    const params: Record<string, string> = { query, types: types.join(","), take: String(take) };
    const body = await this.call("qloo.search", purpose, "/search", params, (b) => {
      const r = (b?.results || []) as any[];
      return r.length ? r.slice(0, take).map((e) => `${e.name} → ${e.entity_id}`) : ["no match"];
    });
    const results = (body?.results || []) as any[];
    return results.map((r) => normaliseEntity(r, types[0]));
  }

  /** GET /v2/tags — find tag IDs for hobbies, cuisines, genres. */
  async tags(query: string, purpose: string, tagTypes?: string[], take = 3): Promise<QTag[]> {
    const params: Record<string, string> = { "filter.query": query, take: String(take) };
    if (tagTypes?.length) params["filter.tag.types"] = tagTypes.join(",");
    const body = await this.call("qloo.tags", purpose, "/v2/tags", params, (b) => {
      const r = (b?.results?.tags || []) as any[];
      return r.length ? r.slice(0, take).map((t) => `${t.name} → ${t.id}`) : ["no tag found"];
    });
    const tags = (body?.results?.tags || []) as any[];
    return tags.map((t) => ({ id: String(t.id || t.tag_id), name: String(t.name), type: t.type }));
  }

  /** GET /v2/insights — the core taste-graph query. Params are validated per filter.type. */
  async insights(raw: Record<string, string | number | boolean | undefined>, purpose: string): Promise<QEntity[]> {
    const { clean, dropped } = sanitizeInsightsParams(raw);
    const body = await this.call(
      "qloo.insights",
      purpose,
      "/v2/insights",
      clean,
      (b) => {
        const r = (b?.results?.entities || []) as any[];
        if (!r.length) return ["0 results"];
        return r
          .slice(0, 5)
          .map((e) => {
            const a = num(e?.query?.affinity);
            return `${e.name}${a !== undefined ? ` (affinity ${a.toFixed(2)})` : ""}`;
          })
          .concat(r.length > 5 ? [`…and ${r.length - 5} more`] : []);
      },
      dropped,
    );
    const ents = (body?.results?.entities || []) as any[];
    return ents.map((e) => normaliseEntity(e, clean["filter.type"]));
  }

  /** GET /v2/analysis/compare — shared taste between two groups of entities. */
  async compare(
    a: string[],
    b: string[],
    purpose: string,
    take = 10,
  ): Promise<{ tagId: string; name: string; score: number }[]> {
    const params: Record<string, string> = {
      "a.signal.interests.entities": a.join(","),
      "b.signal.interests.entities": b.join(","),
      take: String(take),
    };
    const body = await this.call("qloo.compare", purpose, "/v2/analysis/compare", params, (resp) => {
      const r = parseCompare(resp);
      return r.length ? r.slice(0, 5).map((x) => `${x.name} (${x.score.toFixed(2)})`) : ["no shared tags"];
    });
    return body ? parseCompare(body) : [];
  }
}

/**
 * The compare response schema is not spelled out in the public docs text, so parse defensively.
 * Expected-ish: { results: { tags: [{ tag_id|id, name, query: { affinity | a/b } }] } }.
 * VERIFY against a live response once the hackathon key arrives.
 */
export function parseCompare(body: any): { tagId: string; name: string; score: number }[] {
  const list: any[] = body?.results?.tags || body?.results?.entities || body?.results || [];
  if (!Array.isArray(list)) return [];
  return list
    .map((t) => {
      const q = t?.query || {};
      const aff =
        num(q.affinity) ??
        (num(q.a?.affinity) !== undefined && num(q.b?.affinity) !== undefined
          ? Math.min(num(q.a?.affinity)!, num(q.b?.affinity)!)
          : undefined) ??
        num(t?.affinity) ??
        num(t?.score) ??
        0;
      return { tagId: String(t?.tag_id || t?.id || t?.entity_id || ""), name: String(t?.name || ""), score: aff };
    })
    .filter((t) => t.tagId && t.name)
    .sort((x, y) => y.score - x.score);
}
