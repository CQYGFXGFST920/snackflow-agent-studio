import { AgentError, errorPayload } from "@/lib/agent/errors";
import { listRuns } from "@/lib/agent/repository";
import { listAnnotations, listImprovements, listRatings, listABTests } from "@/lib/agent/opsRepository";
export async function GET() {
  try {
    const [{ runs, total }, ratings, annotations, improvements, abTests] = await Promise.all([listRuns(100, 0), listRatings(), listAnnotations(), listImprovements(), listABTests()]);
    const success = runs.filter((run) => run.status === "COMPLETED").length;
    const failedSteps = runs.flatMap((run) => run.steps.filter((step) => step.status === "ERROR").map((step) => ({ runId: run.id, capabilityId: step.capabilityId, error: step.error, createdAt: run.createdAt })));
    const riskDistribution = runs.reduce<Record<string, number>>((acc, run) => { const level = run.riskResult?.level ?? "unknown"; acc[level] = (acc[level] ?? 0) + 1; return acc; }, {});
    return Response.json({
      metrics: { total, successRate: runs.length ? success / runs.length : 0, averageDurationMs: runs.length ? Math.round(runs.reduce((sum, run) => sum + run.durationMs, 0) / runs.length) : 0, failedSteps, riskDistribution, handoffRate: runs.length ? runs.filter((run) => run.handoff.active || run.status === "HANDOFF").length / runs.length : 0 },
      runs: runs.slice(0, 20), ratings, annotations, improvements, abTests,
    });
  } catch (error) { return Response.json({ error: errorPayload(error) }, { status: error instanceof AgentError ? error.status : 500 }); }
}
