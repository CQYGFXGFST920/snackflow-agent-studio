"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Capability } from "@/lib/agent/types";

export default function ToolManager() {
  const [tools, setTools] = useState<Capability[]>([]);
  const [selected, setSelected] = useState<Capability | null>(null);
  const [question, setQuestion] = useState("订单号 SN240701 的物流到哪里了？");
  const [contextText, setContextText] = useState("{}");
  const [result, setResult] = useState<unknown>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "testing" | "error">("loading");
  const [message, setMessage] = useState("");

  const load = () => fetch("/api/tools", { cache: "no-store" }).then(async (response) => {
    const data = await response.json() as { tools?: Capability[]; error?: { message?: string } };
    if (!response.ok || !data.tools) throw new Error(data.error?.message ?? "Tool 加载失败");
    setTools(data.tools); setSelected((current) => data.tools!.find((item) => item.id === current?.id) ?? data.tools![0] ?? null); setState("ready");
  }).catch((error: Error) => { setMessage(error.message); setState("error"); });
  useEffect(() => { void load(); }, []);

  async function save() {
    if (!selected) return; setState("saving"); setMessage("");
    try {
      const response = await fetch("/api/tools", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, patch: { description: selected.description, enabled: selected.enabled } }) });
      const data = await response.json() as { tool?: Capability; error?: { message?: string } };
      if (!response.ok || !data.tool) throw new Error(data.error?.message ?? "保存失败");
      await load(); setMessage("Tool 配置已保存，Planner 下次运行会读取最新状态。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); setState("error"); }
  }
  async function test() {
    if (!selected) return; setState("testing"); setResult(null); setMessage("");
    try {
      const context = JSON.parse(contextText) as Record<string, unknown>;
      const response = await fetch(`/api/tools/${selected.id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, context }) });
      const data = await response.json() as { input?: unknown; output?: unknown; durationMs?: number; status?: string; error?: { message?: string } };
      setResult(data);
      if (!response.ok) throw new Error(data.error?.message ?? "Tool 测试失败");
      setState("ready");
    } catch (error) { setMessage(error instanceof Error ? error.message : "测试失败"); setState("error"); }
  }

  return <main><AdminHeader active="tools" />
    <div className="workspace"><section className="page-heading"><div><p className="eyebrow">SERVER-SIDE TOOL REGISTRY</p><h1>Tool 管理</h1><p>测试结果由服务端实际执行代码产生，客户端不生成成功结果。</p></div></section>
      {state === "loading" ? <div className="card admin-state">正在加载 Tool…</div> : !tools.length ? <div className="card admin-state">暂无 Tool</div> :
      <div className="admin-three">
        <aside className="card admin-list">{tools.map((tool) => <button key={tool.id} className={selected?.id === tool.id ? "active" : ""} onClick={() => { setSelected(tool); setResult(null); }}><b>{tool.name}</b><small>{tool.id}</small><i className={tool.enabled ? "enabled" : ""} /></button>)}</aside>
        {selected && <section className="card admin-form"><div className="section-head"><div><span className="step-num">TOOL</span><h2>{selected.name}</h2></div><button className={`toggle ${selected.enabled ? "on" : ""}`} onClick={() => setSelected({ ...selected, enabled: !selected.enabled })}><span /></button></div>
          <label>描述<textarea value={selected.description} onChange={(event) => setSelected({ ...selected, description: event.target.value })} /></label>
          <label>输入 Schema<pre>{JSON.stringify(selected.inputSchema, null, 2)}</pre></label>
          <label>输出示例<pre>{JSON.stringify(selected.outputExample, null, 2)}</pre></label>
          <button className="primary" disabled={state === "saving"} onClick={save}>{state === "saving" ? "保存中…" : "保存 Tool"}</button>
        </section>}
        {selected && <aside className="card admin-form"><div className="section-head"><div><span className="step-num">TEST</span><h2>服务端测试</h2></div></div>
          <label>真实输入 question<textarea value={question} onChange={(event) => setQuestion(event.target.value)} /></label><label>context JSON<textarea value={contextText} onChange={(event) => setContextText(event.target.value)} /></label>
          <button className="primary" disabled={state === "testing" || !selected.enabled} onClick={test}>{state === "testing" ? "执行中…" : "执行 Tool"}</button>
          {result !== null && <pre>{JSON.stringify(result, null, 2)}</pre>}
        </aside>}
      </div>}{message && <div className={state === "error" ? "inline-error admin-message" : "toast"}>{message}</div>}</div>
  </main>;
}

export function AdminHeader({ active }: { active: string }) {
  return <header className="topbar"><Link className="brand" href="/"><span className="brandmark">S</span><span><b>SnackOps</b><small>Management</small></span></Link><nav><Link href="/">工作台</Link><Link href="/demo">Demo</Link><Link className={active === "skills" ? "active" : ""} href="/skills">Skill</Link><Link className={active === "tools" ? "active" : ""} href="/tools">Tool</Link><Link className={active === "planner" ? "active" : ""} href="/planner">Planner</Link><Link className={active === "catalog" ? "active" : ""} href="/catalog">目录</Link><Link className={active === "models" ? "active" : ""} href="/models">模型</Link><Link className={active === "eval" ? "active" : ""} href="/eval">Eval</Link><Link className={active === "ops" ? "active" : ""} href="/ops">运营中心</Link></nav><div className="top-actions"><span className="status-dot"><i /> 管理后台</span></div></header>;
}
