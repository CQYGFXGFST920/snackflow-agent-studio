import { errorPayload } from "@/lib/agent/errors";
import { listSkillConfigs } from "@/lib/agent/skillRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ skills: await listSkillConfigs() });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: 500 });
  }
}
