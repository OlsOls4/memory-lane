import { NextResponse } from "next/server";
import { sessionScript } from "@/lib/agent/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const ss = (v: unknown, k: number, n: number) => (Array.isArray(v) ? v.map((x) => s(x, n)).filter(Boolean).slice(0, k) : []);

// POST /api/script { day: DayPlan, resident: { firstName, constraints, country } } -> SessionScript
// Only the day's wording, item names and care flags are sent to Nemotron.
export async function POST(req: Request) {
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const d = b?.day || {};
  const r = b?.resident || {};
  const c = r.constraints || {};
  if (!s(d.title, 100)) return NextResponse.json({ error: "Send the day to script." }, { status: 400 });
  const out = await sessionScript({
    day: {
      day: s(d.day, 12),
      title: s(d.title, 100),
      theme: s(d.theme, 60),
      durationMins: Math.min(60, Math.max(5, Number(d.durationMins) || 30)),
      steps: ss(d.steps, 6, 240),
      prompts: ss(d.prompts, 4, 200),
      followUps: ss(d.followUps, 3, 200),
      items: (Array.isArray(d.items) ? d.items : []).slice(0, 6).map((i: any) => ({ name: s(i?.name, 80), year: Number(i?.year) || undefined })).filter((i: any) => i.name),
    },
    firstName: s(r.firstName, 40) || undefined,
    dementiaStage: ["none", "early", "moderate", "advanced"].includes(c.dementiaStage) ? c.dementiaStage : "none",
    hearing: s(c.hearing, 12) || "none",
    vision: s(c.vision, 12) || "none",
    country: s(r.country, 60) || "United Kingdom",
    avoid: s(c.avoid, 200) || undefined,
  });
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
