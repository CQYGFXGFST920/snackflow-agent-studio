import { createLLMProvider } from "@/lib/agent/provider";
import { errorPayload } from "@/lib/agent/errors";
import { getRun } from "@/lib/agent/repository";
import type { ProviderName } from "@/lib/agent/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { runId?: string; provider?: ProviderName; focus?: "plan" | "risk" | "all" };
    if (!body.runId) return Response.json({ error: { code: "RUN_ID_REQUIRED", message: "缺少 runId" } }, { status: 400 });
    const run = await getRun(body.runId);
    if (!run) return Response.json({ error: { code: "RUN_NOT_FOUND", message: "找不到运行记录" } }, { status: 404 });
    const provider = createLLMProvider(body.provider ?? run.provider);
    const result = await provider.generate({
      task: "explain",
      systemPrompt: "用简洁中文解释 Agent 运行、计划选择或风险判断。必须引用 Trace 中的真实证据。输出 JSON。",
      payload: { focus: body.focus ?? "all", plan: run.plan, validation: run.validation, steps: run.steps, riskResult: run.riskResult },
      temperature: 0.1,
      maxTokens: 900,
    });
    return Response.json({ explanation: JSON.parse(result.content), provider: result.provider, model: result.model });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: 500 });
  }
}
