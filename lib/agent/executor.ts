import { AgentError, errorPayload } from "./errors";
import { createPlan, detectMandatoryCapabilities } from "./planner";
import { createLLMProvider } from "./provider";
import { capabilityVersions, getCapabilities } from "./registry";
import { saveRun } from "./repository";
import { executeTool } from "./tools";
import type { AgentEvent, AgentRunInput, Capability, PlannerConfig, RunRecord, RunStep } from "./types";
import { validatePlan } from "./validator";
import { getLLMConfig, getPlannerConfig } from "./adminRepository";
import { detectHandoffPolicy } from "./handoffPolicy";

const now = () => new Date().toISOString();
const emitEvent = (emit: ((event: AgentEvent) => void) | undefined, runId: string, type: AgentEvent["type"], data: unknown) => {
  emit?.({ type, runId, timestamp: now(), data });
};

function initialRecord(input: AgentRunInput, provider: ReturnType<typeof createLLMProvider>): RunRecord {
  const createdAt = now();
  return {
    id: crypto.randomUUID(),
    question: input.userInput.trim(),
    source: input.source ?? "workbench",
    conversationId: input.conversationId ?? crypto.randomUUID(),
    conversationHistory: input.conversationHistory ?? [],
    createdAt,
    updatedAt: createdAt,
    status: "RUNNING",
    finalReply: "",
    plan: null,
    validation: null,
    steps: [],
    riskResult: null,
    durationMs: 0,
    error: null,
    provider: provider.name,
    model: provider.defaultModel,
    skillVersions: {},
    toolVersions: {},
    handoff: { active: false },
    annotations: [],
    retryOf: input.retryOf,
  };
}

async function timed<T>(promise: Promise<T>, ms: number, code: string, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new AgentError(code, message, 504)), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function recordedStep<T>(args: {
  run: RunRecord;
  type: RunStep["type"];
  capability: Pick<Capability, "id" | "name">;
  input: unknown;
  execute: () => Promise<T>;
  emit?: (event: AgentEvent) => void;
}) {
  const startedAt = now();
  const start = Date.now();
  const step: RunStep = {
    stepId: crypto.randomUUID(),
    type: args.type,
    capabilityId: args.capability.id,
    capabilityName: args.capability.name,
    input: args.input,
    output: null,
    durationMs: 0,
    status: "RUNNING",
    error: null,
    startedAt,
    completedAt: null,
  };
  args.run.steps.push(step);
  emitEvent(args.emit, args.run.id, "step.started", step);
  try {
    const output = await args.execute();
    step.output = output;
    step.status = "SUCCESS";
    step.durationMs = Date.now() - start;
    step.completedAt = now();
    args.run.updatedAt = now();
    await saveRun(args.run);
    emitEvent(args.emit, args.run.id, "step.completed", step);
    return output;
  } catch (error) {
    const payload = errorPayload(error);
    step.status = "ERROR";
    step.error = payload.message;
    step.output = { error: payload };
    step.durationMs = Date.now() - start;
    step.completedAt = now();
    args.run.updatedAt = now();
    await saveRun(args.run);
    emitEvent(args.emit, args.run.id, "step.error", step);
    throw error;
  }
}

function mergeToolContext(context: Record<string, unknown>, toolId: string, output: Record<string, unknown>) {
  if (toolId === "query_products") {
    context.products = output.products;
    context.productSelection = output.selection;
  }
  else if (toolId === "query_activities") context.activities = output.activities;
  else if (toolId === "query_coupons") context.coupon = output.coupon;
  else if (toolId === "calculate_price") context.price = output;
  else if (toolId === "query_order") context.order = output.order;
  else if (toolId === "query_logistics") context.logistics = output.logistics;
  else if (toolId === "risk_check") context.ruleRisk = output;
  context[`tool:${toolId}`] = output;
}

export async function executeAgent(
  input: AgentRunInput,
  emit?: (event: AgentEvent) => void,
  executionSnapshot?: { skills: Capability[]; tools: Capability[]; planner: PlannerConfig },
): Promise<RunRecord> {
  if (!input.userInput?.trim()) throw new AgentError("USER_INPUT_REQUIRED", "请输入客服问题", 400);
  const started = Date.now();
  const llmConfig = await getLLMConfig();
  const plannerConfig = executionSnapshot?.planner ?? await getPlannerConfig();
  const provider = createLLMProvider(input.provider ?? llmConfig.provider, input.model ?? llmConfig.defaultModel);
  const run = initialRecord(input, provider);
  const capabilitySet = executionSnapshot
    ? { skills: structuredClone(executionSnapshot.skills), tools: structuredClone(executionSnapshot.tools) }
    : await getCapabilities({ disabledSkills: input.disabledSkills, disabledTools: input.disabledTools });
  const skills = capabilitySet.skills.map((item) => ({ ...item, enabled: item.enabled && (!plannerConfig.enabledSkills.length || plannerConfig.enabledSkills.includes(item.id)) }));
  const tools = capabilitySet.tools.map((item) => ({ ...item, enabled: item.enabled && plannerConfig.enabledTools.includes(item.id) }));
  run.skillVersions = capabilityVersions(skills);
  run.toolVersions = capabilityVersions(tools);
  await saveRun(run);
  emitEvent(emit, run.id, "run.started", { runId: run.id, provider: run.provider, model: run.model, source: run.source });

  try {
    const handoffPolicy = detectHandoffPolicy(input.userInput);
    const mandatoryCapabilities = [...new Set([
      ...(handoffPolicy ? ["service_copy", "risk_review"] : detectMandatoryCapabilities(input.userInput)),
      ...plannerConfig.mandatoryCapabilities,
    ])];
    const plannerOutput = await recordedStep({
      run,
      type: "planner",
      capability: { id: "planner", name: "Agent Planner" },
      input: { userInput: input.userInput, conversationHistory: input.conversationHistory ?? [], availableSkills: skills, availableTools: tools, mandatoryCapabilities },
      emit,
      execute: () => timed(
        createPlan({
          userInput: input.userInput,
          conversationHistory: input.conversationHistory ?? [],
          availableSkills: skills,
          availableTools: tools,
          mandatoryCapabilities,
          provider,
          prompt: plannerConfig.prompt,
        }),
        15_000,
        "PLANNER_TIMEOUT",
        "Planner 生成计划超时",
      ),
    });
    run.plan = plannerOutput.plan;
    run.model = plannerOutput.model;
    emitEvent(emit, run.id, "plan.created", run.plan);

    run.validation = await recordedStep({
      run,
      type: "validator",
      capability: { id: "plan_validator", name: "Plan Validator" },
      input: run.plan,
      emit,
      execute: async () => validatePlan(run.plan!, skills, tools, input.userInput),
    });
    emitEvent(emit, run.id, "plan.validated", run.validation);

    if (run.validation.blocked) {
      const reason = run.validation.errors.map((item) => item.message).join("；") || run.plan.resolutionReason || "能力不足";
      run.status = "BLOCKED";
      run.finalReply = `当前能力配置无法安全完成该请求，已停止执行并建议转人工。原因：${reason}`;
      run.handoff = { active: true, reason, at: now() };
      run.error = { code: "PLAN_VALIDATION_BLOCKED", message: reason, details: run.validation.errors };
      throw new AgentError("PLAN_VALIDATION_BLOCKED", reason, 422, run.validation.errors);
    }

    if (handoffPolicy || run.plan.resolution !== "execute") {
      const reason = handoffPolicy?.reason ?? run.plan.resolutionReason ?? "Planner 判定需要人工接管";
      const context: Record<string, unknown> = { question: input.userInput };
      for (const toolId of run.plan.selectedTools) {
        const tool = tools.find((item) => item.id === toolId);
        if (!tool?.enabled) throw new AgentError("TOOL_UNAVAILABLE", `Tool 不可用：${toolId}`, 422);
        const output = await recordedStep({
          run,
          type: toolId === "risk_check" ? "risk-check" : "tool",
          capability: tool,
          input: { question: input.userInput, context: { ...context } },
          emit,
          execute: () => executeTool(toolId, {
            question: input.userInput,
            context,
            simulateToolError: input.simulateToolError,
          }),
        }) as Record<string, unknown>;
        mergeToolContext(context, toolId, output);
      }
      run.finalReply = handoffPolicy?.reply ?? "该请求需要人工客服进一步核验，已停止自动处理并转人工接管。";
      run.handoff = { active: true, reason, at: now() };
      emitEvent(emit, run.id, "reply.created", { finalReply: run.finalReply, handoff: run.handoff });

      const riskSkill = skills.find((item) => item.id === "risk_review");
      if (!riskSkill?.enabled) throw new AgentError("RISK_REVIEW_UNAVAILABLE", "风险审核 Skill 已停用，禁止输出人工接管回复", 422);
      const risk = await recordedStep({
        run,
        type: "risk-check",
        capability: riskSkill,
        input: { reply: run.finalReply, handoff: run.handoff, policy: handoffPolicy },
        emit,
        execute: () => timed(
          provider.generate({
            task: "risk",
            systemPrompt: riskSkill.prompt ?? "审核回复风险并输出 JSON",
            payload: {
              reply: run.finalReply,
              handoff: run.handoff,
              ruleRisk: context.ruleRisk ?? {
                level: run.plan?.riskAssessment.level,
                signals: run.plan?.riskAssessment.signals,
              },
            },
            temperature: 0,
            maxTokens: riskSkill.maxTokens,
            model: riskSkill.model,
          }).then((result) => {
            const parsed = JSON.parse(result.content) as { passed: boolean; level: "low" | "medium" | "high"; signals?: string[]; safeReply?: string };
            return { ...parsed, signals: parsed.signals ?? [], reviewedAt: now() };
          }),
          15_000,
          "SKILL_TIMEOUT",
          "人工接管回复风险审核超时",
        ),
      });
      run.riskResult = risk;
      if (!risk.passed) run.finalReply = risk.safeReply ?? "该请求需要人工客服处理，自动回复已被风险审核拦截。";
      run.status = "BLOCKED";
      run.durationMs = Date.now() - started;
      run.updatedAt = now();
      await saveRun(run);
      emitEvent(emit, run.id, "risk.completed", risk);
      emitEvent(emit, run.id, "run.completed", run);
      return run;
    }

    const context: Record<string, unknown> = { question: input.userInput };
    for (const toolId of run.plan.selectedTools) {
      const tool = tools.find((item) => item.id === toolId);
      if (!tool?.enabled) throw new AgentError("TOOL_UNAVAILABLE", `Tool 不可用：${toolId}`, 422);
      const output = await recordedStep({
        run,
        type: toolId === "risk_check" ? "risk-check" : "tool",
        capability: tool,
        input: { question: input.userInput, context: { ...context } },
        emit,
        execute: () => executeTool(toolId, { question: input.userInput, context, simulateToolError: input.simulateToolError }),
      }) as Record<string, unknown>;
      mergeToolContext(context, toolId, output);
    }

    for (const skillId of run.plan.selectedSkills.filter((id) => id !== "risk_review")) {
      const skill = skills.find((item) => item.id === skillId);
      if (!skill?.enabled) throw new AgentError("SKILL_UNAVAILABLE", `Skill 不可用：${skillId}`, 422);
      const output = await recordedStep({
        run,
        type: "skill",
        capability: skill,
        input: { question: input.userInput, context: { ...context } },
        emit,
        execute: () => timed(
          provider.generate({
            task: "skill",
            systemPrompt: skill.prompt ?? skill.description,
            payload: { skillId, question: input.userInput, context },
            temperature: skill.temperature,
            maxTokens: skill.maxTokens,
            model: skill.model,
          }).then((result) => JSON.parse(result.content)),
          15_000,
          "SKILL_TIMEOUT",
          `Skill「${skill.name}」执行超时`,
        ),
      });
      context[`skill:${skillId}`] = output;
    }

    const draft = await recordedStep({
      run,
      type: "skill",
      capability: { id: "final_reply_generator", name: "最终回复生成" },
      input: { question: input.userInput, context },
      emit,
      execute: () => timed(
        provider.generate({
          task: "reply",
          systemPrompt: "仅根据已执行 Tool 的事实结果和 Skill 输出生成中文客服回复。不得发明价格、活动、订单或物流信息。输出 JSON：{text:string}。",
          payload: { question: input.userInput, context },
          temperature: 0.4,
          maxTokens: 1200,
        }).then((result) => JSON.parse(result.content) as { text: string }),
        15_000,
        "SKILL_TIMEOUT",
        "最终回复生成超时",
      ),
    });
    run.finalReply = draft.text;
    emitEvent(emit, run.id, "reply.created", { finalReply: run.finalReply });

    const riskSkill = skills.find((item) => item.id === "risk_review");
    if (!riskSkill?.enabled) throw new AgentError("RISK_REVIEW_UNAVAILABLE", "风险审核 Skill 已停用，禁止输出最终回复", 422);
    const risk = await recordedStep({
      run,
      type: "risk-check",
      capability: riskSkill,
      input: { reply: run.finalReply, facts: context, ruleRisk: context.ruleRisk },
      emit,
      execute: () => timed(
        provider.generate({
          task: "risk",
          systemPrompt: riskSkill.prompt ?? "审核回复风险并输出 JSON",
          payload: { reply: run.finalReply, facts: context, ruleRisk: context.ruleRisk },
          temperature: 0,
          maxTokens: riskSkill.maxTokens,
          model: riskSkill.model,
        }).then((result) => {
          const parsed = JSON.parse(result.content) as { passed: boolean; level: "low" | "medium" | "high"; signals?: string[]; safeReply?: string };
          return { ...parsed, signals: parsed.signals ?? [], reviewedAt: now() };
        }),
        15_000,
        "SKILL_TIMEOUT",
        "风险审核 Skill 执行超时",
      ),
    });
    run.riskResult = risk;
    if (!risk.passed) {
      run.finalReply = risk.safeReply ?? "本次回复未通过风险审核，已转人工处理。";
      run.status = "BLOCKED";
      run.handoff = { active: true, reason: "风险审核未通过", at: now() };
    } else {
      run.status = "COMPLETED";
    }
    emitEvent(emit, run.id, "risk.completed", risk);
    run.durationMs = Date.now() - started;
    run.updatedAt = now();
    await saveRun(run);
    emitEvent(emit, run.id, "run.completed", run);
    return run;
  } catch (error) {
    const payload = errorPayload(error);
    if (run.status === "RUNNING") run.status = error instanceof AgentError && error.code === "PLAN_VALIDATION_BLOCKED" ? "BLOCKED" : "ERROR";
    run.error = payload;
    run.durationMs = Date.now() - started;
    run.updatedAt = now();
    await saveRun(run);
    emitEvent(emit, run.id, "run.error", { error: payload, run });
    emitEvent(emit, run.id, "run.completed", run);
    return run;
  }
}
