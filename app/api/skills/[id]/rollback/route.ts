import { AgentError, errorPayload } from "@/lib/agent/errors";
import { listSkillVersions, updateSkillConfig } from "@/lib/agent/skillRepository";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { versionId?: string };
    const version = (await listSkillVersions(id)).find((item) => item.id === body.versionId);
    if (!version) throw new AgentError("SKILL_VERSION_NOT_FOUND", "找不到目标版本", 404);
    const skill = await updateSkillConfig(id, version.config, `回滚到 v${version.version}`);
    return Response.json({ skill, restoredFrom: version });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
