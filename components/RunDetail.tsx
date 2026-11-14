"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RunRecord } from "@/lib/agent/types";

export default function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [label, setLabel] = useState("待复核");
  const [busy, setBusy] = useState("");
  const [explanation, setExplanation] = useState<unknown>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}`)
      .then(async (response) => {
        const payload = await response.json() as { run: RunRecord; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? "加载失败");
        return payload.run;
      })
      .then(setRun)
      .catch((cause: Error) => setError(cause.message));
  }, [runId]);

  async function action(kind: "retry" | "handoff" | "annotate" | "explain") {
    setBusy(kind);
    setError("");
    try {
      const request = kind === "retry"
        ? fetch("/api/run/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) })
        : kind === "handoff"
          ? fetch(`/api/runs/${runId}/handoff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "运营人员在详情页发起接管" }) })
          : kind === "annotate"
            ? fetch(`/api/runs/${runId}/annotate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, note }) })
            : fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, focus: "all" }) });
      const response = await request;
      const payload = await response.json() as { run: RunRecord; explanation?: unknown; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "操作失败");
      if (kind === "retry") window.location.href = `/runs/${payload.run.id}`;
      else if (kind === "explain") setExplanation(payload.explanation ?? null);
      else { setRun(payload.run); setNote(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally { setBusy(""); }
  }

  if (error && !run) return <main className="detail-state"><h1>无法加载 RunRecord</h1><p>{error}</p><Link href="/">返回工作台</Link></main>;
  if (!run) return <main className="detail-state"><p>正在加载 RunRecord…</p></main>;

  return <main>
    <header className="topbar"><Link className="brand" href="/"><span className="brandmark">S</span><span><b>SnackOps</b><small>Run Inspector</small></span></Link><nav><Link href="/">← 返回工作台</Link><Link href="/skills">◆ Skill 管理</Link></nav><div className="top-actions"><span className="status-dot"><i /> {run.provider}</span></div></header>
    <div className="workspace detail-page">
      <section className="detail-hero">
        <div><p className="eyebrow">RUN RECORD · {run.id}</p><h1>{run.question}</h1><p>{new Date(run.createdAt).toLocaleString("zh-CN")} · {run.durationMs} ms · {run.steps.length} steps</p></div>
        <span className={`run-status large ${run.status.toLowerCase()}`}>{run.status}</span>
      </section>
      {error && <div className="inline-error">{error}</div>}
      <div className="detail-actions">
        <button className="secondary" disabled={!!busy} onClick={() => action("retry")}>↻ 重试运行</button>
        <button className="secondary" disabled={!!busy} onClick={() => action("handoff")}>☞ 人工接管</button>
        <button className="secondary" disabled={!!busy} onClick={() => action("explain")}>✦ 解释本次运行</button>
      </div>
      <div className="detail-grid">
        <section>
          <article className="card detail-card"><div className="section-head compact"><div><span className="step-num">PLAN</span><h2>计划与校验</h2></div></div><pre>{JSON.stringify({ plan: run.plan, validation: run.validation }, null, 2)}</pre></article>
          <article className="card detail-card"><div className="section-head compact"><div><span className="step-num">TRACE</span><h2>完整执行步骤</h2></div></div>{run.steps.map((step) => <details key={step.stepId} className="step-detail"><summary><span className={`run-status ${step.status.toLowerCase()}`}>{step.status}</span><b>{step.capabilityName}</b><small>{step.type} · {step.durationMs} ms</small></summary><div className="io-grid"><div><label>INPUT</label><pre>{JSON.stringify(step.input, null, 2)}</pre></div><div><label>OUTPUT</label><pre>{JSON.stringify(step.output, null, 2)}</pre></div></div>{step.error && <p className="step-error">{step.error}</p>}</details>)}</article>
        </section>
        <aside>
          <article className="card detail-card sticky"><div className="section-head compact"><div><span className="step-num">RESULT</span><h2>结果与风险</h2></div></div><div className="reply-bubble">{run.finalReply || "无最终回复"}</div><pre>{JSON.stringify(run.riskResult, null, 2)}</pre>{run.error && <div className="inline-error"><b>{run.error.code}</b><p>{run.error.message}</p></div>}</article>
          <article className="card detail-card"><div className="section-head compact"><div><span className="step-num">NOTE</span><h2>运营标注</h2></div></div><select value={label} onChange={(event) => setLabel(event.target.value)}><option>待复核</option><option>优质回复</option><option>事实错误</option><option>风险误判</option></select><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="写下标注说明…" /><button className="primary" disabled={!note.trim() || !!busy} onClick={() => action("annotate")}>保存标注</button>{run.annotations.map((item) => <div className="annotation" key={item.createdAt}><b>{item.label}</b><p>{item.note}</p><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small></div>)}</article>
          {explanation !== null && <article className="card detail-card"><div className="section-head compact"><div><span className="step-num">WHY</span><h2>运行解释</h2></div></div><pre>{JSON.stringify(explanation, null, 2)}</pre></article>}
        </aside>
      </div>
    </div>
  </main>;
}
