"use client";
import { useEffect, useState } from "react";
import type { Capability, Plan, PlanValidation, PlannerConfig } from "@/lib/agent/types";
import { AdminHeader } from "./ToolManager";

type Payload = { config: PlannerConfig; skills: Capability[]; tools: Capability[] };
export default function PlannerManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [question, setQuestion] = useState("预算 50 元，请推荐三款不辣零食并计算优惠后价格");
  const [preview, setPreview] = useState<{ plan: Plan; validation: PlanValidation; provider: string; model: string } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "testing" | "error">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/planner", { cache: "no-store" }).then(async (r) => { const p = await r.json() as Payload & { error?: { message?: string } }; if (!r.ok) throw new Error(p.error?.message); return p; }).then((p) => { setData(p); setState("ready"); }).catch((e: Error) => { setMessage(e.message || "加载失败"); setState("error"); }); }, []);
  const update = (patch: Partial<PlannerConfig>) => data && setData({ ...data, config: { ...data.config, ...patch } });
  const toggle = (key: "enabledSkills" | "enabledTools", id: string) => {
    if (!data) return; const values = data.config[key]; update({ [key]: values.includes(id) ? values.filter((item) => item !== id) : [...values, id] });
  };
  async function save() {
    if (!data) return; setState("saving"); setMessage("");
    try { const r = await fetch("/api/planner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data.config) }); const p = await r.json() as { config: PlannerConfig; error?: { message?: string } }; if (!r.ok) throw new Error(p.error?.message); setData({ ...data, config: p.config }); setState("ready"); setMessage("Planner 配置已保存。"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "保存失败"); setState("error"); }
  }
  async function runPreview() {
    setState("testing"); setMessage(""); setPreview(null);
    try { const r = await fetch("/api/planner/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }); const p = await r.json() as { plan: Plan; validation: PlanValidation; provider: string; model: string; error?: { message?: string } }; if (!r.ok) throw new Error(p.error?.message); setPreview(p); setState("ready"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "预览失败"); setState("error"); }
  }
  return <main><AdminHeader active="planner" /><div className="workspace"><section className="page-heading"><div><p className="eyebrow">PLANNER POLICY CONSOLE</p><h1>Planner 管理</h1><p>控制 Planner 可见能力、强制能力并预览校验结果。</p></div>{data && <div className="stats-card"><b>v{data.config.version}</b><small>当前版本</small></div>}</section>
    {state === "loading" ? <div className="card admin-state">正在加载 Planner…</div> : !data ? <div className="inline-error">{message || "Planner 配置为空"}</div> :
    <div className="planner-grid"><section className="card admin-form"><div className="section-head"><div><span className="step-num">PROMPT</span><h2>Planner Prompt</h2></div></div><textarea className="prompt-large" value={data.config.prompt} onChange={(e) => update({ prompt: e.target.value })} />
      <label>mandatoryCapabilities<input value={data.config.mandatoryCapabilities.join(", ")} onChange={(e) => update({ mandatoryCapabilities: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} /></label><button className="primary" disabled={state === "saving"} onClick={save}>{state === "saving" ? "保存中…" : "保存 Planner"}</button></section>
      <aside className="card admin-form"><h2>允许使用的 Skill</h2><div className="check-grid">{data.skills.map((item) => <label key={item.id}><input type="checkbox" checked={data.config.enabledSkills.length ? data.config.enabledSkills.includes(item.id) : item.enabled} disabled={!item.enabled} onChange={() => toggle("enabledSkills", item.id)} /> {item.name}</label>)}</div><h2>允许使用的 Tool</h2><div className="check-grid">{data.tools.map((item) => <label key={item.id}><input type="checkbox" checked={data.config.enabledTools.includes(item.id)} disabled={!item.enabled} onChange={() => toggle("enabledTools", item.id)} /> {item.name}</label>)}</div></aside>
      <section className="card admin-form planner-test"><div className="section-head"><div><span className="step-num">PREVIEW</span><h2>计划预览</h2></div></div><textarea value={question} onChange={(e) => setQuestion(e.target.value)} /><button className="primary" disabled={state === "testing"} onClick={runPreview}>{state === "testing" ? "生成中…" : "生成并校验 Plan"}</button>{preview && <><div className={`validation-banner ${preview.validation.valid ? "pass" : "fail"}`}><b>{preview.validation.valid ? "计划合法" : "计划非法"}</b>{preview.validation.errors.map((e) => <p key={e.code}>{e.code} · {e.message}</p>)}</div><pre>{JSON.stringify({ selectedSkills: preview.plan.selectedSkills, selectedTools: preview.plan.selectedTools, reasoning: preview.plan.reasoning, mandatoryCapabilities: preview.plan.mandatoryCapabilities }, null, 2)}</pre></>}</section>
    </div>}{message && <div className={state === "error" ? "inline-error admin-message" : "toast"}>{message}</div>}</div></main>;
}
