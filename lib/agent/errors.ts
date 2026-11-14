export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AgentError";
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function errorPayload(error: unknown) {
  if (error instanceof AgentError) return error.toJSON();
  return {
    code: "AGENT_UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : "Agent 执行发生未知错误",
  };
}
