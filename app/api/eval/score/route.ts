import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getRun } from "@/lib/agent/repository";
import { getEvalCase, saveEvalBatch } from "@/lib/eval/repository";
import { scoreEvalCase } from "@/lib/eval/scorer";
import type { EvalBatch } from "@/lib/agent/types";
export async function POST(request: Request) {
  try {
    const body = await request.json() as { caseId?:string; runId?:string };
    if (!body.caseId || !body.runId) throw new AgentError("EVAL_SCORE_INPUT_REQUIRED","缺少 caseId 或 runId",400);
    const [evalCase,run]=await Promise.all([getEvalCase(body.caseId),getRun(body.runId)]);
    if (!evalCase) throw new AgentError("EVAL_CASE_NOT_FOUND","找不到评测用例",404);
    if (!run) throw new AgentError("RUN_NOT_FOUND","找不到运行记录",404);
    const score=scoreEvalCase(evalCase,run);
    const batch:EvalBatch={id:crypto.randomUUID(),caseId:evalCase.id,runId:run.id,createdAt:new Date().toISOString(),provider:run.provider,model:run.model,runStatus:run.status,finalReply:run.finalReply,trace:run.steps,score};
    return Response.json({batch:await saveEvalBatch(batch)},{status:201});
  } catch(error){ return Response.json({error:errorPayload(error)},{status:error instanceof AgentError?error.status:500}); }
}
