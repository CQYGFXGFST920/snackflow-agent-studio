import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getCapabilities } from "@/lib/agent/registry";
import { listEvalBatches, listEvalCases, listEvalRunBatches } from "@/lib/eval/repository";
export async function GET(request: Request) {
  try {
    const enabledOnly = new URL(request.url).searchParams.get("enabled") === "true";
    const [cases, batches, runBatches, capabilities] = await Promise.all([listEvalCases(!enabledOnly), listEvalBatches(), listEvalRunBatches(), getCapabilities()]);
    return Response.json({ cases, batches, runBatches, skills: capabilities.skills, tools: capabilities.tools });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
