import { AgentError, errorPayload } from "@/lib/agent/errors";
import type { EvalCase } from "@/lib/agent/types";
import { createBatch } from "@/lib/eval/batch";
import { getEvalRunBatch, getEvalRunBatchByRequestKey, listEvalCases } from "@/lib/eval/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      caseIds?: unknown;
      name?: string;
      versionLabel?: string;
      changeNote?: string;
      baselineBatchId?: string;
      requestKey?: string;
    };
    const requestKey = request.headers.get("Idempotency-Key")?.trim() || body.requestKey?.trim() || crypto.randomUUID();
    const existing = await getEvalRunBatchByRequestKey(requestKey);
    if (existing) return Response.json({ batchId: existing.id, requestKey, duplicate: true }, { status: 200 });

    const allCases = await listEvalCases(true);
    let requestedIds: string[] | undefined;
    if (body.caseIds !== undefined) {
      if (!Array.isArray(body.caseIds)) throw new AgentError("EVAL_CASE_IDS_INVALID", "caseIds 必须是数组", 400);
      if (body.caseIds.length === 0) throw new AgentError("EVAL_CASE_IDS_EMPTY", "caseIds 不能是空数组", 400);
      requestedIds = [...new Set(body.caseIds.map(String))];
    } else if (body.baselineBatchId) {
      const baseline = await getEvalRunBatch(body.baselineBatchId);
      if (!baseline) throw new AgentError("EVAL_BASELINE_NOT_FOUND", "找不到基线批次", 404, { id: body.baselineBatchId });
      requestedIds = baseline.caseIds;
    }

    let cases: EvalCase[];
    if (requestedIds) {
      const byId = new Map(allCases.map((item) => [item.id, item]));
      const invalidIds = requestedIds.filter((id) => !byId.has(id));
      if (invalidIds.length) throw new AgentError("EVAL_CASE_IDS_NOT_FOUND", "部分评测用例不存在", 400, { invalidIds });
      cases = requestedIds.map((id) => byId.get(id)!);
    } else {
      cases = allCases.filter((item) => item.enabled);
    }
    if (!cases.length) throw new AgentError("EVAL_NO_ENABLED_CASES", "没有可运行的启用用例", 400);

    const batch = await createBatch({
      requestKey,
      name: body.name,
      versionLabel: body.versionLabel,
      changeNote: body.changeNote,
      cases,
      baselineBatchId: body.baselineBatchId,
    });
    return Response.json({ batchId: batch.id, requestKey, batch }, { status: 202 });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
