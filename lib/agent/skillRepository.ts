import { env } from "cloudflare:workers";
import defaultSkills from "@/app/data/skills.json";
import type { Capability, SkillVersion } from "./types";
import { AgentError } from "./errors";

type SkillRow = { config_json: string };
type D1Result<T> = { results?: T[] };

function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new AgentError("SKILL_STORE_UNAVAILABLE", "Skill 配置数据库不可用，请确认 D1 绑定 DB 已配置。", 503);
  return db;
}

let initialized: Promise<void> | null = null;

async function ensureSkillSchema() {
  if (!initialized) {
    initialized = (async () => {
      const db = database();
      await db.prepare(`CREATE TABLE IF NOT EXISTS agent_skills (
        id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        config_json TEXT NOT NULL
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS agent_skill_versions (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        version TEXT NOT NULL,
        change_note TEXT NOT NULL,
        created_at TEXT NOT NULL,
        config_json TEXT NOT NULL
      )`).run();
      const updatedAt = new Date().toISOString();
      await db.batch(defaultSkills.map((skill) => {
        const config: Capability = { ...skill, version: "1.0.0", dependsOn: defaultDependencies(skill.id) };
        return db.prepare("INSERT OR IGNORE INTO agent_skills (id, enabled, updated_at, config_json) VALUES (?, ?, ?, ?)")
          .bind(config.id, config.enabled ? 1 : 0, updatedAt, JSON.stringify(config));
      }));
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}

export async function listSkillConfigs(): Promise<Capability[]> {
  await ensureSkillSchema();
  const result = await database().prepare("SELECT config_json FROM agent_skills ORDER BY rowid")
    .all<SkillRow>() as D1Result<SkillRow>;
  return (result.results ?? []).map((row) => JSON.parse(row.config_json) as Capability);
}

export async function getSkillConfig(id: string) {
  await ensureSkillSchema();
  const row = await database().prepare("SELECT config_json FROM agent_skills WHERE id = ?")
    .bind(id).first<SkillRow>();
  return row ? JSON.parse(row.config_json) as Capability : null;
}

export async function updateSkillConfig(id: string, patch: Partial<Capability>, changeNote = "更新 Skill 配置") {
  const current = await getSkillConfig(id);
  if (!current) throw new AgentError("SKILL_NOT_FOUND", "找不到该 Skill", 404, { id });
  const next: Capability = {
    ...current,
    name: String(patch.name ?? current.name).trim(),
    description: String(patch.description ?? current.description).trim(),
    prompt: String(patch.prompt ?? current.prompt ?? "").trim(),
    model: String(patch.model ?? current.model ?? "").trim(),
    temperature: Number(patch.temperature ?? current.temperature ?? 0.2),
    maxTokens: Number(patch.maxTokens ?? current.maxTokens ?? 800),
    enabled: patch.enabled ?? current.enabled,
    dependsOn: Array.isArray(patch.dependsOn) ? patch.dependsOn.map(String) : current.dependsOn ?? [],
    version: incrementVersion(current.version),
  };
  if (!next.name || !next.description || !next.prompt || !next.model) {
    throw new AgentError("SKILL_CONFIG_INVALID", "名称、描述、Prompt 和模型不能为空", 400);
  }
  if (!Number.isFinite(next.temperature) || !Number.isFinite(next.maxTokens) || next.temperature! < 0 || next.temperature! > 2 || next.maxTokens! < 64 || next.maxTokens! > 8192) {
    throw new AgentError("SKILL_CONFIG_INVALID", "temperature 应为 0–2，maxTokens 应为 64–8192", 400);
  }
  if (typeof next.enabled !== "boolean") throw new AgentError("SKILL_CONFIG_INVALID", "enabled 必须是布尔值", 400);
  const createdAt = new Date().toISOString();
  const snapshot: SkillVersion = { id: crypto.randomUUID(), skillId: id, version: current.version, changeNote: changeNote.trim() || "更新 Skill 配置", createdAt, config: current };
  await database().batch([
    database().prepare("INSERT INTO agent_skill_versions (id, skill_id, version, change_note, created_at, config_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(snapshot.id, id, snapshot.version, snapshot.changeNote, createdAt, JSON.stringify(current)),
    database().prepare("UPDATE agent_skills SET enabled = ?, updated_at = ?, config_json = ? WHERE id = ?")
      .bind(next.enabled ? 1 : 0, createdAt, JSON.stringify(next), id),
  ]);
  return next;
}

export async function listSkillVersions(skillId: string): Promise<SkillVersion[]> {
  await ensureSkillSchema();
  const result = await database().prepare("SELECT id, skill_id, version, change_note, created_at, config_json FROM agent_skill_versions WHERE skill_id = ? ORDER BY created_at DESC")
    .bind(skillId).all<{ id: string; skill_id: string; version: string; change_note: string; created_at: string; config_json: string }>();
  return (result.results ?? []).map((row) => ({
    id: row.id, skillId: row.skill_id, version: row.version, changeNote: row.change_note,
    createdAt: row.created_at, config: JSON.parse(row.config_json) as Capability,
  }));
}

function defaultDependencies(skillId: string) {
  if (skillId === "recommend_decision" || skillId === "recommend_reason") return ["query_products"];
  if (skillId === "service_copy") return ["query_products"];
  if (skillId === "risk_review") return ["risk_check"];
  return [];
}

function incrementVersion(version: string) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "1.0.1";
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}
