import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getLLMConfig, updateLLMConfig } from "@/lib/agent/adminRepository";
import type { LLMConfig } from "@/lib/agent/types";

function status() {
  return {
    "classroom-fixture": { configured: true, required: [] },
    "openai-compatible": { configured: !!process.env.OPENAI_API_KEY && !!process.env.OPENAI_BASE_URL && !!process.env.LLM_MODEL, required: ["OPENAI_API_KEY", "OPENAI_BASE_URL", "LLM_MODEL"].filter((key) => !process.env[key]) },
    coze: { configured: !!process.env.COZE_WORKLOAD_IDENTITY_API_KEY && !!process.env.COZE_INTEGRATION_BASE_URL && !!process.env.COZE_INTEGRATION_MODEL_BASE_URL && !!process.env.LLM_MODEL, required: ["COZE_WORKLOAD_IDENTITY_API_KEY", "COZE_INTEGRATION_BASE_URL", "COZE_INTEGRATION_MODEL_BASE_URL", "LLM_MODEL"].filter((key) => !process.env[key]) },
  };
}

export async function GET() {
  try { return Response.json({ config: await getLLMConfig(), environment: status() }); }
  catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}

export async function PUT(request: Request) {
  try { return Response.json({ config: await updateLLMConfig(await request.json() as Partial<LLMConfig>), environment: status() }); }
  catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
