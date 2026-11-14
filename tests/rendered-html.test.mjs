import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const routes = ["app/page.tsx", "app/demo/page.tsx", "app/skills/page.tsx", "app/tools/page.tsx", "app/planner/page.tsx", "app/ops/page.tsx", "app/catalog/page.tsx", "app/models/page.tsx", "app/eval/page.tsx", "app/runs/[runId]/page.tsx"];

test("关键页面均存在", async () => {
  for (const route of routes) assert.equal((await stat(new URL(route, root))).isFile(), true, route);
});

test("站点元数据属于 SnackOps 而非 starter", async () => {
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  assert.match(layout, /SnackOps/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|Your site is taking shape/);
});

test("客户端代码不包含密钥原文或服务端环境变量读取", async () => {
  const clients = await Promise.all([
    "components/ModelManager.tsx",
    "components/AgentWorkbench.tsx",
    "components/EvalCenter.tsx",
    "components/EvalBatchCenter.tsx",
  ].map((path) => readFile(new URL(path, root), "utf8")));
  const source = clients.join("\n");
  assert.doesNotMatch(source, /process\.env|sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9_-]{12,}/);
  assert.doesNotMatch(source, /OPENAI_API_KEY\s*[:=]\s*["'][^"']+["']/);
});

test("课堂重置没有 HTTP API 暴露", async () => {
  await assert.rejects(stat(new URL("app/api/reset/route.ts", root)));
  await assert.rejects(stat(new URL("app/api/classroom/reset/route.ts", root)));
});
