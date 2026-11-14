import { AgentError, errorPayload } from "@/lib/agent/errors";
import { deleteEvalCase, updateEvalCase } from "@/lib/eval/repository";
import type { EvalCase } from "@/lib/agent/types";
export async function PATCH(request: Request, context: { params: Promise<{ id:string }> }) {
  try { return Response.json({ case: await updateEvalCase((await context.params).id, await request.json() as Partial<EvalCase>) }); }
  catch (error) { return Response.json({ error:errorPayload(error) }, { status:error instanceof AgentError ? error.status:500 }); }
}
export async function DELETE(_: Request, context: { params: Promise<{ id:string }> }) {
  try { await deleteEvalCase((await context.params).id); return new Response(null,{status:204}); }
  catch (error) { return Response.json({ error:errorPayload(error) }, { status:error instanceof AgentError ? error.status:500 }); }
}
