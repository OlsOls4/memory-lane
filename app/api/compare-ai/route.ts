import { NextResponse } from "next/server";
import { compareWithAiOnly } from "@/lib/agent/compareAi";
import { nemotronEnabled } from "@/lib/nemotron/client";
import { parseResident } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/compare-ai { resident } -> what an LLM alone suggests, each pick checked against Qloo.
export async function POST(req: Request) {
  if (!nemotronEnabled()) return NextResponse.json({ error: "The AI-only comparison needs NEBIUS_API_KEY." }, { status: 503 });
  let resident;
  try {
    const body = await req.json();
    resident = parseResident(body?.resident ?? body);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Body must be JSON." }, { status: 400 });
  }
  const out = await compareWithAiOnly(resident).catch((e) => {
    console.error("compare-ai failed", e);
    return null;
  });
  if (!out) return NextResponse.json({ error: "The comparison could not be made. Please try again." }, { status: 502 });
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
