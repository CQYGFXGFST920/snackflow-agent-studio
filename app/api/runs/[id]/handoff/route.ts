import { errorPayload } from "@/lib/agent/errors";
import { markHandoff } from "@/lib/agent/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { reason?: string };
    return Response.json({ run: await markHandoff(id, body.reason?.trim() || "客服人工接管") });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: 500 });
  }
}
