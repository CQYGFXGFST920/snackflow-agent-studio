import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getRun } from "@/lib/agent/repository";
import { createEvalCase, getEvalCase } from "@/lib/eval/repository";
import type { EvalCase } from "@/lib/agent/types";
export async function POST(request: Request) {
  try {
    const body = await request.json() as Omit<EvalCase,"id"|"createdAt"> & { copyFromId?: string; sourceRunId?: string };
    if (body.copyFromId) {
      const source = await getEvalCase(body.copyFromId); if (!source) throw new AgentError("EVAL_CASE_NOT_FOUND", "找不到要复制的用例", 404);
      const { id: _id, createdAt: _createdAt, ...copy } = source; void _id; void _createdAt;
      return Response.json({ case: await createEvalCase({ ...copy, name: `${copy.name}（副本）` }) }, { status: 201 });
    }
    if (body.sourceRunId && !body.question) {
      const run = await getRun(body.sourceRunId); if (!run) throw new AgentError("RUN_NOT_FOUND", "找不到来源 Run", 404);
      return Response.json({ case: await createEvalCase({
        name: `来自 Run：${run.question.slice(0,24)}`, question: run.question, scenario: "运营沉淀", category: "运营沉淀", difficulty: "medium", riskLevel: run.riskResult?.level === "high" ? "high" : "low", expectedBehavior: "复现该 Run 并检查最终回复和能力调用", expectedReply: run.finalReply, expectedKeywords: { mode:"OR", groups:[] }, forbiddenWords:[], expectReplySafe:true, expectShouldSend:run.status==="COMPLETED", requiredCapabilities:[...(run.plan?.selectedSkills ?? []),...(run.plan?.selectedTools ?? [])], forbiddenCapabilities:[], evalDimension:["regression","capability","risk"], tags:["source-run"], sourceRunId:run.id, enabled:true,
      }) }, { status: 201 });
    }
    const { copyFromId: _copy, ...input } = body; void _copy;
    return Response.json({ case: await createEvalCase(input) }, { status: 201 });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
