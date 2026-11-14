CREATE TABLE IF NOT EXISTS agent_skills (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  config_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  change_note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  config_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_skill_versions_skill_idx ON agent_skill_versions(skill_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_tools (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_admin_config (
  key TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_batches (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS eval_batches_case_idx ON eval_batches(case_id);

CREATE TABLE IF NOT EXISTS eval_run_batches (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS eval_run_batches_created_idx ON eval_run_batches(created_at DESC);

CREATE TABLE IF NOT EXISTS eval_batch_claims (
  batch_id TEXT NOT NULL,
  item_index INTEGER NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY(batch_id, item_index)
);

CREATE TABLE IF NOT EXISTS ops_ratings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  problem_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_ratings_run_idx ON ops_ratings(run_id);

CREATE TABLE IF NOT EXISTS ops_annotations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_annotations_run_idx ON ops_annotations(run_id);

CREATE TABLE IF NOT EXISTS ops_improvements (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_ab_tests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
