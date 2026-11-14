import { executeAgent } from "@/lib/agent/executor";
import { errorPayload } from "@/lib/agent/errors";
import type { AgentEvent, AgentRunInput } from "@/lib/agent/types";

export const dynamic = "force-dynamic";
const TOOL_IDS = new Set(["query_products", "query_activities", "query_coupons", "calculate_price", "query_order", "query_logistics", "risk_check"]);

export async function POST(request: Request) {
  let input: AgentRunInput;
  try {
    input = await request.json() as AgentRunInput;
  } catch {
    return Response.json({ error: { code: "INVALID_JSON", message: "请求体必须是有效 JSON" } }, { status: 400 });
  }
  if (input.simulateToolError !== undefined && (typeof input.simulateToolError !== "string" || !TOOL_IDS.has(input.simulateToolError))) {
    return Response.json({
      error: {
        code: "SIMULATE_TOOL_ERROR_INVALID",
        message: "simulateToolError 必须是已存在的 Tool ID",
        details: { allowed: [...TOOL_IDS] },
      },
    }, { status: 400 });
  }
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      try {
        await executeAgent(input, send);
      } catch (error) {
        const event: AgentEvent = {
          type: "run.error",
          runId: "uncreated",
          timestamp: new Date().toISOString(),
          data: { error: errorPayload(error) },
        };
        send(event);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}
