// Optional runtime web search (Tavily) for local history: what was happening in the resident's
// hometown during their memory years (a new pier, a big match, a royal visit, the last tram).
// Enabled only when TAVILY_API_KEY is set; skipped silently otherwise.
// Privacy: the query contains only the town, country and decades, never the resident.
// Nemotron 3 Nano (reasoning off) turns the search snippets into 2-3 conversation hooks, each tied
// to a source URL from the results; without Nemotron the result titles are used as-is.

import type { LocalHook, ModelUse, ResidentProfile } from "../types";
import type { QlooService } from "../qloo/client";
import { nemotronEnabled, nemotronJSON } from "../nemotron/client";

export function tavilyEnabled() {
  return !!process.env.TAVILY_API_KEY;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

async function tavilySearch(query: string, timeoutMs = 9000): Promise<TavilyResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 6, include_answer: false, topic: "general" }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const body = await res.json();
  return (Array.isArray(body?.results) ? body.results : [])
    .map((r: any) => ({ title: String(r.title || "").slice(0, 140), url: String(r.url || ""), content: String(r.content || "").slice(0, 500) }))
    .filter((r: TavilyResult) => r.title && /^https?:\/\//.test(r.url));
}

export async function localHistory(svc: QlooService, p: ResidentProfile, era: { formativeStart: number; formativeEnd: number }, models: ModelUse[]): Promise<LocalHook[]> {
  if (!tavilyEnabled() || !p.hometown.trim()) return [];
  const d1 = Math.floor(era.formativeStart / 10) * 10;
  const d2 = Math.floor(era.formativeEnd / 10) * 10;
  // Every decade in the memory years (1956-1971 -> "1950s, 1960s and 1970s"), not just the ends.
  const ds: string[] = [];
  for (let d = d1; d <= d2; d += 10) ds.push(`${d}s`);
  const decades = ds.length > 1 ? `${ds.slice(0, -1).join(", ")} and ${ds[ds.length - 1]}` : ds[0];
  const town = p.hometown.split(",")[0].trim();
  const query = `${town} ${p.country} local history ${decades} memories events`;
  const step = svc.begin("web.history", `Tavily web search: local history of ${town} in the ${decades}`, {
    request: { method: "POST", path: "api.tavily.com/search", params: { query } },
  });
  try {
    const results = await tavilySearch(query);
    if (!results.length) {
      step.summary = ["No local history found"];
      return [];
    }
    let hooks: LocalHook[] = results.slice(0, 3).map((r) => ({ title: r.title, detail: r.content.slice(0, 160), url: r.url }));
    if (nemotronEnabled()) {
      const r = await nemotronJSON<any>(
        "reader",
        `From these web results about ${town} in the ${decades}, pick up to 3 events, places or everyday things a person who grew up there then might remember (e.g. a new shopping arcade, a famous match, the trams, a flood, a royal visit).
Only use facts stated in the results. Prefer everyday life, entertainment, music venues, shops, transport, sport and celebrations. Skip anything distressing or divisive (disasters with deaths, wars, crimes, riots, politics and elections, demolitions or communities displaced). For each: title (max 8 words), detail (one sentence a carer can say, max 25 words), year if stated, source (the result number).
Return JSON {"hooks":[{"title":"","detail":"","year":null,"source":1}]}.
RESULTS:
${results.map((x, i) => `[${i + 1}] ${x.title} — ${x.content}`).join("\n")}`,
        { timeoutMs: 12000, maxTokens: 800 },
      );
      const xs = Array.isArray(r?.data?.hooks) ? r!.data.hooks : [];
      const picked = xs
        .map((h: any) => {
          const src = results[Number(h?.source) - 1];
          if (!src || !h?.title) return null;
          const y = Number(h.year);
          return { title: String(h.title).slice(0, 80), detail: String(h.detail || "").slice(0, 220), url: src.url, year: y > 1880 && y < 2030 ? y : undefined } as LocalHook;
        })
        .filter(Boolean) as LocalHook[];
      if (picked.length) {
        hooks = picked.slice(0, 3);
        step.model = r!.meta.model;
        models.push({ role: "reader", label: "Local history hooks", model: r!.meta.model, ms: r!.meta.ms });
      }
    }
    step.summary = hooks.map((h) => `${h.title}${h.year ? ` (${h.year})` : ""}`);
    return hooks;
  } catch (e: any) {
    step.error = String(e?.message || e).slice(0, 120);
    step.summary = ["Local history skipped"];
    return [];
  } finally {
    svc.end(step);
  }
}
