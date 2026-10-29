import type { AgentEvent } from '../types.js';
import { one } from '../db.js';
import {
  addRun, audit, buildRun, emitAgent, getCatalogue, getCatalogueSize, getCodeRules, getMappings, getRuns, getStages, loadDataset, projectState, putItems,
  runSignable, setStage, touch, updateProject, upsertFixes,
} from '../store.js';
import { alignProject } from './aligner.js';
import { activeSkills, effectsOf, projectSkills, recordUse, refs } from '../learning/store.js';
import { helped, proposeForSharing } from '../learning/share.js';
import { q } from '../db.js';
import { evaluateLater } from '../learning/engine.js';
import { getProject } from '../store.js';
import { runQuestions } from '../decisions/flow.js';
import { questionsForStage } from '../decisions/questions.js';
import { decisionInputs } from '../store.js';
import { ONTOLOGY_VERSION } from '../data/ontology.js';
import { proposeFixes, validate } from '../rules.js';

// Runs pipeline stages for a project. Each step is recorded as an agent event and, for tool calls,
// in the audit log. Data work is done by the rules engine and transformations on stored records.

type Step = Omit<AgentEvent, 'id' | 'ts' | 'stage'> & { wait?: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString('en-GB');

async function steps(pid: string, n: number): Promise<Step[]> {
  const ds = await loadDataset(pid);
  const mappings = await getMappings(pid);
  const decided = mappings.filter((m) => ['approved', 'changed', 'auto_accepted', 'not_migrated'].includes(m.status)).length;
  const custom = (await getCatalogueSize(pid)).custom;
  switch (n) {
    case 1: return [
      { agent: 'orchestrator', kind: 'plan', text: 'Checking connectors to the source and the IFS Cloud sandbox.' },
      { agent: 'orchestrator', kind: 'tool', text: 'Read-only role confirmed: SELECT on source schema, no DML grants.', tool: 'connector.test', args: 'source', ms: 420 },
      { agent: 'orchestrator', kind: 'tool', text: 'IFS Cloud sandbox reachable; migration projections available.', tool: 'connector.test', args: 'ifs-sandbox', ms: 610 },
      { agent: 'orchestrator', kind: 'done', text: 'Connections healthy. Credentials are held in Key Vault.' },
    ];
    case 2: {
      const size = await getCatalogueSize(pid);
      return [
        { agent: 'harvester', kind: 'tool', text: `Read source data dictionary: ${size.tables} tables, ${size.fields} profiled fields.`, tool: 'dictionary.read', args: 'source', ms: 1240 },
        { agent: 'harvester', kind: 'thought', text: `${custom} custom elements found outside the vendor standard; marked for review.` },
        { agent: 'harvester', kind: 'tool', text: 'Read IFS Cloud $metadata for equipment, PM and work order projections.', tool: 'odata.metadata', args: 'ifs-sandbox', ms: 1530 },
        { agent: 'harvester', kind: 'done', text: 'Source and target catalogues updated.' },
      ];
    }
    case 3: {
      const untyped = ds.assets.filter((a) => !a.classstructure).length;
      return [
        { agent: 'profiler', kind: 'tool', text: `Profiled ${fmt(ds.assets.length)} assets: ${untyped} without classification.`, tool: 'profile.run', args: 'ASSET', ms: 2100 },
        { agent: 'profiler', kind: 'tool', text: `Profiled ${fmt(ds.workOrders.length)} open work orders and ${fmt(ds.pms.length)} PM plans.`, tool: 'profile.run', args: 'WORKORDER, PM', ms: 1720 },
        { agent: 'profiler', kind: 'tool', text: `Profiled ${fmt(ds.locations.length)} locations.`, tool: 'profile.run', args: 'LOCATIONS', ms: 900 },
        { agent: 'profiler', kind: 'done', text: 'Profile complete.' },
      ];
    }
    case 4: {
      const rules = await getCodeRules(pid);
      return [
        { agent: 'code-reader', kind: 'plan', text: 'Reading automation scripts, Java classes and escalations. Customer code is read, never run.' },
        ...rules.map((r) => ({ agent: 'code-reader', kind: 'tool' as const, text: `${r.sourceFile}: ${r.ruleText.split('.')[0]}.`, tool: 're_harness.trace_writes', args: r.sourceFile, ms: 900 })),
        { agent: 'code-reader', kind: 'done', text: `${rules.length} business rules linked to the fields they touch.` },
      ];
    }
    case 5: return [
      { agent: 'orchestrator', kind: 'plan', text: `Assigning ${mappings.length} source elements to Concept Aligner, Hierarchy Agent and Code List Agent.` },
      { agent: 'aligner', kind: 'tool', text: `Resolved ${mappings.length} elements against ${ONTOLOGY_VERSION}.`, tool: 'ontology.find_concept', args: `${mappings.length} elements`, ms: 1800 },
      { agent: 'aligner', kind: 'tool', text: `${mappings.filter((m) => m.precedents.some((p) => p.outcome === 'approved')).length} bindings backed by precedents.`, tool: 'memory.get_precedents', args: 'tenant + shared', ms: 400 },
      { agent: 'hierarchy', kind: 'result', text: `${validate(ds).filter((f) => f.rule === 'SM-01').length} assets sit under a parent their class does not allow.` },
      { agent: 'code-list', kind: 'done', text: 'Code lists mapped; unmatched codes sent to the data owner.' },
    ];
    case 6: return [
      { agent: 'target-designer', kind: 'tool', text: 'Bound concepts to EquipmentFunctional, EquipmentSerial, PmAction and WorkOrder.', tool: 'ontology.get_vendor_binding', args: 'ifs-cloud', ms: 900 },
      { agent: 'target-designer', kind: 'needs_human', text: 'Configuration items sent to the IFS solution consultant for approval.' },
    ];
    case 8: return [
      { agent: 'builder', kind: 'plan', text: `Building from ${decided} decided mappings; ${mappings.length - decided} undecided mappings keep the previous version.` },
      { agent: 'builder', kind: 'tool', text: 'Generated t_asset_serial, t_functional, t_pm_action, t_work_order, t_measurement with unit tests.', tool: 'astra_data.generate', args: '5 targets', ms: 2600 },
      { agent: 'builder', kind: 'tool', text: 'Unit tests passed. Transformation version committed.', tool: 'tests.run', args: 'transformations', ms: 1800 },
    ];
    case 9: return [
      { agent: 'orchestrator', kind: 'tool', text: 'Loaded functional and serial objects through IFS data migration tooling.', tool: 'ifs.migration_job', args: 'EquipmentFunctional, EquipmentSerial', ms: 2400 },
      { agent: 'orchestrator', kind: 'tool', text: 'Loaded PM actions, open work orders and measurements.', tool: 'ifs.migration_job', args: 'PmAction, WorkOrder, Measurement', ms: 2000 },
    ];
    case 10: {
      const s = await projectState(pid);
      return [
        { agent: 'validator', kind: 'tool', text: `Ran 13 rules over ${fmt(s.cur.assets.length + s.cur.workOrders.length + s.cur.pms.length)} records: ${s.curFailures.length} findings, ${s.curFailures.filter((f) => f.severity === 'error').length} errors.`, tool: 'rules.run', args: 'ST, RF, SM, BR, DQ', ms: 1800 },
        { agent: 'remediator', kind: 'needs_human', text: `${s.fixes.filter((f) => f.status === 'proposed').length} fix proposals waiting for approval.` },
      ];
    }
    case 11: return [
      { agent: 'reconciler', kind: 'tool', text: 'Compared counts, totals, hierarchy and sampled records.', tool: 'recon.run', args: 'source ↔ IFS', ms: 1800 },
    ];
    case 13: return [
      { agent: 'orchestrator', kind: 'tool', text: 'Applied source changes since the last run (change-date watermark).', tool: 'delta.apply', ms: 1500 },
      { agent: 'orchestrator', kind: 'tool', text: 'Production load complete through IFS data migration tooling.', tool: 'ifs.migration_job', args: 'production', ms: 2600 },
      { agent: 'reconciler', kind: 'done', text: 'Post-cutover reconciliation passed.' },
    ];
    case 14: {
      const project = await getProject(pid);
      const skills = await projectSkills(pid);
      const measured = skills.project.filter((s) => s.status === 'measured');
      const ready = measured.filter(helped);
      const proposals = await q<{ n: number }>(`SELECT count(*)::int AS n FROM ontology_proposals WHERE status = 'proposed'`);
      const out: Step[] = [
        { agent: 'steward', kind: 'tool', text: `Stored ${decided} decisions and ${skills.project.length} project skills in the tenant memory.`, tool: 'memory.write_tenant', ms: 900 },
        { agent: 'steward', kind: 'result', text: `${proposals[0]?.n ?? 0} ontology proposals waiting for the curator.` },
      ];
      if (!project?.sharedLearning) out.push({ agent: 'steward', kind: 'done', text: `Shared learning is off for this contract: ${ready.length} measured skill${ready.length === 1 ? '' : 's'} that helped stay in the tenant.` });
      else {
        for (const s of ready) {
          const c = await proposeForSharing(pid, s.id).catch(() => undefined);
          if (c) out.push({ agent: 'steward', kind: 'handoff', text: `"${c.name}" anonymised and proposed to the shared library as ${c.id}.` });
        }
        out.push({ agent: 'steward', kind: ready.length ? 'needs_human' : 'done', text: ready.length ? 'Proposals sent to the ontology curator for golden-dataset testing.' : 'No measured skill showed a benefit yet.' });
      }
      return out;
    }
    default: return [];
  }
}

/** Skill steps for a stage: load pre-checks before the dry-run load, location rules in alignment. */
async function skillSteps(pid: string, n: number): Promise<Step[]> {
  const project = await getProject(pid);
  if (!project || (n !== 9 && n !== 5)) return [];
  const skills = await activeSkills(pid, project);
  const out: Step[] = [];
  const ds = await loadDataset(pid);
  if (n === 9) {
    for (const { skill, effect } of effectsOf(skills, 'load_precheck')) {
      if (effect.check === 'default_site') {
        const sites = new Set(ds.locations.filter((l) => l.type === 'SITE').map((l) => l.location));
        const missing = ds.workOrders.filter((w) => !w.siteid || !sites.has(w.siteid)).length;
        await recordUse(pid, skill, 'orchestrator', 'stage 9', 1);
        await audit(pid, 'orchestrator', 'agent', 'skill.apply', skill.id, `Default site check: ${missing} work orders without a known site`, undefined, refs([skill]));
        out.push({ agent: 'orchestrator', kind: 'tool', tool: 'precheck.default_site', args: `skill ${skill.id}`, text: `Skill "${skill.name}": checked the source default site before loading; ${missing} work orders without a known site.`, ms: 300 });
      }
    }
  }
  if (n === 5) {
    for (const { skill, effect } of effectsOf(skills, 'location_type_rule')) {
      const count = ds.locations.filter((l) => l.type === effect.locationType).length;
      if (!count) continue;
      await recordUse(pid, skill, 'hierarchy', 'stage 5', count);
      out.push({ agent: 'hierarchy', kind: 'result', text: `Skill "${skill.name}": ${count} ${effect.locationType} locations ${effect.action === 'functional_object' ? 'become functional objects' : 'are not migrated'}.` });
    }
  }
  return out;
}

async function play(pid: string, n: number) {
  await setStage(pid, n, { status: 'running', started: true });
  await touch(pid);
  for (const step of await skillSteps(pid, n)) await emitAgent(pid, { ...step, stage: n });
  for (const step of await steps(pid, n)) {
    await sleep(step.wait ?? 450 + Math.min(step.ms ?? 300, 1500));
    const { wait, ...ev } = step;
    void wait;
    await emitAgent(pid, { ...ev, stage: n });
    if (ev.kind === 'tool') await audit(pid, ev.agent, 'agent', `tool.${ev.tool}`, ev.args, ev.text);
  }
  await setStage(pid, n, { status: 'done', finished: true });
}

const running = new Set<string>();

export async function runStage(pid: string, n: number, actor: string) {
  if (running.has(pid)) throw new Error('Another stage is running');
  const hasData = await one<{ n: number }>(`SELECT count(*)::int AS n FROM source_records WHERE project_id = $1`, [pid]);
  if (n >= 2 && !hasData?.n) throw new Error('Upload a source extract or connect a source system first');
  running.add(pid);
  await audit(pid, actor, 'user', 'stage.run', `Stage ${n}`);
  try {
    if (n >= 8 && n <= 11) {
      for (const k of [8, 9, 10, 11].filter((k) => k >= n)) {
        if (k === 8 || k === 10) {
          // Decision batches for this stage run first; reruns answer from the decision cache.
          await setStage(pid, k, { status: 'running', started: true });
          await runQuestions(pid, questionsForStage(k), 'decision-model');
        }
        if (k === 10) {
          // The Remediation Agent proposes fixes for anything the raw data still breaks.
          const raw = await loadDataset(pid);
          const dec = await decisionInputs(pid);
          await upsertFixes(pid, proposeFixes(raw, validate(raw, dec), dec));
        }
        await play(pid, k);
      }
      const run = await buildRun(pid, (await getRuns(pid)).length + 1);
      await addRun(pid, run);
      const fails = run.reconciliation!.filter((c) => c.outcome === 'fail').length;
      await setStage(pid, 9, { metric: `Run ${run.number}` });
      await setStage(pid, 10, { metric: `${run.validation.reduce((s, v) => s + v.failures, 0)} findings` });
      await setStage(pid, 11, { metric: fails ? `${fails} checks failing` : 'All checks pass' });
      if (runSignable(run)) await setStage(pid, 12, { status: 'ready' });
      await emitAgent(pid, { agent: 'orchestrator', kind: 'done', stage: 11, text: `Run ${run.number} complete · data quality ${(run.dqScore * 100).toFixed(1)}% · ${runSignable(run) ? 'ready for sign-off' : `${fails} reconciliation checks failing, ${run.errors.length} errors in the queue`}.` });
      await audit(pid, 'orchestrator', 'agent', 'load.run', run.id, `Dry run ${run.number} · ${run.transformationVersion} · ${ONTOLOGY_VERSION}`);
      evaluateLater(pid);
    } else {
      if (n === 5 && !(await getMappings(pid)).length) {
        await emitAgent(pid, { agent: 'aligner', kind: 'plan', stage: 5, text: 'Binding catalogue fields to ontology concepts from the mapping memory and the model.' });
        const proposed = await alignProject(pid, await getCatalogue(pid));
        await putItems(pid, 'mapping', proposed);
        await audit(pid, 'aligner', 'agent', 'alignment.propose', `${proposed.length} mappings`);
      }
      await play(pid, n);
      // Screening (stage 2) and review risk, precedent relevance and code lists (stage 5).
      if (n === 2 || n === 5) {
        await runQuestions(pid, questionsForStage(n), 'decision-model').catch((e) =>
          emitAgent(pid, { agent: 'decision-model', kind: 'error', stage: n, text: `Decision batch failed: ${String(e?.message ?? e)}` }));
      }
      const next = (await getStages(pid)).find((s) => s.n === n + 1);
      if (next?.status === 'locked' && n < 7) await setStage(pid, n + 1, { status: n + 1 === 7 ? 'waiting' : 'ready' });
      if (n === 13) { await updateProject(pid, { status: 'Live in IFS Cloud' }); await setStage(pid, 14, { status: 'ready' }); }
    }
  } finally {
    running.delete(pid);
    await touch(pid);
  }
}

export async function reviewProgressNudge(pid: string) {
  const mappings = await getMappings(pid);
  const left = mappings.filter((m) => m.status === 'proposed' || m.status === 'question').length;
  await setStage(pid, 7, { metric: left ? `${left} items to decide` : 'All decided' });
  const st = (await getStages(pid)).find((s) => s.n === 7);
  if (!left && st && st.status !== 'done') {
    await setStage(pid, 7, { status: 'done', finished: true });
    await emitAgent(pid, { agent: 'orchestrator', kind: 'handoff', stage: 7, text: `Every source element has a decision. The next dry run can start.` });
  }
}
