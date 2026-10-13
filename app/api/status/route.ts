import { NextResponse } from "next/server";
import { qlooMode } from "@/lib/qloo/client";
import { geminiEnabled, geminiJSON, geminiModel, lastGeminiError, geminiModels } from "@/lib/agent/gemini";

export const dynamic = "force-dynamic";

// GET /api/status -> which modes are active (never exposes keys)
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("probe") === "models" && geminiEnabled()) return NextResponse.json({ models: await geminiModels() });
  if (new URL(req.url).searchParams.get("probe") === "1" && geminiEnabled()) {
    const t = Date.now();
    const out = await geminiJSON<any>('Return JSON {"ok":true}', 20000, new URL(req.url).searchParams.get("model") || undefined);
    return NextResponse.json({ gemini: out ? "ok" : "failed", ms: Date.now() - t, error: out ? undefined : lastGeminiError, model: geminiModel() });
  }
  return NextResponse.json({
    qloo: qlooMode(),
    composer: geminiEnabled() ? "gemini" : "template",
  });
}
