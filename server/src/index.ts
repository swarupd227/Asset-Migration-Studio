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
import { concepts, ONTOLOGY_VERSION, INDUSTRY_PACK } from './data/ontology.js';
import { workOrderStats } from './data/seed.js';
import { catalogueEntry, impliedSites, tableFromFilename, toRecords } from './extracts.js';
import { ExtractError, formatOf, readExtract } from './tabular.js';
import { randomBytes } from 'node:crypto';
import { hierarchyIssues, hierarchyTree, rules } from './rules.js';
import { reviewProgressNudge, runStage } from './agents/orchestrator.js';
import { answer, liveModel, type ChatTurn } from './agents/assistant.js';
import { decisionModelFor, decisionSetting, runQuestions, thresholdsFor } from './decisions/flow.js';
import { QUESTIONS, RUN_ORDER } from './decisions/questions.js';
import { decisionStats, getDecisions } from './store.js';
import type { ModelDecision, Skill } from './types.js';
import { evaluateLater, evaluateTriggers } from './learning/engine.js';
import { getSkill, matches, pinnedLibrary, projectSkills, saveSkill, skillUseCounts } from './learning/store.js';
import { baseline, measureProjectSkills } from './learning/measure.js';
import { toSkillMd } from './learning/format.js';
import { datasets, limitsFor, listEvals, recordEval, RELEASE } from './evals/store.js';
import { runEval } from './evals/run.js';
import { helped, proposeForSharing, publishLibrary, ShareError, sharedSkills, testCandidate } from './learning/share.js';
import type { CodeRule, Mapping, Person, Question } from './types.js';
import { activeJob, enqueue, handle, JobConflict, listJobs, onJobFailed, startWorker, stopWorker, type JobKind } from './jobs.js';
import { budgetReached, monthSpend, usageSummary } from './usage.js';
import { MIN_EXAMPLES, labels, trainable, trainedModels, trainProject } from './decisions/trained.js';
import { localDecisionModel } from './decisions/adapters/local.js';
import { ontologyRouter } from './ontology/routes.js';

const app = express();
const production = process.env.NODE_ENV === 'production';
app.disable('x-powered-by');
app.set('trust proxy', 1);
if (!production) app.use(cors());
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  });
  if (production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
// One JSON line per API request: method, path, status and duration.
app.use('/api', (req, res, next) => {
  const t0 = performance.now();
  res.on('finish', () => {
    if (/^\/api\/(health|stream)/.test(req.originalUrl)) return;
    console.log(JSON.stringify({ at: new Date().toISOString(), method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(performance.now() - t0) }));
  });
  next();
});
app.use(express.json({ limit: '2mb' }));

// Simple per-client limit for model calls: 20 requests per minute.
const hits = new Map<string, number[]>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) { res.status(429).set('Retry-After', '30').json({ error: 'Too many assistant requests; try again shortly' }); return; }
  recent.push(now);
  hits.set(key, recent);
  next();
}

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

app.use('/api/ontology', ontologyRouter);

// Evaluation harness: golden-dataset runs and the release gate.
app.get('/api/evals', wrap(async (_req, res) => {
  res.json({ release: RELEASE, datasets, runs: await listEvals(), limits: limitsFor('Utilities') });
}));
let evalRunning = false;
app.post('/api/evals/run', wrap(async (req, res) => {
  const actor = await actorOf(req);
  if (!['Ontology curator', 'Migration lead'].includes(actor.role)) throw new HttpError(403, 'The ontology curator or a migration lead runs evaluations');
  const model = req.body.model === 'configured' ? 'configured' : 'local';
  if (evalRunning) throw new HttpError(409, 'An evaluation is already running');
  evalRunning = true;
  runEval({ model }).then((r) => recordEval(r, actor.name)).catch((e) => console.error('Evaluation failed:', e)).finally(() => { evalRunning = false; });
  res.status(202).json({ ok: true });
}));

// Curator: shared skill candidates, golden-dataset tests and library versions.
const shareErr = (e: unknown) => { if (e instanceof ShareError) throw new HttpError(e.status, e.message); throw e; };
async function curator(req: Request) {
  const actor = await actorOf(req);
  if (actor.role !== 'Ontology curator') throw new HttpError(403, 'Only the ontology curator manages the shared skill library');
  return actor;
}
app.get('/api/curator/skills', wrap(async (_req, res) => {
  const libraries = await q<{ version: string; published_at: Date; published_by: string; skills: unknown[] }>('SELECT * FROM skill_library ORDER BY published_at DESC');
  res.json({ skills: await sharedSkills(), libraries: libraries.map((l) => ({ version: l.version, publishedAt: l.published_at.toISOString(), publishedBy: l.published_by, skills: l.skills })) });
}));
app.post('/api/curator/skills/:id/test', wrap(async (req, res) => {
  const actor = await curator(req);
  res.json(await testCandidate(String(req.params.id), actor.name).catch(shareErr));
}));
app.post('/api/curator/library', wrap(async (req, res) => {
  const actor = await curator(req);
  const r = await publishLibrary(actor.name).catch(shareErr);
  for (const p of await listProjects()) await audit(p.id, actor.name, 'user', 'skill.library.publish', r.version, `New shared library version with ${r.added.join(', ')}; this project stays pinned until its migration lead upgrades`);
  res.json(r);
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
async function queue(pid: string, kind: JobKind, payload: Record<string, unknown>, by: string) {
  try {
    const job = await enqueue(pid, kind, payload, by);
    await touch(pid);
    return job;
  } catch (e) {
    if (e instanceof JobConflict) throw new HttpError(409, e.message);
    throw e;
  }
}

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
  res.status(202).json({ ok: true, job: await queue(pid, 'stage.run', { n, actor: actor.name }, actor.name) });
}));

// Extracts: CSV, Excel or Parquet with a header row; the table comes from ?table, the file name or the sheet name
p.get('/extracts', wrap(async (req, res) => {
  res.json(await q(`SELECT id, filename, table_name AS "table", row_count AS rows, columns, format, sheet, uploaded_by AS "uploadedBy", uploaded_at AS "uploadedAt" FROM extracts WHERE project_id = $1 ORDER BY uploaded_at DESC`, [pidOf(req)]));
}));
p.post('/extracts', express.raw({ type: () => true, limit: '50mb' }), wrap(async (req, res) => {
  const pid = pidOf(req);
  const actor = await actorOf(req);
  if (['Ontology curator', 'Customer data owner'].includes(actor.role)) throw new HttpError(403, `${actor.role} cannot upload extracts`);
  const filename = String(req.query.filename ?? 'extract.csv').slice(0, 200);
  const format = formatOf(filename);
  if (!format) throw new HttpError(400, 'Upload CSV, Excel (.xlsx) or Parquet files with a header row');
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : '');
  const sheets = await readExtract(filename, buf).catch((e) => { if (e instanceof ExtractError) throw new HttpError(400, e.message); throw e; });
  if (!sheets.length) throw new HttpError(400, 'The file has no data rows');
  // One sheet (or a CSV/Parquet file) is named by ?table or the file name; a workbook's sheets by their own names.
  const named = sheets.map((sh) => ({ ...sh, table: (sheets.length === 1 ? String(req.query.table || tableFromFilename(filename)) : tableFromFilename(`${sh.sheet}.xlsx`)).toUpperCase() }));
  const dup = named.find((t, i) => named.findIndex((x) => x.table === t.table) !== i);
  if (dup) throw new HttpError(400, `Two sheets load into ${dup.table}; keep one sheet per table`);
  const results = [];
  for (const t of named) results.push(await ingestTable(pid, actor.name, filename, format, t));
  for (const n of [2, 3]) if ((await getStages(pid)).find((s) => s.n === n)?.status === 'locked') await setStage(pid, n, { status: 'ready' });
  await setStage(pid, 1, { status: 'done', finished: true });
  await touch(pid);
  res.status(201).json({ format, tables: results });
}));

async function ingestTable(pid: string, actor: string, filename: string, format: string, t: { sheet?: string; table: string; header: string[]; rows: string[][] }) {
  const { table, header, rows: data } = t;
  const source = t.sheet ? `${filename} · ${t.sheet}` : filename;
  const records = toRecords(table, header, data);
  const existingLocs = new Set((await loadDataset(pid)).locations.map((l) => l.location).concat(records.filter((r) => r.kind === 'location').map((r) => r.key)));
  await insertRecords(pid, [...records, ...impliedSites(records, existingLocs)]);
  const entry = catalogueEntry(table, header, data);
  await q('INSERT INTO catalogue_tables (project_id, name, data) VALUES ($1, $2, $3) ON CONFLICT (project_id, name) DO UPDATE SET data = EXCLUDED.data', [pid, table, JSON.stringify(entry)]);
  const id = `EX-${randomBytes(4).toString('hex')}`;
  await q('INSERT INTO extracts (id, project_id, filename, table_name, row_count, columns, uploaded_by, format, sheet) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, pid, filename, table, data.length, JSON.stringify(header), actor, format, t.sheet ?? null]);
  await audit(pid, actor, 'user', 'extract.upload', source, `${table} · ${format} · ${data.length.toLocaleString('en-GB')} rows · ${header.length} columns`);
  const custom = entry.fields.filter((f) => f.custom).map((f) => f.name);
  await emitAgent(pid, { agent: 'profiler', kind: 'result', text: `${source}: ${data.length.toLocaleString('en-GB')} rows profiled into ${table} (${custom.length} custom columns, ${records.length.toLocaleString('en-GB')} records loaded).` });
  return { id, table, sheet: t.sheet, rows: data.length, columns: header.length, records: records.length, custom };
}

// Decisions
p.get('/decisions/questions', wrap(async (req, res) => {
  const pid = pidOf(req);
  const [model, thresholds, setting] = await Promise.all([decisionModelFor(pid), thresholdsFor(pid), decisionSetting(pid)]);
  const ordered = RUN_ORDER.map((id) => QUESTIONS.find((x) => x.id === id)!);
  res.json({ questions: ordered.map(({ prompt, ...qq }) => (void prompt, qq)), model: model?.name ?? 'off', setting, reasoningModel: liveModel && setting === 'auto' ? MODEL_LABEL : null, thresholds });
}));
p.post('/decisions/settings', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ model: z.enum(['auto', 'local', 'off']), actor: z.string(), thresholds: z.object({ auto: z.number(), human: z.number() }).optional() }), req.body);
  const actor = await actorOf(req);
  if (actor.role !== 'Migration lead') throw new HttpError(403, 'Only the migration lead changes the decision model');
  if (body.thresholds) {
    const lim = limitsFor((await getProject(pid))!.industryPack);
    const t = body.thresholds;
    if (t.auto < lim.auto[0] || t.auto > lim.auto[1] || t.human < lim.human[0] || t.human > lim.human[1] || t.human >= t.auto)
      throw new HttpError(400, `Thresholds must stay within the curator limits: auto ${lim.auto.join('–')}, person ${lim.human.join('–')}`);
    await q(`UPDATE projects SET decision_thresholds = decision_thresholds || $2::jsonb WHERE id = $1`, [pid, JSON.stringify(t)]);
    await audit(pid, actor.name, 'user', 'decision.thresholds', `${t.auto} / ${t.human}`, 'Within curator limits');
  }
  await q('UPDATE projects SET decision_model = $2 WHERE id = $1', [pid, body.model]);
  await audit(pid, actor.name, 'user', 'decision.settings', body.model, { auto: 'Decision model and reasoning model', local: 'In-environment model only', off: 'Rules and people only' }[body.model]);
  await touch(pid);
  res.json({ ok: true, model: body.model });
}));
p.get('/decisions/stats', wrap(async (req, res) => res.json(await decisionStats(pidOf(req)))));
p.get('/decisions', wrap(async (req, res) => {
  const s = (k: string) => (req.query[k] ? String(req.query[k]) : undefined);
  res.json(await getDecisions(pidOf(req), { question: s('question'), status: s('status'), step: s('step'), record: s('record'), limit: Number(req.query.limit ?? 100), offset: Number(req.query.offset ?? 0) }));
}));
p.post('/decisions/run', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ question: z.string(), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  if (!['Migration lead', 'Data subject expert'].includes(actor.role)) throw new HttpError(403, 'Migration leads and data subject experts run decision batches');
  const ids = body.question === 'all' ? RUN_ORDER : [body.question];
  if (!ids.every((id) => QUESTIONS.some((x) => x.id === id))) throw new HttpError(404, 'Unknown question');
  res.status(202).json({ ok: true, job: await queue(pid, 'decisions.run', { ids, actor: actor.name }, actor.name) });
}));
// In-environment decision model trained on this project's decided records.
p.get('/decisions/trained', wrap(async (req, res) => {
  const pid = pidOf(req);
  const models = await trainedModels(pid);
  const questions = await Promise.all(RUN_ORDER.filter(trainable).map(async (id) => {
    const qq = QUESTIONS.find((x) => x.id === id)!;
    const versions = models.filter((m) => m.questionId === id);
    return { id, label: qq.label, labels: (await labels(pid, id)).length, active: versions.find((m) => m.active) ?? null, latest: versions[0] ?? null };
  }));
  res.json({ minExamples: MIN_EXAMPLES, questions });
}));
p.post('/decisions/train', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ question: z.string(), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  if (!['Migration lead', 'Data subject expert'].includes(actor.role)) throw new HttpError(403, 'Migration leads and data subject experts train the in-environment model');
  const ids = body.question === 'all' ? RUN_ORDER.filter(trainable) : [body.question];
  if (!ids.every((id) => QUESTIONS.some((x) => x.id === id) && trainable(id))) throw new HttpError(400, 'This question is not trained');
  res.status(202).json({ ok: true, job: await queue(pid, 'decisions.train', { ids, actor: actor.name }, actor.name) });
}));

// Background work and model usage.
p.get('/jobs', wrap(async (req, res) => res.json(await listJobs(pidOf(req)))));
p.get('/usage', wrap(async (req, res) => {
  const pid = pidOf(req);
  const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30)));
  res.json({ ...(await usageSummary(pid, days)), days, monthUsd: await monthSpend(pid), budgetReached: await budgetReached(pid) });
}));
p.post('/usage/budget', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ budgetUsd: z.number().min(0).max(100000).nullable(), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  if (actor.role !== 'Migration lead') throw new HttpError(403, 'Only the migration lead sets the model budget');
  await q('UPDATE projects SET model_budget_usd = $2 WHERE id = $1', [pid, body.budgetUsd]);
  await audit(pid, actor.name, 'user', 'usage.budget', body.budgetUsd == null ? 'No limit' : `$${body.budgetUsd.toFixed(2)} a month`, 'External model calls stop for the month once the budget is used; work continues on the in-environment model');
  await touch(pid);
  res.json({ ok: true });
}));
p.post('/decisions/:id', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ decision: z.enum(['accept', 'override']), answer: z.string().optional(), note: z.string().max(1000).optional(), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  if (!['Data subject expert', 'Migration lead', 'Customer data owner'].includes(actor.role)) throw new HttpError(403, `${actor.role} cannot decide record tags`);
  const row = await one<{ data: ModelDecision }>('SELECT data FROM model_decisions WHERE project_id = $1 AND id = $2', [pid, String(req.params.id)]);
  if (!row) throw new HttpError(404, 'Not found');
  const d = row.data;
  const answer = body.decision === 'override' ? body.answer : (d.answer);
  if (!answer || !d.options.includes(answer)) throw new HttpError(400, 'Answer must be one of the options');
  if (body.decision === 'override' && !body.note?.trim()) throw new HttpError(400, 'An override needs a reason');
  const status = body.decision === 'override' && answer !== d.answer ? 'overridden' : 'accepted';
  const updated: ModelDecision & { modelAnswer: string; modelConfidence: number } = { ...d, answer, status, step: 'human', decidedBy: actor.name, reviewNote: body.note?.trim(), modelAnswer: d.answer, modelConfidence: d.confidence };
  await q('UPDATE model_decisions SET answer = $3, status = $4, step = $5, data = $6 WHERE project_id = $1 AND id = $2', [pid, d.id, answer, status, 'human', JSON.stringify(updated)]);
  await audit(pid, actor.name, 'user', `decision.${body.decision}`, d.id, `${answer}${body.note ? ` · ${body.note}` : ''}`);
  evaluateLater(pid);
  await touch(pid);
  res.json(updated);
}));

// Skills
p.get('/skills', wrap(async (req, res) => {
  const pid = pidOf(req);
  await measureProjectSkills(pid);
  const [all, uses, triggers] = await Promise.all([projectSkills(pid), skillUseCounts(pid), q('SELECT key, kind, skill_id AS "skillId", fired_at AS "firedAt", data FROM skill_triggers WHERE project_id = $1 ORDER BY fired_at DESC', [pid])]);
  const project = (await getProject(pid))!;
  const withUse = (s: Skill) => ({ ...s, uses: uses.get(s.id)?.uses ?? 0, lastUsed: uses.get(s.id)?.last, applies: matches(s, project) });
  const libraries = await q<{ version: string; published_at: Date; published_by: string }>('SELECT version, published_at, published_by FROM skill_library ORDER BY published_at DESC');
  res.json({ library: all.library, libraries, shared: all.shared.map(withUse), project: all.project.map(withUse), triggers });
}));
p.get('/skills/:id/SKILL.md', wrap(async (req, res) => {
  const s = await getSkill(String(req.params.id));
  if (!s || (s.projectId && s.projectId !== pidOf(req))) throw new HttpError(404, 'Not found');
  res.type('text/markdown').set('Content-Disposition', `attachment; filename="${s.id}-SKILL.md"`).send(toSkillMd(s));
}));
p.post('/skills/evaluate', wrap(async (req, res) => {
  const actor = await actorOf(req);
  if (!['Migration lead', 'Data subject expert'].includes(actor.role)) throw new HttpError(403, 'Migration leads and data subject experts run the trigger check');
  res.json({ fired: (await evaluateTriggers(pidOf(req))).map((h) => h.title) });
}));
p.post('/skills/:id/decision', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ decision: z.enum(['approve', 'reject', 'retire']), reason: z.string().max(1000).optional(), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  const s = await getSkill(String(req.params.id));
  if (!s || (s.projectId && s.projectId !== pid)) throw new HttpError(404, 'Not found');
  if (s.scope === 'shared' && actor.role !== 'Ontology curator') throw new HttpError(403, 'Only the ontology curator changes shared skills');
  if (s.scope === 'project' && actor.role !== 'Data subject expert') throw new HttpError(403, 'A data subject expert approves project skills');
  if (body.decision !== 'approve' && !body.reason?.trim()) throw new HttpError(400, 'A reason is required');
  if (body.decision === 'approve' && s.status !== 'draft') throw new HttpError(400, 'Only drafts can be approved');
  const next: Skill & { baseline?: unknown } = { ...s, status: body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : 'retired', statusNote: body.reason?.trim(),
    ...(body.decision === 'approve' ? { approvedBy: actor.name, approvedAt: new Date().toISOString(), baseline: await baseline(pid, s) } : {}) };
  await saveSkill(next);
  await audit(pid, actor.name, 'user', `skill.${body.decision}`, `${s.id} v${s.version}`, body.reason ?? s.name);
  await touch(pid);
  res.json(next);
}));
p.post('/shared-learning', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ enabled: z.boolean(), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  if (actor.role !== 'Customer data owner') throw new HttpError(403, 'Shared learning follows the customer contract; the customer data owner changes it');
  await q('UPDATE projects SET shared_learning = $2 WHERE id = $1', [pid, body.enabled]);
  await audit(pid, actor.name, 'user', 'project.shared_learning', body.enabled ? 'on' : 'off', body.enabled ? 'Anonymised skills may be proposed to the shared library' : 'Project skills stay in the tenant');
  await touch(pid);
  res.json({ ok: true, sharedLearning: body.enabled });
}));
p.post('/skills/:id/propose', wrap(async (req, res) => {
  const pid = pidOf(req);
  const actor = await actorOf(req);
  if (!['Migration lead', 'Data subject expert'].includes(actor.role)) throw new HttpError(403, 'Migration leads and data subject experts propose skills for sharing');
  const c = await proposeForSharing(pid, String(req.params.id)).catch(shareErr);
  await audit(pid, actor.name, 'user', 'skill.propose', `${req.params.id} → ${c.id}`, 'Anonymised and sent to the curator');
  await emitAgent(pid, { agent: 'steward', kind: 'handoff', text: `"${c.name}" anonymised and proposed to the shared library as ${c.id}.` });
  await touch(pid);
  res.json(c);
}));
p.post('/skills/library', wrap(async (req, res) => {
  const pid = pidOf(req);
  const body = parse(z.object({ version: z.string(), actor: z.string() }), req.body);
  const actor = await actorOf(req);
  if (actor.role !== 'Migration lead') throw new HttpError(403, 'Only the migration lead changes the pinned skill library');
  if (!(await one('SELECT version FROM skill_library WHERE version = $1', [body.version]))) throw new HttpError(404, 'Unknown library version');
  const before = (await pinnedLibrary(pid)).version;
  await q('UPDATE projects SET skill_library_version = $2 WHERE id = $1', [pid, body.version]);
  await audit(pid, actor.name, 'user', 'skill.library.pin', body.version, `from ${before ?? 'none'}`);
  await touch(pid);
  res.json({ ok: true, version: body.version });
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
  m.decidedAt = new Date().toISOString();
  m.correctionKind = d.decision === 'reject' ? 'reject' : d.decision === 'not_migrated' ? 'not_migrated'
    : d.decision === 'change' ? (d.change?.target && d.change.target !== m.target ? 'target' : 'rule') : undefined;
  m.status = ({ approve: 'approved', reject: 'rejected', not_migrated: 'not_migrated', change: 'changed' } as const)[d.decision];
  if (d.decision === 'change') {
    m.version++;
    if (d.change?.target) m.target = d.change.target;
    if (d.change?.rule) m.rule = d.change.rule;
    m.evidence = [...m.evidence, { type: 'reviewer', content: `${actor.name}: ${note}`, source: 'Review workbench', weight: 0.3 }];
  }
  await putItem(pid, 'mapping', m);
  await audit(pid, actor.name, 'user', `mapping.${d.decision}`, m.id, note);
  if (m.correctionKind) evaluateLater(pid);
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
p.post('/assistant', rateLimit, wrap(async (req, res) => {
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

// Background work: every replica runs a worker unless AMS_WORKER=off.
handle('stage.run', (j) => runStage(j.projectId, Number(j.payload.n), String(j.payload.actor)));
handle('decisions.run', async (j) => { await runQuestions(j.projectId, j.payload.ids as string[], String(j.payload.actor)); await touch(j.projectId); });
handle('decisions.train', async (j) => { await trainProject(j.projectId, localDecisionModel, String(j.payload.actor), j.payload.ids as string[]); await touch(j.projectId); });
onJobFailed(async (j, error) => {
  // A failed stage goes back to ready so it can be run again.
  await q(`UPDATE project_stages SET status = 'ready' WHERE project_id = $1 AND status = 'running'`, [j.projectId]);
  await emitAgent(j.projectId, { agent: j.kind === 'stage.run' ? 'orchestrator' : 'decision-model', kind: 'error', text: `${j.label} failed: ${error}` });
  await touch(j.projectId);
});
const worker = startWorker();
const server = app.listen(port, () => console.log(`Asset Migration Studio API on :${port} · model ${liveModel ? MODEL_LABEL : 'not configured'} · worker ${worker ? 'on' : 'off'}`));

// Container platforms send SIGTERM before stopping a replica: finish in-flight requests, then close the pool.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    void stopWorker();
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
