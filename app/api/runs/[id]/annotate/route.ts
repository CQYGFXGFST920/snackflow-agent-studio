import { errorPayload } from "@/lib/agent/errors";
import { addAnnotation } from "@/lib/agent/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { label?: string; note?: string };
    if (!body.label?.trim() || !body.note?.trim()) {
      return Response.json({ error: { code: "ANNOTATION_REQUIRED", message: "label 和 note 均不能为空" } }, { status: 400 });
    }
    return Response.json({ run: await addAnnotation(id, { label: body.label.trim(), note: body.note.trim() }) });
  } catch (error) {
    return Response.json({ error: errorPayload(error) }, { status: 500 });
  }
}
