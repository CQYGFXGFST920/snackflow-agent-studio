import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const script = join(root, "scripts", "classroom-reset.mjs");

test("classroom reset 可重复、结果稳定且不改业务 JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "snackops-reset-"));
  const database = join(directory, "classroom.sqlite");
  const businessFiles = ["products.json", "orders.json", "activities.json", "coupons.json", "logistics.json"];
  const before = businessFiles.map((name) => digest(join(root, "app", "data", name)));
  execFileSync(process.execPath, [script, "--database", database], { cwd: root });
  const first = snapshot(database);
  execFileSync(process.execPath, [script, "--database", database], { cwd: root });
  const second = snapshot(database);
  assert.deepEqual(second, first);
  assert.deepEqual(first.counts, { cases: 9, skills: 5, versions: 0, batches: 0, annotations: 0, improvements: 0, runs: 0 });
  assert.equal(first.provider, "classroom-fixture");
  assert.deepEqual(businessFiles.map((name) => digest(join(root, "app", "data", name))), before);
});

test("生产环境拒绝课堂重置", () => {
  const directory = mkdtempSync(join(tmpdir(), "snackops-reset-prod-"));
  const database = join(directory, "classroom.sqlite");
  assert.throws(() => execFileSync(process.execPath, [script, "--database", database], { cwd: root, env: { ...process.env, NODE_ENV: "production" }, stdio: "pipe" }));
});

test("拒绝重置项目和系统临时目录之外的数据库", () => {
  const unsafeDatabase = join(root, "app", "data", "should-not-exist.sqlite");
  assert.throws(() => execFileSync(process.execPath, [script, "--database", unsafeDatabase], { cwd: root, stdio: "pipe" }));
});

function snapshot(database) {
  const query = `SELECT json_object(
    'cases',(SELECT count(*) FROM eval_cases),
    'skills',(SELECT count(*) FROM agent_skills),
    'versions',(SELECT count(*) FROM agent_skill_versions),
    'batches',(SELECT count(*) FROM eval_run_batches),
    'annotations',(SELECT count(*) FROM ops_annotations),
    'improvements',(SELECT count(*) FROM ops_improvements),
    'runs',(SELECT count(*) FROM agent_runs),
    'provider',json_extract((SELECT config_json FROM agent_admin_config WHERE key='llm'),'$.provider')
  );`;
  const parsed = JSON.parse(execFileSync("/usr/bin/sqlite3", [database, query], { encoding: "utf8" }).trim());
  return {
    counts: { cases: parsed.cases, skills: parsed.skills, versions: parsed.versions, batches: parsed.batches, annotations: parsed.annotations, improvements: parsed.improvements, runs: parsed.runs },
    provider: parsed.provider,
  };
}
function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
