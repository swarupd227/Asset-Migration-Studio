import { createHash } from 'node:crypto';
import type {
  AgentEvent, AuditEntry, CatalogueTable, CodeRule, Dashboard, DecisionBatch, ModelDecision, Dataset, FixProposal, LoadRun, Mapping, Person, Project, Question, Stage, ValidationFailure,
} from './types.js';
import { bus, one, publish, q, tx } from './db.js';
import { conceptById, ONTOLOGY_VERSION } from './data/ontology.js';
import { conceptOf, dqSnapshot, hierarchyIssues, linkFixes, reconcile, runObjects, transform, validate } from './rules.js';

export const MODEL_LABEL = process.env.AMS_MODEL ?? 'claude-opus-5-5';

// ---------------- Static agent definitions ----------------

export const agents = [
  { id: 'orchestrator', name: 'Orchestrator', job: 'Plans stages, assigns work, tracks state and asks people for decisions.', guardrail: 'Cannot read data values or write to any target.', icon: 'workflow' },
  { id: 'harvester', name: 'Metadata Harvester', job: 'Reads the source data dictionary and IFS Cloud OData metadata.', guardrail: 'Read-only access only.', icon: 'database' },
  { id: 'profiler', name: 'Profiler', job: 'Profiles tables: null rates, distinct counts, patterns and broken references.', guardrail: 'Works on statistics and small samples.', icon: 'bar-chart' },
  { id: 'code-reader', name: 'Code Reader', job: 'Reads automation scripts, Java classes and escalations for hidden business rules.', guardrail: 'Never runs customer code.', icon: 'file-code' },
  { id: 'aligner', name: 'Concept Aligner', job: 'Binds each source field, table and code value to an ontology concept.', guardrail: 'No evidence means no binding.', icon: 'link' },
  { id: 'target-designer', name: 'Target Designer', job: 'Binds concepts to IFS Cloud objects and lists configuration needed.', guardrail: 'Configuration is approved by an IFS consultant.', icon: 'layout' },
  { id: 'hierarchy', name: 'Hierarchy Agent', job: 'Rebuilds source hierarchies as IFS functional and serial objects.', guardrail: "Uses the ontology's allowed-parent rules.", icon: 'git-branch' },
  { id: 'code-list', name: 'Code List Agent', job: 'Maps statuses, priorities, failure codes, units and crafts.', guardrail: 'Unmatched codes always go to a person.', icon: 'list' },
  { id: 'builder', name: 'Transformation Builder', job: 'Generates transformation code and unit tests from approved mappings.', guardrail: 'Code must pass its tests before it runs.', icon: 'hammer' },
  { id: 'validator', name: 'Validation Agent', job: 'Runs structural, reference, semantic and business rules.', guardrail: 'Reports only; cannot change data.', icon: 'shield-check' },
  { id: 'remediator', name: 'Remediation Agent', job: 'Proposes fixes such as merging duplicates or classifying untyped assets.', guardrail: 'Fixes run only after approval.', icon: 'wand' },
  { id: 'reconciler', name: 'Reconciliation Agent', job: 'Compares source and target: counts, totals, hierarchy and samples.', guardrail: 'Read-only on both sides.', icon: 'scale' },
  { id: 'assistant', name: 'Review Assistant', job: 'Explains evidence, answers questions and drafts decision notes.', guardrail: 'Cannot approve anything.', icon: 'sparkles' },
  { id: 'decision-model', name: 'Decision model', job: 'Answers typed questions on records, such as the failure mode a work order describes.', guardrail: 'Typed answers only; never sees names of people, customers or sites.', icon: 'gauge' },
  { id: 'steward', name: 'Ontology Steward', job: 'Proposes ontology additions from approved project decisions.', guardrail: 'Cannot publish ontology changes.', icon: 'book' },
];

export const STAGES: Omit<Stage, 'status'>[] = [
  { n: 1, key: 'connect', name: 'Connect', summary: 'Read-only access to the source and an IFS Cloud sandbox.', agents: ['orchestrator'], previewEligible: true },
  { n: 2, key: 'discover', name: 'Discover', summary: 'Catalogues of the source and target systems.', agents: ['harvester'], previewEligible: true },
  { n: 3, key: 'profile', name: 'Profile', summary: 'Measure the data and flag quality problems.', agents: ['profiler'], previewEligible: true },
  { n: 4, key: 'code', name: 'Read custom code', summary: 'Find business rules in scripts and enhancements.', agents: ['code-reader'], previewEligible: true },
  { n: 5, key: 'align', name: 'Align to ontology', summary: 'Bind source elements to ontology concepts.', agents: ['aligner', 'hierarchy', 'code-list'], previewEligible: true },
  { n: 6, key: 'design', name: 'Design target', summary: 'Bind concepts to IFS Cloud and list configuration.', agents: ['target-designer'], previewEligible: true },
  { n: 7, key: 'review', name: 'Review', summary: 'Decide mappings, lowest confidence and highest risk first.', agents: ['assistant'], previewEligible: false },
  { n: 8, key: 'build', name: 'Build transformations', summary: 'Generate and test transformation code.', agents: ['builder'], previewEligible: false },
  { n: 9, key: 'load', name: 'Dry-run load', summary: 'Load into the IFS sandbox through migration tooling.', agents: ['orchestrator'], previewEligible: false },
  { n: 10, key: 'validate', name: 'Validate', summary: 'Run the rule catalogue and propose fixes.', agents: ['validator', 'remediator'], previewEligible: false },
  { n: 11, key: 'reconcile', name: 'Reconcile', summary: 'Compare source and target and update the proof pack.', agents: ['reconciler'], previewEligible: false },
  { n: 12, key: 'signoff', name: 'Sign off', summary: 'Customer data owner and IFS consultant sign the proof pack.', agents: [], previewEligible: false },
  { n: 13, key: 'cutover', name: 'Delta loads & cutover', summary: 'Apply changes since the last load, then the production load.', agents: ['orchestrator'], previewEligible: false },
  { n: 14, key: 'learn', name: 'Learn', summary: 'Approved decisions go to the mapping memory.', agents: ['steward'], previewEligible: false },
];

// ---------------- Users ----------------

type UserRow = { id: string; name: string; email: string | null; role: Person['role']; org: string; initials: string; can_approve: string };
const toPerson = (u: UserRow): Person => ({ id: u.id, name: u.name, role: u.role, org: u.org, initials: u.initials, canApprove: u.can_approve });
export const listUsers = async () => (await q<UserRow>('SELECT * FROM users ORDER BY name')).map(toPerson);
export async function getUser(id: string) {
  const u = await one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return u ? toPerson(u) : undefined;
}

// ---------------- Projects and stages ----------------

type ProjectRow = { id: string; name: string; customer: string; mode: Project['mode']; source_systems: string[]; target: string; industry_pack: string; ontology_version: string; region: string; shared_learning: boolean; status: string; created_at: Date; expires_at: Date | null };
const toProject = (p: ProjectRow): Project => ({
  id: p.id, name: p.name, customer: p.customer, mode: p.mode, sourceSystems: p.source_systems, target: p.target, industryPack: p.industry_pack,
  ontologyVersion: p.ontology_version, region: p.region, sharedLearning: p.shared_learning, status: p.status,
  createdAt: p.created_at.toISOString(), expiresAt: p.expires_at?.toISOString(),
});
export const listProjects = async () => (await q<ProjectRow>('SELECT * FROM projects WHERE NOT archived ORDER BY created_at')).map(toProject);
export async function getProject(id: string) {
  const p = await one<ProjectRow>('SELECT * FROM projects WHERE id = $1 AND NOT archived', [id]);
  return p ? toProject(p) : undefined;
}
export async function updateProject(id: string, patch: Partial<Pick<Project, 'status' | 'name'>>) {
  if (patch.status) await q('UPDATE projects SET status = $2 WHERE id = $1', [id, patch.status]);
  if (patch.name) await q('UPDATE projects SET name = $2 WHERE id = $1', [id, patch.name]);
}

type StageRow = { n: number; status: Stage['status']; started_at: Date | null; finished_at: Date | null; metric: string | null };
export async function getStages(pid: string): Promise<Stage[]> {
  const rows = await q<StageRow>('SELECT * FROM project_stages WHERE project_id = $1', [pid]);
  const by = new Map(rows.map((r) => [r.n, r]));
  return STAGES.map((s) => {
    const r = by.get(s.n);
    return { ...s, status: r?.status ?? 'locked', startedAt: r?.started_at?.toISOString(), finishedAt: r?.finished_at?.toISOString(), metric: r?.metric ?? undefined };
  });
}
export async function setStage(pid: string, n: number, patch: { status?: Stage['status']; metric?: string; started?: boolean; finished?: boolean }) {
  await q(
    `INSERT INTO project_stages (project_id, n, status, metric, started_at, finished_at) VALUES ($1, $2, COALESCE($3, 'locked'), $4,
       CASE WHEN $5 THEN now() END, CASE WHEN $6 THEN now() END)
     ON CONFLICT (project_id, n) DO UPDATE SET
       status = COALESCE($3, project_stages.status), metric = COALESCE($4, project_stages.metric),
       started_at = CASE WHEN $5 THEN now() ELSE project_stages.started_at END,
       finished_at = CASE WHEN $6 THEN now() ELSE project_stages.finished_at END`,
    [pid, n, patch.status ?? null, patch.metric ?? null, !!patch.started, !!patch.finished],
  );
}
export const runningStage = async (pid: string) => (await one<{ n: number }>(`SELECT n FROM project_stages WHERE project_id = $1 AND status = 'running'`, [pid]))?.n ?? null;

// ---------------- Source records ----------------

export async function loadDataset(pid: string): Promise<Dataset> {
  const rows = await q<{ kind: string; data: unknown }>('SELECT kind, data FROM source_records WHERE project_id = $1 ORDER BY kind, key', [pid]);
  const ds: Dataset = { assets: [], locations: [], workOrders: [], pms: [], meters: [] };
  for (const r of rows) {
    if (r.kind === 'asset') ds.assets.push(r.data as Dataset['assets'][number]);
    else if (r.kind === 'location') ds.locations.push(r.data as Dataset['locations'][number]);
    else if (r.kind === 'workorder') ds.workOrders.push(r.data as Dataset['workOrders'][number]);
    else if (r.kind === 'pm') ds.pms.push(r.data as Dataset['pms'][number]);
    else if (r.kind === 'meter') ds.meters.push(r.data as Dataset['meters'][number]);
  }
  for (const a of ds.assets) a.conceptId = conceptOf(a);
  return ds;
}

export async function insertRecords(pid: string, records: { kind: string; key: string; data: unknown }[]) {
  for (let i = 0; i < records.length; i += 2000) {
    await q(
      `INSERT INTO source_records (project_id, kind, key, data)
       SELECT $1, x.kind, x.key, x.data FROM jsonb_to_recordset($2::jsonb) AS x(kind text, key text, data jsonb)
       ON CONFLICT (project_id, kind, key) DO UPDATE SET data = EXCLUDED.data`,
      [pid, JSON.stringify(records.slice(i, i + 2000))],
    );
  }
}

export async function getCatalogue(pid: string): Promise<CatalogueTable[]> {
  return (await q<{ data: CatalogueTable }>('SELECT data FROM catalogue_tables WHERE project_id = $1 ORDER BY name', [pid])).map((r) => r.data);
}
export async function getCatalogueSize(pid: string) {
  const t = await getCatalogue(pid);
  return { tables: t.length, fields: t.reduce((s, x) => s + x.fields.length, 0), custom: t.filter((x) => x.custom).length + t.reduce((s, x) => s + x.fields.filter((f) => f.custom).length, 0) };
}

// ---------------- Items (mappings, questions, fixes, code rules) ----------------

type ItemType = 'mapping' | 'question' | 'fix' | 'code_rule';
export async function getItems<T>(pid: string, type: ItemType): Promise<T[]> {
  return (await q<{ data: T }>('SELECT data FROM items WHERE project_id = $1 AND type = $2 ORDER BY id', [pid, type])).map((r) => r.data);
}
export async function getItem<T>(pid: string, type: ItemType, id: string): Promise<T | undefined> {
  return (await one<{ data: T }>('SELECT data FROM items WHERE project_id = $1 AND type = $2 AND id = $3', [pid, type, id]))?.data;
}
export async function putItems(pid: string, type: ItemType, list: { id: string; status: string; version?: number }[]) {
  if (!list.length) return;
  await q(
    `INSERT INTO items (project_id, type, id, status, version, data)
     SELECT $1, $2, x.id, x.status, COALESCE(x.version, 1), x.data FROM jsonb_to_recordset($3::jsonb) AS x(id text, status text, version int, data jsonb)
     ON CONFLICT (project_id, type, id) DO UPDATE SET status = EXCLUDED.status, version = EXCLUDED.version, data = EXCLUDED.data, updated_at = now()`,
    [pid, type, JSON.stringify(list.map((x) => ({ id: x.id, status: x.status, version: x.version ?? 1, data: x })))],
  );
}
export const putItem = (pid: string, type: ItemType, item: { id: string; status: string; version?: number }) => putItems(pid, type, [item]);

export const getMappings = (pid: string) => getItems<Mapping>(pid, 'mapping');
export const getFixes = (pid: string) => getItems<FixProposal>(pid, 'fix');
export const getQuestions = (pid: string) => getItems<Question>(pid, 'question');
export const getCodeRules = (pid: string) => getItems<CodeRule>(pid, 'code_rule');

/** Upserts fix proposals, keeping the decision on proposals that already exist. */
export async function upsertFixes(pid: string, proposals: FixProposal[]) {
  const existing = new Map((await getFixes(pid)).map((f) => [f.id, f]));
  await putItems(pid, 'fix', proposals.map((p) => ({ ...p, status: existing.get(p.id)?.status ?? p.status })));
}

// ---------------- Runs and sign-offs ----------------

export const getRuns = async (pid: string) => (await q<{ data: LoadRun }>('SELECT data FROM load_runs WHERE project_id = $1 ORDER BY number', [pid])).map((r) => r.data);
export async function addRun(pid: string, run: LoadRun) {
  await q('INSERT INTO load_runs (project_id, id, number, data) VALUES ($1, $2, $3, $4)', [pid, run.id, run.number, JSON.stringify(run)]);
}
export const getSignoffs = async (pid: string) =>
  (await q<{ role: string; name: string; at: Date; run_id: string; signature: string }>('SELECT * FROM signoffs WHERE project_id = $1 ORDER BY at', [pid]))
    .map((s) => ({ role: s.role, name: s.name, at: s.at.toISOString(), runId: s.run_id, signature: s.signature }));

// ---------------- Audit log (write-once, hash-chained per project) ----------------

const hash = (prev: string, payload: object) => createHash('sha256').update(prev + JSON.stringify(payload)).digest('hex');

export async function audit(pid: string, actor: string, actorKind: AuditEntry['actorKind'], action: string, target?: string, detail?: string, at?: string): Promise<AuditEntry> {
  return tx(async (c) => {
    // Serialise appends per project so the chain never forks.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [pid]);
    const last = (await c.query<{ seq: number; hash: string }>('SELECT seq, hash FROM audit_log WHERE project_id = $1 ORDER BY seq DESC LIMIT 1', [pid])).rows[0];
    const ts = at ?? new Date().toISOString();
    const base = { seq: (last?.seq ?? 0) + 1, ts, actor, actorKind, action, target, detail, ontologyVersion: actorKind === 'agent' ? ONTOLOGY_VERSION : undefined, model: actorKind === 'agent' ? MODEL_LABEL : undefined };
    const prevHash = last?.hash ?? '0'.repeat(64);
    const entry: AuditEntry = { ...base, prevHash, hash: hash(prevHash, base) };
    await c.query(
      'INSERT INTO audit_log (project_id, seq, ts, actor, actor_kind, action, target, detail, ontology_version, model, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [pid, entry.seq, ts, actor, actorKind, action, target ?? null, detail ?? null, base.ontologyVersion ?? null, base.model ?? null, prevHash, entry.hash],
    );
    return entry;
  });
}

type AuditRow = { seq: number; ts: Date; actor: string; actor_kind: AuditEntry['actorKind']; action: string; target: string | null; detail: string | null; ontology_version: string | null; model: string | null; prev_hash: string; hash: string };
export async function auditEntries(pid: string): Promise<AuditEntry[]> {
  return (await q<AuditRow>('SELECT * FROM audit_log WHERE project_id = $1 ORDER BY seq', [pid])).map((r) => ({
    seq: r.seq, ts: r.ts.toISOString(), actor: r.actor, actorKind: r.actor_kind, action: r.action, target: r.target ?? undefined, detail: r.detail ?? undefined,
    ontologyVersion: r.ontology_version ?? undefined, model: r.model ?? undefined, prevHash: r.prev_hash, hash: r.hash,
  }));
}
export async function verifyAudit(pid: string) {
  const entries = await auditEntries(pid);
  let prev = '0'.repeat(64);
  for (const e of entries) {
    const { hash: h, prevHash, ...base } = e;
    if (prevHash !== prev || hash(prev, base) !== h) return { ok: false, brokenAt: e.seq, entries: entries.length };
    prev = h;
  }
  return { ok: true, entries: entries.length, head: prev };
}

// ---------------- Agent events and change notifications ----------------

export async function emitAgent(pid: string, e: Omit<AgentEvent, 'id' | 'ts'>) {
  const row = await one<{ id: string; ts: Date }>('INSERT INTO agent_events (project_id, data) VALUES ($1, $2) RETURNING id, ts', [pid, JSON.stringify(e)]);
  const full: AgentEvent = { id: `ev-${row!.id}`, ts: row!.ts.toISOString(), ...e };
  await publish('agent', pid, full);
  return full;
}
export async function recentEvents(pid: string, limit = 60): Promise<AgentEvent[]> {
  const rows = await q<{ id: string; ts: Date; data: Omit<AgentEvent, 'id' | 'ts'> }>('SELECT id, ts, data FROM agent_events WHERE project_id = $1 ORDER BY id DESC LIMIT $2', [pid, limit]);
  return rows.reverse().map((r) => ({ id: `ev-${r.id}`, ts: r.ts.toISOString(), ...r.data }));
}
export const touch = (pid: string) => { stateCache.delete(pid); return publish('state', pid, { at: Date.now() }); };

// ---------------- Decisions ----------------

export async function getDecisions(pid: string, f: { question?: string; status?: string; step?: string; record?: string; limit?: number; offset?: number }) {
  const where = ['project_id = $1'];
  const params: unknown[] = [pid];
  const add = (col: string, v?: string) => { if (v) { params.push(v); where.push(`${col} = $${params.length}`); } };
  add('question_id', f.question); add('status', f.status); add('step', f.step); add('record_key', f.record);
  params.push(Math.min(500, f.limit ?? 100), f.offset ?? 0);
  const rows = await q<{ data: ModelDecision; status: string; step: string; answer: string }>(
    `SELECT data, status, step, answer FROM model_decisions WHERE ${where.join(' AND ')} ORDER BY confidence ASC, record_key LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows.map((r) => ({ ...r.data, status: r.status, step: r.step, answer: r.answer }) as ModelDecision);
}

export async function decisionStats(pid: string) {
  const byStep = await q<{ question_id: string; step: string; status: string; n: number; conf: number }>(
    'SELECT question_id, step, status, count(*)::int AS n, avg(confidence)::real AS conf FROM model_decisions WHERE project_id = $1 GROUP BY question_id, step, status', [pid]);
  const answers = await q<{ question_id: string; answer: string; n: number }>(
    `SELECT question_id, answer, count(*)::int AS n FROM model_decisions WHERE project_id = $1 AND status <> 'needs_review' GROUP BY question_id, answer ORDER BY n DESC`, [pid]);
  const batches = (await q<{ data: DecisionBatch }>('SELECT data FROM decision_batches WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20', [pid])).map((r) => r.data);
  return { byStep, answers, batches };
}

// ---------------- Derived project state ----------------

// Derived project state is memoised per project and dropped on every change notification,
// which every replica receives through LISTEN/NOTIFY.
const stateCache = new Map<string, { at: number; value: Promise<Awaited<ReturnType<typeof computeState>>> }>();
bus.on('state', (pid: string) => stateCache.delete(pid));

export function projectState(pid: string) {
  const hit = stateCache.get(pid);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = computeState(pid);
  stateCache.set(pid, { at: Date.now(), value });
  value.catch(() => stateCache.delete(pid));
  return value;
}

async function computeState(pid: string) {
  const [raw, fixes, mappings] = await Promise.all([loadDataset(pid), getFixes(pid), getMappings(pid)]);
  const rawFailures = validate(raw);
  const cur = transform(raw, fixes, mappings);
  const curFailures = linkFixes(validate(cur), fixes);
  return { raw, rawFailures, cur, curFailures, fixes, mappings };
}

export async function currentValidation(pid: string): Promise<ValidationFailure[]> {
  return (await projectState(pid)).curFailures;
}

export async function quality(pid: string) {
  const s = await projectState(pid);
  return { dq: dqSnapshot(s.raw, s.rawFailures, s.cur, s.curFailures), fixes: s.fixes, issues: hierarchyIssues(s.rawFailures, s.fixes) };
}

export async function buildRun(pid: string, number: number): Promise<LoadRun> {
  const s = await projectState(pid);
  // History older than five years is summarised, not loaded record by record (BR-01).
  const woRows = (await getCatalogue(pid)).find((t) => t.name === 'WORKORDER')?.rows ?? 0;
  const older = Math.max(0, woRows - s.raw.workOrders.length);
  const objects = runObjects(s.raw, s.cur, s.curFailures, { history: older, attrs: s.cur.assets.reduce((n, a) => n + Object.keys(a.specs).length, 0) });
  const byRule = new Map<string, number>();
  for (const f of s.curFailures) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  return {
    id: `RUN-${number}`, number, kind: 'dry_run', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    transformationVersion: `T-${new Date().toISOString().slice(0, 7).replace('-', '.')}.${number}`, ontologyVersion: ONTOLOGY_VERSION, status: 'complete',
    objects, validation: [...byRule.entries()].map(([rule, failures]) => ({ rule, failures })),
    dqScore: dqSnapshot(s.raw, s.rawFailures, s.cur, s.curFailures).overallAfter,
    reconciliation: reconcile(s.raw, s.cur, objects, s.curFailures),
    errors: s.curFailures.filter((f) => f.severity === 'error').slice(0, 50).map((f) => ({ record: f.record, object: f.object, ifsMessage: `${f.rule}: ${f.reason}` })),
  };
}

/** A run can be signed when it has no failing reconciliation checks and no open errors. */
export function runSignable(run: LoadRun) {
  return !run.reconciliation?.some((c) => c.outcome === 'fail') && !run.errors.length;
}

export async function dashboard(pid: string): Promise<Dashboard & { running: number | null }> {
  const [project, stages, mappings, questions, codeRules, q2, running] = await Promise.all([
    getProject(pid), getStages(pid), getMappings(pid), getQuestions(pid), getCodeRules(pid), quality(pid), runningStage(pid),
  ]);
  const fx = q2.fixes.filter((f) => f.status === 'proposed');
  const open = (m: Mapping) => m.status === 'proposed' || m.status === 'question';
  const needsYou: Dashboard['needsYou'] = [];
  const named = mappings.filter((m) => m.path === 'named' && open(m));
  if (named.length) needsYou.push({ id: 'n-named', title: `${named.length} safety-critical or regulatory items need a named reviewer`, detail: named.map((m) => m.sourceElements[0]).join(', '), href: '/review?path=named', role: 'Data subject expert', severity: 'high' });
  const expert = mappings.filter((m) => m.path === 'expert' && open(m));
  if (expert.length) needsYou.push({ id: 'n-expert', title: `${expert.length} low-confidence mappings need expert review`, detail: 'Lowest confidence first', href: '/review?path=expert', role: 'Data subject expert', severity: 'high' });
  const oq = questions.filter((x) => x.status === 'open');
  if (oq.length) needsYou.push({ id: 'n-q', title: `${oq.length} business questions are open`, detail: oq.map((x) => x.text.split('?')[0]).slice(0, 2).join(' · '), href: '/review?tab=questions', role: 'Customer data owner', severity: 'medium' });
  if (fx.length) needsYou.push({ id: 'n-fx', title: `${fx.length} data fixes awaiting approval`, detail: `${fx.filter((f) => f.kind === 'merge_duplicate').length} duplicate merges · ${fx.filter((f) => f.kind === 'reparent').length} re-parents · ${fx.filter((f) => f.kind === 'classify').length} classifications`, href: '/quality', role: 'Data subject expert', severity: 'medium' });
  const cr = codeRules.filter((r) => r.status === 'proposed');
  if (cr.length) needsYou.push({ id: 'n-cr', title: `${cr.length} business rules found in custom code to confirm`, detail: cr.map((r) => r.id).join(', '), href: '/discovery?tab=rules', role: 'Migration lead', severity: 'low' });
  const review = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM model_decisions WHERE project_id = $1 AND status = 'needs_review'`, [pid]))?.n ?? 0;
  if (review) needsYou.push({ id: 'n-dec', title: `${review.toLocaleString('en-GB')} work-order tags need a person`, detail: 'Low confidence or the two models disagree', href: '/decisions?status=needs_review', role: 'Data subject expert', severity: 'medium' });
  const quick = mappings.filter((m) => m.path === 'quick' && open(m));
  if (quick.length) needsYou.push({ id: 'n-quick', title: `${quick.length} mappings ready for quick review`, detail: 'Strong evidence; approve or change', href: '/review?path=quick', role: 'Data subject expert', severity: 'low' });
  const sample = mappings.filter((m) => m.path === 'auto' && m.sampled && m.status === 'auto_accepted');
  const assetsCount = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM source_records WHERE project_id = $1 AND kind = 'asset'`, [pid]))?.n ?? 0;
  const woCount = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM source_records WHERE project_id = $1 AND kind = 'workorder'`, [pid]))?.n ?? 0;
  return {
    project: project!, stages, running,
    kpis: {
      sourceElements: mappings.length,
      mapped: mappings.filter((m) => ['approved', 'changed', 'auto_accepted'].includes(m.status)).length,
      notMigrated: mappings.filter((m) => m.status === 'not_migrated').length,
      openQuestions: oq.length,
      autoAccepted: mappings.filter((m) => m.path === 'auto').length,
      quickReview: mappings.filter((m) => m.path === 'quick').length,
      expertReview: mappings.filter((m) => m.path === 'expert').length,
      namedReview: mappings.filter((m) => m.path === 'named').length,
      pendingReview: mappings.filter(open).length + sample.length,
      precedentShare: mappings.length ? mappings.filter((m) => m.precedents.some((p) => p.outcome === 'approved')).length / mappings.length : 0,
      dqBefore: q2.dq.overallBefore, dqAfter: q2.dq.overallAfter,
      assets: assetsCount, workOrders: Math.max(woCount, (await getCatalogue(pid)).find((t) => t.name === 'WORKORDER')?.rows ?? 0),
      hiddenRules: codeRules.length, fixesPending: fx.length,
    },
    needsYou,
  };
}

export async function aiReadyAsset(pid: string, num?: string) {
  const s = await projectState(pid);
  const a =s.cur.assets.find((x) => x.assetnum === num) ?? s.cur.assets.find((x) => s.cur.meters.some((m) => m.assetnum === x.assetnum)) ?? s.cur.assets[0];
  if (!a) return null;
  const c = conceptById.get(conceptOf(a) ?? '')!;
  const loc = s.cur.locations.find((l) => l.location === a.location);
  const sys = s.cur.locations.find((l) => l.location === loc?.parent);
  const siteLoc = s.cur.locations.find((l) => l.location === a.siteid);
  const children = s.cur.assets.filter((x) => x.parent === a.assetnum);
  const contract = ({ NORTH: 'NV10', RIVR: 'NV20', LAKE: 'NV30', HARB: 'NV40', EAST: 'NV50' } as Record<string, string>)[a.siteid] ?? a.siteid;
  const units: Record<string, string> = { RATEDFLOW: 'm³/h', RATEDHEAD: 'm', RATEDPOWER: 'kW', RATINGKVA: 'kVA', VOLTAGE: 'V', SPEED: 'rpm', SIZE: 'mm', DOSERATE: 'kg/day', BREAKKA: 'kA', RATEDCURRENT: 'A', OILVOL: 'L', PRIMARYKV: 'kV', RATEDKV: 'kV' };
  const meter = s.cur.meters.find((m) => m.assetnum === a.assetnum);
  const wos = s.cur.workOrders.filter((w) => w.assetnum === a.assetnum);
  const runs = await getRuns(pid);
  return {
    '@context': { iao: 'https://ontology.artizent.com/iao/2.4/', util: 'https://ontology.artizent.com/iao/2.4/utilities/', ifs: 'urn:ifs:cloud:', schema: 'https://schema.org/' },
    '@id': `ifs:EquipmentSerial/${contract}/${a.assetnum}`,
    '@type': [c?.id, c?.parent ?? 'core:PhysicalAsset'],
    label: a.description,
    ontologyClass: c && { id: c.id, label: c.label, definition: c.definition, standard: c.standard, version: ONTOLOGY_VERSION },
    identity: { objectId: a.assetnum, serialNo: a.serialnum, manufacturer: a.manufacturer, model: a.model, installed: a.installDate },
    placement: {
      site: { id: contract, name: siteLoc?.description ?? a.siteid },
      functionalPath: [siteLoc?.description, sys?.description, loc?.description].filter(Boolean),
      parentObject: a.parent ?? a.location,
      children: children.map((x) => ({ id: x.assetnum, class: conceptById.get(conceptOf(x) ?? '')?.label })),
    },
    criticality: { value: ['E', 'D', 'C', 'B', 'A'][a.criticality - 1], scale: 'A (highest) – E', source: 'ASSET.NV_CRITCODE' },
    technicalAttributes: Object.entries(a.specs).map(([k, v]) => ({ name: k, value: v, unit: units[k] })),
    failureVocabulary: (c?.failureModes ?? []).map((f) => ({ code: f.match(/\((\w+)\)/)?.[1], label: f.replace(/\s*\(\w+\)/, ''), scheme: 'ISO 14224' })),
    allowedParents: (c?.allowedParents ?? []).map((p) => conceptById.get(p)?.label),
    measurements: meter ? [{ parameter: 'Runtime hours', concept: 'util:RuntimeHours', cumulative: true, lastValue: meter.readings.at(-1)!.value, unit: 'h', lastRead: meter.readings.at(-1)!.date }] : [],
    maintenance: { pmActions: s.cur.pms.filter((p) => p.assetnum === a.assetnum).map((p) => ({ id: p.pmnum, name: p.description, trigger: p.frequnit === 'HOURS' ? `meter · ${p.frequency} h` : `calendar · ${p.frequency} ${p.frequnit.toLowerCase()}` })) },
    failureHistory: await failureHistory(pid, wos.map((w) => w.wonum)),
    workHistory: {
      openWorkOrders: wos.filter((w) => !['CLOSE', 'COMP'].includes(w.status)).length,
      closedLast5Years: wos.filter((w) => ['CLOSE', 'COMP'].includes(w.status)).length,
      topFailureModes: [...wos.reduce((m, w) => (w.failurecode ? m.set(w.failurecode, (m.get(w.failurecode) ?? 0) + 1) : m), new Map<string, number>())].map(([code, count]) => ({ code, count })),
    },
    provenance: { source: `Maximo 7.6 · ASSET/${a.assetnum}`, mappings: ['M-001', 'M-002', 'M-005', 'M-009', 'M-010', 'M-020', 'M-021', 'M-022'], loadRun: runs.at(-1)?.id, transformation: runs.at(-1)?.transformationVersion },
  };
}

async function failureHistory(pid: string, wonums: string[]) {
  if (!wonums.length) return [];
  const rows = await q<{ answer: string; n: number; conf: number; review: number }>(
    `SELECT answer, count(*)::int AS n, avg(confidence)::real AS conf, count(*) FILTER (WHERE status = 'needs_review')::int AS review
     FROM model_decisions WHERE project_id = $1 AND question_id = 'wo.failure_mode' AND record_key = ANY($2) GROUP BY answer ORDER BY n DESC`, [pid, wonums]);
  return rows.map((r) => ({ mode: r.answer, code: r.answer.match(/\((\w+)\)/)?.[1] ?? null, count: r.n, confidence: Math.round(r.conf * 100) / 100, needsReview: r.review }));
}
