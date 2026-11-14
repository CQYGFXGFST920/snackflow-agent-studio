import type { LLMGenerateInput, LLMResult, ProviderName } from "./types";
import { AgentError } from "./errors";

function selectedProvider(requested?: ProviderName): ProviderName {
  const configured = requested ?? process.env.LLM_PROVIDER;
  if (!configured) return "classroom-fixture";
  if (!["coze", "openai-compatible", "classroom-fixture"].includes(configured)) {
    throw new AgentError("LLM_PROVIDER_INVALID", `不支持的 LLM Provider：${configured}`, 400, {
      allowed: ["coze", "openai-compatible", "classroom-fixture"],
    });
  }
  return configured as ProviderName;
}

function fixturePlan(payload: Record<string, unknown>) {
  const input = String(payload.userInput ?? "");
  const availableSkills = (payload.availableSkills ?? []) as Array<{ id: string }>;
  const availableTools = (payload.availableTools ?? []) as Array<{ id: string; category?: string }>;
  const skillIds = new Set(availableSkills.map((item) => item.id));
  const toolIds = new Set(availableTools.map((item) => item.id));
  const price = /价格|多少钱|优惠|满减|券|预算|到手价/.test(input);
  const order = /订单|下单|退款|退货/.test(input);
  const logistics = /物流|快递|配送|到哪|什么时候到/.test(input);
  const risk = /中奖|转账|验证码|账户|诈骗|链接|返现/.test(input);
  const selectedTools = new Set<string>();
  const selectedSkills = new Set<string>();
  if (/推荐|零食|买|预算|口味/.test(input)) {
    ["query_products"].filter((id) => toolIds.has(id)).forEach((id) => selectedTools.add(id));
    ["structure_intent", "recommend_decision", "recommend_reason"].filter((id) => skillIds.has(id)).forEach((id) => selectedSkills.add(id));
  }
  if (price) ["query_products", "query_activities", "query_coupons", "calculate_price"].filter((id) => toolIds.has(id)).forEach((id) => selectedTools.add(id));
  if (order) ["query_order"].filter((id) => toolIds.has(id)).forEach((id) => selectedTools.add(id));
  if (logistics) ["query_order", "query_logistics"].filter((id) => toolIds.has(id)).forEach((id) => selectedTools.add(id));
  if (risk) ["risk_check"].filter((id) => toolIds.has(id)).forEach((id) => selectedTools.add(id));
  ["service_copy", "risk_review"].filter((id) => skillIds.has(id)).forEach((id) => selectedSkills.add(id));
  const mandatory = (payload.mandatoryCapabilities ?? []) as string[];
  const allSelected = new Set([...selectedSkills, ...selectedTools]);
  const missing = mandatory.filter((id) => !allSelected.has(id));
  return {
    id: crypto.randomUUID(),
    selectedSkills: [...selectedSkills],
    selectedTools: [...selectedTools],
    reasoning: [
      "课堂 fixture 根据意图信号生成结构化计划",
      price ? "检测到价格意图，选择价格事实工具链" : "未检测到价格计算意图",
      order || logistics ? "检测到订单或物流意图，选择对应查询工具" : "无需订单物流能力",
      risk ? "检测到高风险信号，加入风险规则检查" : "保留最终风险审核",
    ],
    mandatoryCapabilities: mandatory,
    riskAssessment: {
      level: risk ? "high" : "low",
      signals: risk ? ["中奖/转账/验证码等潜在诈骗语义"] : [],
      requiresRiskCheck: true,
    },
    resolution: missing.length ? "handoff" : "execute",
    resolutionReason: missing.length ? `缺少必需能力：${missing.join("、")}` : undefined,
  };
}

function fixtureSkill(payload: Record<string, unknown>) {
  const skillId = String(payload.skillId ?? "");
  const context = payload.context as Record<string, unknown> ?? {};
  if (skillId === "structure_intent") return { structured: context.intent ?? {}, confidence: 0.94 };
  if (skillId === "recommend_decision") return { selectedProductIds: ((context.products ?? []) as Array<{ id: string }>).map((p) => p.id), scoreMethod: "约束匹配 + 商品评分" };
  if (skillId === "recommend_reason") return { reasons: ((context.products ?? []) as Array<{ id: string; name: string; description: string }>).map((p) => ({ productId: p.id, reason: `${p.name}：${p.description}` })) };
  if (skillId === "service_copy") return { draftReady: true, tone: "友好、克制、事实优先" };
  return { completed: true, skillId };
}

function fixtureReply(payload: Record<string, unknown>) {
  const context = payload.context as Record<string, unknown> ?? {};
  const products = (context.products ?? []) as Array<{ name: string; price: number; description: string }>;
  const price = context.price as { subtotal: number; finalPrice: number; activity: string; coupon: string } | undefined;
  const selection = context.productSelection as { budget?: number | null; requestedCount?: number; selectedCount?: number; limitedByBudget?: boolean } | undefined;
  const order = context.order as { id?: string; status?: string } | undefined;
  const logistics = context.logistics as { status?: string; latest?: string } | undefined;
  const risk = context.ruleRisk as { level?: string; signals?: string[] } | undefined;
  if (risk?.level === "high") {
    return { text: "这类“中奖后要求转账、提供验证码或点击陌生链接”的信息存在诈骗风险。请不要付款、不要透露验证码，也不要点击不明链接；建议通过平台官方客服入口核验。" };
  }
  if (logistics) return { text: `已查询到物流状态：${logistics.status}。最新进度：${logistics.latest}。如长时间没有更新，我可以为你转人工继续核查。` };
  if (order) return { text: `订单 ${order.id ?? ""} 当前状态为“${order.status ?? "待核实"}”。以上信息来自订单查询工具。` };
  if (products.length) {
    const lines = products.map((p, index) => `${index + 1}. ${p.name}（¥${p.price.toFixed(2)}）：${p.description}`);
    const priceLine = price ? `\n按当前规则，原价 ¥${price.subtotal.toFixed(2)}，使用「${price.activity}」与「${price.coupon}」后预计 ¥${price.finalPrice.toFixed(2)}。` : "";
    const budgetLine = selection?.limitedByBudget && selection.budget !== null
      ? `预算 ¥${selection.budget?.toFixed(2)} 内当前可匹配 ${selection.selectedCount} 款，无法在不超预算的前提下凑满 ${selection.requestedCount} 款，因此没有强行追加商品。\n`
      : "";
    return { text: `${budgetLine}为你筛选了这些零食：\n${lines.join("\n")}${priceLine}\n活动与库存可能变化，请以下单页实时信息为准。` };
  }
  if (selection?.budget !== null && selection?.budget !== undefined) {
    return { text: `当前目录中没有符合条件且单件价格不超过 ¥${selection.budget.toFixed(2)} 的商品。你可以提高预算、放宽口味条件，或转人工继续查找。` };
  }
  return { text: "我已经完成需求分析，但当前没有足够的已验证商品或订单信息。建议补充预算、口味或订单号，也可以转人工处理。" };
}

function fixtureRisk(payload: Record<string, unknown>) {
  const reply = String(payload.reply ?? "");
  const ruleRisk = payload.ruleRisk as { level?: string; signals?: string[] } | undefined;
  const high = ruleRisk?.level === "high";
  const unsafe = /保证中奖|绝对安全|先转账|提供验证码/.test(reply);
  return {
    passed: !unsafe,
    level: high ? "high" : unsafe ? "medium" : "low",
    signals: [...(ruleRisk?.signals ?? []), ...(unsafe ? ["回复包含禁止承诺或危险指引"] : [])],
    safeReply: unsafe ? "该请求存在风险，请勿转账、泄露验证码或点击陌生链接。建议通过官方渠道核验。" : undefined,
  };
}

function fixtureExplain(payload: Record<string, unknown>) {
  return {
    summary: "本次运行由 Planner 选择能力，经 Validator 校验后由 Executor 顺序执行，最终回复通过独立风险审核。",
    evidence: payload,
  };
}

function fixtureGenerate(input: LLMGenerateInput): LLMResult {
  const payload = input.payload as Record<string, unknown>;
  const result = input.task === "planner" ? fixturePlan(payload)
    : input.task === "skill" ? fixtureSkill(payload)
      : input.task === "reply" ? fixtureReply(payload)
        : input.task === "risk" ? fixtureRisk(payload)
          : fixtureExplain(payload);
  return {
    content: JSON.stringify(result),
    provider: "classroom-fixture",
    model: "classroom-fixture-v1",
    fixture: true,
  };
}

async function callOpenAICompatible(input: LLMGenerateInput, defaultModel?: string): Promise<LLMResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = input.model ?? defaultModel ?? process.env.LLM_MODEL;
  const missing = [
    !apiKey && "OPENAI_API_KEY",
    !baseUrl && "OPENAI_BASE_URL",
    !process.env.LLM_MODEL && "LLM_MODEL",
  ].filter(Boolean);
  if (missing.length) {
    throw new AgentError("LLM_PROVIDER_CONFIG_MISSING", `OpenAI 兼容模式缺少配置：${missing.join("、")}。如需无密钥演示，请设置 LLM_PROVIDER=classroom-fixture。`, 503, { provider: "openai-compatible", missing });
  }
  const response = await fetch(`${baseUrl!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: JSON.stringify(input.payload) },
      ],
    }),
  });
  if (!response.ok) throw new AgentError("LLM_REQUEST_FAILED", `模型服务返回 HTTP ${response.status}`, 502, { provider: "openai-compatible" });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return { content: data.choices?.[0]?.message?.content ?? "{}", provider: "openai-compatible", model: model!, fixture: false };
}

async function callCoze(input: LLMGenerateInput, defaultModel?: string): Promise<LLMResult> {
  const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  const baseUrl = process.env.COZE_INTEGRATION_BASE_URL;
  const modelBaseUrl = process.env.COZE_INTEGRATION_MODEL_BASE_URL;
  const model = input.model ?? defaultModel ?? process.env.LLM_MODEL;
  const missing = [!apiKey && "COZE_WORKLOAD_IDENTITY_API_KEY", !baseUrl && "COZE_INTEGRATION_BASE_URL", !modelBaseUrl && "COZE_INTEGRATION_MODEL_BASE_URL", !process.env.LLM_MODEL && "LLM_MODEL"].filter(Boolean);
  if (missing.length) {
    throw new AgentError("LLM_PROVIDER_CONFIG_MISSING", `Coze 模式缺少配置：${missing.join("、")}。如需无密钥演示，请设置 LLM_PROVIDER=classroom-fixture。`, 503, { provider: "coze", missing });
  }
  const { Config, LLMClient } = await import("coze-coding-dev-sdk");
  const client = new LLMClient(new Config({ apiKey, baseUrl, modelBaseUrl }));
  const response = await client.invoke([
    { role: "system", content: input.systemPrompt },
    { role: "user", content: JSON.stringify(input.payload) },
  ], { model, temperature: input.temperature ?? 0.2, streaming: false });
  return { content: response.content, provider: "coze", model: model ?? "coze-default", fixture: false };
}

export function createLLMProvider(requested?: ProviderName, defaultModel?: string) {
  const provider = selectedProvider(requested);
  return {
    name: provider,
    defaultModel: provider === "classroom-fixture" ? "classroom-fixture-v1" : defaultModel ?? process.env.LLM_MODEL ?? "provider-default",
    async generate(input: LLMGenerateInput) {
      if (provider === "classroom-fixture") return fixtureGenerate(input);
      if (provider === "openai-compatible") return callOpenAICompatible(input, defaultModel);
      return callCoze(input, defaultModel);
    },
  };
}
