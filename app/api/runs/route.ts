import { listRuns } from "@/lib/agent/repository";
import { errorPayload } from "@/lib/agent/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return Response.json(await listRuns(limit, offset));
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: 500 });
  }
}
