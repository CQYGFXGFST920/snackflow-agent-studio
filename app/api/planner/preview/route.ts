import { AgentError, errorPayload } from "@/lib/agent/errors";
import { createPlan, detectMandatoryCapabilities } from "@/lib/agent/planner";
import { createLLMProvider } from "@/lib/agent/provider";
import { getCapabilities } from "@/lib/agent/registry";
import { getLLMConfig, getPlannerConfig } from "@/lib/agent/adminRepository";
import { validatePlan } from "@/lib/agent/validator";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { question?: string };
    if (!body.question?.trim()) throw new AgentError("QUESTION_REQUIRED", "请输入测试问题", 400);
    const [config, llm, all] = await Promise.all([getPlannerConfig(), getLLMConfig(), getCapabilities()]);
    const skills = all.skills.map((item) => ({ ...item, enabled: item.enabled && (!config.enabledSkills.length || config.enabledSkills.includes(item.id)) }));
    const tools = all.tools.map((item) => ({ ...item, enabled: item.enabled && config.enabledTools.includes(item.id) }));
    const mandatory = [...new Set([...detectMandatoryCapabilities(body.question), ...config.mandatoryCapabilities])];
    const provider = createLLMProvider(llm.provider, llm.defaultModel);
    const result = await createPlan({ userInput: body.question, conversationHistory: [], availableSkills: skills, availableTools: tools, mandatoryCapabilities: mandatory, provider, prompt: config.prompt });
    const validation = validatePlan(result.plan, skills, tools, body.question);
    return Response.json({ plan: result.plan, validation, provider: provider.name, model: result.model });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
