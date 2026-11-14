import { executeAgent } from "../agent/executor";
import { errorPayload } from "../agent/errors";
import { getLLMConfig, getPlannerConfig } from "../agent/adminRepository";
import { getCapabilities } from "../agent/registry";
import type { EvalBatchComparison, EvalCase, EvalRunBatch, EvalStatus } from "../agent/types";
import { scoreEvalCase } from "./scorer";
import { isBatchStatsConserved, qualityPassRate } from "./statistics";
import { claimEvalBatchItem, createEvalRunBatch, getEvalRunBatch, releaseEvalBatchItem, updateEvalRunBatch } from "./repository";

export const EVALUATOR_VERSION = "rule-scorer-v1";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function hashValue(value: unknown) {
  const bytes = new TextEncoder().encode(stable(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createBatch(input: {
  requestKey: string;
  name?: string;
  versionLabel?: string;
  changeNote?: string;
  cases: EvalCase[];
  baselineBatchId?: string;
}) {
  const [config, capabilities, planner] = await Promise.all([getLLMConfig(), getCapabilities(), getPlannerConfig()]);
  const now = new Date().toISOString();
  const capabilitySnapshot = structuredClone(capabilities);
  const batch: EvalRunBatch = {
    id: crypto.randomUUID(),
    requestKey: input.requestKey,
    name: input.name?.trim() || `评测批次 ${new Date().toLocaleString("zh-CN")}`,
    versionLabel: input.versionLabel?.trim() || "unlabeled",
    changeNote: input.changeNote?.trim() || "",
    caseIds: input.cases.map((item) => item.id),
    caseSnapshot: structuredClone(input.cases),
    caseSetHash: await hashValue(input.cases),
    skillVersionHash: await hashValue(capabilitySnapshot),
    capabilitySnapshot,
    plannerSnapshot: structuredClone(planner),
    plannerHash: await hashValue(planner),
    evaluatorVersion: EVALUATOR_VERSION,
    evaluatorHash: await hashValue({ version: EVALUATOR_VERSION }),
    evaluationMode: "rule",
    judgeEnabled: false,
    provider: config.provider,
    model: config.defaultModel,
    params: { provider: config.provider, model: config.defaultModel },
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    status: "queued",
    currentIndex: 0,
    total: input.cases.length,
    passed: 0,
    failed: 0,
    review: 0,
    errors: 0,
    caseResults: [],
    fatalError: null,
    baselineBatchId: input.baselineBatchId,
  };
  return createEvalRunBatch(batch);
}

export async function runBatch(batchId: string) {
  let batch = await getEvalRunBatch(batchId);
  while (batch && (batch.status === "queued" || batch.status === "running")) batch = await advanceBatch(batchId);
  return batch;
}

/**
 * Durable, polling-driven execution: one poll advances at most one real Agent run.
 * This avoids relying on an untracked background Promise after the HTTP response.
 */
export async function advanceBatch(batchId: string) {
  const batch = await getEvalRunBatch(batchId);
  if (!batch || !["queued", "running"].includes(batch.status)) return batch;
  if (batch.status === "queued") {
    batch.status = "running";
    batch.startedAt = new Date().toISOString();
    await updateEvalRunBatch(batch);
  }
  const index = batch.currentIndex;
  const evalCase = batch.caseSnapshot[index];
  if (!evalCase) {
    batch.status = "done";
    batch.finishedAt = new Date().toISOString();
    await updateEvalRunBatch(batch);
    return batch;
  }
  if (!await claimEvalBatchItem(batch.id, index)) return getEvalRunBatch(batch.id);
  try {
    const run = await executeAgent({
      userInput: evalCase.question,
      source: "eval-batch",
      conversationId: `eval-batch-${batch.id}-${evalCase.id}`,
      provider: batch.provider,
      model: batch.model,
    }, undefined, {
      skills: batch.capabilitySnapshot.skills,
      tools: batch.capabilitySnapshot.tools,
      planner: batch.plannerSnapshot,
    });
    const score = scoreEvalCase(evalCase, run);
    batch.caseResults.push({
      caseId: evalCase.id,
      caseName: evalCase.name,
      question: evalCase.question,
      finalReply: run.finalReply,
      status: score.status,
      reason: score.reason,
      score,
      provider: run.provider,
      model: run.model,
      durationMs: run.durationMs,
      runId: run.id,
      trace: run.steps,
    });
    increment(batch, score.status);
  } catch (error) {
    const payload = errorPayload(error);
    batch.caseResults.push({
      caseId: evalCase.id,
      caseName: evalCase.name,
      question: evalCase.question,
      finalReply: "",
      status: "ERROR",
      reason: payload.message,
      score: {
        status: "ERROR", passed: false, reason: payload.message, evidence: ["Agent 执行未产生可评分结果"],
        keywordHits: [], keywordMisses: [], forbiddenHits: [], riskIssues: [], capabilityHits: [],
        durationMs: 0, runId: "",
      },
      provider: batch.provider,
      model: batch.model,
      durationMs: 0,
      runId: "",
      trace: [],
    });
    increment(batch, "ERROR");
  }
  batch.currentIndex = index + 1;
  if (batch.currentIndex >= batch.total) {
    batch.status = "done";
    batch.finishedAt = new Date().toISOString();
  }
  await updateEvalRunBatch(batch);
  await releaseEvalBatchItem(batch.id, index);
  return batch;
}

export function assertBatchInvariant(batch: EvalRunBatch) {
  return isBatchStatsConserved(batch);
}

function increment(batch: EvalRunBatch, status: EvalStatus) {
  if (status === "PASS") batch.passed += 1;
  else if (status === "FAIL") batch.failed += 1;
  else if (status === "REVIEW") batch.review += 1;
  else batch.errors += 1;
}

function summary(batch: EvalRunBatch) {
  return {
    passed: batch.passed,
    failed: batch.failed,
    review: batch.review,
    errors: batch.errors,
    qualityPassRate: qualityPassRate(batch),
    averageDurationMs: batch.caseResults.length ? Math.round(batch.caseResults.reduce((sum, item) => sum + item.durationMs, 0) / batch.caseResults.length) : 0,
  };
}

export function compareBatches(left: EvalRunBatch, right: EvalRunBatch): EvalBatchComparison {
  const sameCaseIds = stable([...left.caseIds].sort()) === stable([...right.caseIds].sort());
  const conditions = {
    sameCaseIds,
    sameCaseSnapshot: left.caseSetHash === right.caseSetHash,
    sameEvaluator: left.evaluatorHash === right.evaluatorHash,
    sameSkillVersion: left.skillVersionHash === right.skillVersionHash,
    samePlanner: left.plannerHash === right.plannerHash,
    sameProvider: left.provider === right.provider,
    sameModel: left.model === right.model,
    sameParams: stable(left.params) === stable(right.params),
  };
  const reasons = [
    !conditions.sameCaseIds && "用例 ID 集合不同",
    !conditions.sameCaseSnapshot && "用例快照不同",
    !conditions.sameEvaluator && "评分器版本不同",
    !conditions.sameSkillVersion && "Skill/Tool 版本不同",
    !conditions.samePlanner && "Planner 配置不同",
    !conditions.sameProvider && "Provider 不同",
    !conditions.sameModel && "模型不同",
    !conditions.sameParams && "运行参数不同",
  ].filter(Boolean) as string[];
  const previous = new Map(left.caseResults.map((item) => [item.caseId, item]));
  const current = new Map(right.caseResults.map((item) => [item.caseId, item]));
  const fixedCaseIds: string[] = [];
  const regressedCaseIds: string[] = [];
  const unchangedChangedReplyCaseIds: string[] = [];
  for (const id of left.caseIds.filter((item) => current.has(item))) {
    const before = previous.get(id);
    const after = current.get(id);
    if (!before || !after) continue;
    if (before.status !== "PASS" && after.status === "PASS") fixedCaseIds.push(id);
    if (before.status === "PASS" && after.status !== "PASS") regressedCaseIds.push(id);
    if (before.status === after.status && before.finalReply !== after.finalReply) unchangedChangedReplyCaseIds.push(id);
  }
  const leftSummary = summary(left);
  const rightSummary = summary(right);
  return {
    comparable: reasons.length === 0,
    reasons,
    leftId: left.id,
    rightId: right.id,
    left: leftSummary,
    right: rightSummary,
    fixedCaseIds,
    regressedCaseIds,
    unchangedChangedReplyCaseIds,
    averageDurationDeltaMs: rightSummary.averageDurationMs - leftSummary.averageDurationMs,
    conditions,
  };
}
