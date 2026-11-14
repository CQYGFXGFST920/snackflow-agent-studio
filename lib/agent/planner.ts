import type { Capability, Plan } from "./types";
import type { createLLMProvider } from "./provider";
import { applyHandoffPolicyToPlan, detectHandoffPolicy } from "./handoffPolicy";

export const DEFAULT_PLANNER_PROMPT = `你是 SnackOps Planner。只输出 JSON，不要 Markdown。
你必须只选择输入中 enabled=true 的 Skill/Tool；不得发明能力。
价格、优惠、优惠券场景必须选择 category=price 的事实工具；订单和物流必须选择对应工具；风险场景必须包含 risk_check 与 risk_review。
输出字段：id、selectedSkills、selectedTools、reasoning(string[])、mandatoryCapabilities、riskAssessment{level,signals,requiresRiskCheck}、resolution(execute|degrade|handoff)、resolutionReason。
无法满足 mandatoryCapabilities 时 resolution 必须为 degrade 或 handoff。`;

function safePlanFallback(
  mandatoryCapabilities: string[],
  reason: string,
): Plan {
  return {
    id: crypto.randomUUID(),
    selectedSkills: [],
    selectedTools: [],
    reasoning: ["Planner 输出无法安全解析", reason],
    mandatoryCapabilities,
    riskAssessment: {
      level: "medium",
      signals: ["计划解析失败"],
      requiresRiskCheck: true,
    },
    resolution: "handoff",
    resolutionReason: "计划解析失败，已安全降级为人工接管",
  };
}

function parsePlan(content: string, mandatoryCapabilities: string[]): Plan {
  try {
    const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<Plan>;
    if (!Array.isArray(parsed.selectedSkills) || !Array.isArray(parsed.selectedTools) || !Array.isArray(parsed.reasoning)) {
      return safePlanFallback(mandatoryCapabilities, "缺少 required plan fields");
    }
    return {
      id: parsed.id ?? crypto.randomUUID(),
      selectedSkills: parsed.selectedSkills,
      selectedTools: parsed.selectedTools,
      reasoning: parsed.reasoning,
      mandatoryCapabilities,
      riskAssessment: parsed.riskAssessment ?? { level: "medium", signals: ["风险字段缺失"], requiresRiskCheck: true },
      resolution: parsed.resolution ?? "handoff",
      resolutionReason: parsed.resolutionReason,
    };
  } catch (error) {
    return safePlanFallback(mandatoryCapabilities, error instanceof Error ? error.message : "未知 JSON 解析错误");
  }
}

export function detectMandatoryCapabilities(userInput: string) {
  const capabilities = new Set<string>(["service_copy", "risk_review"]);
  if (/价格|多少钱|优惠|满减|券|预算|到手价/.test(userInput)) {
    ["query_products", "query_activities", "query_coupons", "calculate_price"].forEach((id) => capabilities.add(id));
  }
  if (/订单|下单|退款|退货/.test(userInput)) capabilities.add("query_order");
  if (/物流|快递|配送|到哪|什么时候到/.test(userInput)) {
    capabilities.add("query_order");
    capabilities.add("query_logistics");
  }
  if (/中奖|转账|验证码|账户|诈骗|陌生链接|返现/.test(userInput)) capabilities.add("risk_check");
  return [...capabilities];
}

export async function createPlan(input: {
  userInput: string;
  conversationHistory: Array<{ role: string; content: string }>;
  availableSkills: Capability[];
  availableTools: Capability[];
  mandatoryCapabilities: string[];
  provider: ReturnType<typeof createLLMProvider>;
  prompt?: string;
}) {
  const response = await input.provider.generate({
    task: "planner",
    systemPrompt: input.prompt ?? DEFAULT_PLANNER_PROMPT,
    payload: {
      userInput: input.userInput,
      conversationHistory: input.conversationHistory,
      availableSkills: input.availableSkills.filter((item) => item.enabled),
      availableTools: input.availableTools.filter((item) => item.enabled),
      mandatoryCapabilities: input.mandatoryCapabilities,
    },
    temperature: 0.1,
    maxTokens: 1400,
  });
  const plan = parsePlan(response.content, input.mandatoryCapabilities);
  const handoff = detectHandoffPolicy(input.userInput);
  if (handoff) {
    applyHandoffPolicyToPlan(
      plan,
      handoff,
      input.availableSkills.filter((item) => item.enabled).map((item) => item.id),
      input.availableTools.filter((item) => item.enabled).map((item) => item.id),
    );
  }
  return { plan, model: response.model };
}
