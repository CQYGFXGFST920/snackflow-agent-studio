import { AgentError, errorPayload } from "@/lib/agent/errors";
import { getPlannerConfig, updatePlannerConfig } from "@/lib/agent/adminRepository";
import { listSkillConfigs } from "@/lib/agent/skillRepository";
import { listToolConfigs } from "@/lib/agent/adminRepository";
import type { PlannerConfig } from "@/lib/agent/types";

export async function GET() {
  try {
    const [config, skills, tools] = await Promise.all([getPlannerConfig(), listSkillConfigs(), listToolConfigs()]);
    return Response.json({ config, skills, tools });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}

export async function PUT(request: Request) {
  try { return Response.json({ config: await updatePlannerConfig(await request.json() as Partial<PlannerConfig>) }); }
  catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
