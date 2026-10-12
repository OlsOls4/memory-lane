import { NextResponse } from "next/server";
import { buildGroupSession } from "@/lib/agent/composer";
import { parseResident } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/group  { residents: ResidentProfile[] (2–6) }  ->  GroupSession
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const raw = Array.isArray(body?.residents) ? body.residents : [];
  if (raw.length < 2 || raw.length > 6)
    return NextResponse.json({ error: "Add between 2 and 6 residents for a group session." }, { status: 400 });
  let residents;
  try {
    residents = raw.map(parseResident);
    // Quick-add residents may have no name: label them so the session can say who each pick suits.
    residents.forEach((r: any, i: number) => {
      if (!r.firstName) r.firstName = `Resident ${i + 1}`;
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  try {
    const session = await buildGroupSession(residents);
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("group failed", e);
    return NextResponse.json({ error: "Could not build the group session. Please try again." }, { status: 500 });
  }
}
