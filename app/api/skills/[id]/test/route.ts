import { AgentError, errorPayload } from "@/lib/agent/errors";
import { createLLMProvider } from "@/lib/agent/provider";
import { getSkillConfig } from "@/lib/agent/skillRepository";
import type { Capability, ProviderName } from "@/lib/agent/types";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  try {
    const { id } = await context.params;
    const body = await request.json() as { input?: unknown; provider?: ProviderName; skill?: Capability };
    const stored = await getSkillConfig(id);
    if (!stored) throw new AgentError("SKILL_NOT_FOUND", "找不到该 Skill", 404);
    const skill = body.skill?.id === id ? { ...stored, ...body.skill, id } : stored;
    if (!skill.enabled) throw new AgentError("SKILL_DISABLED", "该 Skill 已停用，不能测试", 422);
    const provider = createLLMProvider(body.provider);
    const result = await provider.generate({
      task: id === "risk_review" ? "risk" : "skill",
      systemPrompt: skill.prompt ?? skill.description,
      payload: id === "risk_review"
        ? { reply: String(body.input ?? ""), facts: {}, ruleRisk: null }
        : { skillId: id, question: String(body.input ?? ""), context: {} },
      temperature: skill.temperature,
      maxTokens: skill.maxTokens,
      model: skill.model,
    });
    let output: unknown;
    try { output = JSON.parse(result.content); } catch { output = { text: result.content }; }
    return Response.json({ output, durationMs: Date.now() - started, provider: result.provider, model: result.model });
  } catch (error) {
    const payload = errorPayload(error);
    return Response.json({ error: payload, durationMs: Date.now() - started }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
