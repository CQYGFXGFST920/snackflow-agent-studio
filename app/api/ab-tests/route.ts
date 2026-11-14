import { AgentError, errorPayload } from "@/lib/agent/errors";
import { createABTest, listABTests } from "@/lib/agent/opsRepository";
import { getSkillConfig } from "@/lib/agent/skillRepository";
export async function GET() { try { return Response.json({ tests: await listABTests() }); } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); } }
export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; skillId?: string; variantPrompt?: string };
    if (!body.skillId || !body.variantPrompt?.trim()) throw new AgentError("AB_TEST_INVALID", "Skill 和实验 Prompt 不能为空", 400);
    const skill = await getSkillConfig(body.skillId); if (!skill) throw new AgentError("SKILL_NOT_FOUND", "找不到 Skill", 404);
    return Response.json({ test: await createABTest({ name: body.name?.trim() || "未命名 Prompt A/B", skillId: body.skillId, controlVersion: skill.version, variantPrompt: body.variantPrompt, status: "draft" }) }, { status: 201 });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
