import { NextRequest, NextResponse } from "next/server";

type SkillRequest = {
  skill: { id: string; prompt: string; model: string; temperature: number; maxTokens: number };
  payload: Record<string, unknown>;
  mode: string;
};

function localResponse(mode: string, payload: Record<string, unknown>) {
  const products = (payload.products ?? []) as Array<{ id: string; name: string; description?: string; price?: number; tags?: string[] }>;
  const price = payload.price as { subtotal?: number; finalPrice?: number; activity?: string; coupon?: string } | null;
  if (mode.includes("structure")) {
    const text = String(payload.text ?? "");
    const budget = text.match(/(?:预算|不超过|控制在)\s*(\d+)/)?.[1];
    return { budget: budget ? Number(budget) : null, flavor: text.includes("不辣") ? "不辣" : null, scene: text.includes("追剧") ? "追剧" : text.includes("办公室") ? "办公室" : "日常", dietary: /低糖|孩子/.test(text) ? ["低糖"] : [], wantsPrice: /预算|价格|优惠|券|多少钱/.test(text), provider: "local-demo" };
  }
  if (mode.includes("decision")) return { selectedIds: products.map((p) => p.id), rankingReason: "按需求约束、评分和预算确定候选顺序", tradeoffs: "优先满足明确约束，再兼顾口味丰富度", provider: "local-demo" };
  if (mode.includes("reason")) return { reasons: products.map((p) => ({ productId: p.id, reason: `${p.name}：${p.description ?? "与当前口味和场景匹配"}` })), provider: "local-demo" };
  if (mode.includes("copy")) {
    const lines = products.map((p, i) => `${i + 1}. ${p.name}（¥${Number(p.price).toFixed(2)}）：${p.description ?? "适合当前需求"}`);
    const priceText = price ? `\n这几款合计 ¥${Number(price.subtotal).toFixed(2)}，参加「${price.activity}」并使用「${price.coupon}」后，预计到手 ¥${Number(price.finalPrice).toFixed(2)}。` : "";
    return { text: `给你认真筛了 ${products.length} 款合适的零食：\n${lines.join("\n")}${priceText}\n\n以上价格均按当前活动规则计算，下单前可以再确认一下活动状态哦。`, provider: "local-demo" };
  }
  if (mode.includes("risk")) return { passed: true, level: "low", notes: ["商品均来自查询结果", "价格与优惠引用规则引擎结果", "未发现夸大或绝对化表述"], provider: "local-demo" };
  return { result: "测试通过", input: payload, provider: "local-demo" };
}

function parseJson(content: string) {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { return { text: content }; }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as SkillRequest;
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");

  if (!apiKey) {
    await new Promise((resolve) => setTimeout(resolve, 320));
    return NextResponse.json(localResponse(body.mode, body.payload));
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: body.skill.model,
        temperature: body.skill.temperature,
        max_tokens: body.skill.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: body.skill.prompt },
          { role: "user", content: JSON.stringify(body.payload) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`模型服务返回 ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    return NextResponse.json({ ...parseJson(content), provider: "api" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模型调用失败" }, { status: 502 });
  }
}
