import { AgentError, errorPayload } from "@/lib/agent/errors";
import { compareBatches } from "@/lib/eval/batch";
import { getEvalRunBatch } from "@/lib/eval/repository";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const leftId = url.searchParams.get("leftId");
    const rightId = url.searchParams.get("rightId");
    if (!leftId || !rightId) throw new AgentError("EVAL_COMPARE_IDS_REQUIRED", "请选择两个批次", 400);
    const [left, right] = await Promise.all([getEvalRunBatch(leftId), getEvalRunBatch(rightId)]);
    const missingIds = [!left && leftId, !right && rightId].filter(Boolean);
    if (missingIds.length) throw new AgentError("EVAL_BATCH_NOT_FOUND", "比较批次不存在", 404, { missingIds });
    const unfinishedIds = [left, right].filter((batch) => batch?.status !== "done").map((batch) => batch?.id);
    if (unfinishedIds.length) throw new AgentError("EVAL_BATCH_NOT_COMPLETE", "只有已完成批次可以比较", 409, { unfinishedIds });
    return Response.json({ comparison: compareBatches(left!, right!) });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
