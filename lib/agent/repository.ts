import { env } from "cloudflare:workers";
import type { RunAnnotation, RunRecord } from "./types";
import { AgentError } from "./errors";

type D1Result<T> = { results?: T[] };

function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new AgentError("RUN_STORE_UNAVAILABLE", "运行记录数据库不可用，请确认 D1 绑定 DB 已配置。", 503);
  return db;
}

let initialized: Promise<void> | null = null;
async function ensureSchema() {
  if (!initialized) {
    initialized = (async () => {
      const db = database();
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS agent_runs (
          id TEXT PRIMARY KEY,
          question TEXT NOT NULL,
          source TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          status TEXT NOT NULL,
          final_reply TEXT NOT NULL DEFAULT '',
          record_json TEXT NOT NULL,
          duration_ms INTEGER NOT NULL DEFAULT 0
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS agent_runs_created_at_idx ON agent_runs(created_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS agent_runs_conversation_id_idx ON agent_runs(conversation_id)"),
      ]);
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}

export async function saveRun(record: RunRecord) {
  await ensureSchema();
  await database().prepare(`INSERT INTO agent_runs (
    id, question, source, conversation_id, created_at, updated_at, status, final_reply, record_json, duration_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    status = excluded.status,
    final_reply = excluded.final_reply,
    record_json = excluded.record_json,
    duration_ms = excluded.duration_ms`)
    .bind(
      record.id,
      record.question,
      record.source,
      record.conversationId,
      record.createdAt,
      record.updatedAt,
      record.status,
      record.finalReply,
      JSON.stringify(record),
      record.durationMs,
    ).run();
  return record;
}

export async function getRun(id: string): Promise<RunRecord | null> {
  await ensureSchema();
  const row = await database().prepare("SELECT record_json FROM agent_runs WHERE id = ?").bind(id).first<{ record_json: string }>();
  return row ? JSON.parse(row.record_json) as RunRecord : null;
}

export async function listRuns(limit = 20, offset = 0) {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const result = await database().prepare("SELECT record_json FROM agent_runs ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(safeLimit, safeOffset).all<{ record_json: string }>() as D1Result<{ record_json: string }>;
  const count = await database().prepare("SELECT COUNT(*) AS count FROM agent_runs").first<{ count: number }>();
  return {
    runs: (result.results ?? []).map((row) => JSON.parse(row.record_json) as RunRecord),
    total: count?.count ?? 0,
    limit: safeLimit,
    offset: safeOffset,
  };
}

export async function markHandoff(id: string, reason: string) {
  const record = await getRun(id);
  if (!record) throw new AgentError("RUN_NOT_FOUND", "找不到该运行记录", 404, { id });
  record.status = "HANDOFF";
  record.handoff = { active: true, reason, at: new Date().toISOString() };
  record.updatedAt = new Date().toISOString();
  return saveRun(record);
}

export async function addAnnotation(id: string, annotation: Omit<RunAnnotation, "createdAt">) {
  const record = await getRun(id);
  if (!record) throw new AgentError("RUN_NOT_FOUND", "找不到该运行记录", 404, { id });
  record.annotations.push({ ...annotation, createdAt: new Date().toISOString() });
  record.updatedAt = new Date().toISOString();
  return saveRun(record);
}
