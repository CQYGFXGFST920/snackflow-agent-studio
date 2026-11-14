import type { EvalRunBatch } from "../agent/types";

export function isBatchStatsConserved(batch: Pick<EvalRunBatch, "total" | "passed" | "failed" | "review" | "errors">) {
  return batch.total === batch.passed + batch.failed + batch.review + batch.errors;
}

export function qualityPassRate(batch: Pick<EvalRunBatch, "passed" | "failed">) {
  const denominator = batch.passed + batch.failed;
  return denominator ? batch.passed / denominator : null;
}
