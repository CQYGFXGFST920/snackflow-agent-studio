import { AgentError, errorPayload } from "@/lib/agent/errors";
import { updateAnnotation } from "@/lib/agent/opsRepository";
import type { OpsAnnotation } from "@/lib/agent/types";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ annotation: await updateAnnotation((await context.params).id, await request.json() as Partial<OpsAnnotation>) }); }
  catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
