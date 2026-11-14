import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getImprovement, saveImprovement } from "@/lib/agent/opsRepository";
import { updateSkillConfig } from "@/lib/agent/skillRepository";
export async function POST(request: Request) {
  try {
    const body = await request.json() as { improvementId?: string; confirmed?: boolean };
    if (!body.confirmed) throw new AgentError("CONFIRMATION_REQUIRED", "应用 Prompt 前必须明确确认", 400);
    const item = body.improvementId ? await getImprovement(body.improvementId) : null;
    if (!item?.skillId || !item.draftPrompt) throw new AgentError("PROMPT_DRAFT_NOT_FOUND", "改进建议尚未生成 Prompt 草案", 422);
    const skill = await updateSkillConfig(item.skillId, { prompt: item.draftPrompt }, `应用改进建议：${item.title}`);
    const improvement = await saveImprovement({ ...item, status: "applied", appliedAt: new Date().toISOString() });
    return Response.json({ improvement, skill, snapshotCreated: true });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
