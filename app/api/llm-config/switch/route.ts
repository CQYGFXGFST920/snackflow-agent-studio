import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getLLMConfig, updateLLMConfig } from "@/lib/agent/adminRepository";
import type { ProviderName } from "@/lib/agent/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { provider?: ProviderName };
    if (!body.provider) throw new AgentError("PROVIDER_REQUIRED", "缺少 Provider", 400);
    const current = await getLLMConfig();
    const defaultModel = current.models[body.provider]?.[0] ?? current.defaultModel;
    return Response.json({ config: await updateLLMConfig({ provider: body.provider, defaultModel }) });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
