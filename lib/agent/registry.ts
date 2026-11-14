import skillsConfig from "@/app/data/skills.json";
import type { Capability } from "./types";
import { listSkillConfigs } from "./skillRepository";
import { listToolConfigs } from "./adminRepository";

export const SKILLS: Capability[] = skillsConfig.map((skill) => ({
  ...skill,
  version: "1.0.0",
}));

export const TOOLS: Capability[] = [
  { id: "query_products", name: "查询商品", description: "从商品目录过滤候选商品", version: "1.1.0", enabled: true, category: "catalog" },
  { id: "query_activities", name: "查询优惠活动", description: "读取可用满减活动", version: "1.0.0", enabled: true, category: "price" },
  { id: "query_coupons", name: "查询优惠券", description: "按金额匹配优惠券", version: "1.0.0", enabled: true, category: "price" },
  { id: "calculate_price", name: "计算价格", description: "用代码计算满减与到手价", version: "1.2.0", enabled: true, category: "price" },
  { id: "query_order", name: "查询订单", description: "从本地订单数据查询订单状态", version: "1.0.0", enabled: true, category: "order" },
  { id: "query_logistics", name: "查询物流", description: "从本地物流数据查询配送进度", version: "1.0.0", enabled: true, category: "logistics" },
  { id: "risk_check", name: "风险规则检查", description: "检测诈骗、中奖、转账与敏感承诺", version: "1.1.0", enabled: true, category: "risk" },
];

export async function getCapabilities(overrides?: { disabledSkills?: string[]; disabledTools?: string[] }) {
  const disabledSkills = new Set(overrides?.disabledSkills ?? []);
  const disabledTools = new Set(overrides?.disabledTools ?? []);
  const [configuredSkills, configuredTools] = await Promise.all([listSkillConfigs(), listToolConfigs()]);
  return {
    skills: configuredSkills.map((item) => ({ ...item, enabled: item.enabled && !disabledSkills.has(item.id) })),
    tools: configuredTools.map((item) => ({ ...item, enabled: item.enabled && !disabledTools.has(item.id) })),
  };
}

export function capabilityVersions(items: Capability[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.version]));
}
