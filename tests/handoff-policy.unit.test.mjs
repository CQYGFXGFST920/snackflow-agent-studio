import test from "node:test";
import assert from "node:assert/strict";
import { applyHandoffPolicyToPlan, detectHandoffPolicy } from "../lib/agent/handoffPolicy.ts";

for (const [input, category] of [
  ["零食过期了，给我退款", "refund"],
  ["优惠券怎么补发", "coupon"],
  ["有人说我中奖了，要兑奖", "prize"],
  ["让我给个人账户转账", "money"],
  ["可以免费送我一个礼品吗", "giveaway"],
]) {
  test(`人工接管：${input}`, () => {
    const result = detectHandoffPolicy(input);
    assert.equal(result?.required, true);
    assert.equal(result?.category, category);
    assert.match(result?.reply ?? "", /人工客服/);
  });
}

test("正常购买礼盒送同事不误判为平台赠送", () => {
  assert.equal(detectHandoffPolicy("我想买一份礼盒送同事"), null);
});

test("正常预算推荐不需要人工", () => {
  assert.equal(detectHandoffPolicy("预算30元推荐小孩吃的零食"), null);
});

test("真实 Planner 漏选能力时，人工接管策略补齐已启用的风控能力", async () => {
  const plan = {
    selectedSkills: [],
    selectedTools: [],
    reasoning: ["模拟模型漏选"],
    riskAssessment: { level: "low", signals: [], requiresRiskCheck: false },
    resolution: "execute",
  };
  const decision = detectHandoffPolicy("有人说我中奖了，让我给钱");
  assert.ok(decision);
  applyHandoffPolicyToPlan(plan, decision, ["service_copy", "risk_review"], ["risk_check"]);
  assert.equal(plan.resolution, "handoff");
  assert.deepEqual(plan.selectedSkills, ["service_copy", "risk_review"]);
  assert.deepEqual(plan.selectedTools, ["risk_check"]);
});
