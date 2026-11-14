import { AgentError, errorPayload } from "@/lib/agent/errors";
import { listToolConfigs } from "@/lib/agent/adminRepository";
import { executeTool } from "@/lib/agent/tools";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  let input: { question?: string; context?: Record<string, unknown>; simulateError?: boolean } = {};
  try {
    const { id } = await context.params;
    input = await request.json() as typeof input;
    const tool = (await listToolConfigs()).find((item) => item.id === id);
    if (!tool) throw new AgentError("TOOL_NOT_FOUND", "找不到该 Tool", 404);
    if (!tool.enabled) throw new AgentError("TOOL_DISABLED", "该 Tool 已停用，不能测试", 422);
    const actualInput = { question: String(input.question ?? ""), context: input.context ?? {}, simulateToolError: input.simulateError ? id : undefined };
    const output = await executeTool(id, actualInput);
    return Response.json({ input: actualInput, output, durationMs: Date.now() - started, status: "SUCCESS" });
  } catch (error) {
    return Response.json({ input, output: null, durationMs: Date.now() - started, status: "ERROR", error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
