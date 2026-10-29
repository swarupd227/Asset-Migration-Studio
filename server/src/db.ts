import pg from 'pg';
import { EventEmitter } from 'node:events';

// PostgreSQL access. Every table is scoped by project_id; nested domain objects are stored as JSONB
// next to the columns that are filtered or updated on their own (status, version).

const connectionString = process.env.DATABASE_URL ?? 'postgres://ams:ams@localhost:5433/ams';
const ssl = /sslmode=require|azure\.com/.test(connectionString) ? { rejectUnauthorized: false } : undefined;

export const pool = new pg.Pool({ connectionString, ssl, max: 10 });

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, role TEXT NOT NULL, org TEXT NOT NULL, initials TEXT NOT NULL, can_approve TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, customer TEXT NOT NULL, mode TEXT NOT NULL, source_systems JSONB NOT NULL,
  target TEXT NOT NULL, industry_pack TEXT NOT NULL, ontology_version TEXT NOT NULL, region TEXT NOT NULL,
  shared_learning BOOLEAN NOT NULL DEFAULT false, status TEXT NOT NULL, created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ, archived BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS project_stages (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, n INT NOT NULL, status TEXT NOT NULL,
  started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, metric TEXT, PRIMARY KEY (project_id, n)
);
CREATE TABLE IF NOT EXISTS source_records (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL, key TEXT NOT NULL, data JSONB NOT NULL,
  PRIMARY KEY (project_id, kind, key)
);
CREATE TABLE IF NOT EXISTS extracts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, filename TEXT NOT NULL,
  table_name TEXT NOT NULL, row_count INT NOT NULL, columns JSONB NOT NULL, uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catalogue_tables (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, data JSONB NOT NULL,
  PRIMARY KEY (project_id, name)
);
CREATE TABLE IF NOT EXISTS items (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, type TEXT NOT NULL, id TEXT NOT NULL,
  status TEXT NOT NULL, version INT NOT NULL DEFAULT 1, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, type, id)
);
CREATE INDEX IF NOT EXISTS items_by_type ON items (project_id, type, status);
CREATE TABLE IF NOT EXISTS load_runs (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id TEXT NOT NULL, number INT NOT NULL, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (project_id, id)
);
CREATE TABLE IF NOT EXISTS signoffs (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, run_id TEXT NOT NULL, role TEXT NOT NULL,
  user_id TEXT NOT NULL, name TEXT NOT NULL, signature TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, run_id, role)
);
CREATE TABLE IF NOT EXISTS agent_events (
  id BIGSERIAL PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, ts TIMESTAMPTZ NOT NULL DEFAULT now(), data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_events_by_project ON agent_events (project_id, id DESC);
CREATE TABLE IF NOT EXISTS ontology_proposals (
  id TEXT PRIMARY KEY, status TEXT NOT NULL, data JSONB NOT NULL
);
-- Decision layer: typed decisions on records, a per-project cache, and one row per batch run.
CREATE TABLE IF NOT EXISTS model_decisions (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id TEXT NOT NULL, question_id TEXT NOT NULL,
  record_kind TEXT NOT NULL, record_key TEXT NOT NULL, input_hash TEXT NOT NULL, step TEXT NOT NULL, status TEXT NOT NULL,
  confidence REAL NOT NULL, answer TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);
CREATE INDEX IF NOT EXISTS model_decisions_by_question ON model_decisions (project_id, question_id, status);
CREATE INDEX IF NOT EXISTS model_decisions_by_record ON model_decisions (project_id, record_kind, record_key);
CREATE TABLE IF NOT EXISTS decision_cache (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, input_hash TEXT NOT NULL, question_id TEXT NOT NULL,
  ontology_version TEXT NOT NULL, model TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, input_hash, question_id, ontology_version, model)
);
CREATE TABLE IF NOT EXISTS decision_batches (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id TEXT NOT NULL, question_id TEXT NOT NULL,
  data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (project_id, id)
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS decision_model TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS decision_thresholds JSONB NOT NULL DEFAULT '{"auto": 0.85, "human": 0.60, "sample": 0.05}';
-- Skill library: how agents do the work (the mapping memory holds what was decided).
CREATE TABLE IF NOT EXISTS skills (
  id TEXT NOT NULL, version INT NOT NULL, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, scope TEXT NOT NULL,
  status TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);
CREATE INDEX IF NOT EXISTS skills_by_project ON skills (project_id, status);
CREATE TABLE IF NOT EXISTS skill_library (
  version TEXT PRIMARY KEY, published_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_by TEXT NOT NULL, skills JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_triggers (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, key TEXT NOT NULL, kind TEXT NOT NULL,
  skill_id TEXT, data JSONB NOT NULL, fired_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (project_id, key)
);
CREATE TABLE IF NOT EXISTS skill_uses (
  id BIGSERIAL PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, skill_id TEXT NOT NULL,
  version INT NOT NULL, agent TEXT NOT NULL, ref TEXT, items INT NOT NULL DEFAULT 1, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skill_uses_by_skill ON skill_uses (project_id, skill_id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS skill_library_version TEXT;
-- Evaluation runs on golden datasets; a release is gated on them.
CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY, release TEXT NOT NULL, dataset TEXT NOT NULL, model TEXT NOT NULL, passed BOOLEAN NOT NULL,
  result JSONB NOT NULL, gate JSONB NOT NULL, started_by TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Every external model call: tokens, cost and time, by project, agent and stage.
CREATE TABLE IF NOT EXISTS model_calls (
  id BIGSERIAL PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, stage INT, job_id TEXT,
  agent TEXT NOT NULL, model TEXT NOT NULL, purpose TEXT NOT NULL, input_tokens INT NOT NULL, output_tokens INT NOT NULL,
  cost_usd NUMERIC(12,6) NOT NULL, ms INT NOT NULL, outcome TEXT NOT NULL, error TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_calls_by_project ON model_calls (project_id, at);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS model_budget_usd NUMERIC(10,2);
-- Work queue: stage runs and decision batches run on any replica, one job per project at a time.
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempts INT NOT NULL DEFAULT 0, worker TEXT,
  requested_by TEXT NOT NULL, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs (status, created_at);
CREATE INDEX IF NOT EXISTS jobs_by_project ON jobs (project_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active ON jobs (project_id) WHERE status IN ('queued', 'running');
-- In-environment decision models trained on decisions people made or confirmed, one per project and question.
CREATE TABLE IF NOT EXISTS trained_models (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, question_id TEXT NOT NULL, version INT NOT NULL,
  active BOOLEAN NOT NULL, data JSONB NOT NULL, trained_by TEXT NOT NULL, trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, question_id, version)
);
-- Accepted ontology proposals that extend the served ontology, one row per change, with its version.
CREATE TABLE IF NOT EXISTS ontology_extensions (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, concept_id TEXT, kind TEXT NOT NULL, data JSONB NOT NULL,
  version TEXT NOT NULL, change TEXT NOT NULL, reason TEXT NOT NULL, source TEXT NOT NULL,
  accepted_by TEXT NOT NULL, accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log (
  project_id TEXT NOT NULL, seq INT NOT NULL, ts TIMESTAMPTZ NOT NULL, actor TEXT NOT NULL, actor_kind TEXT NOT NULL,
  action TEXT NOT NULL, target TEXT, detail TEXT, ontology_version TEXT, model TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL,
  PRIMARY KEY (project_id, seq)
);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS skills JSONB;
-- The audit log is write-once: no role, including administrators using the app, can change or remove entries.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
`;

export async function migrate() {
  await pool.query(SCHEMA);
}

// ---- Live events across replicas: every change goes through NOTIFY, every replica LISTENs ----

export const bus = new EventEmitter();
bus.setMaxListeners(200);
const CHANNEL = 'ams_events';

export async function publish(type: 'agent' | 'state', projectId: string, payload: unknown) {
  const msg = JSON.stringify({ type, projectId, payload });
  // NOTIFY payloads are limited to 8 kB; large events go by reference.
  if (msg.length < 7900) await pool.query('SELECT pg_notify($1, $2)', [CHANNEL, msg]);
  else await pool.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify({ type, projectId, payload: { truncated: true } })]);
}

export async function listen() {
  const connect = async () => {
    const c = new pg.Client({ connectionString, ssl });
    c.on('error', () => setTimeout(connect, 2000));
    c.on('notification', (n) => {
      if (!n.payload) return;
      const { type, projectId, payload } = JSON.parse(n.payload);
      bus.emit(type, projectId, payload);
    });
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
  };
  await connect();
}
