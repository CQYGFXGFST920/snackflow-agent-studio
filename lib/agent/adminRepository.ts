import { env } from "cloudflare:workers";
import type { Capability, LLMConfig, PlannerConfig, ProviderName } from "./types";
import { AgentError } from "./errors";

const DEFAULT_PLANNER_PROMPT = `你是 SnackOps Planner。只输出 JSON，不要 Markdown。
只能选择输入中 enabled=true 且允许使用的 Skill/Tool，不得发明能力。
价格、优惠、优惠券必须选择价格事实工具；订单和物流必须选择对应工具；风险场景必须包含 risk_check 与 risk_review。
输出 id、selectedSkills、selectedTools、reasoning、mandatoryCapabilities、riskAssessment、resolution、resolutionReason。`;

const BASE_TOOLS: Capability[] = [
  { id: "query_products", name: "查询商品", description: "从本地 products.json 过滤候选商品", version: "1.1.0", enabled: true, category: "catalog", inputSchema: { question: "string", context: "object" }, outputExample: { products: [], count: 0, source: "products.json" } },
  { id: "query_activities", name: "查询优惠活动", description: "读取本地 activities.json 的可用满减活动", version: "1.0.0", enabled: true, category: "price", inputSchema: { question: "string" }, outputExample: { activities: [], source: "activities.json" } },
  { id: "query_coupons", name: "查询优惠券", description: "按商品小计匹配本地 coupons.json", version: "1.0.0", enabled: true, category: "price", inputSchema: { question: "string", context: { products: "Product[]" } }, outputExample: { coupon: null, subtotal: 0 } },
  { id: "calculate_price", name: "计算价格", description: "用确定性代码计算满减、优惠券和最终价", version: "1.2.0", enabled: true, category: "price", inputSchema: { question: "string", context: { products: "Product[]" } }, outputExample: { subtotal: 0, finalPrice: 0, executedBy: "deterministic-code" } },
  { id: "query_order", name: "查询订单", description: "从本地 orders.json 查询订单状态", version: "1.0.0", enabled: true, category: "order", inputSchema: { question: "包含订单号的 string" }, outputExample: { order: null, source: "orders.json" } },
  { id: "query_logistics", name: "查询物流", description: "从本地 logistics.json 查询配送进度", version: "1.0.0", enabled: true, category: "logistics", inputSchema: { question: "string", context: { order: "Order" } }, outputExample: { logistics: null, source: "logistics.json" } },
  { id: "risk_check", name: "风险规则检查", description: "用代码检测诈骗、中奖、转账与敏感凭证", version: "1.1.0", enabled: true, category: "risk", inputSchema: { question: "string" }, outputExample: { level: "low", signals: [], blockedActions: [] } },
];

function db(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new AgentError("ADMIN_STORE_UNAVAILABLE", "管理配置数据库不可用", 503);
  return binding;
}

let initialized: Promise<void> | null = null;
async function ensureSchema() {
  if (!initialized) initialized = (async () => {
    await db().batch([
      db().prepare("CREATE TABLE IF NOT EXISTS agent_tools (id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL)"),
      db().prepare("CREATE TABLE IF NOT EXISTS agent_admin_config (key TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    ]);
    const now = new Date().toISOString();
    await db().batch(BASE_TOOLS.map((tool) => db().prepare("INSERT OR IGNORE INTO agent_tools (id, config_json, updated_at) VALUES (?, ?, ?)").bind(tool.id, JSON.stringify(tool), now)));
    const planner: PlannerConfig = { version: "1.0.0", prompt: DEFAULT_PLANNER_PROMPT, enabledSkills: ["structure_intent", "recommend_decision", "recommend_reason", "service_copy", "risk_review"], enabledTools: BASE_TOOLS.map((item) => item.id), mandatoryCapabilities: ["service_copy", "risk_review"], updatedAt: now };
    const llm: LLMConfig = {
      provider: ((env as unknown as { LLM_PROVIDER?: ProviderName }).LLM_PROVIDER ?? "classroom-fixture"),
      defaultModel: (env as unknown as { LLM_MODEL?: string }).LLM_MODEL ?? "classroom-fixture-v1",
      models: { "classroom-fixture": ["classroom-fixture-v1"], "openai-compatible": ["deepseek-chat"], coze: ["deepseek-chat"] },
      updatedAt: now,
    };
    await db().batch([
      db().prepare("INSERT OR IGNORE INTO agent_admin_config (key, config_json, updated_at) VALUES ('planner', ?, ?)").bind(JSON.stringify(planner), now),
      db().prepare("INSERT OR IGNORE INTO agent_admin_config (key, config_json, updated_at) VALUES ('llm', ?, ?)").bind(JSON.stringify(llm), now),
    ]);
  })().catch((error) => { initialized = null; throw error; });
  return initialized;
}

export async function listToolConfigs(): Promise<Capability[]> {
  await ensureSchema();
  const rows = await db().prepare("SELECT config_json FROM agent_tools ORDER BY rowid").all<{ config_json: string }>();
  return (rows.results ?? []).map((row) => JSON.parse(row.config_json) as Capability);
}

export async function updateToolConfig(id: string, patch: Partial<Capability>) {
  await ensureSchema();
  const row = await db().prepare("SELECT config_json FROM agent_tools WHERE id = ?").bind(id).first<{ config_json: string }>();
  if (!row) throw new AgentError("TOOL_NOT_FOUND", "找不到该 Tool", 404);
  const current = JSON.parse(row.config_json) as Capability;
  const next = { ...current, description: String(patch.description ?? current.description).trim(), enabled: patch.enabled ?? current.enabled };
  if (!next.description || typeof next.enabled !== "boolean") throw new AgentError("TOOL_CONFIG_INVALID", "Tool 描述不能为空且 enabled 必须是布尔值", 400);
  await db().prepare("UPDATE agent_tools SET config_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(next), new Date().toISOString(), id).run();
  return next;
}

async function getConfig<T>(key: string): Promise<T> {
  await ensureSchema();
  const row = await db().prepare("SELECT config_json FROM agent_admin_config WHERE key = ?").bind(key).first<{ config_json: string }>();
  if (!row) throw new AgentError("ADMIN_CONFIG_NOT_FOUND", `找不到配置：${key}`, 404);
  return JSON.parse(row.config_json) as T;
}

async function setConfig<T>(key: string, value: T) {
  await ensureSchema();
  const updatedAt = new Date().toISOString();
  await db().prepare("UPDATE agent_admin_config SET config_json = ?, updated_at = ? WHERE key = ?").bind(JSON.stringify(value), updatedAt, key).run();
  return value;
}

export const getPlannerConfig = () => getConfig<PlannerConfig>("planner");
export async function updatePlannerConfig(patch: Partial<PlannerConfig>) {
  const current = await getPlannerConfig();
  const next: PlannerConfig = {
    ...current, ...patch,
    prompt: String(patch.prompt ?? current.prompt).trim(),
    enabledSkills: Array.isArray(patch.enabledSkills) ? patch.enabledSkills.map(String) : current.enabledSkills,
    enabledTools: Array.isArray(patch.enabledTools) ? patch.enabledTools.map(String) : current.enabledTools,
    mandatoryCapabilities: Array.isArray(patch.mandatoryCapabilities) ? patch.mandatoryCapabilities.map(String) : current.mandatoryCapabilities,
    version: incrementVersion(current.version), updatedAt: new Date().toISOString(),
  };
  if (!next.prompt) throw new AgentError("PLANNER_CONFIG_INVALID", "Planner Prompt 不能为空", 400);
  return setConfig("planner", next);
}

export const getLLMConfig = () => getConfig<LLMConfig>("llm");
export async function updateLLMConfig(patch: Partial<LLMConfig>) {
  const current = await getLLMConfig();
  const next: LLMConfig = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (!["coze", "openai-compatible", "classroom-fixture"].includes(next.provider)) throw new AgentError("LLM_CONFIG_INVALID", "不支持的 Provider", 400);
  if (!next.defaultModel.trim()) throw new AgentError("LLM_CONFIG_INVALID", "默认模型不能为空", 400);
  return setConfig("llm", next);
}

function incrementVersion(version: string) {
  const parts = version.split(".").map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? `${parts[0]}.${parts[1]}.${parts[2] + 1}` : "1.0.1";
}
