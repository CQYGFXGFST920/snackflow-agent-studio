import assert from "node:assert/strict";

const base = process.env.SNACKOPS_BASE_URL ?? "http://localhost:3000";
const createdIds = [];

try {
  const initial = await api("/api/eval");
  assert.ok(initial.cases.length >= 9, "评测集应已初始化");

  const source = initial.cases[0];
  const copy = { ...source };
  delete copy.id;
  delete copy.createdAt;
  const created = await api("/api/eval/cases", { method: "POST", body: { ...copy, name: "API CRUD 临时用例", question: "API CRUD 测试问题" } }, 201);
  createdIds.push(created.case.id);
  const patched = await api(`/api/eval/cases/${created.case.id}`, { method: "PATCH", body: { expectedKeywords: { mode: "OR", groups: [["测试"]] } } });
  assert.equal(patched.case.expectedKeywords.mode, "OR");
  await api(`/api/eval/cases/${created.case.id}`, { method: "DELETE" }, 204);
  createdIds.pop();

  const exactIds = ["eval-spicy-office", "eval-price-check", "eval-lottery-fraud"];
  const batch = await api("/api/eval/batch/run", { method: "POST", body: { caseIds: exactIds, name: "API 三用例批次", versionLabel: "api-v1", requestKey: `api-${Date.now()}` } }, 202);
  assert.equal(batch.batch.total, 3);
  assert.deepEqual(batch.batch.caseIds, exactIds);
  let current = batch.batch;
  for (let attempt = 0; attempt < 8 && !["done", "error", "cancelled"].includes(current.status); attempt += 1) {
    current = (await api(`/api/eval/batch/${batch.batchId}/advance`, { method: "POST" })).batch;
  }
  assert.equal(current.status, "done");
  assert.deepEqual(current.caseResults.map((item) => item.caseId), exactIds);
  assert.equal(current.total, current.passed + current.failed + current.review + current.errors);
  assert.ok(current.caseResults.every((item) => item.score.evidence.length > 0));

  const couponHandoff = await runAgent({
    userInput: "优惠券不能用，帮我补一张",
    source: "api-handoff-test",
    disabledTools: ["query_products", "query_activities", "query_coupons", "calculate_price", "query_order", "query_logistics", "risk_check"],
  });
  assert.equal(couponHandoff.status, "BLOCKED");
  assert.equal(couponHandoff.plan.resolution, "handoff");
  assert.equal(couponHandoff.handoff.active, true);
  assert.equal(couponHandoff.riskResult.passed, true);
  assert.deepEqual(couponHandoff.steps.map((step) => step.capabilityId), ["planner", "plan_validator", "risk_review"]);

  const invalidSimulation = await raw("/api/agent/run", { method: "POST", body: { userInput: "价格测试", simulateToolError: true } });
  assert.equal(invalidSimulation.response.status, 400);
  assert.equal(invalidSimulation.payload.error.code, "SIMULATE_TOOL_ERROR_INVALID");

  const annotation = await api("/api/annotations", {
    method: "POST",
    body: {
      runId: current.caseResults[0].runId,
      target: "run",
      status: "pending",
      correctness: 4,
      relevance: 4,
      completeness: 4,
      safety: 5,
      tone: 4,
      overall: 4,
      annotator: "API 验证",
      note: "持久化验证",
      addToEval: false,
      addToImprovement: false,
    },
  }, 201);
  const invalidAnnotation = await raw(`/api/annotations/${annotation.annotation.id}`, { method: "PUT", body: { overall: 9, runId: "tampered" } });
  assert.equal(invalidAnnotation.response.status, 400);
  assert.equal(invalidAnnotation.payload.error.code, "ANNOTATION_INVALID");
  const annotations = await api("/api/annotations");
  const persistedAnnotation = annotations.annotations.find((item) => item.id === annotation.annotation.id);
  assert.equal(persistedAnnotation.runId, current.caseResults[0].runId);
  assert.equal(persistedAnnotation.overall, 4);

  const empty = await raw("/api/eval/batch/run", { method: "POST", body: { caseIds: [] } });
  assert.equal(empty.response.status, 400);
  assert.equal(empty.payload.error.code, "EVAL_CASE_IDS_EMPTY");
  const invalid = await raw("/api/eval/batch/run", { method: "POST", body: { caseIds: ["missing-eval-id"] } });
  assert.equal(invalid.response.status, 400);
  assert.deepEqual(invalid.payload.error.details.invalidIds, ["missing-eval-id"]);

  const providerStatus = await api("/api/llm-config");
  if (!providerStatus.environment.coze.configured) {
    const missing = await raw("/api/llm-config/test", { method: "POST", body: { provider: "coze", model: "deepseek-chat" } });
    assert.equal(missing.response.status, 503);
    assert.equal(missing.payload.error.code, "LLM_PROVIDER_CONFIG_MISSING");
    assert.equal(missing.payload.fixture, undefined);
  }

  const skills = await api("/api/skills");
  const skill = skills.skills.find((item) => item.id === "risk_review");
  const updated = await api(`/api/skills/${skill.id}`, { method: "PUT", body: { skill, changeNote: "API 快照验证" } });
  assert.notEqual(updated.skill.version, skill.version);
  const versions = await api(`/api/skills/${skill.id}/versions`);
  assert.ok(versions.versions.some((item) => item.version === skill.version && item.changeNote === "API 快照验证"));

  console.log(JSON.stringify({ ok: true, casesCrud: true, exactCaseIds: exactIds, terminal: current.status, counts: { pass: current.passed, fail: current.failed, review: current.review, error: current.errors }, providerMissing: !providerStatus.environment.coze.configured, skillSnapshot: true, invalidSimulationRejected: true, annotationValidation: true, handoffWithoutBusinessTools: true }));
} finally {
  for (const id of createdIds) await raw(`/api/eval/cases/${id}`, { method: "DELETE" });
}

async function api(path, options = {}, expected = 200) {
  const { response, payload } = await raw(path, options);
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(payload)}`);
  return payload;
}
async function raw(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

async function runAgent(input) {
  const response = await fetch(`${base}/api/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  const events = text.split("\n\n").map((block) => {
    const data = block.split("\n").find((line) => line.startsWith("data: "));
    if (!data) return null;
    try { return JSON.parse(data.slice(6)); } catch { return null; }
  }).filter(Boolean);
  const completed = [...events].reverse().find((event) => event.type === "run.completed");
  assert.ok(completed?.data, "Agent SSE 必须返回 run.completed");
  return completed.data;
}
