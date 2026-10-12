import { NextResponse } from "next/server";
import { qlooMode } from "@/lib/qloo/client";
import { geminiEnabled } from "@/lib/agent/gemini";

export const dynamic = "force-dynamic";

// GET /api/status -> which modes are active (never exposes keys)
export async function GET() {
  return NextResponse.json({
    qloo: qlooMode(),
    composer: geminiEnabled() ? "gemini" : "template",
  });
}
