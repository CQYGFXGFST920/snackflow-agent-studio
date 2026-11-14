import productsData from "@/app/data/products.json";
import activitiesData from "@/app/data/activities.json";
import couponsData from "@/app/data/coupons.json";
import ordersData from "@/app/data/orders.json";
import logisticsData from "@/app/data/logistics.json";
import { AgentError } from "./errors";
import { parseBudget, parseRequestedCount, selectProductsWithinBudget } from "./productSelection";

type Context = Record<string, unknown>;
type Product = (typeof productsData)[number];

function intentFrom(text: string) {
  return {
    budget: parseBudget(text),
    requestedCount: parseRequestedCount(text),
    requestedCountExplicit: /(?:\d+|[一二两三四五六七八九十])\s*(?:款|种|包|件)/.test(text),
    noSpicy: text.includes("不辣"),
    spicy: !text.includes("不辣") && text.includes("辣"),
    lowSugar: /低糖|少糖|孩子/.test(text),
  };
}

export async function executeTool(id: string, input: { question: string; context: Context; simulateToolError?: string }) {
  if (input.simulateToolError === id || input.question.includes(`[TOOL_ERROR:${id}]`)) {
    throw new AgentError("TOOL_EXECUTION_FAILED", `已按验收条件模拟 Tool 失败：${id}`, 502, { toolId: id, simulated: true });
  }
  const intent = intentFrom(input.question);
  if (id === "query_products") {
    const candidates = productsData
      .filter((p) => !intent.noSpicy || !p.tags.includes("辣"))
      .filter((p) => !intent.spicy || p.tags.includes("辣"))
      .filter((p) => !intent.lowSugar || p.tags.includes("低糖"))
      .filter((p) => intent.budget === null || p.price <= intent.budget);
    const products = selectProductsWithinBudget(candidates, intent.budget, intent.requestedCount);
    const subtotal = products.reduce((sum, item) => sum + item.price, 0);
    return {
      products,
      count: products.length,
      source: "products.json",
      selection: {
        budget: intent.budget,
        requestedCount: intent.requestedCount,
        selectedCount: products.length,
        subtotal,
        withinBudget: intent.budget === null || subtotal <= intent.budget,
        limitedByBudget: intent.requestedCountExplicit && intent.budget !== null && products.length < Math.min(intent.requestedCount, candidates.length),
      },
    };
  }
  if (id === "query_activities") return { activities: activitiesData.filter((item) => item.enabled), source: "activities.json" };
  if (id === "query_coupons") {
    const products = (input.context.products ?? []) as Product[];
    const subtotal = products.reduce((sum, item) => sum + item.price, 0);
    const coupon = couponsData.filter((item) => item.enabled && subtotal >= item.threshold).sort((a, b) => b.discount - a.discount)[0] ?? null;
    return { coupon, subtotal, source: "coupons.json" };
  }
  if (id === "calculate_price") {
    const products = (input.context.products ?? []) as Product[];
    const subtotal = products.reduce((sum, item) => sum + item.price, 0);
    const activity = activitiesData.filter((item) => item.enabled && subtotal >= item.threshold).sort((a, b) => b.discount - a.discount)[0] ?? null;
    const coupon = couponsData.filter((item) => item.enabled && subtotal - (activity?.discount ?? 0) >= item.threshold).sort((a, b) => b.discount - a.discount)[0] ?? null;
    const finalPrice = Math.max(0, subtotal - (activity?.discount ?? 0) - (coupon?.discount ?? 0));
    const budget = parseBudget(input.question);
    if (budget !== null && finalPrice > budget) {
      throw new AgentError("BUDGET_EXCEEDED", `计算后的到手价 ¥${finalPrice.toFixed(2)} 超过预算 ¥${budget.toFixed(2)}`, 422, {
        budget,
        finalPrice,
        subtotal,
      });
    }
    return {
      subtotal,
      activity: activity?.name ?? "无可用活动",
      activityDiscount: activity?.discount ?? 0,
      coupon: coupon?.name ?? "未使用优惠券",
      couponDiscount: coupon?.discount ?? 0,
      finalPrice,
      budget,
      withinBudget: budget === null || finalPrice <= budget,
      formula: `${subtotal.toFixed(2)} - ${(activity?.discount ?? 0).toFixed(2)} - ${(coupon?.discount ?? 0).toFixed(2)} = ${finalPrice.toFixed(2)}`,
      executedBy: "deterministic-code",
    };
  }
  if (id === "query_order") {
    const orderId = input.question.match(/(?:订单号?|编号)[：:\s]*(SN\d{6})/i)?.[1]?.toUpperCase() ?? "SN240701";
    const order = ordersData.find((item) => item.id === orderId) ?? null;
    return { order, source: "orders.json", query: orderId };
  }
  if (id === "query_logistics") {
    const order = input.context.order as { id?: string } | undefined;
    const orderId = order?.id ?? input.question.match(/(?:订单号?|编号)[：:\s]*(SN\d{6})/i)?.[1]?.toUpperCase() ?? "SN240701";
    const logistics = logisticsData.find((item) => item.orderId === orderId) ?? null;
    return { logistics, source: "logistics.json", query: orderId };
  }
  if (id === "risk_check") {
    const signals = [
      /中奖|返现/.test(input.question) && "诱导中奖/返现",
      /转账|付款到个人/.test(input.question) && "要求转账",
      /验证码|账户密码/.test(input.question) && "索取敏感凭证",
      /陌生链接|点击链接/.test(input.question) && "引导点击陌生链接",
    ].filter(Boolean) as string[];
    return { level: signals.length ? "high" : "low", signals, blockedActions: signals.length ? ["转账", "提供验证码", "点击陌生链接"] : [] };
  }
  throw new AgentError("TOOL_NOT_IMPLEMENTED", `Tool 未实现：${id}`, 500);
}
