import express, { type NextFunction, type Request, type Response, Router } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { bus, listen, one, pool, q } from './db.js';
import { bootstrap, createProject, reloadNorthvale } from './bootstrap.js';
import {
  agents, aiReadyAsset, audit, auditEntries, currentValidation, dashboard, emitAgent, getCatalogue, getCodeRules, getFixes, getItem, getMappings,
  getProject, getQuestions, getRuns, getSignoffs, getStages, getUser, insertRecords, listProjects, listUsers, loadDataset, MODEL_LABEL, projectState, putItem,
  putItems, quality, recentEvents, runSignable, setStage, touch, verifyAudit,
} from './store.js';
import { concepts, ontologyChangeLog, standards, woStatusCodeList, ONTOLOGY_VERSION, INDUSTRY_PACK } from './data/ontology.js';
import { workOrderStats } from './data/seed.js';
import { catalogueEntry, impliedSites, parseCsv, tableFromFilename, toRecords } from './extracts.js';
import { randomBytes } from 'node:crypto';
import { hierarchyIssues, hierarchyTree, rules } from './rules.js';
import { reviewProgressNudge, runStage } from './agents/orchestrator.js';
import { answer, liveModel, type ChatTurn } from './agents/assistant.js';
import type { CodeRule, Mapping, Person, Question } from './types.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const parse = <T,>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
};
async function actorOf(req: Request): Promise<Person> {
  const id = String(req.body?.actor ?? req.query.actor ?? req.header('x-user-id') ?? '');
  const u = await getUser(id);
  if (!u) throw new HttpError(401, 'Unknown user');
  return u;
}

// ---------- Platform ----------
app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

app.get('/api/meta', wrap(async (req, res) => {
  const pid = req.query.project ? String(req.query.project) : undefined;
  const sites = pid
    ? (await q<{ data: { location: string; description: string } }>(`SELECT data FROM source_records WHERE project_id = $1 AND kind = 'location' AND data->>'type' = 'SITE' ORDER BY key`, [pid]))
      .map((r) => ({ id: r.data.location, name: r.data.description, kind: /substation/i.test(r.data.description) ? 'power' : 'water', region: '' }))
    : [];
  res.json({ agents, people: await listUsers(), sites, rules, liveModel, model: MODEL_LABEL, ontologyVersion: ONTOLOGY_VERSION, industryPack: INDUSTRY_PACK });
}));

app.get('/api/projects', wrap(async (_req, res) => {
  const projects = await listProjects();
  const stats = await q<{ project_id: string; done: number; pending: number; records: number }>(
    `SELECT p.id AS project_id,
       (SELECT count(*)::int FROM project_stages s WHERE s.project_id = p.id AND s.status = 'done') AS done,
       (SELECT count(*)::int FROM items i WHERE i.project_id = p.id AND i.type = 'mapping' AND i.status IN ('proposed','question')) AS pending,
       (SELECT count(*)::int FROM source_records r WHERE r.project_id = p.id) AS records
     FROM projects p WHERE NOT p.archived`);
  const by = new Map(stats.map((s) => [s.project_id, s]));
  res.json(projects.map((x) => ({ ...x, stagesDone: by.get(x.id)?.done ?? 0, pendingReview: by.get(x.id)?.pending ?? 0, records: by.get(x.id)?.records ?? 0 })));
}));

const NewProject = z.object({
  name: z.string().trim().min(3).max(80),
  customer: z.string().trim().min(2).max(80),
  mode: z.enum(['delivery', 'preview']),
  sourceSystems: z.array(z.string().min(2)).min(1),
  target: z.string().min(2),
  industryPack: z.string().optional(),
  ontologyVersion: z.string().optional(),
  region: z.string().min(2),
  actor: z.string(),
});
app.post('/api/projects', wrap(async (req, res) => {
  const actor = await actorOf(req);
  if (!['Migration lead', 'Sales engineer'].includes(actor.role)) throw new HttpError(403, 'Only migration leads and sales engineers create projects');
  const input = parse(NewProject, req.body);
  if (actor.role === 'Sales engineer' && input.mode !== 'preview') throw new HttpError(403, 'Sales engineers create preview workspaces only');
  res.status(201).json(await createProject(input, actor));
}));

app.get('/api/ontology', wrap(async (_req, res) => {
  const proposals = (await q<{ data: object; status: string }>('SELECT data, status FROM ontology_proposals ORDER BY id')).map((r) => ({ ...r.data, status: r.status }));
  res.json({ version: ONTOLOGY_VERSION, pack: INDUSTRY_PACK, concepts, codeList: woStatusCodeList, standards, changeLog: ontologyChangeLog, proposals });
}));
app.post('/api/ontology/proposals/:id', wrap(async (req, res) => {
  const actor = await actorOf(req);
  if (actor.role !== 'Ontology curator') throw new HttpError(403, 'Only the ontology curator can accept ontology proposals');
  const status = req.body.decision === 'reject' ? 'rejected' : 'accepted';
  const row = await one<{ data: object }>('UPDATE ontology_proposals SET status = $2 WHERE id = $1 RETURNING data', [req.params.id, status]);
  if (!row) throw new HttpError(404, 'Not found');
  res.json({ ...row.data, status });
}));

// Live agent activity and change notifications for one project (works across replicas via LISTEN/NOTIFY).
app.get('/api/stream', wrap(async (req, res) => {
  const pid = String(req.query.project ?? '');
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  send('hello', { events: pid ? await recentEvents(pid) : [] });
  const onAgent = (p: string, e: unknown) => { if (p === pid) send('agent', e); };
  const onState = (p: string, e: unknown) => { if (p === pid) send('state', e); };
  bus.on('agent', onAgent);
  bus.on('state', onState);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); bus.off('agent', onAgent); bus.off('state', onState); });
}));

// ---------- Project-scoped API ----------
const p = Router({ mergeParams: true });
app.use('/api/projects/:pid', (req: Request, res: Response, next: NextFunction) => {
  getProject(String(req.params.pid)).then((x) => (x ? next() : res.status(404).json({ error: 'Project not found' }))).catch(next);
}, p);
const pidOf = (req: Request) => String(req.params.pid);

p.get('/dashboard', wrap(async (req, res) => res.json(await dashboard(pidOf(req)))));

p.post('/stages/:n/run', wrap(async (req, res) => {
  const pid = pidOf(req);
  const n = Number(req.params.n);
  const actor = await actorOf(req);
  if (n === 12) throw new HttpError(400, 'Sign-off is done in the proof pack');
  const stage = (await getStages(pid)).find((s) => s.n === n);
  if (!stage || stage.status === 'locked') throw new HttpError(400, 'Stage is locked');
  if (stage.status === 'running') throw new HttpError(409, 'Stage is already running');
  const hasData = await one<{ n: number }>(`SELECT count(*)::int AS n FROM source_records WHERE project_id = $1`, [pid]);
  if (n >= 2 && !hasData?.n) throw new HttpError(400, 'Upload a source extract or connect a source system first');
  runStage(pid, n, actor.name).catch((e) => emitAgent(pid, { agent: 'orchestrator', kind: 'error', text: String(e?.message ?? e) }));
  res.status(202).json({ ok: true });
}));

// Extracts (CSV with a header row; the table is taken from ?table or the file name)
p.get('/extracts', wrap(async (req, res) => {
  res.json(await q(`SELECT id, filename, table_name AS "table", row_count AS rows, columns, uploaded_by AS "uploadedBy", uploaded_at AS "uploadedAt" FROM extracts WHERE project_id = $1 ORDER BY uploaded_at DESC`, [pidOf(req)]));
}));
p.post('/extracts', express.text({ type: () => true, limit: '50mb' }), wrap(async (req, res) => {
  const pid = pidOf(req);
  const actor = await actorOf(req);
  if (['Ontology curator', 'Customer data owner'].includes(actor.role)) throw new HttpError(403, `${actor.role} cannot upload extracts`);
  const filename = String(req.query.filename ?? 'extract.csv');
  if (!/\.(csv|txt)$/i.test(filename)) throw new HttpError(400, 'Upload CSV files with a header row (export Excel and Parquet to CSV first)');
  const rows = parseCsv(typeof req.body === 'string' ? req.body : '');
  if (rows.length < 2) throw new HttpError(400, 'The file has no data rows');
  const [header, ...data] = rows;
  const table = String(req.query.table || tableFromFilename(filename)).toUpperCase();
  const records = toRecords(table, header, data);
  const existingLocs = new Set((await loadDataset(pid)).locations.map((l) => l.location).concat(records.filter((r) => r.kind === 'location').map((r) => r.key)));
  await insertRecords(pid, [...records, ...impliedSites(records, existingLocs)]);
  const entry = catalogueEntry(table, header, data);
  await q('INSERT INTO catalogue_tables (project_id, name, data) VALUES ($1, $2, $3) ON CONFLICT (project_id, name) DO UPDATE SET data = EXCLUDED.data', [pid, table, JSON.stringify(entry)]);
  const id = `EX-${randomBytes(4).toString('hex')}`;
  await q('INSERT INTO extracts (id, project_id, filename, table_name, row_count, columns, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, pid, filename, table, data.length, JSON.stringify(header), actor.name]);
  await audit(pid, actor.name, 'user', 'extract.upload', filename, `${table} · ${data.length.toLocaleString('en-GB')} rows · ${header.length} columns`);
  for (const n of [2, 3]) if ((await getStages(pid)).find((s) => s.n === n)?.status === 'locked') await setStage(pid, n, { status: 'ready' });
  await setStage(pid, 1, { status: 'done', finished: true });
  await emitAgent(pid, { agent: 'profiler', kind: 'result', text: `${filename}: ${data.length.toLocaleString('en-GB')} rows profiled into ${table} (${entry.fields.filter((f) => f.custom).length} custom columns, ${records.length.toLocaleString('en-GB')} records loaded).` });
  await touch(pid);
  res.status(201).json({ id, table, rows: data.length, columns: header.length, records: records.length, custom: entry.fields.filter((f) => f.custom).map((f) => f.name) });
}));

// Discovery
p.get('/catalogue', wrap(async (req, res) => {
  const pid = pidOf(req);
  const [tables, ds] = await Promise.all([getCatalogue(pid), loadDataset(pid)]);
  const meter = ds.meters.find((m) => m.readings.some((r, i) => i > 0 && r.value < m.readings[i - 1].value)) ?? ds.meters[0];
  const woTable = tables.find((t) => t.name === 'WORKORDER');
  res.json({
    tables,
    stats: { ...workOrderStats, open: ds.workOrders.length, closed: woTable ? woTable.rows - ds.workOrders.length : 0, pmPlans: ds.pms.length },
    sampleWorkOrders: ds.workOrders.slice(80, 92),
    badMeter: meter ? { asset: meter.assetnum, meter: meter.metername, readings: meter.readings } : null,
  });
}));
p.get('/code-rules', wrap(async (req, res) => res.json(await getCodeRules(pidOf(req)))));
p.post('/code-rules/:id', wrap(async (req, res) => {
  const pid = pidOf(req);
  const actor = await actorOf(req);
  const r = await getItem<CodeRule>(pid, 'code_rule', String(req.params.id));
  if (!r) throw new HttpError(404, 'Not found');
  r.status = req.body.decision === 'dismiss' ? 'dismissed' : 'confirmed';
  await putItem(pid, 'code_rule', r);
  await audit(pid, actor.name, 'user', `code_rule.${r.status}`, r.id, req.body.note);
  await touch(pid);
  res.json(r);
}));

// Mappings and review
p.get('/mappings', wrap(async (req, res) => res.json(await getMappings(pidOf(req)))));
p.get('/mappings/:id', wrap(async (req, res) => {
  const m = await getItem<Mapping>(pidOf(req), 'mapping', String(req.params.id));
  if (!m) throw new HttpError(404, 'Not found');
  res.json(m);
}));

const Decision = z.object({
  decision: z.enum(['approve', 'reject', 'change', 'not_migrated']),
  actor: z.string(),
  note: z.string().max(2000).optional(),
  change: z.object({ target: z.string().max(200).optional(), rule: z.string().max(1000).optional() }).optional(),
});

async function decide(pid: string, m: Mapping, d: z.infer<typeof Decision>, actor: Person) {
  if (['Sales engineer', 'Ontology curator'].includes(actor.role)) throw new HttpError(403, `${actor.role} cannot decide mappings`);
  if (m.path === 'named' && !['Data subject expert', 'Customer data owner', 'IFS solution consultant'].includes(actor.role))
    throw new HttpError(403, 'Safety-critical and regulatory items need a data subject expert, data owner or IFS consultant');
  const note = d.note?.trim();
  if ((d.decision === 'reject' || d.decision === 'change' || d.decision === 'not_migrated') && !note) throw new HttpError(400, 'A note is required for this decision');
  if (m.path === 'named' && d.decision === 'approve' && !note) throw new HttpError(400, 'Named approvals need a review note');
  m.reviewer = actor.name;
  m.reviewNote = note;
  m.status = ({ approve: 'approved', reject: 'rejected', not_migrated: 'not_migrated', change: 'changed' } as const)[d.decision];
  if (d.decision === 'change') {
    m.version++;
    if (d.change?.target) m.target = d.change.target;
    if (d.change?.rule) m.rule = d.change.rule;
    m.evidence = [...m.evidence, { type: 'reviewer', content: `${actor.name}: ${note}`, source: 'Review workbench', weight: 0.3 }];
  }
  await putItem(pid, 'mapping', m);
  await audit(pid, actor.name, 'user', `mapping.${d.decision}`, m.id, note);
  if (d.decision === 'change') await emitAgent(pid, { agent: m.agent === 'Hierarchy Agent' ? 'hierarchy' : 'aligner', kind: 'result', text: `Applied ${actor.name}'s change to ${m.id} as v${m.version}; stored as a precedent.` });
}

p.post('/mappings/bulk', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ ids: z.array(z.string()).min(1).max(200), actor: z.string(), note: z.string().optional() }), req.body);
  const actor = await actorOf(req);
  const done: string[] = [];
  for (const id of body.ids) {
    const m = await getItem<Mapping>(pid, 'mapping', id);
    if (!m || m.path === 'named') continue; // named items are never bulk-approved
    await decide(pid, m, { decision: 'approve', actor: actor.id, note: body.note ?? 'Bulk approval: shared evidence pattern' }, actor);
    done.push(id);
  }
  await reviewProgressNudge(pid);
  await touch(pid);
  res.json({ approved: done });
}));

p.post('/mappings/:id/decision', wrap(async (req, res) => {
  const pid = pidOf(req);
  const d = parse(Decision, req.body);
  const actor = await actorOf(req);
  const m = await getItem<Mapping>(pid, 'mapping', String(req.params.id));
  if (!m) throw new HttpError(404, 'Not found');
  await decide(pid, m, d, actor);
  await reviewProgressNudge(pid);
  await touch(pid);
  res.json(m);
}));

p.get('/questions', wrap(async (req, res) => res.json(await getQuestions(pidOf(req)))));
p.post('/questions/:id', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ answer: z.string().trim().min(1).max(2000), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  const qn = await getItem<Question>(pid, 'question', String(req.params.id));
  if (!qn) throw new HttpError(404, 'Not found');
  qn.answer = body.answer;
  qn.status = 'answered';
  await putItem(pid, 'question', qn);
  await audit(pid, actor.name, 'user', 'question.answer', qn.id, qn.answer);
  const related = (await getQuestions(pid)).filter((x) => x.item === qn.item);
  if (qn.item.startsWith('M-') && related.every((x) => x.status === 'answered')) {
    const m = await getItem<Mapping>(pid, 'mapping', qn.item);
    if (m && m.status === 'question') {
      Object.assign(m, { status: 'proposed', confidence: Math.max(m.confidence, 0.91), path: 'quick', version: m.version + 1 });
      m.evidence = [...m.evidence, { type: 'reviewer', content: `${actor.name} answered ${related.map((x) => x.id).join(', ')}.`, source: 'Review workbench', weight: 0.2 }];
      await putItem(pid, 'mapping', m);
      await emitAgent(pid, { agent: 'code-list', kind: 'result', text: `All open questions on ${m.id} are answered; re-proposed at ${m.confidence.toFixed(2)} for quick review.` });
    }
  }
  await reviewProgressNudge(pid);
  await touch(pid);
  res.json(qn);
}));

p.get('/memory', wrap(async (req, res) => {
  const pid = pidOf(req);
  const [mappings, project] = await Promise.all([getMappings(pid), getProject(pid)]);
  const tenantDecisions = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log WHERE project_id = $1 AND action LIKE 'mapping.%'`, [pid]))?.n ?? 0;
  res.json({
    sharedLearning: project!.sharedLearning,
    tenantDecisions,
    precedents: mappings.flatMap((m) => m.precedents.map((x) => ({ ...x, mapping: m.id, concept: m.conceptLabel }))),
    fromPrecedent: mappings.filter((m) => m.precedents.some((x) => x.outcome === 'approved')).length,
    total: mappings.length,
  });
}));

// Hierarchy
p.get('/hierarchy', wrap(async (req, res) => {
  const pid = pidOf(req);
  const s = await projectState(pid);
  const site = String(req.query.site ?? s.cur.locations.find((l) => l.type === 'SITE')?.location ?? '');
  const siteName = s.cur.locations.find((l) => l.location === site)?.description ?? site;
  res.json({ ...hierarchyTree(s.cur, site, siteName, s.curFailures), issues: hierarchyIssues(s.rawFailures, s.fixes) });
}));
p.post('/hierarchy/issues/:id', wrap(async (req, res) => {
  const pid = pidOf(req);
  const actor = await actorOf(req);
  const s = await projectState(pid);
  const issue = hierarchyIssues(s.rawFailures, s.fixes).find((i) => i.id === req.params.id);
  if (!issue) throw new HttpError(404, 'Not found');
  const status = req.body.decision === 'dismiss' ? 'rejected' : 'approved';
  const targets = issue.kind === 'untyped' ? s.fixes.filter((f) => f.kind === 'classify') : s.fixes.filter((f) => f.rule === issue.rule && f.records.includes(issue.record));
  for (const f of targets) f.status = status;
  await putItems(pid, 'fix', targets);
  await audit(pid, actor.name, 'user', `hierarchy.${status === 'approved' ? 'fix_approved' : 'dismissed'}`, issue.id, issue.proposedFix);
  await touch(pid);
  res.json({ ...issue, status: status === 'approved' ? 'fix_approved' : 'dismissed' });
}));

// Validation and quality
p.get('/validation', wrap(async (req, res) => {
  const pid = pidOf(req);
  const [failures, runs] = await Promise.all([currentValidation(pid), getRuns(pid)]);
  res.json({ rules, failures, runs: runs.map((r) => ({ ...r, reconciliation: undefined, errors: undefined })) });
}));
p.get('/quality', wrap(async (req, res) => {
  const { dq, fixes } = await quality(pidOf(req));
  res.json({ dq, fixes });
}));

async function decideFixes(pid: string, ids: string[], decision: 'approve' | 'reject', actor: Person) {
  if (actor.role === 'Sales engineer') throw new HttpError(403, 'Sales engineers cannot approve fixes');
  const chosen = (await getFixes(pid)).filter((f) => ids.includes(f.id));
  for (const f of chosen) f.status = decision === 'reject' ? 'rejected' : 'approved';
  await putItems(pid, 'fix', chosen);
  for (const f of chosen) await audit(pid, actor.name, 'user', `fix.${f.status}`, f.id, f.title);
  return chosen;
}
p.post('/fixes/bulk', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ ids: z.array(z.string()).min(1).max(500), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  const done = await decideFixes(pid, body.ids, 'approve', actor);
  await emitAgent(pid, { agent: 'remediator', kind: 'result', text: `${done.length} fixes approved by ${actor.name}; they apply in the next transformation.` });
  await touch(pid);
  res.json({ approved: done.map((f) => f.id) });
}));
p.post('/fixes/:id', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ decision: z.enum(['approve', 'reject']), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  const done = await decideFixes(pid, [String(req.params.id)], body.decision, actor);
  if (!done.length) throw new HttpError(404, 'Not found');
  await touch(pid);
  res.json(done[0]);
}));

// Runs, proof pack, sign-off
p.get('/runs', wrap(async (req, res) => res.json(await getRuns(pidOf(req)))));
p.get('/proofpack', wrap(async (req, res) => {
  const pid = pidOf(req);
  const [project, runs, entries, signoffs, integrity, q2, failures] = await Promise.all([
    getProject(pid), getRuns(pid), auditEntries(pid), getSignoffs(pid), verifyAudit(pid), quality(pid), currentValidation(pid),
  ]);
  const run = runs.at(-1);
  if (!run) throw new HttpError(404, 'No load run yet');
  res.json({
    project, run,
    runs: runs.map((r) => ({ id: r.id, number: r.number, dqScore: r.dqScore, startedAt: r.startedAt, transformationVersion: r.transformationVersion, failing: r.reconciliation?.filter((c) => c.outcome === 'fail').length ?? 0, loaded: r.objects.reduce((s, o) => s + o.loaded, 0), failed: r.objects.reduce((s, o) => s + o.failed, 0) })),
    approvals: entries.filter((a) => /^(mapping|fix|question|code_rule|hierarchy|signoff)\./.test(a.action) && a.actorKind === 'user'),
    lineage: [
      { source: 'Maximo ASSET.SERIALNUM', concept: 'core:SerialNumber', mapping: 'M-002', transformation: `t_asset_serial · ${run.transformationVersion}`, target: 'IFS EquipmentSerial.SerialNo', rule: 'upper(), strip spaces', run: run.id },
      { source: 'Maximo ASSET.PARENT + ASSET.LOCATION', concept: 'core:PhysicalAsset', mapping: 'M-005', transformation: `t_asset_serial · ${run.transformationVersion}`, target: 'IFS EquipmentSerial.SupMchCode', rule: 'parent if allowed by ontology, else location', run: run.id },
      { source: 'Maximo WORKORDER.STATUS', concept: 'Code list: WO status', mapping: 'M-041', transformation: `t_work_order · ${run.transformationVersion}`, target: 'IFS WorkOrder.ObjState', rule: 'lookup via ontology concept scheme', run: run.id },
      { source: 'Maximo PM.FREQUENCY + FREQUNIT', concept: 'core:MaintenancePlan', mapping: 'M-050', transformation: `t_pm_action · ${run.transformationVersion}`, target: 'IFS PmAction.Interval', rule: 'calendar vs meter split', run: run.id },
    ],
    signoffs, auditIntegrity: integrity, validationOpen: failures.length, dq: q2.dq, signable: runSignable(run),
  });
}));

p.post('/signoff', wrap(async (req, res) => {
  const pid = pidOf(req);
  const actor = await actorOf(req);
  if (!['Customer data owner', 'IFS solution consultant'].includes(actor.role)) throw new HttpError(403, 'Only the customer data owner and the IFS consultant sign the proof pack');
  const run = (await getRuns(pid)).at(-1);
  if (!run) throw new HttpError(400, 'No load run to sign');
  if (!runSignable(run)) throw new HttpError(400, `Run ${run.number} has failing reconciliation checks or records in the error queue`);
  if ((await getSignoffs(pid)).some((s) => s.role === actor.role && s.runId === run.id)) throw new HttpError(400, 'Already signed');
  const entry = await audit(pid, actor.name, 'user', 'signoff.sign', run.id, `Proof pack signed as ${actor.role}`);
  await q('INSERT INTO signoffs (project_id, run_id, role, user_id, name, signature) VALUES ($1,$2,$3,$4,$5,$6)', [pid, run.id, actor.role, actor.id, actor.name, entry.hash]);
  if ((await getSignoffs(pid)).filter((s) => s.runId === run.id).length === 2) {
    await setStage(pid, 12, { status: 'done', metric: 'Signed by both parties', finished: true });
    await setStage(pid, 13, { status: 'ready' });
    await emitAgent(pid, { agent: 'orchestrator', kind: 'handoff', stage: 12, text: `Proof pack for ${run.id} signed by both parties (audit #${entry.seq}). Delta load and cutover are unlocked.` });
  }
  await touch(pid);
  res.json({ ok: true, signature: entry.hash });
}));

p.get('/ai-ready', wrap(async (req, res) => {
  const r = await aiReadyAsset(pidOf(req), req.query.asset ? String(req.query.asset) : undefined);
  if (!r) throw new HttpError(404, 'No assets loaded');
  res.json(r);
}));
p.get('/audit', wrap(async (req, res) => {
  const pid = pidOf(req);
  res.json({ entries: (await auditEntries(pid)).reverse(), integrity: await verifyAudit(pid) });
}));
p.get('/agent-events', wrap(async (req, res) => res.json(await recentEvents(pidOf(req), 200))));

// Review Assistant (streams text over SSE)
p.post('/assistant', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({
    messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(40),
    context: z.object({ page: z.string().optional(), itemId: z.string().optional() }).optional(),
  }), req.body);
  const history: ChatTurn[] = body.messages.slice(-12);
  if (history.at(-1)!.role !== 'user') throw new HttpError(400, 'Last message must be from the user');
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  await audit(pid, 'assistant', 'agent', 'assistant.answer', body.context?.itemId ?? body.context?.page, history.at(-1)!.content.slice(0, 140));
  try {
    for await (const chunk of answer(pid, history, body.context ?? {})) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      if (!liveModel) await new Promise((r) => setTimeout(r, 18));
    }
    res.write(`data: ${JSON.stringify({ done: true, live: liveModel })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: String((e as Error).message) })}\n\n`);
  }
  res.end();
}));

// Reload the Northvale reference project from its extract. Disabled unless explicitly allowed.
app.post('/api/admin/reload-reference', wrap(async (_req, res) => {
  if (process.env.ALLOW_REFERENCE_RELOAD !== 'true') throw new HttpError(403, 'Disabled on this environment');
  await reloadNorthvale();
  res.json({ ok: true });
}));

// ---------- Errors ----------
app.use('/api', (_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  void next;
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

// ---------- Static web app (production build) ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

const port = Number(process.env.PORT ?? 8791);
await bootstrap();
await listen();
app.listen(port, () => console.log(`Asset Migration Studio API on :${port} · model ${liveModel ? MODEL_LABEL : 'not configured'}`));
