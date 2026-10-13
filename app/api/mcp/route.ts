import { handleRpc } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
};

// MCP Streamable HTTP endpoint (stateless). POST JSON-RPC messages; responses are plain JSON.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map(handleRpc))).filter((r) => r !== undefined);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? replies : replies[0], { headers: { ...CORS, "Cache-Control": "no-store" } });
}

// No server-initiated stream: this server is stateless.
export async function GET() {
  return new Response("Memory Lane MCP server. POST JSON-RPC to this URL (Streamable HTTP).", { status: 405, headers: { ...CORS, Allow: "POST" } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
