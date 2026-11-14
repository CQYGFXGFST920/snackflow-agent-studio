import { AgentError, errorPayload } from "@/lib/agent/errors";
import { listToolConfigs, updateToolConfig } from "@/lib/agent/adminRepository";
import type { Capability } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return Response.json({ tools: await listToolConfigs() }); }
  catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { id?: string; patch?: Partial<Capability> };
    if (!body.id) throw new AgentError("TOOL_ID_REQUIRED", "缺少 Tool id", 400);
    return Response.json({ tool: await updateToolConfig(body.id, body.patch ?? {}) });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
