"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Capability, ProviderName, SkillVersion } from "@/lib/agent/types";

const colors = ["#596b4d", "#756b83", "#a9874f", "#687c73", "#9a5143"];

export default function SkillManager() {
  const [skills, setSkills] = useState<Capability[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Capability | null>(null);
  const [provider, setProvider] = useState<ProviderName>("classroom-fixture");
  const [testInput, setTestInput] = useState("预算 50 元，想买不辣的办公室零食");
  const [testOutput, setTestOutput] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [changeNote, setChangeNote] = useState("");
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [versionOpen, setVersionOpen] = useState<SkillVersion | null>(null);

  async function loadSkills(preferredId?: string) {
    const response = await fetch("/api/skills", { cache: "no-store" });
    const payload = await response.json() as { skills?: Capability[]; error?: { message?: string } };
    if (!response.ok || !payload.skills) throw new Error(payload.error?.message ?? "Skill 加载失败");
    setSkills(payload.skills);
    const id = preferredId ?? selectedId ?? payload.skills[0]?.id;
    const selected = payload.skills.find((item) => item.id === id) ?? payload.skills[0] ?? null;
    setSelectedId(selected?.id ?? "");
    setDraft(selected ? { ...selected } : null);
  }

  useEffect(() => {
    fetch("/api/skills", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { skills?: Capability[]; error?: { message?: string } };
        if (!response.ok || !payload.skills) throw new Error(payload.error?.message ?? "Skill 加载失败");
        return payload.skills;
      })
      .then((items) => {
        setSkills(items);
        setSelectedId(items[0]?.id ?? "");
        setDraft(items[0] ? { ...items[0] } : null);
        if (items[0]) fetch(`/api/skills/${items[0].id}/versions`).then(async (response) => await response.json() as { versions?: SkillVersion[] }).then((payload) => setVersions(payload.versions ?? [])).catch(() => setVersions([]));
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  function selectSkill(skill: Capability) {
    setSelectedId(skill.id);
    setDraft({ ...skill });
    setTestOutput(null);
    setMessage("");
    setVersionOpen(null);
    fetch(`/api/skills/${skill.id}/versions`).then(async (response) => await response.json() as { versions?: SkillVersion[] }).then((payload) => setVersions(payload.versions ?? [])).catch(() => setVersions([]));
  }

  async function save() {
    if (!draft) return;
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch(`/api/skills/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: draft, changeNote }),
      });
      const payload = await response.json() as { skill?: Capability; error?: { message?: string } };
      if (!response.ok || !payload.skill) throw new Error(payload.error?.message ?? "保存失败");
      await loadSkills(payload.skill.id);
      const versionResponse = await fetch(`/api/skills/${payload.skill.id}/versions`);
      const versionPayload = await versionResponse.json() as { versions?: SkillVersion[] };
      setVersions(versionPayload.versions ?? []);
      setChangeNote("");
      setMessage("已保存。下一次 Agent 运行会使用这份最新配置。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally { setBusy(""); }
  }

  async function testSkill() {
    if (!draft) return;
    setBusy("test");
    setTestOutput(null);
    setMessage("");
    try {
      const response = await fetch(`/api/skills/${draft.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: testInput, provider, skill: draft }),
      });
      const payload = await response.json() as { output?: unknown; error?: { message?: string }; durationMs?: number; provider?: string; model?: string };
      if (!response.ok) throw new Error(payload.error?.message ?? "测试失败");
      setTestOutput(payload);
    } catch (error) {
      setTestOutput({ error: error instanceof Error ? error.message : "测试失败" });
    } finally { setBusy(""); }
  }

  return <main>
    <header className="topbar">
      <Link className="brand" href="/"><span className="brandmark">S</span><span><b>SnackOps</b><small>Skill Registry</small></span></Link>
      <nav>
        <Link href="/">◉ Agent 工作台</Link>
        <Link href="/demo">◇ Demo</Link>
        <Link className="active" href="/skills">◆ Skill 管理</Link>
        <Link href="/tools">Tool</Link><Link href="/planner">Planner</Link><Link href="/catalog">目录</Link><Link href="/models">模型</Link>
        <Link href="/ops">运营</Link>
        <Link href="/eval">Eval</Link>
      </nav>
      <div className="top-actions"><span className="status-dot"><i /> 配置实时生效</span><div className="avatar">运</div></div>
    </header>

    <div className="workspace">
      <section className="page-heading">
        <div><p className="eyebrow">CONFIGURABLE CAPABILITY REGISTRY</p><h1>Skill 管理</h1><p>编辑、启停并单独测试 Agent 的模型能力。</p></div>
        <div className="stats-card"><b>{skills.filter((item) => item.enabled).length}/{skills.length}</b><small>当前启用</small></div>
      </section>

      <div className="skills-layout">
        <aside className="card skill-list">
          <div className="list-title"><h2>Skills</h2><span>{skills.length}</span></div>
          <div className="admin-filter"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button><button className={filter === "enabled" ? "active" : ""} onClick={() => setFilter("enabled")}>启用</button><button className={filter === "disabled" ? "active" : ""} onClick={() => setFilter("disabled")}>停用</button></div>
          {skills.filter((skill) => filter === "all" || (filter === "enabled" ? skill.enabled : !skill.enabled)).map((skill, index) => <button className={`skill-item ${skill.id === selectedId ? "selected" : ""}`} key={skill.id} onClick={() => selectSkill(skill)}>
            <span className="skill-glyph" style={{ background: colors[index % colors.length] }}>S{index + 1}</span>
            <div><b>{skill.name}</b><small>{skill.id} · v{skill.version}</small></div><i className={skill.enabled ? "enabled" : ""} />
          </button>)}
          <div className="tool-summary"><div className="list-title"><h2>内置 Tools</h2><span>7</span></div><div className="tool-mini"><span>T</span><div><b>事实查询与规则计算</b><small>商品 / 活动 / 优惠券 / 价格 / 订单 / 物流 / 风险</small></div><i>代码执行</i></div></div>
        </aside>

        {draft && <section className="card editor">
          <div className="editor-head">
            <div><span className="skill-glyph large">SK</span><div><p>{draft.id} · v{draft.version}</p><h2>{draft.name}</h2></div></div>
            <div className="enable-control"><span>{draft.enabled ? "已启用" : "已停用"}</span><button aria-label="切换 Skill 状态" className={`toggle ${draft.enabled ? "on" : ""}`} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}><span /></button></div>
          </div>
          <div className="form-grid">
            <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label><span>模型</span><input value={draft.model ?? ""} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></label>
            <label className="full"><span>描述</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="full"><span>Prompt <i>Planner 会读取名称与描述，Executor 使用此 Prompt</i></span><textarea value={draft.prompt ?? ""} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></label>
            <label><span>Temperature <output>{draft.temperature ?? 0}</output></span><input type="range" min="0" max="2" step="0.1" value={draft.temperature ?? 0} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} /></label>
            <label><span>Max Tokens</span><input type="number" min="64" max="8192" value={draft.maxTokens ?? 800} onChange={(event) => setDraft({ ...draft, maxTokens: Number(event.target.value) })} /></label>
            <label className="full"><span>依赖 Tool <i>逗号分隔</i></span><input value={(draft.dependsOn ?? []).join(", ")} onChange={(event) => setDraft({ ...draft, dependsOn: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
            <label className="full"><span>变更说明 changeNote</span><input value={changeNote} placeholder="说明本次修改原因" onChange={(event) => setChangeNote(event.target.value)} /></label>
          </div>
          <div className="editor-actions"><button className="secondary" onClick={() => selectSkill(skills.find((item) => item.id === selectedId)!)}>撤销修改</button><button className="primary" disabled={!!busy} onClick={save}>{busy === "save" ? "保存中…" : "保存配置"}</button></div>
        </section>}

        {draft && <aside className="card test-panel">
          <div className="section-head compact"><div><span className="step-num">TEST</span><h2>单 Skill 测试</h2></div></div>
          <label><span>Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value as ProviderName)}><option value="classroom-fixture">classroom-fixture</option><option value="openai-compatible">openai-compatible</option><option value="coze">coze</option></select></label>
          <label><span>测试输入</span><textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} /></label>
          <button className="primary run-test" disabled={!!busy || !draft.enabled} onClick={testSkill}>{busy === "test" ? "测试中…" : draft.enabled ? "运行测试" : "Skill 已停用"}</button>
          <div className="test-output"><label>OUTPUT JSON</label>{testOutput ? <pre>{JSON.stringify(testOutput, null, 2)}</pre> : <p>运行后在这里查看模型输出、Provider 和耗时。</p>}</div>
          <div className="version-list"><div className="list-title"><h2>版本快照</h2><span>{versions.length}</span></div>{versions.length ? versions.map((version) => <button key={version.id} onClick={() => setVersionOpen(version)}><b>v{version.version}</b><small>{version.changeNote}<br />{new Date(version.createdAt).toLocaleString("zh-CN")}</small></button>) : <p className="empty-copy">保存一次后生成旧版本快照</p>}</div>
          {versionOpen && <div className="version-detail"><b>v{versionOpen.version} 正文与 Diff</b><pre>{JSON.stringify(versionOpen.config, null, 2)}</pre><pre>{diffText(versionOpen.config.prompt ?? "", draft.prompt ?? "")}</pre></div>}
        </aside>}
      </div>
      {message && <div className="toast">{message}</div>}
    </div>
  </main>;
}

function diffText(before: string, after: string) {
  if (before === after) return "Prompt 无变化";
  return `--- v旧\n${before}\n+++ 当前\n${after}`;
}
