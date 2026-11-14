import { AgentError, errorPayload } from "@/lib/agent/errors";
import { updateSkillConfig } from "@/lib/agent/skillRepository";
import type { Capability } from "@/lib/agent/types";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as Partial<Capability> & { skill?: Partial<Capability>; changeNote?: string };
    return Response.json({ skill: await updateSkillConfig(id, body.skill ?? body, body.changeNote) });
  } catch (error) {
    const payload = errorPayload(error);
    return Response.json({ error: payload }, { status: error instanceof AgentError ? error.status : 500 });
  }
}
