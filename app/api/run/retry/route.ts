import { executeAgent } from "@/lib/agent/executor";
import { errorPayload } from "@/lib/agent/errors";
import { getRun } from "@/lib/agent/repository";
import type { AgentRunInput } from "@/lib/agent/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { runId?: string; provider?: AgentRunInput["provider"] };
    if (!body.runId) return Response.json({ error: { code: "RUN_ID_REQUIRED", message: "缺少 runId" } }, { status: 400 });
    const original = await getRun(body.runId);
    if (!original) return Response.json({ error: { code: "RUN_NOT_FOUND", message: "找不到原运行记录" } }, { status: 404 });
    const run = await executeAgent({
      userInput: original.question,
      source: "retry",
      conversationId: original.conversationId,
      conversationHistory: original.conversationHistory,
      provider: body.provider ?? original.provider,
      retryOf: original.id,
    });
    return Response.json({ run }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: 500 });
  }
}
