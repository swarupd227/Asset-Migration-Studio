import type { AgentEvent } from '../types.js';
import { audit, emitAgent, newRun, state, touch, currentValidation, dqSnapshot } from '../store.js';
import { ONTOLOGY_VERSION } from '../data/ontology.js';
import { badMeter, pumpsUnderValves } from '../data/seed.js';

// Scripted agent runs for the concept demo. The spec allows scripted agent results where a live
// agent run is not ready, as long as the presenter says so; the UI labels these runs "scripted".

type Step = Omit<AgentEvent, 'id' | 'ts' | 'stage'> & { wait?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function script(n: number): Step[] {
  const approved = state.mappings.filter((m) => ['approved', 'changed', 'auto_accepted', 'not_migrated'].includes(m.status)).length;
  const pending = state.mappings.length - approved;
  switch (n) {
    case 1: return [
      { agent: 'orchestrator', kind: 'plan', text: 'Checking connectors: Maximo (read-only, Oracle 19c) and IFS Cloud sandbox.' },
      { agent: 'orchestrator', kind: 'tool', text: 'Read-only role confirmed: SELECT on MAXIMO schema, no DML grants.', tool: 'connector.test', args: 'maximo-nvwp', ms: 420 },
      { agent: 'orchestrator', kind: 'tool', text: 'IFS Cloud sandbox reachable. 38 projections available for migration.', tool: 'connector.test', args: 'ifs-sandbox', ms: 610 },
      { agent: 'orchestrator', kind: 'done', text: 'Connections healthy. Secrets are held in the vault, never in the project store.' },
    ];
    case 2: return [
      { agent: 'orchestrator', kind: 'plan', text: 'Plan: harvest Maximo data dictionary, then IFS Cloud OData metadata.' },
      { agent: 'harvester', kind: 'tool', text: 'Read MAXOBJECT and MAXATTRIBUTE: 17 objects in scope, 412 attributes.', tool: 'sql.read_dictionary', args: 'MAXOBJECT, MAXATTRIBUTE', ms: 1240 },
      { agent: 'harvester', kind: 'tool', text: 'Read MAXRELATIONSHIP: 64 relations. Read ALNDOMAIN/SYNONYMDOMAIN: 23 domains.', tool: 'sql.read_dictionary', args: 'MAXRELATIONSHIP, *DOMAIN', ms: 880 },
      { agent: 'harvester', kind: 'thought', text: 'Attributes with the NV_ prefix are not in the Maximo standard: marking 6 custom fields and 1 custom table (NV_INSPECTLOG) for review.' },
      { agent: 'harvester', kind: 'tool', text: 'Read IFS Cloud $metadata for EquipmentSerialHandling, EquipmentFunctionalHandling, PmActionHandling…', tool: 'odata.metadata', args: '12 projections', ms: 1530 },
      { agent: 'harvester', kind: 'done', text: 'Source and target catalogues built. 7 custom elements flagged.' },
    ];
    case 3: return [
      { agent: 'profiler', kind: 'plan', text: 'Generating profiling SQL. The model sees statistics and samples only, never full tables.' },
      { agent: 'profiler', kind: 'tool', text: 'Profiled ASSET: 0% null serials, 98.1% match manufacturer pattern, 18 repeated serials.', tool: 'profile.run', args: 'ASSET', ms: 2100 },
      { agent: 'profiler', kind: 'tool', text: `Profiled ASSET.CLASSSTRUCTUREID: 64 assets untyped.`, tool: 'profile.run', args: 'ASSET.CLASSSTRUCTUREID', ms: 640 },
      { agent: 'profiler', kind: 'thought', text: `Meter RUNHRS on ${badMeter.asset} decreases on 2026-02-02. Flagging for semantic validation.` },
      { agent: 'profiler', kind: 'tool', text: 'Profiled WORKORDER.STATUS: 3 values outside the standard domain (NV-HOLD, FLDCOMP, PEND-REG).', tool: 'profile.run', args: 'WORKORDER', ms: 1720 },
      { agent: 'profiler', kind: 'done', text: 'Data profile complete with notes for 17 tables.' },
    ];
    case 4: return [
      { agent: 'code-reader', kind: 'plan', text: 'Loading 41 automation scripts, 12 Java classes, 9 escalations into the Astra RE Harness. Customer code is read, never run.' },
      { agent: 'code-reader', kind: 'tool', text: 'NV_WOPRIORITY.py writes WORKORDER.WOPRIORITY from ASSET.NV_CRITCODE on save.', tool: 're_harness.trace_writes', args: 'autoscript/*', ms: 2400 },
      { agent: 'code-reader', kind: 'tool', text: 'FldAssetSerial.java normalises SERIALNUM (upper case, no spaces).', tool: 're_harness.trace_writes', args: 'java/**', ms: 1300 },
      { agent: 'code-reader', kind: 'tool', text: 'Escalation NVREGESC sets NV_REGFLAG on late chlorinator work.', tool: 're_harness.trace_writes', args: 'escalation/*', ms: 900 },
      { agent: 'code-reader', kind: 'done', text: '3 hidden business rules found, each linked to the fields it touches.' },
    ];
    case 5: return [
      { agent: 'orchestrator', kind: 'plan', text: 'Assigning 52 source elements to Concept Aligner, Hierarchy Agent and Code List Agent.' },
      { agent: 'aligner', kind: 'tool', text: 'find_concept("Serial number", ALN 64) → core:SerialNumber (0.97)', tool: 'ontology.find_concept', args: 'ASSET.SERIALNUM', ms: 180 },
      { agent: 'aligner', kind: 'tool', text: 'get_precedents(sig: maximo/ASSET.SERIALNUM/ALN64) → 4 approved', tool: 'memory.get_precedents', args: 'ASSET.SERIALNUM', ms: 95 },
      { agent: 'aligner', kind: 'thought', text: 'NV_CRITCODE has no precedent. Evidence from profile and code (CR-01) supports "asset criticality", but ASSET.PRIORITY competes. Sending both to expert review.' },
      { agent: 'hierarchy', kind: 'tool', text: 'get_constraints(util:CentrifugalPump) → allowed parents: pumping station, process system. Never valve.', tool: 'ontology.get_constraints', args: 'util:CentrifugalPump', ms: 140 },
      { agent: 'hierarchy', kind: 'result', text: `${pumpsUnderValves.length} pumps sit under valves; 4 orphans; 1 loop in secondary hierarchy.` },
      { agent: 'code-list', kind: 'tool', text: 'get_vendor_binding(code list: WO status, maximo) → 6 exact, 1 close, 3 unmatched', tool: 'ontology.get_vendor_binding', args: 'WOSTATUS', ms: 160 },
      { agent: 'code-list', kind: 'needs_human', text: 'NV-HOLD, FLDCOMP and PEND-REG have no match. Asking the customer data owner. Codes are never dropped silently.' },
      { agent: 'aligner', kind: 'done', text: '52 bindings proposed with evidence and calibrated confidence.' },
    ];
    case 6: return [
      { agent: 'target-designer', kind: 'plan', text: 'Binding concepts to IFS Cloud projections (names to be confirmed with IFS).' },
      { agent: 'target-designer', kind: 'tool', text: 'core:PhysicalAsset → EquipmentSerial; core:FunctionalLocation → EquipmentFunctional', tool: 'ontology.get_vendor_binding', args: 'ifs-cloud', ms: 210 },
      { agent: 'target-designer', kind: 'result', text: 'Configuration needed: 2 custom fields (C_LEGACY_ID, C_REG_REPORTABLE), 11 object types, 31 technical attributes.' },
      { agent: 'target-designer', kind: 'needs_human', text: 'Configuration is only proposed. Sent to Lena Svensson (IFS solution consultant) for approval.' },
      { agent: 'target-designer', kind: 'done', text: 'Target design ready.' },
    ];
    case 8: return [
      { agent: 'orchestrator', kind: 'plan', text: `Building from ${approved} decided mappings. ${pending} undecided mappings are excluded; their objects keep the previous transformation version.` },
      { agent: 'builder', kind: 'tool', text: 'Astra Data: generated PySpark job t_asset_serial.py (412 lines) and 38 unit tests.', tool: 'astra_data.generate', args: 'EquipmentSerial', ms: 2600 },
      { agent: 'builder', kind: 'tool', text: 'Generated t_functional.py, t_pm_action.py, t_work_order.py, t_measurement.py with tests.', tool: 'astra_data.generate', args: '4 targets', ms: 2100 },
      { agent: 'builder', kind: 'tool', text: 'Unit tests: 164 passed, 0 failed. Code version committed.', tool: 'tests.run', args: 'transformations', ms: 1800 },
      { agent: 'builder', kind: 'done', text: 'Transformations versioned and ready. Only tested code moves data.' },
    ];
    case 9: return [
      { agent: 'orchestrator', kind: 'plan', text: 'Dry-run load into IFS sandbox through IFS data migration tooling. No direct database writes.' },
      { agent: 'orchestrator', kind: 'tool', text: 'Loaded functional objects (1,104) and serial objects in 8 batches.', tool: 'ifs.migration_job', args: 'EquipmentFunctional, EquipmentSerial', ms: 2400 },
      { agent: 'orchestrator', kind: 'tool', text: 'Loaded PM actions, standard jobs, open work orders, measurements.', tool: 'ifs.migration_job', args: '7 objects', ms: 2000 },
      { agent: 'orchestrator', kind: 'result', text: 'Records IFS rejected are kept in the error queue with the IFS reason.' },
    ];
    case 10: {
      const f = currentValidation();
      return [
        { agent: 'validator', kind: 'plan', text: `Running ${14} rules at four levels against the loaded data.` },
        { agent: 'validator', kind: 'tool', text: 'Structural and reference rules complete.', tool: 'rules.run', args: 'ST-*, RF-*', ms: 1100 },
        { agent: 'validator', kind: 'tool', text: 'Semantic rules from ontology constraints complete.', tool: 'rules.run', args: 'SM-*', ms: 1400 },
        { agent: 'validator', kind: 'result', text: `${f.length} findings (${f.filter((x) => x.severity === 'error').length} errors). Each explained in plain language.` },
        { agent: 'remediator', kind: 'needs_human', text: `${state.fixes.filter((x) => x.status === 'proposed').length} fix proposals waiting for approval. Fixes run only after approval.` },
      ];
    }
    case 11: return [
      { agent: 'reconciler', kind: 'plan', text: 'Comparing source and target: counts, totals, hierarchy and sampled records. Read-only on both sides.' },
      { agent: 'reconciler', kind: 'tool', text: 'Counts per object compared for 11 objects.', tool: 'recon.counts', ms: 1200 },
      { agent: 'reconciler', kind: 'tool', text: 'Totals for rated power, transformer rating and runtime hours compared.', tool: 'recon.totals', ms: 900 },
      { agent: 'reconciler', kind: 'tool', text: '75 sampled records compared field by field.', tool: 'recon.sample', ms: 1300 },
      { agent: 'reconciler', kind: 'done', text: 'Proof pack updated with lineage, approvals, validation and reconciliation results.' },
    ];
    case 13: return [
      { agent: 'orchestrator', kind: 'plan', text: 'Delta load: applying Maximo changes since the last run, then the production load with the same code version.' },
      { agent: 'orchestrator', kind: 'tool', text: '214 changed records since last run (CHANGEDATE watermark).', tool: 'delta.detect', ms: 1500 },
      { agent: 'orchestrator', kind: 'tool', text: 'Production load complete through IFS data migration tooling.', tool: 'ifs.migration_job', args: 'production', ms: 2600 },
      { agent: 'reconciler', kind: 'done', text: 'Post-cutover reconciliation passed.' },
    ];
    case 14: return [
      { agent: 'steward', kind: 'plan', text: 'Writing approved decisions to the tenant memory. Shared learning is off for this contract, so nothing goes to shared memory.' },
      { agent: 'steward', kind: 'tool', text: `Stored ${approved} decisions and reviewer notes as tenant precedents.`, tool: 'memory.write_tenant', ms: 900 },
      { agent: 'steward', kind: 'needs_human', text: '2 anonymised ontology proposals sent to the curator.' },
    ];
    default: return [{ agent: 'orchestrator', kind: 'done', text: 'Nothing to run for this stage.' }];
  }
}

async function play(n: number) {
  const stage = state.stages.find((s) => s.n === n)!;
  stage.status = 'running';
  stage.startedAt = new Date().toISOString();
  touch();
  for (const step of script(n)) {
    await sleep(step.wait ?? 500 + Math.min(step.ms ?? 300, 1600));
    const { wait, ...ev } = step;
    emitAgent({ ...ev, stage: n });
    if (ev.kind === 'tool') audit(ev.agent, 'agent', `tool.${ev.tool}`, ev.args, ev.text);
  }
  stage.status = 'done';
  stage.finishedAt = new Date().toISOString();
}

export async function runStage(n: number, actor: string) {
  if (state.running) throw new Error('Another stage is running');
  state.running = n;
  audit(actor, 'user', 'stage.run', `Stage ${n}`);
  try {
    if (n >= 8 && n <= 11) {
      // Build → load → validate → reconcile run together as one numbered run.
      for (const k of [8, 9, 10, 11].filter((k) => k >= n)) await play(k);
      const run = newRun();
      state.runs.push(run);
      const fails = run.reconciliation!.filter((c) => c.outcome === 'fail').length;
      state.stages.find((s) => s.n === 9)!.metric = `Run ${run.number}`;
      state.stages.find((s) => s.n === 10)!.metric = `${currentValidation().length} findings`;
      state.stages.find((s) => s.n === 11)!.metric = fails ? `${fails} checks failing` : 'All checks pass';
      const signoff = state.stages.find((s) => s.n === 12)!;
      if (!fails) signoff.status = 'ready';
      emitAgent({ agent: 'orchestrator', kind: 'done', stage: 11, text: `Run ${run.number} complete. Data quality ${(dqSnapshot().overallAfter * 100).toFixed(1)}%. ${fails ? `${fails} reconciliation checks still failing.` : 'All reconciliation checks pass. Ready for sign-off.'}` });
      audit('orchestrator', 'agent', 'load.run', run.id, `Dry run ${run.number} · ${run.transformationVersion} · ${ONTOLOGY_VERSION}`);
    } else {
      await play(n);
      if (n === 13) state.project.status = 'Live in IFS Cloud';
      if (n === 13) state.stages.find((s) => s.n === 14)!.status = 'ready';
    }
  } finally {
    state.running = null;
    touch();
  }
}

export function reviewProgressNudge() {
  const stage = state.stages.find((s) => s.n === 7)!;
  const left = state.mappings.filter((m) => m.status === 'proposed' || m.status === 'question').length;
  stage.metric = left ? `${left} items to decide` : 'All decided';
  if (!left && stage.status !== 'done') {
    stage.status = 'done';
    stage.finishedAt = new Date().toISOString();
    emitAgent({ agent: 'orchestrator', kind: 'handoff', stage: 7, text: 'Every source element now has a decision. Build, load, validate and reconcile can run as Run ' + (state.runs.length + 1) + '.' });
  }
}
