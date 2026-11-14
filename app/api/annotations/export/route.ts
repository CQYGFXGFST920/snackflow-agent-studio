import { listAnnotations } from "@/lib/agent/opsRepository";
export async function GET() {
  const rows = await listAnnotations();
  const headers = ["id","runId","target","status","correctness","relevance","completeness","safety","tone","overall","annotator","note","addToEval","addToImprovement","createdAt","updatedAt"];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key as keyof typeof row])).join(","))].join("\n");
  return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="snackops-annotations.csv"' } });
}
function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
