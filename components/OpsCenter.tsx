"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ABTest, Improvement, OpsAnnotation, RunRecord, ServiceRating, SkillVersion } from "@/lib/agent/types";
import { AdminHeader } from "./ToolManager";

type OpsData = {
  metrics: { total: number; successRate: number; averageDurationMs: number; failedSteps: Array<{ runId: string; capabilityId: string; error: string | null }>; riskDistribution: Record<string, number>; handoffRate: number };
  runs: RunRecord[]; ratings: ServiceRating[]; annotations: OpsAnnotation[]; improvements: Improvement[]; abTests: ABTest[];
};
const dimensions = ["correctness","relevance","completeness","safety","tone","overall"] as const;
export default function OpsCenter() {
  const [data, setData] = useState<OpsData | null>(null);
  const [state, setState] = useState<"loading"|"ready"|"working"|"error">("loading");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("monitor");
  const [runId, setRunId] = useState("");
  const [score, setScore] = useState(2);
  const [problemType, setProblemType] = useState("话术问题");
  const [ratingNote, setRatingNote] = useState("");
  const [filters, setFilters] = useState({ score: "all", type: "all", from: "" });
  const [annotation, setAnnotation] = useState<Record<string, number>>({ correctness: 3, relevance: 3, completeness: 3, safety: 3, tone: 3, overall: 3 });
  const [annotationMeta, setAnnotationMeta] = useState({ annotator: "运营人员", note: "", status: "pending", addToEval: true, addToImprovement: false });
  const [draft, setDraft] = useState<Improvement | null>(null);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [ab, setAb] = useState({ name: "客服话术 Prompt A/B", skillId: "service_copy", variantPrompt: "" });
  const [success, setSuccess] = useState("");

  async function load() {
    setState("loading"); setError("");
    try {
      const response = await fetch("/api/ops", { cache: "no-store" });
      const payload = await response.json() as OpsData & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "运营数据加载失败");
      setData(payload); setRunId((current) => current || payload.runs[0]?.id || ""); setState("ready");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "运营数据加载失败"); setState("error"); }
  }
  useEffect(() => { fetch("/api/ops", { cache: "no-store" }).then(async (response) => { const payload = await response.json() as OpsData & { error?: { message?: string } }; if (!response.ok) throw new Error(payload.error?.message); return payload; }).then((payload) => { setData(payload); setRunId(payload.runs[0]?.id ?? ""); setState("ready"); }).catch((cause: Error) => { setError(cause.message || "运营数据加载失败"); setState("error"); }); }, []);
  const filteredRatings = useMemo(() => (data?.ratings ?? []).filter((item) => (filters.score === "all" || item.score === Number(filters.score)) && (filters.type === "all" || item.problemType === filters.type) && (!filters.from || item.createdAt >= filters.from)), [data, filters]);

  async function post(url: string, body: unknown, ok: string) {
    setState("working"); setError(""); setSuccess("");
    try { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json() as Record<string, unknown> & { error?: { message?: string } }; if (!response.ok) throw new Error(payload.error?.message ?? "操作失败"); setSuccess(ok); await load(); return payload; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); setState("error"); return null; }
  }
  async function createRating() { await post("/api/ratings", { runId, score, problemType, note: ratingNote }, score <= 2 ? "低分已保存，并自动进入改进建议。" : "评分已保存。"); }
  async function createAnnotation() { await post("/api/annotations", { runId, target: "reply", ...annotation, ...annotationMeta }, "标注已持久化。"); }
  async function generatePrompt(item: Improvement) {
    const payload = await post("/api/improvements/generate-prompt", { improvementId: item.id, skillId: item.category === "Planner" ? "structure_intent" : "service_copy" }, "Prompt 草案已生成，尚未应用。");
    const next = payload?.improvement as Improvement | undefined; if (next) { setDraft(next); setTab("improvements"); }
  }
  async function applyPrompt() { if (!draft) return; if (!window.confirm("确认应用此 Prompt 草案？系统会先保存旧 Skill 版本快照。")) return; await post("/api/improvements/apply-prompt", { improvementId: draft.id, confirmed: true }, "Prompt 已应用，旧版本快照已保存。"); setDraft(null); }
  async function loadVersions() { const response = await fetch("/api/skills/service_copy/versions"); const payload = await response.json() as { versions?: SkillVersion[] }; setVersions(payload.versions ?? []); }
  async function rollback(versionId: string) { if (!window.confirm("确认回滚到该版本正文？当前版本也会先保存快照。")) return; await post("/api/skills/service_copy/rollback", { versionId }, "版本回滚成功。"); await loadVersions(); }

  return <main><AdminHeader active="ops" /><div className="workspace ops-page">
    <section className="page-heading"><div><p className="eyebrow">OPERATIONS FEEDBACK LOOP</p><h1>运营中心</h1><p>从运行问题到评分、标注、评测沉淀和 Prompt 改进的完整闭环。</p></div></section>
    <div className="ops-tabs">{[["monitor","运行监控"],["ratings","服务评分"],["annotations","数据标注"],["improvements","改进建议"],["other","评估与版本"]].map(([id,label]) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {state === "loading" && !data ? <div className="card admin-state">正在加载运营数据…</div> : state === "error" && !data ? <div className="card admin-state"><b>运营中心暂时不可用</b><p>{error}</p><button className="primary" onClick={load}>重新加载</button></div> : data && <>
      {tab === "monitor" && <Monitor data={data} />}
      {tab === "ratings" && <section className="ops-grid"><article className="card ops-form"><h2>记录服务评分</h2><RunSelect runs={data.runs} value={runId} onChange={setRunId} /><label>评分<select value={score} onChange={(e) => setScore(Number(e.target.value))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} 分</option>)}</select></label><label>问题类型<select value={problemType} onChange={(e) => setProblemType(e.target.value)}><option>话术问题</option><option>计划问题</option><option>价格错误</option><option>商品问题</option><option>安全问题</option><option>其他</option></select></label><label>备注<textarea value={ratingNote} onChange={(e) => setRatingNote(e.target.value)} /></label><button className="primary" disabled={!runId || state === "working"} onClick={createRating}>保存评分</button></article><article className="card ops-table-card"><div className="ops-filters"><select value={filters.score} onChange={(e) => setFilters({...filters,score:e.target.value})}><option value="all">全部评分</option>{[1,2,3,4,5].map((n)=><option key={n}>{n}</option>)}</select><select value={filters.type} onChange={(e) => setFilters({...filters,type:e.target.value})}><option value="all">全部类型</option>{[...new Set(data.ratings.map((r)=>r.problemType))].map((v)=><option key={v}>{v}</option>)}</select><input type="date" value={filters.from} onChange={(e)=>setFilters({...filters,from:e.target.value})}/></div><DataTable empty="暂无评分">{filteredRatings.map((item)=><div className="ops-row" key={item.id}><b>{item.score}/5 · {item.problemType}</b><span>{item.question}</span><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small><Link href={`/runs/${item.runId}`}>查看 Run</Link></div>)}</DataTable></article></section>}
      {tab === "annotations" && <section className="ops-grid"><article className="card ops-form"><h2>人工评估 / 数据标注</h2><RunSelect runs={data.runs} value={runId} onChange={setRunId} />{dimensions.map((key)=><label key={key}>{key}<input type="range" min="1" max="5" value={annotation[key]} onChange={(e)=>setAnnotation({...annotation,[key]:Number(e.target.value)})}/><output>{annotation[key]}</output></label>)}<label>标注人<input value={annotationMeta.annotator} onChange={(e)=>setAnnotationMeta({...annotationMeta,annotator:e.target.value})}/></label><label>备注<textarea value={annotationMeta.note} onChange={(e)=>setAnnotationMeta({...annotationMeta,note:e.target.value})}/></label><div className="check-grid"><label><input type="checkbox" checked={annotationMeta.addToEval} onChange={(e)=>setAnnotationMeta({...annotationMeta,addToEval:e.target.checked})}/>进入评测集</label><label><input type="checkbox" checked={annotationMeta.addToImprovement} onChange={(e)=>setAnnotationMeta({...annotationMeta,addToImprovement:e.target.checked})}/>进入改进建议</label></div><button className="primary" onClick={createAnnotation}>保存标注</button><Link className="secondary export-link" href="/api/annotations/export">导出 CSV</Link></article><article className="card ops-table-card"><h2>持久化标注</h2><DataTable empty="暂无标注">{data.annotations.map((item)=><div className="ops-row" key={item.id}><b>{item.status} · overall {item.overall}/5</b><span>{item.annotator}：{item.note || "无备注"}</span><small>{dimensions.map((key)=>`${key} ${item[key]}`).join(" · ")}</small><Link href={`/runs/${item.runId}`}>查看样本</Link></div>)}</DataTable></article></section>}
      {tab === "improvements" && <section><div className="rule-label">分析方式：规则聚类（非 LLM 分析）</div><div className="improvement-grid">{data.improvements.length ? data.improvements.map((item)=><article className="card improvement-card" key={item.id}><span className={`run-status ${item.status === "applied" ? "completed" : "running"}`}>{item.status}</span><small>{item.category} · {item.clusterMethod}</small><h2>{item.title}</h2><p>{item.reason}</p><div>{item.sampleRunIds.map((id)=><Link key={id} href={`/runs/${id}`}>{id.slice(0,8)}</Link>)}</div><button className="secondary" disabled={item.status === "applied"} onClick={()=>generatePrompt(item)}>生成 Prompt 草案</button></article>) : <div className="card admin-state">暂无低分或 Bad Case，创建低分评分后会自动进入这里。</div>}</div>{draft && <article className="card prompt-draft"><h2>Prompt 改进草案（尚未应用）</h2><div className="diff-columns"><pre>{`--- 当前 Prompt\n${draft.originalPrompt}`}</pre><pre>{`+++ 改进草案\n${draft.draftPrompt}`}</pre></div><button className="primary" onClick={applyPrompt}>确认并应用</button></article>}</section>}
      {tab === "other" && <section className="ops-grid"><article className="card ops-form"><h2>版本回滚</h2><p>回滚前会自动保存当前正文快照。</p><button className="secondary" onClick={loadVersions}>加载客服话术版本</button>{versions.map((v)=><div className="version-action" key={v.id}><span>v{v.version}<small>{v.changeNote}</small></span><button onClick={()=>rollback(v.id)}>回滚</button></div>)}</article><article className="card ops-form"><h2>Prompt A/B</h2><label>实验名称<input value={ab.name} onChange={(e)=>setAb({...ab,name:e.target.value})}/></label><label>实验 Prompt<textarea value={ab.variantPrompt} onChange={(e)=>setAb({...ab,variantPrompt:e.target.value})}/></label><button className="primary" onClick={()=>post("/api/ab-tests",ab,"A/B 草案已保存。")}>创建 A/B 草案</button><h3>改进记录 / A/B 记录</h3>{data.abTests.map((item)=><div className="version-action" key={item.id}><span>{item.name}<small>{item.status} · {item.controlVersion}</small></span></div>)}</article></section>}
    </>}{error && data && <div className="inline-error admin-message">{error}</div>}{success && <div className="toast">{success}</div>}</div></main>;
}

function RunSelect({runs,value,onChange}:{runs:RunRecord[];value:string;onChange:(id:string)=>void}) { return <label>关联 Run<select value={value} onChange={(e)=>onChange(e.target.value)}>{runs.map((run)=><option key={run.id} value={run.id}>{run.question.slice(0,34)} · {run.status}</option>)}</select></label>; }
function DataTable({children,empty}:{children:React.ReactNode;empty:string}) { return <div className="ops-table">{Array.isArray(children) && children.length === 0 ? <p className="empty-copy">{empty}</p> : children}</div>; }
function Monitor({data}:{data:OpsData}) { const m=data.metrics; return <><div className="metric-grid"><Metric label="运行总数" value={String(m.total)}/><Metric label="成功率" value={`${Math.round(m.successRate*100)}%`}/><Metric label="平均耗时" value={`${m.averageDurationMs} ms`}/><Metric label="人工接管率" value={`${Math.round(m.handoffRate*100)}%`}/></div><div className="ops-grid monitor-grid"><article className="card ops-table-card"><h2>最近运行</h2><DataTable empty="暂无运行">{data.runs.map((run)=><div className="ops-row" key={run.id}><b>{run.status} · {run.durationMs} ms</b><span>{run.question}</span><small>{run.provider} · risk {run.riskResult?.level ?? "unknown"}</small><Link href={`/runs/${run.id}`}>打开详情</Link></div>)}</DataTable></article><aside><article className="card ops-mini"><h2>风险等级分布</h2>{Object.entries(m.riskDistribution).map(([key,value])=><div key={key}><span>{key}</span><b>{value}</b></div>)}</article><article className="card ops-mini"><h2>失败步骤</h2>{m.failedSteps.length ? m.failedSteps.slice(0,8).map((s)=><div key={`${s.runId}-${s.capabilityId}`}><span>{s.capabilityId}</span><Link href={`/runs/${s.runId}`}>查看</Link></div>) : <p>暂无失败步骤</p>}</article></aside></div></>; }
function Metric({label,value}:{label:string;value:string}) { return <article className="card metric-card"><span>{label}</span><b>{value}</b></article>; }
