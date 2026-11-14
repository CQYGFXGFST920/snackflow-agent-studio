import { AgentError, errorPayload } from "@/lib/agent/errors";
import { advanceBatch, assertBatchInvariant } from "@/lib/eval/batch";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const batch = await advanceBatch(id);
    if (!batch) throw new AgentError("EVAL_BATCH_NOT_FOUND", "找不到评测批次", 404, { id });
    if (batch.status === "done" && !assertBatchInvariant(batch)) {
      throw new AgentError("EVAL_BATCH_STATS_INVALID", "批次统计不一致", 500);
    }
    return Response.json({ batch });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
