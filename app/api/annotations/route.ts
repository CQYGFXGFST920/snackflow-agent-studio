import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getRun } from "@/lib/agent/repository";
import { createAnnotation, listAnnotations, saveImprovement } from "@/lib/agent/opsRepository";
import type { AnnotationStatus, Improvement } from "@/lib/agent/types";
export async function GET() {
  try { return Response.json({ annotations: await listAnnotations() }); }
  catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const runId = String(body.runId ?? ""); const run = await getRun(runId);
    if (!run) throw new AgentError("RUN_NOT_FOUND", "找不到运行记录", 404);
    const annotation = await createAnnotation({
      runId, target: body.target === "reply" ? "reply" : "run", status: validStatus(body.status), correctness: Number(body.correctness), relevance: Number(body.relevance), completeness: Number(body.completeness), safety: Number(body.safety), tone: Number(body.tone), overall: Number(body.overall), annotator: String(body.annotator ?? "").trim() || "运营人员", note: String(body.note ?? "").trim(), addToEval: Boolean(body.addToEval), addToImprovement: Boolean(body.addToImprovement),
    });
    let improvement: Improvement | null = null;
    if (annotation.addToImprovement || annotation.overall <= 2) improvement = await saveImprovement({ id: crypto.randomUUID(), sourceType: "annotation", category: annotation.safety <= 2 ? "Eval" : annotation.correctness <= 2 ? "Tool" : "Skill", clusterMethod: "规则聚类", title: "低分标注样本", reason: annotation.note || `标注总分 ${annotation.overall}/5`, sampleRunIds: [runId], status: "suggested", createdAt: new Date().toISOString() });
    return Response.json({ annotation, improvement }, { status: 201 });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
function validStatus(value: unknown): AnnotationStatus {
  return value === "accepted" || value === "rejected" ? value : "pending";
}
