import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getLLMConfig } from "@/lib/agent/adminRepository";
import { createLLMProvider } from "@/lib/agent/provider";
import type { ProviderName } from "@/lib/agent/types";

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const body = await request.json() as { provider?: ProviderName; model?: string };
    const config = await getLLMConfig();
    const provider = createLLMProvider(body.provider ?? config.provider, body.model ?? config.defaultModel);
    const result = await provider.generate({ task: "explain", systemPrompt: "输出 JSON：{ok:true,message:string}", payload: { ping: true }, maxTokens: 100, model: body.model ?? config.defaultModel });
    return Response.json({ ok: true, provider: result.provider, model: result.model, fixture: result.fixture, durationMs: Date.now() - started });
  } catch (error) {
    return Response.json({ ok: false, error: errorPayload(error), durationMs: Date.now() - started }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
