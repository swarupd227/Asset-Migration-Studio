import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  agents, aiReadyAsset, audit, bus, currentValidation, dashboard, dqSnapshot, emitAgent, hierarchyForSite, mappingById,
  MODEL_LABEL, people, personById, reset, rules, sites, state, touch, verifyAudit,
} from './store.js';
import { catalogue } from './data/catalog.js';
import { concepts, ontologyChangeLog, standards, woStatusCodeList, ONTOLOGY_VERSION, INDUSTRY_PACK } from './data/ontology.js';
import { sampleOpenWorkOrders, workOrderStats, badMeter } from './data/seed.js';
import { reviewProgressNudge, runStage } from './agents/orchestrator.js';
import { answer, liveModel, type ChatTurn } from './agents/assistant.js';
import type { Mapping } from './types.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const actorOf = (req: Request) => personById(String(req.body?.actor ?? req.query.actor ?? 'u-dev')) ?? people[1];
const fail = (res: Response, code: number, message: string) => res.status(code).json({ error: message });

app.get('/api/health', (_req, res) => res.json({ ok: true, version: state.version }));

app.get('/api/meta', (_req, res) =>
  res.json({ agents, people, sites, rules, liveModel, model: MODEL_LABEL, ontologyVersion: ONTOLOGY_VERSION, industryPack: INDUSTRY_PACK, scripted: true }),
);

app.get('/api/dashboard', (_req, res) => res.json({ ...dashboard(), running: state.running, version: state.version }));

// Server-sent events: live agent activity and state-change notifications.
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  send('hello', { version: state.version, events: state.events.slice(-60) });
  const onAgent = (e: unknown) => send('agent', e);
  const onState = (e: unknown) => send('state', e);
  bus.on('agent', onAgent);
  bus.on('state', onState);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    bus.off('agent', onAgent);
    bus.off('state', onState);
  });
});

app.post('/api/stages/:n/run', (req, res) => {
  const n = Number(req.params.n);
  const actor = actorOf(req);
  if (state.running) return fail(res, 409, `Stage ${state.running} is already running`);
  if (n === 12) return fail(res, 400, 'Sign-off is done by people in the proof pack');
  const stage = state.stages.find((s) => s.n === n);
  if (!stage || stage.status === 'locked') return fail(res, 400, 'Stage is locked');
  runStage(n, actor.name).catch((e) => emitAgent({ agent: 'orchestrator', kind: 'error', text: String(e?.message ?? e) }));
  res.json({ ok: true });
});

// ---------- Discovery ----------
app.get('/api/catalogue', (_req, res) => res.json({ tables: catalogue, stats: workOrderStats, sampleWorkOrders: sampleOpenWorkOrders, badMeter }));
app.get('/api/code-rules', (_req, res) => res.json(state.codeRules));
app.post('/api/code-rules/:id', (req, res) => {
  const r = state.codeRules.find((x) => x.id === req.params.id);
  if (!r) return fail(res, 404, 'Not found');
  const actor = actorOf(req);
  r.status = req.body.decision === 'dismiss' ? 'dismissed' : 'confirmed';
  audit(actor.name, 'user', `code_rule.${r.status}`, r.id, req.body.note);
  touch();
  res.json(r);
});

// ---------- Mappings & review ----------
app.get('/api/mappings', (_req, res) => res.json(state.mappings));
app.get('/api/mappings/:id', (req, res) => {
  const m = mappingById(req.params.id);
  return m ? res.json(m) : fail(res, 404, 'Not found');
});

function decide(m: Mapping, decision: string, actorId: string, note?: string, change?: { target?: string; rule?: string }) {
  const actor = personById(actorId) ?? people[1];
  if (['Sales engineer', 'Ontology curator'].includes(actor.role)) throw Object.assign(new Error(`${actor.role} cannot approve mappings`), { code: 403 });
  if (m.path === 'named' && !['Data subject expert', 'Customer data owner', 'IFS solution consultant'].includes(actor.role))
    throw Object.assign(new Error('Safety-critical and regulatory items need a named data expert, data owner or IFS consultant'), { code: 403 });
  if (decision === 'reject' && !note?.trim()) throw Object.assign(new Error('A rejection needs a reason'), { code: 400 });
  if (decision === 'change' && !note?.trim()) throw Object.assign(new Error('A change needs a note for the agent'), { code: 400 });
  m.reviewer = actor.name;
  m.reviewNote = note;
  if (decision === 'approve') m.status = 'approved';
  else if (decision === 'reject') m.status = 'rejected';
  else if (decision === 'not_migrated') m.status = 'not_migrated';
  else if (decision === 'change') {
    m.status = 'changed';
    m.version++;
    if (change?.target) m.target = change.target;
    if (change?.rule) m.rule = change.rule;
    m.evidence = [...m.evidence, { type: 'reviewer', content: `${actor.name}: ${note}`, source: 'Review workbench', weight: 0.3 }];
    setTimeout(() => {
      emitAgent({ agent: m.agent === 'Hierarchy Agent' ? 'hierarchy' : 'aligner', kind: 'result', text: `Took ${actor.name}'s note on ${m.id} and re-issued v${m.version}. The change is stored as a precedent.` });
    }, 900);
  } else throw Object.assign(new Error('Unknown decision'), { code: 400 });
  audit(actor.name, 'user', `mapping.${decision}`, m.id, note);
}

app.post('/api/mappings/:id/decision', (req, res) => {
  const m = mappingById(req.params.id);
  if (!m) return fail(res, 404, 'Not found');
  try {
    decide(m, req.body.decision, req.body.actor, req.body.note, req.body.change);
  } catch (e) {
    const err = e as Error & { code?: number };
    return fail(res, err.code ?? 400, err.message);
  }
  reviewProgressNudge();
  touch();
  res.json(m);
});

app.post('/api/mappings/bulk', (req, res) => {
  const ids: string[] = req.body.ids ?? [];
  const done: string[] = [];
  for (const id of ids) {
    const m = mappingById(id);
    if (!m || m.path === 'named') continue; // named items are never bulk-approved
    try {
      decide(m, 'approve', req.body.actor, req.body.note ?? 'Bulk approval: shared evidence pattern');
      done.push(id);
    } catch (e) {
      return fail(res, (e as { code?: number }).code ?? 400, (e as Error).message);
    }
  }
  reviewProgressNudge();
  touch();
  res.json({ approved: done });
});

app.get('/api/questions', (_req, res) => res.json(state.questions));
app.post('/api/questions/:id', (req, res) => {
  const q = state.questions.find((x) => x.id === req.params.id);
  if (!q) return fail(res, 404, 'Not found');
  const actor = actorOf(req);
  q.answer = req.body.answer;
  q.status = 'answered';
  audit(actor.name, 'user', 'question.answer', q.id, q.answer);
  if (q.item === 'M-041' && state.questions.filter((x) => x.item === 'M-041').every((x) => x.status === 'answered')) {
    const m = mappingById('M-041')!;
    m.status = 'proposed';
    m.confidence = 0.91;
    m.path = 'quick';
    m.version++;
    m.evidence = [...m.evidence, { type: 'reviewer', content: 'Customer data owner confirmed the meaning of NV-HOLD, FLDCOMP and PEND-REG.', source: 'Review workbench', weight: 0.2 }];
    setTimeout(() => emitAgent({ agent: 'code-list', kind: 'result', text: 'All 3 local status codes now have a target. M-041 re-proposed at 0.91 for quick review.' }), 700);
  }
  reviewProgressNudge();
  touch();
  res.json(q);
});

// ---------- Ontology ----------
app.get('/api/ontology', (_req, res) =>
  res.json({ version: ONTOLOGY_VERSION, pack: INDUSTRY_PACK, concepts, codeList: woStatusCodeList, standards, changeLog: ontologyChangeLog, proposals: state.ontologyProposals }),
);
app.post('/api/ontology/proposals/:id', (req, res) => {
  const p = state.ontologyProposals.find((x) => x.id === req.params.id);
  if (!p) return fail(res, 404, 'Not found');
  const actor = actorOf(req);
  if (actor.role !== 'Ontology curator') return fail(res, 403, 'Only the ontology curator can accept ontology proposals');
  p.status = req.body.decision === 'reject' ? 'rejected' : 'accepted';
  audit(actor.name, 'user', `ontology.proposal.${p.status}`, p.id);
  touch();
  res.json(p);
});

app.get('/api/memory', (_req, res) => {
  const all = state.mappings.flatMap((m) => m.precedents.map((p) => ({ ...p, mapping: m.id, concept: m.conceptLabel })));
  res.json({
    sharedLearning: state.project.sharedLearning,
    tenantDecisions: state.audit.filter((a) => a.action.startsWith('mapping.')).length,
    precedents: all,
    fromPrecedent: state.mappings.filter((m) => m.precedents.some((p) => p.outcome === 'approved')).length,
    total: state.mappings.length,
  });
});

// ---------- Hierarchy ----------
app.get('/api/hierarchy', (req, res) => res.json({ ...hierarchyForSite(String(req.query.site ?? 'RIVR')), issues: state.issues }));
app.post('/api/hierarchy/issues/:id', (req, res) => {
  const i = state.issues.find((x) => x.id === req.params.id);
  if (!i) return fail(res, 404, 'Not found');
  const actor = actorOf(req);
  i.status = req.body.decision === 'dismiss' ? 'dismissed' : 'fix_approved';
  if (i.kind === 'wrong_parent' && i.status === 'fix_approved') {
    const f = state.fixes.find((x) => x.kind === 'reparent' && x.records[0] === i.record);
    if (f) f.status = 'approved';
  }
  audit(actor.name, 'user', `hierarchy.${i.status}`, i.id, i.proposedFix);
  touch();
  res.json(i);
});

// ---------- Validation & quality ----------
app.get('/api/validation', (_req, res) => res.json({ rules, failures: currentValidation(), runs: state.runs.map(({ reconciliation, errors, ...r }) => r) }));
app.get('/api/quality', (_req, res) => res.json({ dq: dqSnapshot(), fixes: state.fixes }));

function decideFix(id: string, decision: string, actorName: string) {
  const f = state.fixes.find((x) => x.id === id);
  if (!f) return;
  f.status = decision === 'reject' ? 'rejected' : 'approved';
  if (f.kind === 'reparent') {
    const i = state.issues.find((x) => x.kind === 'wrong_parent' && x.record === f.records[0]);
    if (i) i.status = f.status === 'approved' ? 'fix_approved' : 'open';
  }
  if (f.kind === 'classify' && state.fixes.filter((x) => x.kind === 'classify').every((x) => x.status === 'approved')) {
    const i = state.issues.find((x) => x.kind === 'untyped');
    if (i) i.status = 'fix_approved';
  }
  audit(actorName, 'user', `fix.${f.status}`, f.id, f.title);
}
app.post('/api/fixes/bulk', (req, res) => {
  const actor = actorOf(req);
  if (actor.role === 'Sales engineer') return fail(res, 403, 'Sales engineers cannot approve fixes');
  for (const id of req.body.ids ?? []) decideFix(id, 'approve', actor.name);
  emitAgent({ agent: 'remediator', kind: 'result', text: `${(req.body.ids ?? []).length} fixes approved by ${actor.name}. They will run in the next transformation.` });
  touch();
  res.json({ ok: true });
});

app.post('/api/fixes/:id', (req, res) => {
  const actor = actorOf(req);
  if (actor.role === 'Sales engineer') return fail(res, 403, 'Sales engineers cannot approve fixes');
  decideFix(req.params.id, req.body.decision, actor.name);
  touch();
  res.json({ ok: true });
});
// ---------- Runs, proof pack, sign-off ----------
app.get('/api/runs', (_req, res) => res.json(state.runs));
app.get('/api/proofpack', (_req, res) => {
  const run = state.runs.at(-1)!;
  const approvals = state.audit.filter((a) => /^(mapping|fix|question|code_rule|hierarchy|signoff)\./.test(a.action) && a.actorKind === 'user');
  res.json({
    project: state.project,
    run,
    runs: state.runs.map((r) => ({ id: r.id, number: r.number, dqScore: r.dqScore, startedAt: r.startedAt, transformationVersion: r.transformationVersion, failing: r.reconciliation?.filter((c) => c.outcome === 'fail').length ?? 0, loaded: r.objects.reduce((s, o) => s + o.loaded, 0), failed: r.objects.reduce((s, o) => s + o.failed, 0) })),
    approvals,
    lineage: [
      { source: 'Maximo ASSET.SERIALNUM', concept: 'core:SerialNumber', mapping: 'M-002', transformation: `t_asset_serial.py · ${run.transformationVersion}`, target: 'IFS EquipmentSerial.SerialNo', rule: 'upper(), strip spaces', run: run.id },
      { source: 'Maximo ASSET.PARENT + ASSET.LOCATION', concept: 'core:PhysicalAsset', mapping: 'M-005', transformation: `t_asset_serial.py · ${run.transformationVersion}`, target: 'IFS EquipmentSerial.SupMchCode', rule: 'parent if allowed by ontology else location', run: run.id },
      { source: 'Maximo WORKORDER.STATUS', concept: 'Code list: WO status', mapping: 'M-041', transformation: `t_work_order.py · ${run.transformationVersion}`, target: 'IFS WorkOrder.ObjState', rule: 'lookup via ontology concept scheme', run: run.id },
      { source: 'Maximo PM.FREQUENCY + FREQUNIT', concept: 'core:MaintenancePlan', mapping: 'M-050', transformation: `t_pm_action.py · ${run.transformationVersion}`, target: 'IFS PmAction.Interval', rule: 'calendar vs meter split', run: run.id },
    ],
    signoffs: state.signoffs,
    auditIntegrity: verifyAudit(),
    validationOpen: currentValidation().length,
    dq: dqSnapshot(),
  });
});

app.post('/api/signoff', (req, res) => {
  const actor = actorOf(req);
  if (!['Customer data owner', 'IFS solution consultant'].includes(actor.role)) return fail(res, 403, 'Only the customer data owner and the IFS consultant sign the proof pack');
  const run = state.runs.at(-1)!;
  if (run.reconciliation?.some((c) => c.outcome === 'fail')) return fail(res, 400, `Run ${run.number} still has failing reconciliation checks`);
  if (state.signoffs.some((s) => s.role === actor.role && s.runId === run.id)) return fail(res, 400, 'Already signed');
  state.signoffs.push({ role: actor.role, name: actor.name, at: new Date().toISOString(), runId: run.id });
  const entry = audit(actor.name, 'user', 'signoff.sign', run.id, `Proof pack signed as ${actor.role}`);
  if (state.signoffs.filter((s) => s.runId === run.id).length === 2) {
    const st = state.stages.find((s) => s.n === 12)!;
    st.status = 'done';
    st.finishedAt = new Date().toISOString();
    st.metric = 'Signed by both parties';
    state.stages.find((s) => s.n === 13)!.status = 'ready';
    emitAgent({ agent: 'orchestrator', kind: 'handoff', stage: 12, text: `Proof pack for ${run.id} signed by both parties (audit #${entry.seq}). Delta load and cutover are unlocked.` });
  }
  touch();
  res.json({ ok: true, signature: entry.hash });
});

app.get('/api/ai-ready', (req, res) => res.json(aiReadyAsset(req.query.asset ? String(req.query.asset) : undefined)));
app.get('/api/audit', (_req, res) => res.json({ entries: [...state.audit].reverse(), integrity: verifyAudit() }));
app.get('/api/agent-events', (_req, res) => res.json(state.events.slice(-200)));

// ---------- Review Assistant (streams text over SSE) ----------
app.post('/api/assistant', async (req, res) => {
  const history: ChatTurn[] = (req.body.messages ?? []).slice(-12);
  if (!history.length || history.at(-1)!.role !== 'user') return fail(res, 400, 'Last message must be from the user');
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  audit('assistant', 'agent', 'assistant.answer', req.body.context?.itemId ?? req.body.context?.page, history.at(-1)!.content.slice(0, 140));
  try {
    for await (const chunk of answer(history, req.body.context ?? {})) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      if (!liveModel) await new Promise((r) => setTimeout(r, 28));
    }
    res.write(`data: ${JSON.stringify({ done: true, live: liveModel })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: String((e as Error).message) })}\n\n`);
  }
  res.end();
});

app.post('/api/reset', (_req, res) => {
  reset();
  res.json({ ok: true });
});

// ---------- Static web app (production build) ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

const port = Number(process.env.PORT ?? 8791);
app.listen(port, () => {
  console.log(`Asset Migration Studio API on http://localhost:${port} · model ${liveModel ? MODEL_LABEL : 'scripted (no ANTHROPIC_API_KEY)'}`);
});
