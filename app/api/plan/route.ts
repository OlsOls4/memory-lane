import { NextResponse } from "next/server";
import { streamAgent, wantsStream } from "@/lib/agentStream";
import { buildWeekPlan } from "@/lib/agent/composer";
import { parseFeedback, parseResident } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/plan  { resident: ResidentProfile, feedback?: DayFeedback[] }  ->  WeekPlan
// feedback = last week's "how did it go" per day; the agent adapts this week from it.
// Resident data is processed in memory only and never stored.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  let resident;
  try {
    resident = parseResident(body?.resident ?? body);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  const feedback = parseFeedback(body?.feedback);
  if (wantsStream(req)) return streamAgent((onStep) => buildWeekPlan(resident, onStep, { feedback }), "Could not build the plan. Please try again.");
  try {
    const plan = await buildWeekPlan(resident, undefined, { feedback });
    return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("plan failed", e);
    return NextResponse.json({ error: "Could not build the plan. Please try again." }, { status: 500 });
  }
}
