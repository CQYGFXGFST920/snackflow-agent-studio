import { getRun } from "@/lib/agent/repository";
import { errorPayload } from "@/lib/agent/errors";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const run = await getRun(id);
    if (!run) return Response.json({ error: { code: "RUN_NOT_FOUND", message: "找不到该运行记录" } }, { status: 404 });
    return Response.json({ run });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: 500 });
  }
}
