import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  AgentEvent, AuditEntry, Dashboard, DqSnapshot, FixProposal, HierarchyIssue, HierarchyNode, LoadRun, Mapping,
  Project, Question, ReconciliationCheck, Rule, Stage, ValidationFailure,
} from './types.js';
import { conceptById, INDUSTRY_PACK, ONTOLOGY_VERSION } from './data/ontology.js';
import {
  assets, badMeter, decommissionedOld, duplicatePairs, locations, orphanAssets, people, pumpsUnderValves, sites,
  untypedAssets, workOrderStats, assetByNum,
} from './data/seed.js';
import { buildMappings, codeRules as seedCodeRules } from './data/catalog.js';

export const MODEL_LABEL = process.env.AMS_MODEL ?? 'claude-opus-5-5';
export const bus = new EventEmitter();
bus.setMaxListeners(100);

const now = () => new Date().toISOString();
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

// ---------------- Static definitions ----------------

export const agents = [
  { id: 'orchestrator', name: 'Orchestrator', job: 'Plans stages, assigns work, tracks state and asks people for decisions.', guardrail: 'Cannot read data values or write to any target.', icon: 'workflow' },
  { id: 'harvester', name: 'Metadata Harvester', job: 'Reads MAXOBJECT, MAXATTRIBUTE, MAXRELATIONSHIP and domains; reads IFS OData metadata.', guardrail: 'Read-only access only.', icon: 'database' },
  { id: 'profiler', name: 'Profiler', job: 'Runs profiling code and explains null rates, patterns and broken references.', guardrail: 'Works on statistics and small samples.', icon: 'bar-chart' },
  { id: 'code-reader', name: 'Code Reader', job: 'Uses the Astra RE Harness to read automation scripts, Java classes and escalations.', guardrail: 'Never runs customer code.', icon: 'file-code' },
  { id: 'aligner', name: 'Concept Aligner', job: 'Binds each source field, table and code value to an ontology concept.', guardrail: 'No evidence means no binding.', icon: 'link' },
  { id: 'target-designer', name: 'Target Designer', job: 'Binds concepts to IFS Cloud objects and lists configuration needed.', guardrail: 'Only proposes configuration. An IFS consultant approves it.', icon: 'layout' },
  { id: 'hierarchy', name: 'Hierarchy Agent', job: 'Rebuilds the Maximo dual hierarchy as IFS functional and serial objects.', guardrail: "Uses the ontology's allowed-parent rules.", icon: 'git-branch' },
  { id: 'code-list', name: 'Code List Agent', job: 'Maps statuses, priorities, failure codes, units and crafts.', guardrail: 'Unmatched codes always go to a person.', icon: 'list' },
  { id: 'builder', name: 'Transformation Builder', job: 'Uses Astra Data to generate transformation code and unit tests from approved mappings.', guardrail: 'Code must pass its tests before it can run.', icon: 'hammer' },
  { id: 'validator', name: 'Validation Agent', job: 'Runs structural, reference, semantic and business rules.', guardrail: 'Cannot change data. It can only report.', icon: 'shield-check' },
  { id: 'remediator', name: 'Remediation Agent', job: 'Proposes fixes such as merging duplicates or classifying untyped assets.', guardrail: 'Fixes run only after approval.', icon: 'wand' },
  { id: 'reconciler', name: 'Reconciliation Agent', job: 'Compares source and target: counts, totals, hierarchy and sampled records.', guardrail: 'Read-only on both sides.', icon: 'scale' },
  { id: 'assistant', name: 'Review Assistant', job: 'Explains evidence, answers questions and drafts decision notes.', guardrail: 'Cannot approve anything.', icon: 'sparkles' },
  { id: 'steward', name: 'Ontology Steward', job: 'Proposes ontology additions from what the project learned.', guardrail: 'Cannot publish ontology changes.', icon: 'book' },
];

export const rules: Rule[] = [
  { id: 'ST-01', level: 'Structural', text: 'Every mandatory IFS field has a value.', source: 'IFS catalogue' },
  { id: 'ST-02', level: 'Structural', text: 'Values fit the target type and length.', source: 'IFS catalogue' },
  { id: 'RF-01', level: 'Reference', text: 'Every work order points to an asset or location that exists in the load.', source: 'Generic' },
  { id: 'RF-02', level: 'Reference', text: 'Every spare part on an asset exists as an inventory part.', source: 'Generic' },
  { id: 'SM-01', level: 'Semantic', text: "A child asset's class is allowed under its parent's class. A pump cannot sit under a valve.", source: 'Ontology allowed-parent rules' },
  { id: 'SM-02', level: 'Semantic', text: 'A failure cause is valid for the failure mode and the equipment class.', source: 'Ontology failure model' },
  { id: 'SM-03', level: 'Semantic', text: 'Meter readings on a cumulative meter never decrease over time.', source: 'Ontology measurement rules' },
  { id: 'SM-04', level: 'Semantic', text: 'PM intervals use valid units, and calendar and meter triggers are not mixed in one interval field.', source: 'Ontology plan rules' },
  { id: 'SM-05', level: 'Semantic', text: 'Rated values sit within plausible ranges for the class.', source: 'Ontology attribute ranges' },
  { id: 'BR-01', level: 'Business', text: 'Only open work orders and five years of closed history are migrated.', source: 'Customer data owner' },
  { id: 'BR-02', level: 'Business', text: 'Assets decommissioned for more than two years are archived, not migrated.', source: 'Customer data owner' },
  { id: 'DQ-01', level: 'Data quality', text: 'Assets with the same serial number, manufacturer and model at the same site are possible duplicates.', source: 'Generic' },
  { id: 'DQ-02', level: 'Data quality', text: 'Every asset has an asset class.', source: 'Ontology' },
  { id: 'DQ-03', level: 'Data quality', text: 'Asset descriptions follow the naming standard "<class> <function> <position>".', source: 'Customer naming standard' },
];

const STAGES: Omit<Stage, 'status'>[] = [
  { n: 1, key: 'connect', name: 'Connect', summary: 'Read-only access to Maximo and an IFS Cloud sandbox.', agents: ['orchestrator'], previewEligible: true },
  { n: 2, key: 'discover', name: 'Discover', summary: 'Catalogues of the source and target systems.', agents: ['harvester'], previewEligible: true },
  { n: 3, key: 'profile', name: 'Profile', summary: 'Measure the data and flag quality problems.', agents: ['profiler'], previewEligible: true },
  { n: 4, key: 'code', name: 'Read custom code', summary: 'Find business rules hidden in scripts and enhancements.', agents: ['code-reader'], previewEligible: true },
  { n: 5, key: 'align', name: 'Align to ontology', summary: 'Bind source elements to ontology concepts.', agents: ['aligner', 'hierarchy', 'code-list'], previewEligible: true },
  { n: 6, key: 'design', name: 'Design target', summary: 'Bind concepts to IFS Cloud and list configuration.', agents: ['target-designer'], previewEligible: true },
  { n: 7, key: 'review', name: 'Review', summary: 'People decide, lowest confidence and highest risk first.', agents: ['assistant'], previewEligible: false },
  { n: 8, key: 'build', name: 'Build transformations', summary: 'Generate and test transformation code.', agents: ['builder'], previewEligible: false },
  { n: 9, key: 'load', name: 'Dry-run load', summary: 'Load into the IFS sandbox through IFS migration tooling.', agents: ['orchestrator'], previewEligible: false },
  { n: 10, key: 'validate', name: 'Validate', summary: 'Run the rule catalogue and propose fixes.', agents: ['validator', 'remediator'], previewEligible: false },
  { n: 11, key: 'reconcile', name: 'Reconcile', summary: 'Compare source and target and build the proof pack.', agents: ['reconciler'], previewEligible: false },
  { n: 12, key: 'signoff', name: 'Sign off', summary: 'Customer data owner and IFS consultant sign the proof pack.', agents: [], previewEligible: false },
  { n: 13, key: 'cutover', name: 'Delta loads & cutover', summary: 'Apply changes since last load, then the production load.', agents: ['orchestrator'], previewEligible: false },
  { n: 14, key: 'learn', name: 'Learn', summary: 'Approved decisions go to the mapping memory.', agents: ['steward'], previewEligible: false },
];

// ---------------- Mutable state ----------------

interface State {
  project: Project;
  stages: Stage[];
  mappings: Mapping[];
  codeRules: typeof seedCodeRules;
  issues: HierarchyIssue[];
  fixes: FixProposal[];
  questions: Question[];
  runs: LoadRun[];
  audit: AuditEntry[];
  events: AgentEvent[];
  signoffs: { role: string; name: string; at: string; runId: string }[];
  version: number;
  running: number | null;
  ontologyProposals: { id: string; change: string; reason: string; source: string; status: 'proposed' | 'accepted' | 'rejected' }[];
}

export let state: State;

function hash(prev: string, payload: object) {
  return createHash('sha256').update(prev + JSON.stringify(payload)).digest('hex');
}

export function audit(actor: string, actorKind: AuditEntry['actorKind'], action: string, target?: string, detail?: string, ts = now()) {
  const prevHash = state.audit.length ? state.audit[state.audit.length - 1].hash : '0'.repeat(64);
  const base = { seq: state.audit.length + 1, ts, actor, actorKind, action, target, detail, ontologyVersion: actorKind === 'agent' ? ONTOLOGY_VERSION : undefined, model: actorKind === 'agent' ? MODEL_LABEL : undefined };
  const entry: AuditEntry = { ...base, prevHash, hash: hash(prevHash, base) };
  state.audit.push(Object.freeze(entry) as AuditEntry); // write-once: entries are frozen and never edited
  return entry;
}

export function verifyAudit() {
  let prev = '0'.repeat(64);
  for (const e of state.audit) {
    const { hash: h, prevHash, ...base } = e;
    if (prevHash !== prev || hash(prev, base) !== h) return { ok: false, brokenAt: e.seq, entries: state.audit.length };
    prev = h;
  }
  return { ok: true, entries: state.audit.length, head: prev };
}

export function touch() {
  state.version++;
  bus.emit('state', { version: state.version });
}

let evSeq = 0;
export function emitAgent(e: Omit<AgentEvent, 'id' | 'ts'>) {
  const full: AgentEvent = { id: `ev-${++evSeq}`, ts: now(), ...e };
  state.events.push(full);
  if (state.events.length > 500) state.events.shift();
  bus.emit('agent', full);
  return full;
}

// ---------------- Hierarchy ----------------

function buildIssues(): HierarchyIssue[] {
  const out: HierarchyIssue[] = [];
  pumpsUnderValves.forEach((p, i) => {
    const pump = assetByNum(p.pump)!;
    out.push({
      id: `HI-${String(i + 1).padStart(3, '0')}`, rule: 'SM-01', kind: 'wrong_parent', record: p.pump, site: pump.siteid,
      message: `Centrifugal pump ${p.pump} sits under valve ${p.valve}. The ontology does not allow a pump under a valve.`,
      proposedFix: `Move ${p.pump} under functional object ${pump.location}, next to the valve.`, status: 'open',
    });
  });
  orphanAssets.forEach((a, i) => {
    const as = assetByNum(a)!;
    out.push({
      id: `HI-${String(20 + i).padStart(3, '0')}`, rule: 'RF-01', kind: 'orphan', record: a, site: as.siteid,
      message: `Asset ${a} points to location ${as.location}, which does not exist in the extract.`,
      proposedFix: `Place under ${as.siteid}-UNASSIGNED and ask the data owner for the right position.`, status: 'open',
    });
  });
  out.push({
    id: 'HI-030', rule: 'IEC 81346', kind: 'cycle', record: 'LAKE-SY04-P03', site: 'LAKE',
    message: 'Location LAKE-SY04-P03 and LAKE-SY04-P07 point to each other as parents in the secondary system hierarchy.',
    proposedFix: 'Use the primary system only. Break the loop by placing both under LAKE-SY04.', status: 'open',
  });
  const untypedSample = untypedAssets.slice(0, 64);
  out.push({
    id: 'HI-040', rule: 'DQ-02', kind: 'untyped', record: `${untypedSample.length} assets`, site: 'All',
    message: `${untypedSample.length} assets have no classification, so IFS cannot give them an object type.`,
    proposedFix: 'The Remediation Agent proposes a class from description, attributes and siblings.', status: 'open',
  });
  return out;
}

const classLabel = (conceptId?: string) => (conceptId ? conceptById.get(conceptId)?.label : undefined);

export function hierarchyForSite(siteId: string): { tree: HierarchyNode; maximo: { locations: number; assets: number; maxDepth: number } } {
  const site = sites.find((s) => s.id === siteId)!;
  const locs = locations.filter((l) => l.siteid === siteId);
  const siteAssets = assets.filter((a) => a.siteid === siteId && !decommissionedOld.includes(a.assetnum));
  const issueByRecord = new Map<string, string[]>();
  for (const i of state.issues) if (i.status === 'open') issueByRecord.set(i.record, [...(issueByRecord.get(i.record) ?? []), i.id]);
  const approvedReparent = new Set(state.fixes.filter((f) => f.kind === 'reparent' && f.status === 'approved').flatMap((f) => f.records));
  const merged = new Set(state.fixes.filter((f) => f.kind === 'merge_duplicate' && f.status === 'approved').map((f) => f.records[1]));

  const nodes = new Map<string, HierarchyNode>();
  const root: HierarchyNode = { id: site.id, label: site.name, kind: 'site', conceptId: 'core:Site', classLabel: 'Site', source: 'SITE', issues: [], children: [], childCount: 0 };
  nodes.set(site.id, root);
  for (const l of locs) {
    if (l.type === 'SITE') continue;
    nodes.set(l.location, { id: l.location, label: l.description, kind: 'functional', conceptId: l.conceptId, classLabel: classLabel(l.conceptId), source: 'LOCATIONS', issues: [], children: [], childCount: 0 });
  }
  for (const l of locs) {
    if (l.type === 'SITE') continue;
    const parent = nodes.get(l.parent ?? site.id) ?? root;
    parent.children.push(nodes.get(l.location)!);
  }
  const unassigned: HierarchyNode = { id: `${site.id}-UNASSIGNED`, label: 'Unassigned (needs decision)', kind: 'functional', conceptId: 'core:FunctionalLocation', classLabel: 'Functional location', source: 'generated', issues: [], children: [], childCount: 0 };
  for (const a of siteAssets) {
    if (merged.has(a.assetnum)) continue;
    nodes.set(a.assetnum, { id: a.assetnum, label: a.description, kind: 'serial', conceptId: a.conceptId, classLabel: a.classstructure ? classLabel(a.conceptId) : 'Untyped', source: 'ASSET', issues: [...(issueByRecord.get(a.assetnum) ?? []), ...(a.classstructure ? [] : ['HI-040'])], children: [], childCount: 0 });
  }
  for (const a of siteAssets) {
    const n = nodes.get(a.assetnum);
    if (!n) continue;
    const useLocation = !a.parent || approvedReparent.has(a.assetnum);
    const parent = useLocation ? nodes.get(a.location) : nodes.get(a.parent!);
    (parent ?? unassigned).children.push(n);
  }
  if (unassigned.children.length) root.children.push(unassigned);
  const count = (n: HierarchyNode): number => (n.childCount = n.children.reduce((s, c) => s + 1 + count(c), 0));
  count(root);
  const depth = (n: HierarchyNode): number => 1 + Math.max(0, ...n.children.map(depth));
  return { tree: root, maximo: { locations: locs.length, assets: siteAssets.length, maxDepth: depth(root) } };
}

// ---------------- Fix proposals (Remediation Agent) ----------------

function buildFixes(): FixProposal[] {
  const out: FixProposal[] = [];
  duplicatePairs.forEach((d, i) => {
    const keep = assetByNum(d.keep)!, dup = assetByNum(d.dup)!;
    out.push({
      id: `FX-D${String(i + 1).padStart(2, '0')}`, kind: 'merge_duplicate', rule: 'DQ-01',
      title: `Merge ${d.dup} into ${d.keep}`, detail: `${keep.description} · ${keep.manufacturer} ${keep.model} · ${keep.siteid}`,
      records: [d.keep, d.dup], confidence: d.score, evidence: d.signals, status: 'proposed',
      diff: [
        { field: 'SERIALNUM', from: dup.serialnum!, to: keep.serialnum! },
        { field: 'STATUS', from: dup.status, to: keep.status },
        { field: 'Work orders', from: `${3 + (i % 5)} on ${d.dup}`, to: `re-pointed to ${d.keep}` },
      ],
    });
  });
  pumpsUnderValves.forEach((p, i) => {
    const pump = assetByNum(p.pump)!;
    out.push({
      id: `FX-R${String(i + 1).padStart(2, '0')}`, kind: 'reparent', rule: 'SM-01', title: `Move pump ${p.pump} out from under valve ${p.valve}`,
      detail: `New parent: functional object ${pump.location}`, records: [p.pump], confidence: 0.93,
      evidence: ['Ontology: pump never under valve', `Valve ${p.valve} and pump share location ${pump.location}`, 'Sibling pumps at this station sit under the location'], status: 'proposed',
      diff: [{ field: 'Parent', from: p.valve, to: pump.location }],
    });
  });
  // Classification proposals grouped by proposed class
  const byClass = new Map<string, string[]>();
  for (const num of untypedAssets) {
    const a = assetByNum(num)!;
    byClass.set(a.conceptId!, [...(byClass.get(a.conceptId!) ?? []), num]);
  }
  let ci = 0;
  for (const [cid, nums] of byClass) {
    const c = conceptById.get(cid)!;
    out.push({
      id: `FX-C${String(++ci).padStart(2, '0')}`, kind: 'classify', rule: 'DQ-02', title: `Classify ${nums.length} untyped assets as ${c.label}`,
      detail: c.bindings.ifs ?? '', records: nums, confidence: Math.round((0.78 + ((ci * 7) % 18) / 100) * 100) / 100,
      evidence: ['Description keywords match concept synonyms', 'Attributes present match class attributes', 'Siblings at the same position share this class'], status: 'proposed',
    });
  }
  out.push({
    id: 'FX-M01', kind: 'meter_correction', rule: 'SM-03', title: `Correct runtime reading on ${badMeter.asset}`,
    detail: 'Reading of 2026-02-02 drops from 42,690 h to 4,312 h, then continues at 43,990 h.', records: [badMeter.asset], confidence: 0.82,
    evidence: ['Value fits the trend if a trailing digit was dropped (43,120 h)', 'No meter replacement recorded on this asset', 'Average 760 h per month before and after'], status: 'proposed',
    diff: [{ field: 'RUNHRS 2026-02-02', from: '4,312', to: '43,120' }],
  });
  out.push({
    id: 'FX-A01', kind: 'archive', rule: 'BR-02', title: `Archive ${decommissionedOld.length} assets decommissioned for more than two years`,
    detail: 'They go to the source archive extract and are not loaded into IFS Cloud.', records: decommissionedOld, confidence: 0.99,
    evidence: ['STATUS = DECOMMISSIONED', 'Status date older than 2024-10-29', 'Business rule BR-02 set by the customer data owner'], status: 'proposed',
  });
  out.push({
    id: 'FX-N01', kind: 'code_map', rule: 'DQ-03', title: 'Apply the naming standard to 192 asset descriptions',
    detail: 'Examples: "OLD - Pump 3" → "Centrifugal pump · Pumping Station 2 · P03"', records: [], confidence: 0.86,
    evidence: ['Customer naming standard <class> <function> <position>', 'Ontology class labels', 'Location descriptions'], status: 'proposed',
    diff: [{ field: 'DESCRIPTION', from: 'OLD - Pumping Station 2 pump 3', to: 'Centrifugal pump · Pumping Station 2 · P03' }],
  });
  out.push({
    id: 'FX-T01', kind: 'code_map', rule: 'SM-05', title: 'Correct 2 transformer ratings out of range',
    detail: 'TX ratings 15000 kVA and 7500 kVA on 11 kV feeders. Likely an extra zero.', records: [], confidence: 0.77,
    evidence: ['Ontology range for distribution transformer: 15–5000 kVA', 'Same model elsewhere rated 1500 kVA and 750 kVA', 'Oil volume matches the smaller rating'], status: 'proposed',
    diff: [{ field: 'RATINGKVA', from: '15000', to: '1500' }, { field: 'RATINGKVA', from: '7500', to: '750' }],
  });
  return out;
}

// ---------------- Validation, DQ, load runs ----------------

const approved = (id: string) => state.fixes.find((f) => f.id === id)?.status === 'approved';
const approvedOfKind = (k: FixProposal['kind']) => state.fixes.filter((f) => f.kind === k && f.status === 'approved');
const mappingDone = (id: string) => ['approved', 'changed'].includes(state.mappings.find((m) => m.id === id)?.status ?? '');

export function currentValidation(): ValidationFailure[] {
  const out: ValidationFailure[] = [];
  const mergedDup = new Set(approvedOfKind('merge_duplicate').map((f) => f.records[1]));
  const reparented = new Set(approvedOfKind('reparent').flatMap((f) => f.records));
  const classified = new Set(approvedOfKind('classify').flatMap((f) => f.records));

  for (const p of pumpsUnderValves) {
    if (reparented.has(p.pump)) continue;
    const pump = assetByNum(p.pump)!;
    const fix = state.fixes.find((f) => f.kind === 'reparent' && f.records[0] === p.pump);
    out.push({ id: `VF-SM01-${p.pump}`, rule: 'SM-01', record: p.pump, object: 'Serial object', site: pump.siteid, severity: 'error', fixId: fix?.id,
      reason: `Pump ${p.pump} sits under valve ${p.valve}. A centrifugal pump can only sit under a pumping station or process system, never under a valve, meter or instrument.`,
      proposedFix: `Move it under functional object ${pump.location}.` });
  }
  if (!approved('FX-M01')) {
    out.push({ id: 'VF-SM03-1', rule: 'SM-03', record: `${badMeter.asset} · RUNHRS`, object: 'Measurement', site: 'RIVR', severity: 'error', fixId: 'FX-M01',
      reason: 'The runtime hours meter goes down from 42,690 h on 5 Jan to 4,312 h on 2 Feb. A cumulative meter can only go down when the meter is replaced, and no replacement is recorded.',
      proposedFix: 'Correct the reading to 43,120 h (a dropped digit), or record a meter replacement.' });
  }
  for (const d of duplicatePairs) {
    if (mergedDup.has(d.dup)) continue;
    const a = assetByNum(d.keep)!;
    const fix = state.fixes.find((f) => f.kind === 'merge_duplicate' && f.records[1] === d.dup);
    out.push({ id: `VF-DQ01-${d.dup}`, rule: 'DQ-01', record: `${d.keep} / ${d.dup}`, object: 'Serial object', site: a.siteid, severity: 'warning', fixId: fix?.id,
      reason: `${d.keep} and ${d.dup} have the same serial number ${a.serialnum}, manufacturer ${a.manufacturer} and model at ${a.siteid}. They are probably the same pump or device entered twice.`,
      proposedFix: `Merge ${d.dup} into ${d.keep} and re-point its work orders.` });
  }
  const untypedLeft = untypedAssets.filter((n) => !classified.has(n));
  for (const n of untypedLeft.slice(0, 64)) {
    const a = assetByNum(n)!;
    const fix = state.fixes.find((f) => f.kind === 'classify' && f.records.includes(n));
    out.push({ id: `VF-DQ02-${n}`, rule: 'DQ-02', record: n, object: 'Serial object', site: a.siteid, severity: 'error', fixId: fix?.id,
      reason: `Asset ${n} ("${a.description}") has no classification, so it cannot get an IFS object type or technical attributes.`,
      proposedFix: `Classify as ${conceptById.get(a.conceptId!)?.label}.` });
  }
  if (!approved('FX-A01')) {
    out.push({ id: 'VF-BR02', rule: 'BR-02', record: `${decommissionedOld.length} assets`, object: 'Serial object', site: 'All', severity: 'warning', fixId: 'FX-A01',
      reason: `${decommissionedOld.length} assets were decommissioned more than two years ago. The customer rule says they are archived, not migrated, but they are still in the load set.`,
      proposedFix: 'Approve the archive proposal to remove them from the load.' });
  }
  if (!mappingDone('M-050')) {
    out.push({ id: 'VF-SM04', rule: 'SM-04', record: '12 PM plans', object: 'PM action', site: 'All', severity: 'error',
      reason: '12 preventive maintenance plans use HOURS as a calendar unit. Running hours are a meter trigger, and IFS cannot mix calendar and meter triggers in one interval.',
      proposedFix: 'Approve mapping M-050, which moves HOURS plans to a runtime meter trigger.' });
  }
  if (!approved('FX-T01')) {
    out.push({ id: 'VF-SM05', rule: 'SM-05', record: '2 transformers', object: 'Technical attribute', site: 'HARB', severity: 'warning', fixId: 'FX-T01',
      reason: 'Two distribution transformers are rated 15,000 kVA and 7,500 kVA. That is outside the plausible range for this class (15–5,000 kVA) on an 11 kV feeder.',
      proposedFix: 'Correct to 1,500 kVA and 750 kVA after a quick check with the site.' });
  }
  out.push({ id: 'VF-SM02', rule: 'SM-02', record: '14 work orders', object: 'Work order', site: 'NORTH', severity: 'warning',
    reason: 'Failure cause "tap changer failure" is recorded on 14 pump work orders. That cause is only valid for transformers.',
    proposedFix: 'Map these causes to "mechanical failure – general" and keep the original code in the note.' });
  out.push({ id: 'VF-RF01', rule: 'RF-01', record: '22 work orders', object: 'Work order', site: 'All', severity: 'error',
    reason: '22 closed work orders point to assets that are not in the extract (deleted in Maximo before 2019).',
    proposedFix: 'Link them to their work location instead, which still exists.' });
  if (!mappingDone('M-046')) {
    out.push({ id: 'VF-ST02', rule: 'ST-02', record: '31 work orders', object: 'Work order', site: 'All', severity: 'warning',
      reason: '31 work order descriptions are longer than the 60 characters the IFS field allows.',
      proposedFix: 'Approve mapping M-046, which moves the overflow into the note.' });
  }
  return out;
}

export function dqSnapshot(): DqSnapshot {
  const fails = currentValidation();
  const assetFailures = fails.filter((f) => f.object === 'Serial object').length + (approved('FX-N01') ? 0 : 192) + (approved('FX-A01') ? 0 : decommissionedOld.length - 1);
  const assetAfter = Math.max(0, 1 - assetFailures / assets.length);
  const assetBefore = 1 - (untypedAssets.length + duplicatePairs.length + pumpsUnderValves.length + orphanAssets.length + decommissionedOld.length + 192 + 2) / assets.length;
  const byObject = [
    { object: 'Serial objects (assets)', before: assetBefore, after: assetAfter, records: assets.length },
    { object: 'Functional objects', before: 0.991, after: state.issues.find((i) => i.kind === 'cycle')?.status === 'fix_approved' ? 0.999 : 0.995, records: locations.length },
    { object: 'Work orders', before: 0.962, after: mappingDone('M-046') ? 0.991 : 0.984, records: workOrderStats.open + workOrderStats.inScopeClosed },
    { object: 'PM plans', before: 0.9, after: mappingDone('M-050') ? 0.987 : 0.93, records: workOrderStats.pmPlans },
    { object: 'Meters and readings', before: 0.993, after: approved('FX-M01') ? 1 : 0.999, records: workOrderStats.meters },
    { object: 'Failure codes', before: 0.912, after: 0.958, records: workOrderStats.failureCodes },
  ];
  const total = byObject.reduce((s, o) => s + o.records, 0);
  const w = (k: 'before' | 'after') => byObject.reduce((s, o) => s + o[k] * o.records, 0) / total;
  const siteFactor: Record<string, number> = { NORTH: 0.004, RIVR: -0.011, LAKE: 0.006, HARB: -0.004, EAST: 0.008 };
  return {
    overallBefore: w('before'),
    overallAfter: w('after'),
    byObject,
    bySite: sites.map((s) => ({ site: s.id, before: w('before') + siteFactor[s.id], after: Math.min(0.999, w('after') + siteFactor[s.id] / 3) })),
  };
}

function runObjects(failFactor: number) {
  const inScopeAssets = assets.length - decommissionedOld.length;
  const rows = [
    { object: 'Functional objects', ifsTarget: 'EquipmentFunctional', source: locations.length },
    { object: 'Serial objects', ifsTarget: 'EquipmentSerial', source: inScopeAssets },
    { object: 'Technical attributes', ifsTarget: 'TechnicalAttribute', source: 9810 },
    { object: 'PM actions', ifsTarget: 'PmAction', source: workOrderStats.pmPlans },
    { object: 'Standard jobs', ifsTarget: 'StandardJob', source: 180 },
    { object: 'Open work orders', ifsTarget: 'WorkOrder', source: workOrderStats.open },
    { object: 'Work history (summarised)', ifsTarget: 'Historical work', source: workOrderStats.inScopeClosed },
    { object: 'Measurement values', ifsTarget: 'Measurement', source: 21420 },
    { object: 'Failure codes', ifsTarget: 'Discovery / cause', source: workOrderStats.failureCodes },
    { object: 'Spare parts', ifsTarget: 'Object spare part', source: workOrderStats.spareParts },
    { object: 'Documents', ifsTarget: 'Document connection', source: workOrderStats.documents },
  ];
  return rows.map((r, i) => {
    const failed = Math.round(r.source * failFactor * (0.4 + ((i * 37) % 10) / 10) * 0.01);
    return { ...r, loaded: r.source - failed, failed };
  });
}

function reconciliation(run: Pick<LoadRun, 'objects'>, perfect: boolean): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = [];
  run.objects.forEach((o, i) => {
    checks.push({
      id: `RC-C${i + 1}`, kind: 'count', object: o.object, check: 'Record count (in scope vs loaded)', sourceValue: o.source.toLocaleString('en-GB'),
      targetValue: o.loaded.toLocaleString('en-GB'), outcome: o.failed === 0 ? 'pass' : perfect ? 'explained' : 'fail',
      note: o.failed ? `${o.failed} in error queue with IFS reason` : undefined,
    });
  });
  checks.push({ id: 'RC-T1', kind: 'total', object: 'Serial objects', check: 'Σ rated power of pumps (kW)', sourceValue: '61,842', targetValue: '61,842', outcome: 'pass' });
  checks.push({ id: 'RC-T2', kind: 'total', object: 'Serial objects', check: 'Σ transformer rating (kVA)', sourceValue: perfect ? '64,875' : '83,625', targetValue: '64,875', outcome: perfect ? 'pass' : 'explained', note: perfect ? undefined : 'Difference = 2 corrected ratings (FX-T01)' });
  checks.push({ id: 'RC-T3', kind: 'total', object: 'Measurement values', check: 'Σ runtime hours, last reading per meter', sourceValue: '18,204,611', targetValue: '18,204,611', outcome: 'pass' });
  checks.push({ id: 'RC-H1', kind: 'hierarchy', object: 'Serial objects', check: 'Every serial object has a parent object', sourceValue: '100%', targetValue: perfect ? '100%' : '99.8%', outcome: perfect ? 'pass' : 'fail' });
  checks.push({ id: 'RC-H2', kind: 'hierarchy', object: 'Functional objects', check: 'Children per functional object match source', sourceValue: '1,104 nodes', targetValue: '1,104 nodes', outcome: 'pass' });
  checks.push({ id: 'RC-S1', kind: 'sample', object: 'Serial objects', check: '50 sampled records, all fields', sourceValue: '50', targetValue: perfect ? '50 match' : '48 match', outcome: perfect ? 'pass' : 'fail', note: perfect ? undefined : '2 differences caused by unmerged duplicates' });
  checks.push({ id: 'RC-S2', kind: 'sample', object: 'Open work orders', check: '25 sampled records, all fields', sourceValue: '25', targetValue: '25 match', outcome: 'pass' });
  return checks;
}

function seedRuns(): LoadRun[] {
  const r1: LoadRun = {
    id: 'RUN-1', number: 1, kind: 'dry_run', startedAt: ago(60 * 24 * 9), finishedAt: ago(60 * 24 * 9 - 47), transformationVersion: 'T-2026.10.1', ontologyVersion: ONTOLOGY_VERSION, status: 'complete',
    objects: runObjects(6), validation: [{ rule: 'SM-01', failures: 7 }, { rule: 'DQ-01', failures: 18 }, { rule: 'DQ-02', failures: 64 }, { rule: 'SM-04', failures: 12 }, { rule: 'RF-01', failures: 61 }, { rule: 'ST-02', failures: 31 }],
    dqScore: 0.842, errors: [],
  };
  const r2: LoadRun = {
    id: 'RUN-2', number: 2, kind: 'dry_run', startedAt: ago(60 * 24 * 3), finishedAt: ago(60 * 24 * 3 - 39), transformationVersion: 'T-2026.10.4', ontologyVersion: ONTOLOGY_VERSION, status: 'complete',
    objects: runObjects(2.2), validation: [{ rule: 'SM-01', failures: 7 }, { rule: 'DQ-01', failures: 18 }, { rule: 'DQ-02', failures: 64 }, { rule: 'SM-04', failures: 12 }, { rule: 'RF-01', failures: 22 }, { rule: 'ST-02', failures: 31 }],
    dqScore: 0.871,
    errors: [
      { record: 'WO-071233', object: 'Work order', ifsMessage: 'ORA-20111: WorkOrder.MchCode "PU-10877" does not exist (Object).' },
      { record: 'PU-11410A', object: 'Serial object', ifsMessage: 'Serial number already exists for part no PUMP-CENT (EquipmentSerial.SerialNo).' },
      { record: 'PM-00418', object: 'PM action', ifsMessage: 'Interval unit HOURS is not valid for a calendar based PM action.' },
    ],
  };
  r1.reconciliation = reconciliation(r1, false);
  r2.reconciliation = reconciliation(r2, false);
  return [r1, r2];
}

export function newRun(): LoadRun {
  const n = state.runs.length + 1;
  const fails = currentValidation();
  const errorFactor = Math.max(0.15, fails.filter((f) => f.severity === 'error').length / 25);
  const perfect = fails.filter((f) => f.severity === 'error' && !['SM-02', 'RF-01'].includes(f.rule)).length === 0 && approved('FX-T01');
  const byRule = new Map<string, number>();
  for (const f of fails) {
    const m = f.record.match(/^(\d+)\s/);
    byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + (m ? Number(m[1]) : 1));
  }
  const run: LoadRun = {
    id: `RUN-${n}`, number: n, kind: 'dry_run', startedAt: now(), finishedAt: now(), transformationVersion: `T-2026.10.${4 + n}`, ontologyVersion: ONTOLOGY_VERSION, status: 'complete',
    objects: runObjects(errorFactor), validation: [...byRule.entries()].map(([rule, failures]) => ({ rule, failures })),
    dqScore: dqSnapshot().overallAfter,
    errors: fails.filter((f) => f.severity === 'error').slice(0, 6).map((f) => ({ record: f.record, object: f.object, ifsMessage: `Validation ${f.rule}: ${f.reason.slice(0, 90)}…` })),
  };
  run.reconciliation = reconciliation(run, perfect);
  return run;
}

// ---------------- Questions ----------------

function seedQuestions(): Question[] {
  return [
    { id: 'Q-01', item: 'M-041', text: 'What does the local work order status NV-HOLD mean, and where should its 38 work orders go in IFS?', assignedTo: 'u-tom', status: 'open', options: ['Released, with a hold reason "Waiting for parts"', 'Prepared (not yet released)', 'Treat as cancelled'] },
    { id: 'Q-02', item: 'M-041', text: 'FLDCOMP is used on 27 work orders. Is it "field work complete, paperwork pending"?', assignedTo: 'u-tom', status: 'open', options: ['Yes → Work done or reported', 'No → Work started'] },
    { id: 'Q-03', item: 'M-041', text: 'PEND-REG (15 work orders) appears only on chlorinator work. Does it mean "pending regulator approval"?', assignedTo: 'u-tom', status: 'open', options: ['Yes → Released + regulatory flag', 'No → ask the site'] },
    { id: 'Q-04', item: 'BR-01', text: 'Confirm business rule BR-01: migrate open work orders and five years of closed history (8,068 work orders), and summarise older history per asset and year.', assignedTo: 'u-tom', status: 'answered', answer: 'Confirmed. Five years in full, older history summarised.' },
    { id: 'Q-05', item: 'M-012', text: 'Can we add custom field C_LEGACY_ID on serial objects in IFS Cloud for the GIS legacy id?', assignedTo: 'u-lena', status: 'open', options: ['Yes, add the custom field', 'No, store it as an object note'] },
  ];
}

// ---------------- Init / reset ----------------

export function reset() {
  state = {
    project: {
      id: 'nvwp-mx-ifs', name: 'Northvale Maximo → IFS Cloud', customer: 'Northvale Water & Power (fictional)', mode: 'delivery',
      sourceSystems: ['IBM Maximo 7.6.1.3'], target: 'IFS Cloud 25R2 · sandbox', industryPack: INDUSTRY_PACK, ontologyVersion: ONTOLOGY_VERSION,
      region: 'Azure · UK South', sharedLearning: false, createdAt: ago(60 * 24 * 21), status: 'In review',
    },
    stages: STAGES.map((s) => ({
      ...s,
      status: s.n <= 6 ? 'done' : s.n === 7 ? 'waiting' : s.n <= 11 ? 'done' : 'locked',
      finishedAt: s.n <= 6 ? ago(60 * 24 * (12 - s.n)) : s.n <= 11 ? ago(60 * 24 * 3) : undefined,
      metric: ({ 2: '17 tables · 1 custom', 3: '2,000+ assets profiled', 4: '3 hidden rules', 5: '52 bindings', 6: '4 config items', 9: 'Run 2', 10: '208 failures', 11: '3 checks failing' } as Record<number, string>)[s.n],
    })),
    mappings: buildMappings(),
    codeRules: seedCodeRules.map((r) => ({ ...r })),
    issues: [],
    fixes: [],
    questions: seedQuestions(),
    runs: [],
    audit: [],
    events: [],
    signoffs: [],
    version: 1,
    running: null,
    ontologyProposals: [
      { id: 'OP-01', change: 'Add synonym "booster station" (local term) to Pumping station', reason: 'Used for 3 Northvale locations; matched with 0.88 confidence', source: 'Project decision M-032', status: 'proposed' },
      { id: 'OP-02', change: 'Add local status pattern "field complete" as close match to Work complete', reason: 'Seen in 2 projects (anonymised)', source: 'Code list decision Q-02', status: 'proposed' },
    ],
  };
  state.issues = buildIssues();
  state.fixes = buildFixes();
  state.runs = seedRuns();
  const lastRun = state.runs.at(-1)!;
  const failingChecks = lastRun.reconciliation!.filter((c) => c.outcome === 'fail').length;
  state.stages.find((s) => s.n === 10)!.metric = `${currentValidation().length} findings`;
  state.stages.find((s) => s.n === 11)!.metric = `${failingChecks} checks failing`;

  // Historical audit trail (synthetic): what happened before the demo starts.
  const hist: [number, string, AuditEntry['actorKind'], string, string?, string?][] = [
    [60 * 24 * 21, 'Maya Okafor', 'user', 'project.create', 'nvwp-mx-ifs', `Pinned ontology ${ONTOLOGY_VERSION}, pack ${INDUSTRY_PACK}`],
    [60 * 24 * 20, 'Maya Okafor', 'user', 'connector.add', 'Maximo 7.6 (read-only, Oracle)', 'Credentials stored in Azure Key Vault'],
    [60 * 24 * 20, 'Maya Okafor', 'user', 'connector.add', 'IFS Cloud sandbox', 'OData metadata + data migration tooling'],
    [60 * 24 * 11, 'harvester', 'agent', 'stage.complete', 'Discover', '17 tables, 412 fields, 1 custom table'],
    [60 * 24 * 10, 'profiler', 'agent', 'stage.complete', 'Profile', 'Profiled 17 tables on statistics and samples'],
    [60 * 24 * 9, 'code-reader', 'agent', 'stage.complete', 'Read custom code', '3 rules found in 41 scripts and classes'],
    [60 * 24 * 8, 'aligner', 'agent', 'stage.complete', 'Align to ontology', '52 bindings proposed'],
    [60 * 24 * 7, 'target-designer', 'agent', 'stage.complete', 'Design target', '4 configuration items proposed'],
    [60 * 24 * 9, 'orchestrator', 'agent', 'load.run', 'RUN-1', 'Dry run through IFS data migration tooling'],
    [60 * 24 * 5, 'Dev Raman', 'user', 'mapping.approve', 'M-007'],
    [60 * 24 * 5, 'Dev Raman', 'user', 'mapping.approve', 'M-033'],
    [60 * 24 * 5, 'Dev Raman', 'user', 'mapping.approve', 'M-052'],
    [60 * 24 * 4, 'Dev Raman', 'user', 'mapping.approve', 'M-061'],
    [60 * 24 * 4, 'Dev Raman', 'user', 'mapping.approve', 'M-080'],
    [60 * 24 * 4, 'Maya Okafor', 'user', 'mapping.not_migrated', 'M-013', 'Financial postings out of scope'],
    [60 * 24 * 4, 'Tom Hughes', 'user', 'question.answer', 'Q-04', 'BR-01 confirmed'],
    [60 * 24 * 3, 'orchestrator', 'agent', 'load.run', 'RUN-2', 'Dry run through IFS data migration tooling'],
  ];
  for (const [m, actor, kind, action, target, detail] of hist) audit(actor, kind, action, target, detail, ago(m));
  touch();
}

reset();

// ---------------- Derived views ----------------

export function dashboard(): Dashboard {
  const ms = state.mappings;
  const decided = ms.filter((m) => m.status !== 'proposed');
  const dq = dqSnapshot();
  const needsYou: Dashboard['needsYou'] = [];
  const named = ms.filter((m) => m.path === 'named' && m.status === 'proposed');
  if (named.length) needsYou.push({ id: 'n-named', title: `${named.length} safety-critical or regulatory items need a named reviewer`, detail: named.map((m) => m.sourceElements[0]).join(', '), href: '/review?path=named', role: 'Data subject expert', severity: 'high' });
  const expert = ms.filter((m) => m.path === 'expert' && m.status === 'proposed');
  if (expert.length) needsYou.push({ id: 'n-expert', title: `${expert.length} low-confidence mappings need expert review`, detail: 'Lowest confidence first', href: '/review?path=expert', role: 'Data subject expert', severity: 'high' });
  const q = state.questions.filter((x) => x.status === 'open');
  if (q.length) needsYou.push({ id: 'n-q', title: `${q.length} business questions are open`, detail: q.map((x) => x.text.split('?')[0]).slice(0, 2).join(' · '), href: '/review?tab=questions', role: 'Customer data owner', severity: 'medium' });
  const fx = state.fixes.filter((f) => f.status === 'proposed');
  if (fx.length) needsYou.push({ id: 'n-fx', title: `${fx.length} data fixes proposed by the Remediation Agent`, detail: `${fx.filter((f) => f.kind === 'merge_duplicate').length} duplicate merges · ${fx.filter((f) => f.kind === 'reparent').length} re-parents · ${fx.filter((f) => f.kind === 'classify').length} classifications`, href: '/quality', role: 'Data subject expert', severity: 'medium' });
  const cr = state.codeRules.filter((r) => r.status === 'proposed');
  if (cr.length) needsYou.push({ id: 'n-cr', title: `${cr.length} hidden business rules to confirm`, detail: cr.map((r) => r.id).join(', '), href: '/discovery?tab=rules', role: 'Migration lead', severity: 'low' });
  const quick = ms.filter((m) => m.path === 'quick' && m.status === 'proposed');
  const sample = ms.filter((m) => m.path === 'auto' && m.sampled && m.status === 'auto_accepted');
  return {
    project: state.project,
    stages: state.stages,
    kpis: {
      sourceElements: ms.length,
      mapped: decided.filter((m) => ['approved', 'changed', 'auto_accepted'].includes(m.status)).length,
      notMigrated: ms.filter((m) => m.status === 'not_migrated').length,
      openQuestions: q.length,
      autoAccepted: ms.filter((m) => m.path === 'auto').length,
      quickReview: ms.filter((m) => m.path === 'quick').length,
      expertReview: ms.filter((m) => m.path === 'expert').length,
      namedReview: ms.filter((m) => m.path === 'named').length,
      pendingReview: ms.filter((m) => m.status === 'proposed' || m.status === 'question').length + sample.length,
      precedentShare: ms.filter((m) => m.precedents.some((p) => p.outcome === 'approved')).length / ms.length,
      dqBefore: dq.overallBefore,
      dqAfter: dq.overallAfter,
      assets: assets.length,
      workOrders: workOrderStats.closed + workOrderStats.open,
      hiddenRules: state.codeRules.length,
      fixesPending: fx.length,
    },
    needsYou: needsYou.concat(quick.length ? [{ id: 'n-quick', title: `${quick.length} mappings ready for quick review`, detail: 'Evidence is strong; approve or change in seconds', href: '/review?path=quick', role: 'Data subject expert', severity: 'low' as const }] : []),
  };
}

export function aiReadyAsset(num?: string) {
  const a = assetByNum(num ?? badMeter.asset) ?? assets[0];
  const c = conceptById.get(a.conceptId!)!;
  const loc = locations.find((l) => l.location === a.location);
  const sys = locations.find((l) => l.location === loc?.parent);
  const site = sites.find((s) => s.id === a.siteid)!;
  const children = assets.filter((x) => x.parent === a.assetnum);
  const contract = ({ NORTH: 'NV10', RIVR: 'NV20', LAKE: 'NV30', HARB: 'NV40', EAST: 'NV50' } as Record<string, string>)[a.siteid];
  const unitOf = (k: string) => c.attributes.find((x) => x.name.toUpperCase().replace(/\s/g, '') === k)?.unit;
  return {
    '@context': { iao: 'https://ontology.artizent.example/iao/2.4/', util: 'https://ontology.artizent.example/iao/2.4/utilities/', ifs: 'urn:ifs:cloud:', schema: 'https://schema.org/' },
    '@id': `ifs:EquipmentSerial/${contract}/${a.assetnum}`,
    '@type': [c.id, c.parent ?? 'core:PhysicalAsset'],
    label: a.description,
    ontologyClass: { id: c.id, label: c.label, definition: c.definition, standard: c.standard, version: ONTOLOGY_VERSION },
    identity: { objectId: a.assetnum, serialNo: a.serialnum, manufacturer: a.manufacturer, model: a.model, installed: a.installDate },
    placement: {
      site: { id: contract, name: site.name },
      functionalPath: [site.name, sys?.description, loc?.description].filter(Boolean),
      parentObject: a.location,
      children: children.map((x) => ({ id: x.assetnum, class: conceptById.get(x.conceptId!)?.label })),
    },
    criticality: { value: ['E', 'D', 'C', 'B', 'A'][a.criticality - 1], scale: 'A (highest) – E', source: 'ASSET.NV_CRITCODE' },
    technicalAttributes: Object.entries(a.specs).map(([k, v]) => ({ name: k, value: v, unit: unitOf(k.replace('RATED', 'RATED')) ?? ({ RATEDFLOW: 'm³/h', RATEDHEAD: 'm', RATEDPOWER: 'kW' } as Record<string, string>)[k] })),
    failureVocabulary: c.failureModes.map((f) => ({ code: f.match(/\((\w+)\)/)?.[1], label: f.replace(/\s*\(\w+\)/, ''), scheme: 'ISO 14224' })),
    allowedParents: c.allowedParents.map((p) => conceptById.get(p)?.label),
    measurements: [{ parameter: 'Runtime hours', concept: 'util:RuntimeHours', cumulative: true, lastValue: badMeter.readings.at(-1)!.value, unit: 'h', lastRead: badMeter.readings.at(-1)!.date }],
    maintenance: { pmActions: [{ id: 'PM-00211', name: 'Quarterly pump inspection', trigger: 'calendar · 3 months' }, { id: 'PM-00212', name: 'Seal replacement', trigger: 'meter · 8,000 h runtime' }] },
    workHistory: { openWorkOrders: 1, closedLast5Years: 23, topFailureModes: [{ code: 'VIB', count: 6 }, { code: 'ELP', count: 4 }, { code: 'OHE', count: 1 }], meanTimeBetweenFailuresDays: 214 },
    provenance: { source: `Maximo 7.6 · ASSET/${a.assetnum}`, mappings: ['M-001', 'M-002', 'M-005', 'M-009', 'M-010', 'M-020', 'M-021', 'M-022'], loadRun: state.runs.at(-1)?.id, transformation: state.runs.at(-1)?.transformationVersion },
  };
}

export const mappingById = (id: string) => state.mappings.find((m) => m.id === id);
export const personById = (id: string) => people.find((p) => p.id === id);
export { people, sites };
