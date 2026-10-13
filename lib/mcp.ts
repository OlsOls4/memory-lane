// Minimal MCP server (Streamable HTTP, stateless JSON responses) so any MCP-capable agent
// (Claude, ChatGPT connectors, Cursor, custom agents) can call Memory Lane as a tool.
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
import { buildGroupSession, buildWeekPlan } from "./agent/composer";
import { eraFor } from "./agent/care";
import { parseResident } from "./validate";
import type { GroupSession, WeekPlan } from "./types";

const PROTOCOL = "2025-06-18";
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

const residentSchema = {
  type: "object",
  properties: {
    born: { type: "string", description: 'When they were born: a year ("1942"), a decade ("1940s") or an age ("age 84").' },
    loved: { type: "string", description: 'One or more things they loved, comma-separated: a singer, film, TV show, food or hobby ("Cilla Black, ballroom dancing").' },
    firstName: { type: "string", description: "Optional first name. Used only in the wording; never sent to Qloo." },
    hometown: { type: "string", description: 'Optional town they grew up in ("Liverpool").' },
    country: { type: "string", description: 'Country they grew up in. Default "United Kingdom".' },
    avoid: { type: "string", description: 'Optional: subjects to steer clear of ("war films"). Read by the planner; never sent to Qloo.' },
    hearing: { type: "string", enum: ["none", "mild", "significant"] },
    vision: { type: "string", enum: ["none", "mild", "significant"] },
    dementiaStage: { type: "string", enum: ["none", "early", "moderate", "advanced"] },
    softFoods: { type: "boolean", description: "Needs soft or easy-to-chew food (IDDSI)." },
    diabetic: { type: "boolean" },
  },
  required: ["born", "loved"],
};

export const TOOLS = [
  {
    name: "plan_reminiscence_week",
    title: "Plan a week of reminiscence activities",
    description:
      "Builds a printable 7-day reminiscence activity plan for one care-home resident from Qloo's taste graph: era-matched songs, films, TV, a taste of home, armchair travel, a read-aloud and a sing-along, each with steps, conversation prompts adapted to dementia stage, and a reason grounded in Qloo signals. Takes 10 to 30 seconds (it makes 12 to 20 live Qloo calls).",
    inputSchema: residentSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "plan_group_session",
    title: "Plan a group reminiscence session",
    description:
      "Plans a 45-minute group session for 2 to 6 residents: finds the years they share and the tastes Qloo's compare analysis says they have in common, then picks songs, films and TV everyone is likely to know. Takes 20 to 50 seconds.",
    inputSchema: {
      type: "object",
      properties: { residents: { type: "array", minItems: 2, maxItems: 6, items: residentSchema } },
      required: ["residents"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "reminiscence_years",
    title: "Work out someone's reminiscence years",
    description:
      "Instant, no Qloo call: given when someone was born, returns the years (roughly ages 10 to 30, the 'reminiscence bump') whose music, films and events they are most likely to remember.",
    inputSchema: { type: "object", properties: { born: residentSchema.properties.born }, required: ["born"] },
    annotations: { readOnlyHint: true },
  },
];

function toRaw(a: any) {
  const born = String(a?.born ?? "").trim();
  const raw: any = {
    firstName: a?.firstName,
    hometown: a?.hometown,
    country: a?.country,
    loved: a?.loved,
    constraints: { hearing: a?.hearing, vision: a?.vision, dementiaStage: a?.dementiaStage, softFoods: a?.softFoods, diabetic: a?.diabetic, avoid: a?.avoid },
  };
  const age = born.match(/^(?:age\s*)?(\d{2,3})$/i);
  if (/^\d{4}$/.test(born)) raw.birthYear = born;
  else if (/^(\d{2,4})s$/i.test(born)) raw.birthDecade = born;
  else if (age && Number(age[1]) < 120) raw.age = Number(age[1]);
  else raw.birthYear = born;
  return raw;
}

function planText(p: WeekPlan): string {
  const lines = [
    `Reminiscence week (${p.era.formativeStart}–${p.era.formativeEnd} were their teens and twenties). Qloo: ${p.qlooMode}, ${p.trace.filter((t) => t.tool.startsWith("qloo.")).length} calls. Planner: ${p.planner === "nemotron" ? "NVIDIA Nemotron 3 Ultra on Nebius Token Factory" : "deterministic"}.`,
  ];
  if (p.strategy) lines.push(`Strategy: ${p.strategy}`);
  if (p.adapted) lines.push(`Adapted from last week: ${p.adapted.summary}`);
  if (p.understood?.length) lines.push(`Understood: ${p.understood.join("; ")}`);
  for (const d of p.days) {
    lines.push("", `${d.day}: ${d.title} (${d.durationMins} min)`);
    for (const it of d.items.slice(0, 4)) lines.push(`- ${it.name}${it.year ? ` (${it.year})` : ""}: ${it.landing || it.why}`);
    for (const s of d.steps.slice(0, 3)) lines.push(`  step: ${s}`);
    if (d.prompts[0]) lines.push(`  ask: ${d.prompts[0]}`);
    for (const a of d.adaptations) lines.push(`  care: ${a}`);
  }
  if (p.flagged.length) lines.push("", `Left out: ${p.flagged.slice(0, 6).map((f) => `${f.name} (${f.reason})`).join("; ")}`);
  if (p.warnings.length) lines.push("", `Notes: ${p.warnings.join(" ")}`);
  lines.push("", "Open the full printable plan at https://memory-lane-azure-six.vercel.app");
  return lines.join("\n");
}

function groupText(g: GroupSession): string {
  const lines = [
    `Group session for ${g.residents.map((r) => r.firstName).join(", ")}; shared years ${g.sharedWindow.start}–${g.sharedWindow.end}.`,
  ];
  if (g.sharedThemes.length) lines.push(`Shared tastes (Qloo compare): ${g.sharedThemes.slice(0, 6).map((t) => `${t.tag} ${t.score.toFixed(2)}`).join(", ")}`);
  lines.push("Picks:");
  for (const p of g.picks.slice(0, 8)) lines.push(`- ${p.name} (${p.domain}): ${p.why}`);
  lines.push("Outline:");
  for (const o of g.outline) lines.push(`- ${o.minutes} min ${o.segment}: ${o.detail}`);
  return lines.join("\n");
}

function slimPlan(p: WeekPlan) {
  return {
    era: p.era,
    qlooMode: p.qlooMode,
    qlooCalls: p.trace.filter((t) => t.tool.startsWith("qloo.")).length,
    planner: p.planner,
    strategy: p.strategy,
    flagged: p.flagged,
    models: p.models.map((m) => ({ role: m.role, model: m.model, ms: m.ms })),
    days: p.days.map((d) => ({ day: d.day, title: d.title, items: d.items.map((i) => ({ name: i.name, domain: i.domain, year: i.year, why: i.why, landing: i.landing })), steps: d.steps, prompts: d.prompts, adaptations: d.adaptations })),
    warnings: p.warnings,
  };
}

async function callTool(name: string, args: any) {
  if (name === "reminiscence_years") {
    const r = parseResident({ ...toRaw(args), loved: "x" });
    const e = eraFor(r.birthYear);
    const out = { birthYear: r.birthYear, approximate: !!r.birthYearApprox, reminiscenceYears: { start: e.formativeStart, end: e.formativeEnd } };
    return { content: [{ type: "text", text: `Born ${r.birthYear}: most vivid memories likely from ${e.formativeStart} to ${e.formativeEnd}.` }], structuredContent: out };
  }
  if (name === "plan_reminiscence_week") {
    const plan = await buildWeekPlan(parseResident(toRaw(args)));
    return { content: [{ type: "text", text: planText(plan) }], structuredContent: slimPlan(plan) };
  }
  if (name === "plan_group_session") {
    const list = Array.isArray(args?.residents) ? args.residents : [];
    if (list.length < 2 || list.length > 6) throw new Error("Give between 2 and 6 residents.");
    const residents = list.map((r: any, i: number) => {
      const p = parseResident(toRaw(r));
      if (!p.firstName) p.firstName = `Resident ${i + 1}`;
      return p;
    });
    const g = await buildGroupSession(residents);
    return { content: [{ type: "text", text: groupText(g) }], structuredContent: { sharedWindow: g.sharedWindow, sharedThemes: g.sharedThemes, picks: g.picks.map((p) => ({ name: p.name, domain: p.domain, why: p.why })), outline: g.outline } };
  }
  return null;
}

export async function handleRpc(msg: any): Promise<any | undefined> {
  const id = msg?.id;
  const isNotification = id === undefined || id === null;
  const ok = (result: any) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (msg?.jsonrpc !== "2.0" || typeof msg?.method !== "string") return isNotification ? undefined : err(-32600, "Invalid request");
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: SUPPORTED.includes(asked) ? asked : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "memory-lane", title: "Memory Lane (Qloo taste graph + NVIDIA Nemotron planner)", version: "1.1.0" },
        instructions:
          "Use these tools when someone caring for an older person (care-home staff, a family member) wants era-matched music, films, TV, food or places to spark memories and conversation. Ask for roughly when the person was born and one thing they loved; hometown and care needs are optional. Never pass health details beyond the listed care flags.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = msg.params?.name;
      if (!TOOLS.some((t) => t.name === name)) return err(-32602, `Unknown tool: ${name}`);
      try {
        const result = await callTool(name, msg.params?.arguments || {});
        return ok(result);
      } catch (e: any) {
        // Tool errors go back as results so the calling agent can correct its input.
        return ok({ isError: true, content: [{ type: "text", text: String(e?.message || e) }] });
      }
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return isNotification ? undefined : err(-32601, `Method not found: ${msg.method}`);
  }
}
