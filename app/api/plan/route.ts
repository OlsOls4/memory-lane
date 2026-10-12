import { NextResponse } from "next/server";
import { buildWeekPlan } from "@/lib/agent/composer";
import { parseResident } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/plan  { resident: ResidentProfile }  ->  WeekPlan
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
  try {
    const plan = await buildWeekPlan(resident);
    return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("plan failed", e);
    return NextResponse.json({ error: "Could not build the plan. Please try again." }, { status: 500 });
  }
}
