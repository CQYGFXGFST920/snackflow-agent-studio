import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getRun } from "@/lib/agent/repository";
import { createRating, listRatings, saveImprovement } from "@/lib/agent/opsRepository";
import type { Improvement } from "@/lib/agent/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json({ ratings: await listRatings({ score: url.searchParams.get("score") ? Number(url.searchParams.get("score")) : undefined, problemType: url.searchParams.get("problemType") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined }) });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json() as { runId?: string; score?: number; problemType?: string; note?: string };
    if (!body.runId) throw new AgentError("RUN_ID_REQUIRED", "缺少 runId", 400);
    const run = await getRun(body.runId);
    if (!run) throw new AgentError("RUN_NOT_FOUND", "找不到运行记录", 404);
    const rating = await createRating({ runId: run.id, score: Number(body.score), problemType: body.problemType?.trim() || "其他", question: run.question, reply: run.finalReply, note: body.note?.trim() || "" });
    let improvement: Improvement | null = null;
    if (rating.score <= 2) {
      improvement = await saveImprovement({ id: crypto.randomUUID(), sourceType: "low-rating", category: categoryFor(rating.problemType), clusterMethod: "规则聚类", title: `${rating.problemType}低分样本`, reason: `用户评分 ${rating.score}/5：${rating.note || "未填写原因"}`, sampleRunIds: [run.id], status: "suggested", createdAt: new Date().toISOString() });
    }
    return Response.json({ rating, improvement }, { status: 201 });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
function categoryFor(type: string): Improvement["category"] {
  if (/计划|意图/.test(type)) return "Planner";
  if (/价格|商品|物流|订单/.test(type)) return "Tool";
  if (/话术|语气|回复/.test(type)) return "Skill";
  return "Eval";
}
