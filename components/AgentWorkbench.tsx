"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AgentEvent, ProviderName, RunRecord } from "@/lib/agent/types";

const scenarios = [
  { label: "正常推荐", text: "预算 50 元，想买不辣的办公室追剧零食，请推荐三款。" },
  { label: "价格计算", text: "预算 80 元，推荐低糖零食，并告诉我叠加活动和优惠券后的到手价。" },
  { label: "订单物流", text: "帮我查订单号 SN240701 的物流到哪里了？" },
  { label: "中奖诈骗", text: "有人说我中奖了，让我先转账并提供验证码，可信吗？" },
];

function statusLabel(status?: string) {
  return ({ RUNNING: "执行中", COMPLETED: "已完成", ERROR: "错误", BLOCKED: "已阻断", HANDOFF: "人工接管" } as Record<string, string>)[status ?? ""] ?? "等待";
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function readSSE(response: Response, onEvent: (event: AgentEvent) => void) {
  if (!response.body) throw new Error("流式响应不可用");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
      if (data) onEvent(JSON.parse(data) as AgentEvent);
    }
  }
}

export default function AgentWorkbench({ compact = false }: { compact?: boolean }) {
  const [question, setQuestion] = useState(scenarios[0].text);
  const [provider, setProvider] = useState<ProviderName>("classroom-fixture");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [recent, setRecent] = useState<RunRecord[]>([]);
  const [error, setError] = useState("");
  const [openStep, setOpenStep] = useState<string | null>(null);

  const latestByType = useMemo(() => Object.fromEntries(events.map((event) => [event.type, event])), [events]);
  const liveSteps = run?.steps ?? events.filter((event) => event.type === "step.completed" || event.type === "step.error").map((event) => event.data as RunRecord["steps"][number]);

  async function loadRecent() {
    try {
      const response = await fetch("/api/runs?limit=6");
      if (response.ok) setRecent(((await response.json()) as { runs: RunRecord[] }).runs);
    } catch { /* local preview may still be booting */ }
  }

  useEffect(() => {
    fetch("/api/runs?limit=6")
      .then(async (response) => response.ok ? await response.json() as { runs: RunRecord[] } : null)
      .then((payload) => { if (payload) setRecent(payload.runs); })
      .catch(() => undefined);
  }, []);

  async function execute() {
    if (!question.trim() || running) return;
    setRunning(true);
    setRun(null);
    setEvents([]);
    setError("");
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: question, provider, source: compact ? "demo" : "workbench" }),
      });
      if (!response.ok) throw new Error(`请求失败：HTTP ${response.status}`);
      await readSSE(response, (event) => {
        setEvents((current) => [...current, event]);
        if (event.type === "run.completed") setRun(event.data as RunRecord);
        if (event.type === "run.error") {
          const payload = event.data as { error?: { message?: string }; run?: RunRecord };
          if (payload.run) setRun(payload.run);
          setError(payload.error?.message ?? "执行失败");
        }
      });
      await loadRecent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "执行失败");
    } finally { setRunning(false); }
  }

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/"><span className="brandmark">S</span><span><b>SnackOps</b><small>Agent Control Plane</small></span></Link>
        <nav>
          <Link className={!compact ? "active" : ""} href="/">◉ Agent 工作台</Link>
          <Link className={compact ? "active" : ""} href="/demo">◇ Demo</Link>
          <Link href="/skills">◆ Skill 管理</Link>
          <Link href="/tools">Tool</Link>
          <Link href="/planner">Planner</Link>
          <Link href="/catalog">目录</Link>
          <Link href="/models">模型</Link>
          <Link href="/ops">运营</Link>
          <Link href="/eval">Eval</Link>
        </nav>
        <div className="top-actions"><span className="status-dot"><i /> {provider === "classroom-fixture" ? "演示模式" : provider}</span><div className="avatar">运</div></div>
      </header>

      <div className={`workspace ${compact ? "demo-page" : "runner"}`}>
        <section className="hero">
          <div>
            <p className="eyebrow">{compact ? "SAME PIPELINE · SIMPLIFIED UI" : "PLAN · VALIDATE · EXECUTE · REVIEW"}</p>
            <h1>{compact ? "和 Agent 对话，" : "每一次回复，"}<br /><em>{compact ? "但不跳过任何安全链路。" : "都有完整证据链。"}</em></h1>
            <p className="subtitle">Planner 选能力，Validator 守边界，Executor 留 Trace，Risk Check 决定能否输出。</p>
          </div>
          {!compact && <div className="capability-strip"><span><b>3</b> LLM Provider</span><span><b>9</b> 可配置能力</span><span><b>100%</b> RunRecord 持久化</span></div>}
        </section>

        <div className={compact ? "demo-shell" : "runner-grid"}>
          <section className="composer card">
            <div className="section-head">
              <div><span className="step-num">INPUT</span><h2>客服问题</h2></div>
              <label className="provider-select">Provider
                <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderName)}>
                  <option value="classroom-fixture">classroom-fixture</option>
                  <option value="openai-compatible">openai-compatible</option>
                  <option value="coze">coze</option>
                </select>
              </label>
            </div>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") execute();
            }} />
            <div className="example-row"><span>验收场景：</span>{scenarios.map((item) => <button key={item.label} onClick={() => setQuestion(item.text)}>{item.label}</button>)}</div>
            <button className="primary execute" onClick={execute} disabled={running}>{running ? <><i className="spinner" /> 主链路执行中…</> : <>▶ 运行 Agent 主链路 <span>⌘ ↵</span></>}</button>
            {error && <div className="inline-error"><b>执行未成功</b><p>{error}</p></div>}
          </section>

          {!compact && <aside className="guardrails card">
            <div className="section-head compact"><div><span className="step-num">LIVE</span><h2>链路状态</h2></div></div>
            {["run.started", "plan.created", "plan.validated", "reply.created", "risk.completed"].map((type, index) => (
              <div className="rule" key={type}><span className={`rule-icon ${latestByType[type] ? "green" : "muted"}`}>{latestByType[type] ? "✓" : index + 1}</span><div><b>{["Run 已创建", "Plan 已生成", "Plan 已校验", "回复已生成", "风险已审核"][index]}</b><p>{latestByType[type] ? "事件已写入执行流" : "等待上游完成"}</p></div></div>
            ))}
          </aside>}
        </div>

        {(events.length > 0 || run) && <section className="execution-area">
          <div className="execution-title"><div><span className="step-num">TRACE</span><h2>执行证据链</h2><span className="plan-badge">{liveSteps.length} steps</span></div><span className={`run-state ${running ? "live" : ""}`}><i /> {statusLabel(run?.status ?? (running ? "RUNNING" : ""))}</span></div>
          <div className="trace-layout">
            <div>
              {(run?.validation ?? (latestByType["plan.validated"]?.data as RunRecord["validation"])) && <div className={`validation-banner ${(run?.validation ?? latestByType["plan.validated"]?.data as RunRecord["validation"])?.valid ? "pass" : "fail"}`}>
                <b>Plan Validator：{(run?.validation ?? latestByType["plan.validated"]?.data as RunRecord["validation"])?.valid ? "通过" : "阻断"}</b>
                {(run?.validation ?? latestByType["plan.validated"]?.data as RunRecord["validation"])?.errors.map((item) => <p key={item.code}>{item.code} · {item.message}</p>)}
              </div>}
              <div className="timeline">
                {liveSteps.map((step, index) => <article className={`trace-step ${step.status === "SUCCESS" ? "done" : step.status === "ERROR" ? "error" : "running"}`} key={step.stepId}>
                  <div className="rail"><span>{step.status === "SUCCESS" ? "✓" : step.status === "ERROR" ? "!" : index + 1}</span></div>
                  <button className="trace-card" onClick={() => setOpenStep(openStep === step.stepId ? null : step.stepId)}>
                    <div className="trace-summary"><div><span className={`kind ${step.type === "tool" ? "tool" : "skill"}`}>{step.type.toUpperCase()}</span><h3>{step.capabilityName}</h3><p>{step.capabilityId} · {step.status}</p></div><div className="trace-meta">{step.durationMs} ms <span>⌄</span></div></div>
                    {openStep === step.stepId && <div className="io-grid" onClick={(event) => event.stopPropagation()}><div><label>INPUT JSON</label><pre>{json(step.input)}</pre></div><div><label>OUTPUT JSON</label><pre>{json(step.output)}</pre>{step.error && <p className="step-error">{step.error}</p>}</div></div>}
                  </button>
                </article>)}
              </div>
            </div>
            <aside className="result-panel card">
              <div className="section-head compact"><div><span className="step-num">RESULT</span><h2>最终回复</h2></div></div>
              {run?.finalReply ? <><div className="reply-bubble">{run.finalReply}</div><div className={`risk-result ${run.riskResult?.passed ? "pass" : "fail"}`}><div><span>{run.riskResult?.passed ? "✓" : "!"}</span><b>{run.riskResult?.passed ? "风险审核通过" : "未通过 / 未完成"}</b></div><p>风险等级：{run.riskResult?.level ?? "—"}</p>{run.riskResult?.signals.map((signal) => <small key={signal}>• {signal}</small>)}</div><Link className="detail-link" href={`/runs/${run.id}`}>查看完整 RunRecord →</Link></> : <div className="empty-result"><span>✦</span><p>{running ? "Agent 正在执行计划…" : "执行结束后显示回复"}</p></div>}
            </aside>
          </div>
        </section>}

        {!compact && <section className="recent-runs">
          <div className="execution-title"><div><span className="step-num">HISTORY</span><h2>最近运行</h2></div></div>
          <div className="run-list">{recent.map((item) => <Link href={`/runs/${item.id}`} className="run-row card" key={item.id}><span className={`run-status ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span><div><b>{item.question}</b><small>{item.provider} · {item.steps.length} steps · {item.durationMs} ms</small></div><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time><span>→</span></Link>)}</div>
        </section>}
      </div>
    </main>
  );
}
