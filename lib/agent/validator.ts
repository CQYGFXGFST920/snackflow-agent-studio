import type { Capability, Plan, PlanValidation } from "./types";
import { detectHandoffPolicy } from "./handoffPolicy";

export function validatePlan(plan: Plan, skills: Capability[], tools: Capability[], userInput: string): PlanValidation {
  const errors: PlanValidation["errors"] = [];
  const skillMap = new Map(skills.map((item) => [item.id, item]));
  const toolMap = new Map(tools.map((item) => [item.id, item]));
  const selected = new Set([...plan.selectedSkills, ...plan.selectedTools]);
  const deterministicHandoff = detectHandoffPolicy(userInput) !== null;

  for (const id of plan.selectedSkills) {
    const skill = skillMap.get(id);
    if (!skill) errors.push({ code: "SKILL_NOT_FOUND", message: `计划使用了不存在的 Skill：${id}`, severity: "error" });
    else if (!skill.enabled) errors.push({ code: "SKILL_DISABLED", message: `计划使用了已停用的 Skill：${skill.name}`, severity: "error" });
  }
  for (const id of plan.selectedTools) {
    const tool = toolMap.get(id);
    if (!tool) errors.push({ code: "TOOL_NOT_FOUND", message: `计划使用了不存在的 Tool：${id}`, severity: "error" });
    else if (!tool.enabled) errors.push({ code: "TOOL_DISABLED", message: `计划使用了已停用的 Tool：${tool.name}`, severity: "error" });
  }
  for (const mandatory of plan.mandatoryCapabilities) {
    if (!selected.has(mandatory)) errors.push({ code: "MANDATORY_CAPABILITY_MISSING", message: `遗漏必需能力：${mandatory}`, severity: "error" });
  }
  if (!deterministicHandoff && /价格|多少钱|优惠|满减|券|预算|到手价/.test(userInput)) {
    const priceTool = plan.selectedTools.some((id) => toolMap.get(id)?.category === "price");
    if (!priceTool) errors.push({ code: "PRICE_TOOL_REQUIRED", message: "价格场景缺少价格事实 Tool", severity: "error" });
    if (!plan.selectedTools.includes("calculate_price")) errors.push({ code: "PRICE_CALCULATOR_REQUIRED", message: "价格场景必须调用 calculate_price", severity: "error" });
  }
  if (!deterministicHandoff && /物流|快递|配送|到哪|什么时候到/.test(userInput) && !plan.selectedTools.includes("query_logistics")) {
    errors.push({ code: "LOGISTICS_TOOL_REQUIRED", message: "物流场景缺少 query_logistics", severity: "error" });
  }
  if (!deterministicHandoff && /订单|下单|退款|退货/.test(userInput) && !plan.selectedTools.includes("query_order")) {
    errors.push({ code: "ORDER_TOOL_REQUIRED", message: "订单场景缺少 query_order", severity: "error" });
  }
  const riskScenario = !deterministicHandoff && (/中奖|转账|验证码|账户|诈骗|陌生链接|返现/.test(userInput) || plan.riskAssessment.level === "high");
  if (riskScenario && (!plan.selectedTools.includes("risk_check") || !plan.selectedSkills.includes("risk_review"))) {
    errors.push({ code: "RISK_CHECK_REQUIRED", message: "高风险场景缺少完整风险检查能力，执行已阻断", severity: "error" });
  }
  if (!plan.selectedSkills.includes("risk_review")) {
    errors.push({ code: "FINAL_RISK_REVIEW_REQUIRED", message: "最终回复必须调用 risk_review", severity: "error" });
  }

  const blocked = errors.some((item) => item.severity === "error");
  return { valid: !blocked, blocked, errors, checkedAt: new Date().toISOString() };
}
