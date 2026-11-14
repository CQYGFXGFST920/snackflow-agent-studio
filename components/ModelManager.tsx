"use client";
import { useEffect, useState } from "react";
import type { LLMConfig, ProviderName } from "@/lib/agent/types";
import { AdminHeader } from "./ToolManager";

type EnvStatus = Record<ProviderName, { configured: boolean; required: string[] }>;
const descriptions: Record<ProviderName, string> = {
  "classroom-fixture": "无外部密钥的确定性演示 Provider，输出稳定并明确标记 fixture。",
  "openai-compatible": "通过 OpenAI Chat Completions 兼容接口调用 DeepSeek 或其他兼容模型。",
  coze: "通过 coze-coding-dev-sdk 调用 Coze Coding 模型服务。",
};
export default function ModelManager() {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [environment, setEnvironment] = useState<EnvStatus | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "testing" | "error">("loading");
  const [message, setMessage] = useState("");
  const [testResult, setTestResult] = useState<unknown>(null);
  const load = () => fetch("/api/llm-config", { cache: "no-store" }).then(async (r) => { const p = await r.json() as { config: LLMConfig; environment: EnvStatus; error?: { message?: string } }; if (!r.ok) throw new Error(p.error?.message); setConfig(p.config); setEnvironment(p.environment); setState("ready"); });
  useEffect(() => { load().catch((e: Error) => { setMessage(e.message || "模型配置加载失败"); setState("error"); }); }, []);
  async function switchProvider(provider: ProviderName) {
    setState("saving"); setMessage("");
    try { const r = await fetch("/api/llm-config/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) }); const p = await r.json() as { error?: { message?: string } }; if (!r.ok) throw new Error(p.error?.message); await load(); setMessage(`已切换到 ${provider}，后续 RunRecord 将使用该 Provider。`); }
    catch (e) { setMessage(e instanceof Error ? e.message : "切换失败"); setState("error"); }
  }
  async function saveModel() {
    if (!config) return; setState("saving");
    try { const r = await fetch("/api/llm-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultModel: config.defaultModel, models: config.models }) }); const p = await r.json() as { config: LLMConfig; error?: { message?: string } }; if (!r.ok) throw new Error(p.error?.message); setConfig(p.config); setState("ready"); setMessage("模型配置已保存。"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "保存失败"); setState("error"); }
  }
  async function test() {
    if (!config) return; setState("testing"); setTestResult(null);
    try { const r = await fetch("/api/llm-config/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: config.provider, model: config.defaultModel }) }); const p = await r.json() as { ok?: boolean; error?: { message?: string }; [key: string]: unknown }; setTestResult(p); if (!r.ok) throw new Error(p.error?.message); setState("ready"); setMessage("Provider 连接测试成功。"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "连接失败"); setState("error"); }
  }
  return <main><AdminHeader active="models" /><div className="workspace"><section className="page-heading"><div><p className="eyebrow">LLM PROVIDER CONTROL</p><h1>模型管理</h1><p>只展示配置状态，不返回或渲染任何密钥原文。</p></div></section>
    {state === "loading" ? <div className="card admin-state">正在加载 Provider…</div> : !config || !environment ? <div className="inline-error">{message || "没有模型配置"}</div> : <>
      <div className={`mode-banner ${config.provider === "classroom-fixture" ? "fixture" : environment[config.provider].configured ? "real" : "missing"}`}><b>{config.provider === "classroom-fixture" ? "演示稳定模式" : `真实 Provider：${config.provider}`}</b><span>{config.provider === "classroom-fixture" ? "不访问外部模型，确定性输出用于演示" : environment[config.provider].configured ? "环境变量配置完整" : `缺少：${environment[config.provider].required.join("、")}`}</span></div>
      <div className="model-grid">{(["classroom-fixture", "openai-compatible", "coze"] as ProviderName[]).map((provider) => <article className={`card provider-card ${config.provider === provider ? "selected" : ""}`} key={provider}><div><span className="provider-mark">{provider.slice(0, 2).toUpperCase()}</span><span className={`run-status ${environment[provider].configured ? "completed" : "error"}`}>{environment[provider].configured ? "配置可用" : "缺少配置"}</span></div><h2>{provider}</h2><p>{descriptions[provider]}</p><small>{environment[provider].required.length ? `缺少 ${environment[provider].required.join(" / ")}` : "密钥状态：已隐藏"}</small><button className="secondary" disabled={state === "saving" || config.provider === provider} onClick={() => switchProvider(provider)}>{config.provider === provider ? "当前 Provider" : "切换到此 Provider"}</button></article>)}</div>
      <section className="card model-settings"><div><label>默认模型<select value={config.defaultModel} onChange={(e) => setConfig({ ...config, defaultModel: e.target.value })}>{(config.models[config.provider] ?? []).map((model) => <option key={model}>{model}</option>)}</select></label><label>模型列表（每行一个）<textarea value={(config.models[config.provider] ?? []).join("\n")} onChange={(e) => setConfig({ ...config, models: { ...config.models, [config.provider]: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) } })} /></label></div><div className="model-actions"><button className="secondary" disabled={state === "testing"} onClick={test}>{state === "testing" ? "测试中…" : "测试连接"}</button><button className="primary" disabled={state === "saving"} onClick={saveModel}>保存模型配置</button></div>{testResult !== null && <pre>{JSON.stringify(testResult, null, 2)}</pre>}</section>
    </>}{message && <div className={state === "error" ? "inline-error admin-message" : "toast"}>{message}</div>}</div></main>;
}
