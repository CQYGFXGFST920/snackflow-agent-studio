import { AgentError, errorPayload } from "@/lib/agent/errors";
import { assertBatchInvariant } from "@/lib/eval/batch";
import { getEvalRunBatch } from "@/lib/eval/repository";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const batch = await getEvalRunBatch(id);
    if (!batch) throw new AgentError("EVAL_BATCH_NOT_FOUND", "找不到评测批次", 404, { id });
    if (batch.status === "done" && !assertBatchInvariant(batch)) {
      throw new AgentError("EVAL_BATCH_STATS_INVALID", "批次统计不一致", 500, {
        total: batch.total, passed: batch.passed, failed: batch.failed, review: batch.review, errors: batch.errors,
      });
    }
    return Response.json({ batch });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
