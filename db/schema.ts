import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  source: text("source").notNull(),
  conversationId: text("conversation_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  status: text("status").notNull(),
  finalReply: text("final_reply").notNull().default(""),
  recordJson: text("record_json").notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
});

export type AgentRunRow = typeof agentRuns.$inferSelect;
