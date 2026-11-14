export type HandoffCategory = "refund" | "coupon" | "prize" | "money" | "giveaway";

export interface HandoffDecision {
  required: true;
  category: HandoffCategory;
  reason: string;
  reply: string;
}

type HandoffPlan = {
  selectedSkills: string[];
  selectedTools: string[];
  reasoning: string[];
  riskAssessment: { level: "low" | "medium" | "high"; signals: string[]; requiresRiskCheck: boolean };
  resolution: "execute" | "degrade" | "handoff";
  resolutionReason?: string;
};

const RULES: Array<{ category: HandoffCategory; pattern: RegExp; label: string }> = [
  { category: "refund", pattern: /退款|退货|赔偿|补偿|售后退款|仅退款/, label: "退款、退货或赔付" },
  { category: "coupon", pattern: /优惠券|领券|发券|补券|券码|用券|折扣券/, label: "优惠券处理" },
  { category: "prize", pattern: /中奖|奖金|奖品|返现|抽奖|兑奖/, label: "中奖、奖品或返现" },
  { category: "money", pattern: /转账|打款|给钱|收款|付款给个人|汇款|红包/, label: "资金收付" },
  { category: "giveaway", pattern: /送我|给我送|免费送|白送|赠送|赠品|送东西|送礼品|送礼物|给.*礼品|给.*礼物/, label: "赠送商品或礼品" },
];

export function detectHandoffPolicy(input: string): HandoffDecision | null {
  const matched = RULES.find((rule) => rule.pattern.test(input));
  if (!matched) return null;
  return {
    required: true,
    category: matched.category,
    reason: `请求涉及${matched.label}，需要人工核验身份、订单或活动资格`,
    reply: `你的请求涉及${matched.label}，为避免误操作或错误承诺，我不会直接办理或提供未经核验的结果。已为你转接人工客服，请准备订单号、下单手机号后四位及相关凭证；请勿在聊天中提供密码、验证码或向个人账户转账。`,
  };
}

export function applyHandoffPolicyToPlan<T extends HandoffPlan>(
  plan: T,
  decision: HandoffDecision,
  enabledSkillIds: string[],
  enabledToolIds: string[],
): T {
  const skillSet = new Set(enabledSkillIds);
  const toolSet = new Set(enabledToolIds);
  plan.selectedSkills = ["service_copy", "risk_review"].filter((id) => skillSet.has(id));
  plan.selectedTools = (
    (decision.category === "money" || decision.category === "prize") && toolSet.has("risk_check")
      ? ["risk_check"]
      : []
  );
  plan.resolution = "handoff";
  plan.resolutionReason = decision.reason;
  plan.reasoning = [...plan.reasoning, `确定性人工接管策略：${decision.reason}`];
  plan.riskAssessment = {
    level: decision.category === "money" || decision.category === "prize" ? "high" : "medium",
    signals: [...plan.riskAssessment.signals, decision.reason],
    requiresRiskCheck: true,
  };
  return plan;
}
