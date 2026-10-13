import { NextResponse } from "next/server";
import { qlooMode } from "@/lib/qloo/client";
import { chat, latencyLog, lastNemotronError, MODELS, nemotronEnabled, primaryModel, shortModel, type NemotronRole } from "@/lib/nemotron/client";
import { tavilyEnabled } from "@/lib/agent/localHistory";

export const dynamic = "force-dynamic";

const ROLES: { role: NemotronRole; does: string }[] = [
  { role: "planner", does: "Picks, orders and flags the week (reasoning on, Qloo tool calls)" },
  { role: "writer", does: "Writes the days and the group running order" },
  { role: "prompts", does: "Conversation prompts and follow-up questions" },
  { role: "reader", does: "Reads staff notes; local-history hooks" },
  { role: "feedback", does: "Turns 'how did it go' into next week's changes" },
  { role: "script", does: "Word-for-word session scripts on demand" },
];

// GET /api/status -> which modes are active (never exposes keys)
// GET /api/status?probe=1 -> one tiny call per Nemotron model (reasoning off) with latency
export async function GET(req: Request) {
  const url = new URL(req.url);
  const on = nemotronEnabled();
  if (url.searchParams.get("probe") === "1" && on) {
    const out = await Promise.all(
      Object.values(MODELS).map(async (m) => {
        const r = await chat("writer", { only: m, messages: [{ role: "user", content: 'Return JSON {"ok":true}' }], maxTokens: 50, timeoutMs: 20000 });
        return { model: m, ok: !!r, ms: r?.ms, content: r?.content?.slice(0, 40), error: r ? undefined : lastNemotronError };
      }),
    );
    return NextResponse.json({ probe: out });
  }
  if (url.searchParams.get("latency") === "1") return NextResponse.json({ calls: latencyLog.slice(-50) });
  return NextResponse.json({
    qloo: qlooMode(),
    composer: on ? "nemotron" : "template",
    llm: on
      ? { provider: "NVIDIA Nemotron on Nebius Token Factory", roles: ROLES.map((r) => ({ ...r, model: primaryModel(r.role), name: shortModel(primaryModel(r.role)) })) }
      : null,
    tavily: tavilyEnabled(),
  });
}
