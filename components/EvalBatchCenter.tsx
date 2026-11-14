"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { EvalBatchComparison, EvalCase, EvalRunBatch } from "@/lib/agent/types";

const terminal = new Set(["done", "error", "cancelled"]);

export default function EvalBatchCenter({
  cases,
  initialBatches,
  onChanged,
}: {
  cases: EvalCase[];
  initialBatches: EvalRunBatch[];
  onChanged: () => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [versionLabel, setVersionLabel] = useState("baseline-v1");
  const [changeNote, setChangeNote] = useState("");
  const [baselineId, setBaselineId] = useState("");
  const [active, setActive] = useState<EvalRunBatch | null>(null);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [comparison, setComparison] = useState<EvalBatchComparison | null>(null);
  const [state, setState] = useState<"ready" | "creating" | "polling" | "error">("ready");
  const [message, setMessage] = useState("");
  const requestKey = useRef("");
  const enabled = useMemo(() => cases.filter((item) => item.enabled), [cases]);

  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function create(regression = false) {
    setState("creating");
    setMessage("");
    requestKey.current = crypto.randomUUID();
    try {
      const body: Record<string, unknown> = {
        name,
        versionLabel,
        changeNote,
        requestKey: requestKey.current,
      };
      if (regression) {
        if (!baselineId) throw new Error("请先选择要复用用例集的基线批次");
        body.baselineBatchId = baselineId;
      } else if (selectedIds.length) {
        body.caseIds = selectedIds;
      }
      const response = await fetch("/api/eval/batch/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey.current },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { batchId?: string; error?: { message?: string; details?: { invalidIds?: string[] } } };
      if (!response.ok || !payload.batchId) {
        const invalid = payload.error?.details?.invalidIds?.join("、");
        throw new Error(`${payload.error?.message ?? "批次创建失败"}${invalid ? `：${invalid}` : ""}`);
      }
      setState("polling");
      await poll(payload.batchId);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "批次创建失败");
    }
  }

  async function poll(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/eval/batch/${id}/advance`, { method: "POST" });
      const payload = await response.json() as { batch?: EvalRunBatch; error?: { message?: string } };
      if (!response.ok || !payload.batch) throw new Error(payload.error?.message ?? "批次查询失败");
      setActive(payload.batch);
      if (terminal.has(payload.batch.status)) {
        setState(payload.batch.status === "error" ? "error" : "ready");
        setMessage(payload.batch.status === "done" ? "批量评测完成。" : payload.batch.fatalError?.message ?? `批次已${payload.batch.status}`);
        await onChanged();
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      return poll(id);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "轮询失败，已停止");
    }
  }

  async function openBatch(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/eval/batch/${id}`, { cache: "no-store" });
      const payload = await response.json() as { batch?: EvalRunBatch; error?: { message?: string } };
      if (!response.ok || !payload.batch) throw new Error(payload.error?.message ?? "批次读取失败");
      setActive(payload.batch);
      if (!terminal.has(payload.batch.status)) {
        setState("polling");
        await poll(id);
      }
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "批次读取失败");
    }
  }

  async function compare() {
    setMessage("");
    setComparison(null);
    try {
      const response = await fetch(`/api/eval/batch/compare?leftId=${encodeURIComponent(leftId)}&rightId=${encodeURIComponent(rightId)}`, { cache: "no-store" });
      const payload = await response.json() as { comparison?: EvalBatchComparison; error?: { message?: string } };
      if (!response.ok || !payload.comparison) throw new Error(payload.error?.message ?? "比较失败");
      setComparison(payload.comparison);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "比较失败");
    }
  }

  const batches = initialBatches;
  const fixed = new Set(comparison?.fixedCaseIds ?? []);
  const regressed = new Set(comparison?.regressedCaseIds ?? []);
  return <section className="eval-batch-center">
    <div className="section-head batch-title"><div><span className="step-num">BATCH</span><h2>批量评测与版本对比</h2><p>每条用例都重新运行同一 Agent 链路，并使用规则评分器读取本次回复和 Trace。</p></div><span className="rule-label">规则评测，Judge 未启用</span></div>

    <div className="batch-config-grid">
      <section className="card batch-config">
        <h3>1. 选择用例</h3>
        <div className="batch-case-actions"><button className="secondary" onClick={() => setSelectedIds(enabled.map((item) => item.id))}>全选启用</button><button className="secondary" onClick={() => setSelectedIds([])}>清空（运行时代表全部启用）</button><b>{selectedIds.length || enabled.length} 条</b></div>
        <div className="batch-case-list">{enabled.map((item) => <label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggle(item.id)} /><span><b>{item.name}</b><small>{item.id} · {item.category}</small></span></label>)}</div>
      </section>
      <section className="card batch-config">
        <h3>2. 批次信息</h3>
        <label>名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：风险修复回归" /></label>
        <label>版本标签<input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} /></label>
        <label>变更说明<textarea value={changeNote} onChange={(event) => setChangeNote(event.target.value)} /></label>
        <button className="primary" disabled={state === "creating" || state === "polling"} onClick={() => create(false)}>{state === "creating" ? "创建中…" : "创建并运行批次"}</button>
        <div className="regression-box"><label>回归基线<select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}><option value="">选择第一批次</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.versionLabel} · {item.name}</option>)}</select></label><button className="secondary" disabled={!baselineId || state === "polling"} onClick={() => create(true)}>复用基线 caseIds 回归</button></div>
      </section>
      <section className="card batch-progress">
        <h3>3. 运行进度</h3>
        {!active ? <p className="empty-copy">创建批次后在这里显示实时进度。</p> : <>
          <div className="progress-line"><span style={{ width: `${active.total ? active.currentIndex / active.total * 100 : 0}%` }} /></div>
          <b>{active.currentIndex} / {active.total}</b><span className={`run-status ${active.status}`}>{active.status}</span>
          <div className="batch-counts"><span>PASS <b>{active.passed}</b></span><span>FAIL <b>{active.failed}</b></span><span>REVIEW <b>{active.review}</b></span><span>ERROR <b>{active.errors}</b></span></div>
          <small>统计校验：{active.passed + active.failed + active.review + active.errors} / {active.total}</small>
        </>}
        {message && <div className={state === "error" ? "inline-error" : "success-note"}>{message}</div>}
      </section>
    </div>

    <section className="card batch-history"><div className="section-head"><div><span className="step-num">HISTORY</span><h2>历史批次</h2></div><small>刷新后可继续查看或恢复运行</small></div>
      {batches.length ? <div className="batch-history-list">{batches.map((item) => <button key={item.id} className={active?.id === item.id ? "active" : ""} onClick={() => openBatch(item.id)}><span className={`run-status ${item.status}`}>{item.status}</span><b>{item.versionLabel} · {item.name}</b><small>{item.currentIndex}/{item.total} · {new Date(item.createdAt).toLocaleString("zh-CN")}</small></button>)}</div> : <p className="empty-copy">暂无批次</p>}
    </section>

    {active?.caseResults.length ? <section className="card batch-report"><div className="section-head"><div><span className="step-num">REPORT</span><h2>{active.versionLabel} 结果报告</h2></div><small>{active.provider} · {active.model} · {active.evaluatorVersion}</small></div>
      <div className="batch-result-list">{active.caseResults.map((result) => <details key={result.caseId} open={result.status !== "PASS"}><summary><span className={`run-status ${result.status.toLowerCase()}`}>{result.status}</span><b>{result.caseName}</b><small>{result.durationMs} ms</small></summary><div className="batch-result-body"><p><strong>问题：</strong>{result.question}</p><p><strong>实际回复：</strong>{result.finalReply || "未产生回复"}</p><p><strong>原因：</strong>{result.reason}</p><div className="evidence-grid"><span>命中关键词：{result.score.keywordHits.join("、") || "无"}</span><span>缺失关键词：{result.score.keywordMisses.join("、") || "无"}</span><span>禁词：{result.score.forbiddenHits.join("、") || "无"}</span><span>价格：{result.score.expectedPrice ?? "未要求"} → {result.score.mentionedPrice ?? "未识别"}</span><span>风险：{result.score.riskIssues.join("、") || "无问题"}</span><span>能力路径：{result.score.capabilityHits.join(" → ") || "无"}</span></div>{result.runId ? <Link href={`/runs/${result.runId}`}>Run {result.runId.slice(0, 8)} · 查看 Trace</Link> : <span className="inline-error">本条未生成 RunRecord</span>}</div></details>)}</div>
    </section> : null}

    <section className="card batch-compare">
      <div className="section-head"><div><span className="step-num">COMPARE</span><h2>版本对比</h2></div></div>
      <div className="compare-controls"><select value={leftId} onChange={(event) => setLeftId(event.target.value)}><option value="">基线批次</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.versionLabel} · {item.name}</option>)}</select><span>→</span><select value={rightId} onChange={(event) => setRightId(event.target.value)}><option value="">对比批次</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.versionLabel} · {item.name}</option>)}</select><button className="primary" disabled={!leftId || !rightId || leftId === rightId} onClick={compare}>开始比较</button></div>
      {comparison && <div className="comparison-report"><div className={comparison.comparable ? "compare-ok" : "compare-warning"}><b>{comparison.comparable ? "运行条件一致，可以直接比较" : "不可直接比较"}</b>{!comparison.comparable && <p>{comparison.reasons.join("；")}。以下仅展示事实差异，不给出版本变好结论。</p>}</div>
        <div className="comparison-metrics"><Metric label="基线通过率" value={rate(comparison.left.qualityPassRate)} /><Metric label="当前通过率" value={rate(comparison.right.qualityPassRate)} /><Metric label="已修复" value={String(comparison.fixedCaseIds.length)} /><Metric label="新增失败" value={String(comparison.regressedCaseIds.length)} /><Metric label="平均耗时变化" value={`${comparison.averageDurationDeltaMs >= 0 ? "+" : ""}${comparison.averageDurationDeltaMs} ms`} /></div>
        <div className="comparison-cases"><div><h3>已修复</h3>{comparison.fixedCaseIds.map((id) => <p key={id} className={fixed.has(id) ? "fixed" : ""}>{caseName(cases, id)}</p>)}{!comparison.fixedCaseIds.length && <small>无</small>}</div><div><h3>新增失败 / 回归</h3>{comparison.regressedCaseIds.map((id) => <p key={id} className={regressed.has(id) ? "regressed" : ""}>{caseName(cases, id)}</p>)}{!comparison.regressedCaseIds.length && <small>无</small>}</div><div><h3>状态不变但回复改变</h3>{comparison.unchangedChangedReplyCaseIds.map((id) => <p key={id}>{caseName(cases, id)}</p>)}{!comparison.unchangedChangedReplyCaseIds.length && <small>无</small>}</div></div>
        <details><summary>运行条件一致性</summary><pre>{JSON.stringify(comparison.conditions, null, 2)}</pre></details>
      </div>}
    </section>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><b>{value}</b></div>;
}
function rate(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}
function caseName(cases: EvalCase[], id: string) {
  return cases.find((item) => item.id === id)?.name ?? id;
}
