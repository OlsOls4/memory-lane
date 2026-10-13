// Server side: run an agent build and stream its steps as NDJSON, ending with the result.
// Lines: {"type":"step","phase":"start"|"end","step":{...}} ... then {"type":"done","result":...} or {"type":"error","error":"..."}
import type { TraceStep } from "./types";
import type { StepListener } from "./qloo/client";

export function wantsStream(req: Request) {
  return (req.headers.get("accept") || "").includes("application/x-ndjson");
}

function slim(step: TraceStep) {
  // Progress only needs what the person sees; full requests stay in the final trace.
  return { n: step.n, tool: step.tool, purpose: step.purpose, summary: step.summary.slice(0, 3), ms: step.ms, error: step.error };
}

export function streamAgent<T>(build: (onStep: StepListener) => Promise<T>, failMessage: string): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await build((step, phase) => send({ type: "step", phase, step: slim(step) }));
        send({ type: "done", result });
      } catch (e) {
        console.error("agent stream failed", e);
        send({ type: "error", error: failMessage });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
