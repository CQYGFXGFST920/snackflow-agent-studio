import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getSkillConfig, listSkillVersions } from "@/lib/agent/skillRepository";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const current = await getSkillConfig(id);
    if (!current) throw new AgentError("SKILL_NOT_FOUND", "找不到该 Skill", 404);
    return Response.json({ current, versions: await listSkillVersions(id) });
  } catch (error) {
    const payload = errorPayload(error);
    return Response.json({ error: payload }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
