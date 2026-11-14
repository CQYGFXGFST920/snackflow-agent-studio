export type ProviderName = "coze" | "openai-compatible" | "classroom-fixture";
export type RunStatus = "RUNNING" | "COMPLETED" | "ERROR" | "BLOCKED" | "HANDOFF";
export type StepStatus = "PENDING" | "RUNNING" | "SUCCESS" | "ERROR" | "SKIPPED";
export type StepType = "planner" | "validator" | "skill" | "tool" | "risk-check";

export interface Capability {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  category?: "price" | "order" | "logistics" | "risk" | "catalog";
  prompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  dependsOn?: string[];
  inputSchema?: Record<string, unknown>;
  outputExample?: unknown;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  changeNote: string;
  createdAt: string;
  config: Capability;
}

export interface PlannerConfig {
  version: string;
  prompt: string;
  enabledSkills: string[];
  enabledTools: string[];
  mandatoryCapabilities: string[];
  updatedAt: string;
}

export interface LLMConfig {
  provider: ProviderName;
  defaultModel: string;
  models: Record<ProviderName, string[]>;
  updatedAt: string;
}

export interface ServiceRating {
  id: string;
  runId: string;
  score: number;
  problemType: string;
  question: string;
  reply: string;
  note: string;
  createdAt: string;
}

export type AnnotationStatus = "pending" | "accepted" | "rejected";
export interface OpsAnnotation {
  id: string;
  runId: string;
  target: "run" | "reply";
  status: AnnotationStatus;
  correctness: number;
  relevance: number;
  completeness: number;
  safety: number;
  tone: number;
  overall: number;
  annotator: string;
  note: string;
  addToEval: boolean;
  addToImprovement: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Improvement {
  id: string;
  sourceType: "bad-case" | "low-rating" | "annotation";
  category: "Planner" | "Skill" | "Tool" | "Eval";
  clusterMethod: "规则聚类";
  title: string;
  reason: string;
  sampleRunIds: string[];
  skillId?: string;
  draftPrompt?: string;
  originalPrompt?: string;
  status: "suggested" | "drafted" | "applied" | "dismissed";
  createdAt: string;
  appliedAt?: string;
}

export interface ABTest {
  id: string;
  name: string;
  skillId: string;
  controlVersion: string;
  variantPrompt: string;
  status: "draft" | "running" | "completed";
  createdAt: string;
}

export type EvalStatus = "PASS" | "FAIL" | "REVIEW" | "ERROR";
export interface EvalCase {
  id: string;
  name: string;
  question: string;
  scenario: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  riskLevel: "low" | "medium" | "high";
  expectedBehavior: string;
  expectedReply?: string;
  expectedKeywords: { mode: "AND" | "OR"; groups: string[][] };
  forbiddenWords: string[];
  expectedPrice?: number;
  expectReplySafe: boolean;
  expectShouldSend: boolean;
  requiredCapabilities: string[];
  forbiddenCapabilities: string[];
  evalDimension: string[];
  llmJudgePrompt?: string;
  tags: string[];
  sourceRunId?: string;
  createdAt: string;
  enabled: boolean;
}

export interface EvalScore {
  status: EvalStatus;
  passed: boolean;
  reason: string;
  evidence: string[];
  keywordHits: string[];
  keywordMisses: string[];
  forbiddenHits: string[];
  expectedPrice?: number;
  mentionedPrice?: number;
  riskIssues: string[];
  capabilityHits: string[];
  durationMs: number;
  runId: string;
}

export interface EvalBatch {
  id: string;
  caseId: string;
  runId: string;
  createdAt: string;
  provider: ProviderName;
  model: string;
  runStatus: RunStatus;
  finalReply: string;
  trace: RunStep[];
  score: EvalScore;
}

export type EvalRunBatchStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface EvalCaseResult {
  caseId: string;
  caseName: string;
  question: string;
  finalReply: string;
  status: EvalStatus;
  reason: string;
  score: EvalScore;
  provider: ProviderName;
  model: string;
  durationMs: number;
  runId: string;
  trace: RunStep[];
}

export interface EvalRunBatch {
  id: string;
  requestKey: string;
  name: string;
  versionLabel: string;
  changeNote: string;
  caseIds: string[];
  caseSnapshot: EvalCase[];
  caseSetHash: string;
  skillVersionHash: string;
  capabilitySnapshot: { skills: Capability[]; tools: Capability[] };
  plannerSnapshot: PlannerConfig;
  plannerHash: string;
  evaluatorVersion: string;
  evaluatorHash: string;
  evaluationMode: "rule";
  judgeEnabled: false;
  provider: ProviderName;
  model: string;
  params: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: EvalRunBatchStatus;
  currentIndex: number;
  total: number;
  passed: number;
  failed: number;
  review: number;
  errors: number;
  caseResults: EvalCaseResult[];
  fatalError: { code: string; message: string; details?: unknown } | null;
  baselineBatchId?: string;
}

export interface EvalBatchComparison {
  comparable: boolean;
  reasons: string[];
  leftId: string;
  rightId: string;
  left: { passed: number; failed: number; review: number; errors: number; qualityPassRate: number | null; averageDurationMs: number };
  right: { passed: number; failed: number; review: number; errors: number; qualityPassRate: number | null; averageDurationMs: number };
  fixedCaseIds: string[];
  regressedCaseIds: string[];
  unchangedChangedReplyCaseIds: string[];
  averageDurationDeltaMs: number;
  conditions: {
    sameCaseIds: boolean;
    sameCaseSnapshot: boolean;
    sameEvaluator: boolean;
    sameSkillVersion: boolean;
    samePlanner: boolean;
    sameProvider: boolean;
    sameModel: boolean;
    sameParams: boolean;
  };
}

export interface Plan {
  id: string;
  selectedSkills: string[];
  selectedTools: string[];
  reasoning: string[];
  mandatoryCapabilities: string[];
  riskAssessment: {
    level: "low" | "medium" | "high";
    signals: string[];
    requiresRiskCheck: boolean;
  };
  resolution: "execute" | "degrade" | "handoff";
  resolutionReason?: string;
}

export interface PlanValidation {
  valid: boolean;
  blocked: boolean;
  errors: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  checkedAt: string;
}

export interface RunStep {
  stepId: string;
  type: StepType;
  capabilityId: string;
  capabilityName: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  status: StepStatus;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface RiskResult {
  passed: boolean;
  level: "low" | "medium" | "high" | "blocked";
  signals: string[];
  safeReply?: string;
  reviewedAt: string;
}

export interface RunAnnotation {
  label: string;
  note: string;
  createdAt: string;
}

export interface RunRecord {
  id: string;
  question: string;
  source: string;
  conversationId: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  finalReply: string;
  plan: Plan | null;
  validation: PlanValidation | null;
  steps: RunStep[];
  riskResult: RiskResult | null;
  durationMs: number;
  error: { code: string; message: string; details?: unknown } | null;
  provider: ProviderName;
  model: string;
  skillVersions: Record<string, string>;
  toolVersions: Record<string, string>;
  handoff: { active: boolean; reason?: string; at?: string };
  annotations: RunAnnotation[];
  retryOf?: string;
}

export interface AgentEvent {
  type: "run.started" | "plan.created" | "plan.validated" | "step.started" | "step.completed" | "step.error" | "reply.created" | "risk.completed" | "run.error" | "run.completed";
  runId: string;
  timestamp: string;
  data: unknown;
}

export interface AgentRunInput {
  userInput: string;
  source?: string;
  conversationId?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: ProviderName;
  model?: string;
  simulateToolError?: string;
  disabledSkills?: string[];
  disabledTools?: string[];
  retryOf?: string;
}

export interface LLMGenerateInput {
  task: "planner" | "skill" | "reply" | "risk" | "explain";
  systemPrompt: string;
  payload: unknown;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMResult {
  content: string;
  provider: ProviderName;
  model: string;
  fixture: boolean;
}
