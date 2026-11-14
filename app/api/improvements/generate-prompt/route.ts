import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getImprovement, listImprovements, saveImprovement } from "@/lib/agent/opsRepository";
import { getSkillConfig } from "@/lib/agent/skillRepository";
export async function GET() {
  try { return Response.json({ improvements: await listImprovements() }); }
  catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json() as { improvementId?: string; skillId?: string };
    const improvement = body.improvementId ? await getImprovement(body.improvementId) : null;
    if (!improvement) throw new AgentError("IMPROVEMENT_NOT_FOUND", "找不到改进建议", 404);
    const skillId = body.skillId || "service_copy"; const skill = await getSkillConfig(skillId);
    if (!skill) throw new AgentError("SKILL_NOT_FOUND", "找不到目标 Skill", 404);
    const guard = improvement.category === "Tool" ? "严格引用 Tool 返回的事实；事实缺失时明确说明并转人工。" : improvement.category === "Eval" ? "优先保证安全、事实一致和完整性；不确定时拒绝推断。" : "先识别用户真实意图，再用简洁、具体、克制的中文回答。";
    const draftPrompt = `${skill.prompt ?? ""}\n\n【运营改进草案｜规则聚类】\n${guard}\n改进依据：${improvement.reason}`;
    const next = await saveImprovement({ ...improvement, skillId, originalPrompt: skill.prompt ?? "", draftPrompt, status: "drafted" });
    return Response.json({ improvement: next, analysisMode: "规则聚类", applied: false });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
