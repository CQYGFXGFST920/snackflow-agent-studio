CREATE TABLE `agent_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `question` text NOT NULL,
  `source` text NOT NULL,
  `conversation_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `status` text NOT NULL,
  `final_reply` text DEFAULT '' NOT NULL,
  `record_json` text NOT NULL,
  `duration_ms` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_runs_created_at_idx` ON `agent_runs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `agent_runs_conversation_id_idx` ON `agent_runs` (`conversation_id`);
