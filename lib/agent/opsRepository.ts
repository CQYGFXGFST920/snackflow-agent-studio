import { env } from "cloudflare:workers";
import { AgentError } from "./errors";
import type { ABTest, Improvement, OpsAnnotation, ServiceRating } from "./types";

function db(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new AgentError("OPS_STORE_UNAVAILABLE", "运营数据存储不可用", 503);
  return binding;
}

let initialized: Promise<void> | null = null;
async function ensureSchema() {
  if (!initialized) initialized = db().batch([
    db().prepare("CREATE TABLE IF NOT EXISTS ops_ratings (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, score INTEGER NOT NULL, problem_type TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL)"),
    db().prepare("CREATE INDEX IF NOT EXISTS ops_ratings_run_idx ON ops_ratings(run_id)"),
    db().prepare("CREATE TABLE IF NOT EXISTS ops_annotations (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL)"),
    db().prepare("CREATE INDEX IF NOT EXISTS ops_annotations_run_idx ON ops_annotations(run_id)"),
    db().prepare("CREATE TABLE IF NOT EXISTS ops_improvements (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL)"),
    db().prepare("CREATE TABLE IF NOT EXISTS ops_ab_tests (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL)"),
  ]).then(() => undefined).catch((error) => { initialized = null; throw error; });
  return initialized;
}

export async function listRatings(filters?: { score?: number; problemType?: string; from?: string; to?: string }) {
  await ensureSchema();
  const rows = await db().prepare("SELECT data_json FROM ops_ratings ORDER BY created_at DESC").all<{ data_json: string }>();
  return (rows.results ?? []).map((row) => JSON.parse(row.data_json) as ServiceRating).filter((item) =>
    (!filters?.score || item.score === filters.score) &&
    (!filters?.problemType || item.problemType === filters.problemType) &&
    (!filters?.from || item.createdAt >= filters.from) &&
    (!filters?.to || item.createdAt <= filters.to));
}

export async function createRating(input: Omit<ServiceRating, "id" | "createdAt">) {
  await ensureSchema();
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) throw new AgentError("RATING_INVALID", "评分必须是 1–5 的整数", 400);
  const rating: ServiceRating = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await db().prepare("INSERT INTO ops_ratings (id, run_id, score, problem_type, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(rating.id, rating.runId, rating.score, rating.problemType, rating.createdAt, JSON.stringify(rating)).run();
  return rating;
}

export async function listAnnotations() {
  await ensureSchema();
  const rows = await db().prepare("SELECT data_json FROM ops_annotations ORDER BY created_at DESC").all<{ data_json: string }>();
  return (rows.results ?? []).map((row) => JSON.parse(row.data_json) as OpsAnnotation);
}

export async function createAnnotation(input: Omit<OpsAnnotation, "id" | "createdAt" | "updatedAt">) {
  await ensureSchema();
  validateAnnotation(input);
  const now = new Date().toISOString();
  const item: OpsAnnotation = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await db().prepare("INSERT INTO ops_annotations (id, run_id, status, created_at, updated_at, data_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(item.id, item.runId, item.status, now, now, JSON.stringify(item)).run();
  return item;
}

export async function updateAnnotation(id: string, patch: Partial<OpsAnnotation>) {
  await ensureSchema();
  const row = await db().prepare("SELECT data_json FROM ops_annotations WHERE id = ?").bind(id).first<{ data_json: string }>();
  if (!row) throw new AgentError("ANNOTATION_NOT_FOUND", "找不到标注", 404);
  const current = JSON.parse(row.data_json) as OpsAnnotation;
  const allowedPatch = {
    status: patch.status ?? current.status,
    correctness: patch.correctness ?? current.correctness,
    relevance: patch.relevance ?? current.relevance,
    completeness: patch.completeness ?? current.completeness,
    safety: patch.safety ?? current.safety,
    tone: patch.tone ?? current.tone,
    overall: patch.overall ?? current.overall,
    annotator: patch.annotator ?? current.annotator,
    note: patch.note ?? current.note,
    addToEval: patch.addToEval ?? current.addToEval,
    addToImprovement: patch.addToImprovement ?? current.addToImprovement,
  };
  validateAnnotation(allowedPatch);
  const next: OpsAnnotation = { ...current, ...allowedPatch, id, runId: current.runId, target: current.target, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  await db().prepare("UPDATE ops_annotations SET status = ?, updated_at = ?, data_json = ? WHERE id = ?").bind(next.status, next.updatedAt, JSON.stringify(next), id).run();
  return next;
}

function validateAnnotation(input: Partial<OpsAnnotation>) {
  if (!["pending", "accepted", "rejected"].includes(String(input.status))) {
    throw new AgentError("ANNOTATION_INVALID", "status 必须是 pending、accepted 或 rejected", 400);
  }
  for (const key of ["correctness", "relevance", "completeness", "safety", "tone", "overall"] as const) {
    if (!Number.isInteger(input[key]) || input[key]! < 1 || input[key]! > 5) {
      throw new AgentError("ANNOTATION_INVALID", `${key} 必须是 1–5 的整数`, 400);
    }
  }
  if (typeof input.addToEval !== "boolean" || typeof input.addToImprovement !== "boolean") {
    throw new AgentError("ANNOTATION_INVALID", "addToEval 和 addToImprovement 必须是布尔值", 400);
  }
}

export async function listImprovements() {
  await ensureSchema();
  const rows = await db().prepare("SELECT data_json FROM ops_improvements ORDER BY created_at DESC").all<{ data_json: string }>();
  return (rows.results ?? []).map((row) => JSON.parse(row.data_json) as Improvement);
}

export async function saveImprovement(item: Improvement) {
  await ensureSchema();
  await db().prepare("INSERT INTO ops_improvements (id, status, created_at, data_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data_json = excluded.data_json")
    .bind(item.id, item.status, item.createdAt, JSON.stringify(item)).run();
  return item;
}
export async function getImprovement(id: string) {
  await ensureSchema();
  const row = await db().prepare("SELECT data_json FROM ops_improvements WHERE id = ?").bind(id).first<{ data_json: string }>();
  return row ? JSON.parse(row.data_json) as Improvement : null;
}

export async function listABTests() {
  await ensureSchema();
  const rows = await db().prepare("SELECT data_json FROM ops_ab_tests ORDER BY created_at DESC").all<{ data_json: string }>();
  return (rows.results ?? []).map((row) => JSON.parse(row.data_json) as ABTest);
}
export async function createABTest(input: Omit<ABTest, "id" | "createdAt">) {
  await ensureSchema();
  const item: ABTest = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await db().prepare("INSERT INTO ops_ab_tests (id, status, created_at, data_json) VALUES (?, ?, ?, ?)").bind(item.id, item.status, item.createdAt, JSON.stringify(item)).run();
  return item;
}
