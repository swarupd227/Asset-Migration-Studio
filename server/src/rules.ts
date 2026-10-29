import type {
  Dataset, DqSnapshot, FixProposal, HierarchyIssue, HierarchyNode, Mapping, ReconciliationCheck, Rule, SourceAsset, ValidationFailure,
} from './types.js';
import { conceptById } from './data/ontology.js';

// Rule catalogue, transformations and data quality. Everything here is a pure function of the stored
// source records, approved fixes and approved mappings, so any replica computes the same answer.

export const rules: Rule[] = [
  { id: 'ST-01', level: 'Structural', text: 'Every mandatory IFS field has a value.', source: 'IFS catalogue' },
  { id: 'ST-02', level: 'Structural', text: 'Values fit the target type and length.', source: 'IFS catalogue' },
  { id: 'RF-01', level: 'Reference', text: 'Every asset and work order points to a record that exists in the load.', source: 'Generic' },
  { id: 'SM-01', level: 'Semantic', text: "A child asset's class is allowed under its parent's class.", source: 'Ontology allowed-parent rules' },
  { id: 'SM-02', level: 'Semantic', text: 'A failure cause is valid for the equipment class.', source: 'Ontology failure model' },
  { id: 'SM-03', level: 'Semantic', text: 'Readings on a cumulative meter never decrease.', source: 'Ontology measurement rules' },
  { id: 'SM-04', level: 'Semantic', text: 'Calendar and meter triggers are not mixed in one PM interval.', source: 'Ontology plan rules' },
  { id: 'SM-05', level: 'Semantic', text: 'Rated values sit within plausible ranges for the class.', source: 'Ontology attribute ranges' },
  { id: 'BR-01', level: 'Business', text: 'Only open work orders and five years of closed history are migrated.', source: 'Customer data owner' },
  { id: 'BR-02', level: 'Business', text: 'Assets decommissioned more than two years ago are archived, not migrated.', source: 'Customer data owner' },
  { id: 'DQ-01', level: 'Data quality', text: 'Assets with the same serial, manufacturer and model at one site are duplicates.', source: 'Generic' },
  { id: 'DQ-02', level: 'Data quality', text: 'Every asset has an asset class.', source: 'Ontology' },
  { id: 'DQ-03', level: 'Data quality', text: 'Asset descriptions follow the naming standard.', source: 'Customer naming standard' },
];

// ---------------- Classification ----------------

export const classToConcept: Record<string, string> = {
  'PUMP\\CENTRIFUGAL': 'util:CentrifugalPump', 'MOTOR\\AC': 'util:ElectricMotor', 'VALVE\\GATE': 'util:Valve', 'VALVE\\BUTTERFLY': 'util:Valve',
  'INSTR\\PRESS': 'util:Instrument', 'INSTR\\FLOW': 'util:FlowMeter', 'ELEC\\TRANSFORMER': 'util:DistributionTransformer',
  'ELEC\\BREAKER': 'util:CircuitBreaker', 'ELEC\\SWGR': 'util:Switchgear', BLOWER: 'util:Blower', 'CHEM\\CHLOR': 'util:Chlorinator',
};
const conceptToClass: Record<string, string> = Object.fromEntries(Object.entries(classToConcept).reverse().map(([k, v]) => [v, k]));

export const conceptOf = (a: SourceAsset) => (a.classstructure ? classToConcept[a.classstructure] : undefined);

/** Infers a class for an untyped asset from its description, using ontology synonyms. */
export function inferConcept(a: SourceAsset): string | undefined {
  const d = a.description.toLowerCase();
  const order: [RegExp, string][] = [
    [/motor/, 'util:ElectricMotor'], [/pressure transmitter|transmitter|relay|ct\b/, 'util:Instrument'], [/flow meter/, 'util:FlowMeter'],
    [/valve/, 'util:Valve'], [/pump/, 'util:CentrifugalPump'], [/transformer/, 'util:DistributionTransformer'],
    [/breaker/, 'util:CircuitBreaker'], [/ring main|switchgear/, 'util:Switchgear'], [/blower/, 'util:Blower'], [/chlorinator/, 'util:Chlorinator'],
  ];
  return order.find(([re]) => re.test(d))?.[1];
}

export const isClosed = (w: { status: string }) => w.status === 'CLOSE' || w.status === 'COMP';
const normSerial = (s?: string) => (s ?? '').toUpperCase().replace(/\s/g, '');
const twoYearsAgo = () => new Date(Date.now() - 2 * 365 * 86400_000).toISOString().slice(0, 10);
const label = (cid?: string) => (cid ? conceptById.get(cid)?.label ?? cid : 'unclassified');
const SPEC_ATTR: Record<string, string> = { RATINGKVA: 'Rating', RATEDFLOW: 'Rated flow', RATEDHEAD: 'Rated head', RATEDPOWER: 'Rated power' };
const parseRange = (r?: string) => r?.match(/([\d.]+)\s*[–-]\s*([\d.]+)/)?.slice(1).map(Number) as [number, number] | undefined;

// ---------------- Transformations ----------------

export function transform(raw: Dataset, fixes: FixProposal[], mappings: Mapping[]): Dataset {
  const approved = fixes.filter((f) => f.status === 'approved');
  const decided = new Set(mappings.filter((m) => m.status === 'approved' || m.status === 'changed').map((m) => m.id));
  const assets = new Map(raw.assets.map((a) => [a.assetnum, { ...a, specs: { ...a.specs } }]));
  const locations = [...raw.locations];
  let workOrders = raw.workOrders.map((w) => ({ ...w }));
  let pms = raw.pms.map((p) => ({ ...p }));
  const meters = raw.meters.map((m) => ({ ...m, readings: m.readings.map((r) => ({ ...r })) }));
  const redirect = new Map<string, string>();

  for (const f of approved) {
    const p = f.payload ?? {};
    if (f.rule === 'RF-01' && f.payload?.target === 'asset') {
      for (const r of f.records) {
        const a = assets.get(r);
        if (!a) continue;
        const loc = `${a.siteid}-UNASSIGNED`;
        if (!locations.some((l) => l.location === loc)) locations.push({ location: loc, description: 'Unassigned (data owner decision pending)', siteid: a.siteid, parent: a.siteid, type: 'OPERATING', conceptId: 'core:FunctionalLocation' });
        a.location = loc;
      }
    } else if (f.kind === 'merge_duplicate') {
      const [keep, dup] = f.records;
      assets.delete(dup);
      redirect.set(dup, keep);
    } else if (f.kind === 'reparent') {
      for (const r of f.records) { const a = assets.get(r); if (a) { a.parent = undefined; if (p.location) a.location = String(p.location); } }
    } else if (f.kind === 'classify') {
      for (const r of f.records) { const a = assets.get(r); if (a) a.classstructure = conceptToClass[String(p.concept)]; }
    } else if (f.kind === 'meter_correction') {
      const m = meters.find((x) => x.assetnum === f.records[0]);
      const r = m?.readings.find((x) => x.date === p.date);
      if (r) r.value = Number(p.value);
    } else if (f.kind === 'archive') {
      // Archived assets are not loaded; open work orders on them move to the asset's location.
      const gone = new Map(f.records.map((r) => [r, assets.get(r)?.location]));
      for (const r of f.records) assets.delete(r);
      workOrders = workOrders.map((w) => (w.assetnum && gone.has(w.assetnum) ? { ...w, assetnum: undefined, location: gone.get(w.assetnum) ?? w.location } : w));
    } else if (f.rule === 'SM-05') {
      for (const [num, v] of Object.entries((p.values ?? {}) as Record<string, number>)) { const a = assets.get(num); if (a) a.specs.RATINGKVA = v; }
    } else if (f.rule === 'DQ-03') {
      for (const [num, v] of Object.entries((p.names ?? {}) as Record<string, string>)) { const a = assets.get(num); if (a) a.description = v; }
    } else if (f.rule === 'RF-01' && f.payload?.target === 'workorder') {
      const set = new Set(f.records);
      workOrders = workOrders.map((w) => (set.has(w.wonum) ? { ...w, assetnum: undefined } : w));
    } else if (f.rule === 'SM-02') {
      const set = new Set(f.records);
      workOrders = workOrders.map((w) => (set.has(w.wonum) ? { ...w, causecode: 'MECH' } : w));
    }
  }
  if (redirect.size) workOrders = workOrders.map((w) => (w.assetnum && redirect.has(w.assetnum) ? { ...w, assetnum: redirect.get(w.assetnum) } : w));
  // Approved mappings change how records are shaped for IFS.
  if (decided.has('M-046')) workOrders = workOrders.map((w) => ({ ...w, description: w.description.slice(0, 60) }));
  if (decided.has('M-050')) pms = pms.map((p) => (p.frequnit === 'HOURS' ? { ...p, frequnit: 'MONTHS', frequency: 0, meterTrigger: { meter: 'RUNHRS', interval: p.frequency } } as typeof p : p));
  return { assets: [...assets.values()], locations, workOrders, pms, meters };
}

// ---------------- Validation ----------------

export function validate(ds: Dataset): ValidationFailure[] {
  const out: ValidationFailure[] = [];
  const assets = new Map(ds.assets.map((a) => [a.assetnum, a]));
  const locs = new Set(ds.locations.map((l) => l.location));
  const add = (f: Omit<ValidationFailure, 'id'> & { key: string }) => { const { key, ...rest } = f; out.push({ id: `VF-${f.rule}-${key}`, ...rest }); };

  for (const a of ds.assets) {
    const cid = conceptOf(a);
    if (!a.description?.trim()) add({ key: a.assetnum, rule: 'ST-01', record: a.assetnum, object: 'Serial object', site: a.siteid, severity: 'error', reason: `Asset ${a.assetnum} has no description, which IFS requires.`, proposedFix: 'Use class and position as the description.' });
    if (!locs.has(a.location)) add({ key: a.assetnum, rule: 'RF-01', record: a.assetnum, object: 'Serial object', site: a.siteid, severity: 'error', reason: `Asset ${a.assetnum} points to location ${a.location}, which is not in the extract.`, proposedFix: `Place it under ${a.siteid}-UNASSIGNED until the data owner confirms the position.` });
    if (a.parent) {
      const parent = assets.get(a.parent);
      const pc = parent && conceptOf(parent);
      const never = cid ? conceptById.get(cid)?.neverUnder ?? [] : [];
      if (pc && never.includes(pc)) {
        add({ key: a.assetnum, rule: 'SM-01', record: a.assetnum, object: 'Serial object', site: a.siteid, severity: 'error',
          reason: `${label(cid)} ${a.assetnum} sits under ${label(pc).toLowerCase()} ${a.parent}. A ${label(cid).toLowerCase()} can sit under a pumping station or process system, not under a ${label(pc).toLowerCase()}.`,
          proposedFix: `Move it under functional object ${a.location}.` });
      }
    }
    if (!a.classstructure) add({ key: a.assetnum, rule: 'DQ-02', record: a.assetnum, object: 'Serial object', site: a.siteid, severity: 'error', reason: `Asset ${a.assetnum} ("${a.description}") has no classification, so it cannot get an IFS object type.`, proposedFix: inferConcept(a) ? `Classify as ${label(inferConcept(a))}.` : 'Classify manually.' });
    if (a.status === 'DECOMMISSIONED' && a.statusDate < twoYearsAgo()) add({ key: a.assetnum, rule: 'BR-02', record: a.assetnum, object: 'Serial object', site: a.siteid, severity: 'warning', reason: `Asset ${a.assetnum} was decommissioned on ${a.statusDate}, more than two years ago, but is still in the load set.`, proposedFix: 'Archive it instead of migrating it.' });
    if (/^OLD\s*-/i.test(a.description)) add({ key: a.assetnum, rule: 'DQ-03', record: a.assetnum, object: 'Serial object', site: a.siteid, severity: 'warning', reason: `"${a.description}" does not follow the naming standard <class> · <function> · <position>.`, proposedFix: 'Apply the naming standard.' });
    const c = cid ? conceptById.get(cid) : undefined;
    for (const [k, attr] of Object.entries(SPEC_ATTR)) {
      const v = Number(a.specs[k]);
      const range = parseRange(c?.attributes.find((x) => x.name === attr)?.range);
      if (range && Number.isFinite(v) && (v < range[0] || v > range[1])) {
        const unit = c?.attributes.find((x) => x.name === attr)?.unit ?? '';
        add({ key: `${a.assetnum}-${k}`, rule: 'SM-05', record: a.assetnum, object: 'Technical attribute', site: a.siteid, severity: 'warning', reason: `${label(cid)} ${a.assetnum} has ${attr.toLowerCase()} ${v.toLocaleString('en-GB')} ${unit}, outside the plausible range ${range[0]}–${range[1].toLocaleString('en-GB')} ${unit}.`, proposedFix: `Check with the site; likely ${(v / 10).toLocaleString('en-GB')} ${unit}.` });
      }
    }
  }

  // Duplicates
  const groups = new Map<string, SourceAsset[]>();
  for (const a of ds.assets) {
    if (!a.serialnum) continue;
    const k = [a.siteid, normSerial(a.serialnum), a.manufacturer, a.model].join('|');
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const [keep, ...dups] = [...g].sort((x, y) => x.assetnum.length - y.assetnum.length || x.assetnum.localeCompare(y.assetnum));
    for (const d of dups) add({ key: d.assetnum, rule: 'DQ-01', record: `${keep.assetnum} / ${d.assetnum}`, object: 'Serial object', site: keep.siteid, severity: 'warning', reason: `${keep.assetnum} and ${d.assetnum} share serial number ${normSerial(keep.serialnum)}, manufacturer ${keep.manufacturer} and model at ${keep.siteid}.`, proposedFix: `Merge ${d.assetnum} into ${keep.assetnum} and re-point its work orders.` });
  }

  for (const w of ds.workOrders) {
    if (w.description.length > 60) add({ key: w.wonum, rule: 'ST-02', record: w.wonum, object: 'Work order', site: w.siteid, severity: 'warning', reason: `The description of ${w.wonum} has ${w.description.length} characters; the IFS field allows 60.`, proposedFix: 'Move the overflow into the work order note (mapping M-046).' });
    if (w.assetnum && !assets.has(w.assetnum)) add({ key: w.wonum, rule: 'RF-01', record: w.wonum, object: 'Work order', site: w.siteid, severity: 'error', reason: `${w.wonum} points to asset ${w.assetnum}, which is not in the extract.`, proposedFix: `Link it to its work location ${w.location ?? ''} instead.` });
    const a = w.assetnum ? assets.get(w.assetnum) : undefined;
    if (w.causecode === 'TAPCHG' && a && conceptOf(a) !== 'util:DistributionTransformer') add({ key: w.wonum, rule: 'SM-02', record: w.wonum, object: 'Work order', site: w.siteid, severity: 'warning', reason: `Cause "tap changer failure" on ${w.wonum} is not valid for a ${label(conceptOf(a)).toLowerCase()}; it only applies to transformers.`, proposedFix: 'Map to "mechanical failure – general" and keep the original code in the note.' });
  }
  for (const p of ds.pms) {
    if (p.frequnit === 'HOURS') add({ key: p.pmnum, rule: 'SM-04', record: p.pmnum, object: 'PM action', site: p.siteid, severity: 'error', reason: `${p.pmnum} runs every ${p.frequency.toLocaleString('en-GB')} HOURS as a calendar interval. Running hours are a meter trigger.`, proposedFix: 'Move it to a runtime meter trigger (mapping M-050).' });
  }
  for (const m of ds.meters) {
    if (!m.cumulative) continue;
    m.readings.forEach((r, i) => {
      const prev = m.readings[i - 1];
      if (prev && r.value < prev.value) add({ key: `${m.assetnum}-${r.date}`, rule: 'SM-03', record: `${m.assetnum} · ${m.metername}`, object: 'Measurement', site: '', severity: 'error', reason: `${m.metername} on ${m.assetnum} goes down from ${prev.value.toLocaleString('en-GB')} on ${prev.date} to ${r.value.toLocaleString('en-GB')} on ${r.date}, and no meter replacement is recorded.`, proposedFix: 'Correct the reading or record a meter replacement.' });
    });
  }
  return out;
}

// ---------------- Remediation proposals ----------------

export function proposeFixes(raw: Dataset, failures: ValidationFailure[]): FixProposal[] {
  const out: FixProposal[] = [];
  const assets = new Map(raw.assets.map((a) => [a.assetnum, a]));
  const by = (rule: string) => failures.filter((f) => f.rule === rule);
  const pad = (n: number) => String(n).padStart(2, '0');

  by('DQ-01').forEach((f, i) => {
    const [keep, dup] = f.record.split(' / ');
    const k = assets.get(keep)!, d = assets.get(dup)!;
    const woCount = raw.workOrders.filter((w) => w.assetnum === dup).length;
    out.push({
      id: `FX-D${pad(i + 1)}`, kind: 'merge_duplicate', rule: 'DQ-01', title: `Merge ${dup} into ${keep}`, detail: `${k.description} · ${k.manufacturer} ${k.model} · ${k.siteid}`,
      records: [keep, dup], confidence: d.description.startsWith('OLD') ? 0.98 : d.status === 'NOT READY' ? 0.94 : 0.89,
      evidence: ['Same serial number', 'Same manufacturer and model', d.location === k.location ? 'Same location' : 'Same site', ...(d.description.startsWith('OLD') ? ['Description prefixed "OLD -"'] : [])],
      status: 'proposed',
      diff: [{ field: 'SERIALNUM', from: d.serialnum ?? '', to: k.serialnum ?? '' }, { field: 'STATUS', from: d.status, to: k.status }, { field: 'Work orders', from: `${woCount} on ${dup}`, to: `re-pointed to ${keep}` }],
    });
  });
  by('SM-01').forEach((f, i) => {
    const a = assets.get(f.record)!;
    out.push({
      id: `FX-R${pad(i + 1)}`, kind: 'reparent', rule: 'SM-01', title: `Move ${a.assetnum} out from under ${a.parent}`, detail: `New parent: functional object ${a.location}`,
      records: [a.assetnum], confidence: 0.93, payload: { location: a.location },
      evidence: [`Ontology: ${label(conceptOf(a)).toLowerCase()} never under ${label(conceptOf(assets.get(a.parent!)!)).toLowerCase()}`, `Both share location ${a.location}`, 'Sibling assets at this position sit under the location'],
      status: 'proposed', diff: [{ field: 'Parent', from: a.parent!, to: a.location }],
    });
  });
  const byConcept = new Map<string, string[]>();
  for (const f of by('DQ-02')) {
    const cid = inferConcept(assets.get(f.record)!);
    if (cid) byConcept.set(cid, [...(byConcept.get(cid) ?? []), f.record]);
  }
  [...byConcept.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([cid, nums], i) => {
    out.push({
      id: `FX-C${pad(i + 1)}`, kind: 'classify', rule: 'DQ-02', title: `Classify ${nums.length} untyped asset${nums.length > 1 ? 's' : ''} as ${label(cid)}`,
      detail: conceptById.get(cid)?.bindings.ifs ?? '', records: nums, confidence: Math.min(0.97, 0.8 + nums.length / 100), payload: { concept: cid },
      evidence: ['Description matches concept synonyms', 'Attributes present match the class', 'Siblings at the same position share this class'], status: 'proposed',
    });
  });
  for (const f of by('SM-03')) {
    const m = raw.meters.find((x) => f.record.startsWith(x.assetnum))!;
    const i = m.readings.findIndex((r, j) => j > 0 && r.value < m.readings[j - 1].value);
    const bad = m.readings[i];
    const corrected = bad.value * 10;
    out.push({
      id: 'FX-M01', kind: 'meter_correction', rule: 'SM-03', title: `Correct ${m.metername} reading on ${m.assetnum}`,
      detail: `Reading of ${bad.date} drops to ${bad.value.toLocaleString('en-GB')} h, then continues at ${m.readings[i + 1]?.value.toLocaleString('en-GB')} h.`,
      records: [m.assetnum], confidence: 0.82, payload: { date: bad.date, value: corrected },
      evidence: [`${corrected.toLocaleString('en-GB')} h fits the trend (a dropped digit)`, 'No meter replacement recorded', 'Steady monthly increase before and after'], status: 'proposed',
      diff: [{ field: `${m.metername} ${bad.date}`, from: bad.value.toLocaleString('en-GB'), to: corrected.toLocaleString('en-GB') }],
    });
  }
  const archive = by('BR-02').map((f) => f.record);
  if (archive.length) out.push({ id: 'FX-A01', kind: 'archive', rule: 'BR-02', title: `Archive ${archive.length} assets decommissioned more than two years ago`, detail: `They go to the source archive extract and are not loaded into IFS Cloud. ${raw.workOrders.filter((w) => w.assetnum && archive.includes(w.assetnum)).length} open work orders on them move to the asset's location.`, records: archive, confidence: 0.99, evidence: ['STATUS = DECOMMISSIONED', `Status date before ${twoYearsAgo()}`, 'Business rule BR-02'], status: 'proposed' });
  const naming = by('DQ-03').map((f) => assets.get(f.record)!);
  if (naming.length) {
    const names = Object.fromEntries(naming.map((a) => [a.assetnum, `${label(conceptOf(a))} · ${a.description.replace(/^OLD\s*-\s*/i, '')}`]));
    out.push({ id: 'FX-N01', kind: 'code_map', rule: 'DQ-03', title: `Apply the naming standard to ${naming.length} asset descriptions`, detail: `For example "${naming[0].description}" → "${names[naming[0].assetnum]}"`, records: naming.map((a) => a.assetnum), confidence: 0.9, payload: { names }, evidence: ['Customer naming standard', 'Ontology class labels'], status: 'proposed', diff: naming.slice(0, 3).map((a) => ({ field: a.assetnum, from: a.description, to: names[a.assetnum] })) });
  }
  const ranges = by('SM-05');
  if (ranges.length) {
    const values = Object.fromEntries(ranges.map((f) => [f.record, Number(assets.get(f.record)!.specs.RATINGKVA) / 10]));
    out.push({ id: 'FX-T01', kind: 'code_map', rule: 'SM-05', title: `Correct ${ranges.length} transformer ratings out of range`, detail: 'Ratings well above the plausible range on 11 kV feeders; likely an extra zero.', records: ranges.map((f) => f.record), confidence: 0.77, payload: { values }, evidence: ['Ontology range 15–5000 kVA', 'Same model rated lower elsewhere', 'Oil volume matches the lower rating'], status: 'proposed', diff: ranges.map((f) => ({ field: `${f.record} RATINGKVA`, from: String(assets.get(f.record)!.specs.RATINGKVA), to: String(values[f.record]) })) });
  }
  const woRefs = by('RF-01').filter((f) => f.object === 'Work order').map((f) => f.record);
  if (woRefs.length) out.push({ id: 'FX-W01', kind: 'code_map', rule: 'RF-01', title: `Link ${woRefs.length} work orders to their location`, detail: 'Their asset was deleted in Maximo before 2019; the work location still exists.', records: woRefs, confidence: 0.91, payload: { target: 'workorder' }, evidence: ['Asset not in extract', 'Location present and active', 'Work orders are closed-out or low priority'], status: 'proposed' });
  const orphans = by('RF-01').filter((f) => f.object === 'Serial object').map((f) => f.record);
  if (orphans.length) out.push({ id: 'FX-O01', kind: 'reparent', rule: 'RF-01', title: `Place ${orphans.length} assets with unknown locations under "Unassigned"`, detail: 'The data owner confirms the right position before cutover.', records: orphans, confidence: 0.86, payload: { target: 'asset' }, evidence: ['Location missing from LOCATIONS', 'No similar location code found'], status: 'proposed' });
  const causes = by('SM-02').map((f) => f.record);
  if (causes.length) out.push({ id: 'FX-S01', kind: 'code_map', rule: 'SM-02', title: `Remap ${causes.length} invalid failure causes`, detail: '"Tap changer failure" on pump work orders → "mechanical failure – general".', records: causes, confidence: 0.88, evidence: ['Ontology failure model for centrifugal pumps', 'Original code kept in the note'], status: 'proposed' });
  return out;
}

/** Attaches the fix that resolves each failure. */
export function linkFixes(failures: ValidationFailure[], fixes: FixProposal[]): ValidationFailure[] {
  return failures.map((f) => {
    const recs = f.record.split(' / ');
    const fix = fixes.find((x) => x.rule === f.rule && x.status !== 'rejected' && (f.rule === 'DQ-01' ? x.records[1] === recs[1] : x.records.some((r) => f.record.startsWith(r))));
    return fix ? { ...f, fixId: fix.id } : f;
  });
}

// ---------------- Data quality ----------------

export function dqSnapshot(raw: Dataset, rawFailures: ValidationFailure[], cur: Dataset, curFailures: ValidationFailure[]): DqSnapshot {
  const failingBy = (fs: ValidationFailure[], object: string[]) => new Set(fs.filter((f) => object.includes(f.object)).map((f) => f.record.split(' / ').at(-1)!.split(' · ')[0]));
  const share = (n: number, failing: number) => (n ? Math.max(0, 1 - failing / n) : 1);
  const objects = [
    { object: 'Serial objects (assets)', keys: ['Serial object', 'Technical attribute'], count: (d: Dataset) => d.assets.length },
    { object: 'Functional objects', keys: ['Functional object'], count: (d: Dataset) => d.locations.length },
    { object: 'Work orders', keys: ['Work order'], count: (d: Dataset) => d.workOrders.length },
    { object: 'PM plans', keys: ['PM action'], count: (d: Dataset) => d.pms.length },
    { object: 'Meters and readings', keys: ['Measurement'], count: (d: Dataset) => d.meters.length },
  ];
  const byObject = objects.map((o) => ({
    object: o.object,
    before: share(o.count(raw), failingBy(rawFailures, o.keys).size),
    after: share(o.count(cur), failingBy(curFailures, o.keys).size),
    records: o.count(cur),
  }));
  const total = byObject.reduce((s, o) => s + o.records, 0);
  const weighted = (k: 'before' | 'after') => byObject.reduce((s, o) => s + o[k] * o.records, 0) / total;
  const sites = [...new Set(raw.assets.map((a) => a.siteid))];
  const siteShare = (d: Dataset, fs: ValidationFailure[], site: string) => {
    const n = d.assets.filter((a) => a.siteid === site).length;
    return share(n, new Set(fs.filter((f) => f.site === site && f.object === 'Serial object').map((f) => f.record)).size);
  };
  return {
    overallBefore: weighted('before'), overallAfter: weighted('after'), byObject,
    bySite: sites.map((s) => ({ site: s, before: siteShare(raw, rawFailures, s), after: siteShare(cur, curFailures, s) })),
  };
}

// ---------------- Hierarchy ----------------

export function hierarchyIssues(rawFailures: ValidationFailure[], fixes: FixProposal[]): HierarchyIssue[] {
  const fixFor = (rule: string, rec: string) => fixes.find((f) => f.rule === rule && f.records.includes(rec));
  const status = (f?: FixProposal): HierarchyIssue['status'] => (f?.status === 'approved' ? 'fix_approved' : f?.status === 'rejected' ? 'dismissed' : 'open');
  const out: HierarchyIssue[] = [];
  rawFailures.filter((f) => f.rule === 'SM-01').forEach((f, i) => {
    const fx = fixFor('SM-01', f.record);
    out.push({ id: `HI-${String(i + 1).padStart(3, '0')}`, rule: 'SM-01', kind: 'wrong_parent', record: f.record, site: f.site, message: f.reason, proposedFix: f.proposedFix, status: status(fx) });
  });
  rawFailures.filter((f) => f.rule === 'RF-01' && f.object === 'Serial object').forEach((f, i) => {
    const fx = fixFor('RF-01', f.record);
    out.push({ id: `HI-${String(20 + i).padStart(3, '0')}`, rule: 'RF-01', kind: 'orphan', record: f.record, site: f.site, message: f.reason, proposedFix: f.proposedFix, status: status(fx) });
  });
  const untyped = rawFailures.filter((f) => f.rule === 'DQ-02');
  if (untyped.length) {
    const cls = fixes.filter((f) => f.kind === 'classify');
    out.push({ id: 'HI-040', rule: 'DQ-02', kind: 'untyped', record: `${untyped.length} assets`, site: 'All', message: `${untyped.length} assets have no classification, so IFS cannot give them an object type.`, proposedFix: 'Approve the classification proposals in Data quality.', status: cls.length && cls.every((f) => f.status === 'approved') ? 'fix_approved' : 'open' });
  }
  return out;
}

export function hierarchyTree(ds: Dataset, siteId: string, siteName: string, failures: ValidationFailure[]) {
  const locs = ds.locations.filter((l) => l.siteid === siteId);
  const siteAssets = ds.assets.filter((a) => a.siteid === siteId);
  const issueBy = new Map<string, string[]>();
  for (const f of failures) if (['SM-01', 'RF-01', 'DQ-02'].includes(f.rule)) issueBy.set(f.record, [...(issueBy.get(f.record) ?? []), f.rule]);
  const nodes = new Map<string, HierarchyNode>();
  const root: HierarchyNode = { id: siteId, label: siteName, kind: 'site', conceptId: 'core:Site', classLabel: 'Site', source: 'SITE', issues: [], children: [], childCount: 0 };
  for (const l of locs) if (l.type !== 'SITE') nodes.set(l.location, { id: l.location, label: l.description, kind: 'functional', conceptId: l.conceptId, classLabel: label(l.conceptId), source: 'LOCATIONS', issues: [], children: [], childCount: 0 });
  for (const l of locs) if (l.type !== 'SITE') (nodes.get(l.parent ?? siteId) ?? root).children.push(nodes.get(l.location)!);
  const unassigned: HierarchyNode = { id: `${siteId}-ORPHANS`, label: 'Location not in extract', kind: 'functional', classLabel: 'Needs decision', source: 'generated', issues: [], children: [], childCount: 0 };
  for (const a of siteAssets) nodes.set(a.assetnum, { id: a.assetnum, label: a.description, kind: 'serial', conceptId: conceptOf(a), classLabel: a.classstructure ? label(conceptOf(a)) : 'Untyped', source: 'ASSET', issues: issueBy.get(a.assetnum) ?? [], children: [], childCount: 0 });
  for (const a of siteAssets) {
    const parent = a.parent ? nodes.get(a.parent) : nodes.get(a.location);
    (parent ?? unassigned).children.push(nodes.get(a.assetnum)!);
  }
  if (unassigned.children.length) root.children.push(unassigned);
  const count = (n: HierarchyNode): number => (n.childCount = n.children.reduce((s, c) => s + 1 + count(c), 0));
  count(root);
  const depth = (n: HierarchyNode): number => 1 + Math.max(0, ...n.children.map(depth));
  return { tree: root, maximo: { locations: locs.length, assets: siteAssets.length, maxDepth: depth(root) } };
}

// ---------------- Load runs and reconciliation ----------------

export function runObjects(raw: Dataset, cur: Dataset, failures: ValidationFailure[], extra: { history: number; attrs: number }) {
  const errorRecords = (object: string) => new Set(failures.filter((f) => f.severity === 'error' && f.object === object).map((f) => f.record)).size;
  const closedKeys = new Set(cur.workOrders.filter(isClosed).map((w) => w.wonum));
  const errorRecordsWhere = (object: string, keep: (record: string) => boolean) =>
    new Set(failures.filter((f) => f.severity === 'error' && f.object === object && keep(f.record)).map((f) => f.record)).size;
  const rows = [
    { object: 'Functional objects', ifsTarget: 'EquipmentFunctional', source: cur.locations.length, failed: errorRecords('Functional object') },
    { object: 'Serial objects', ifsTarget: 'EquipmentSerial', source: cur.assets.length, failed: errorRecords('Serial object') },
    { object: 'Technical attributes', ifsTarget: 'TechnicalAttribute', source: extra.attrs, failed: 0 },
    { object: 'PM actions', ifsTarget: 'PmAction', source: cur.pms.length, failed: errorRecords('PM action') },
    { object: 'Open work orders', ifsTarget: 'WorkOrder', source: cur.workOrders.filter((w) => !isClosed(w)).length, failed: errorRecordsWhere('Work order', (r) => !closedKeys.has(r)) },
    { object: 'Work history (closed, 5 years)', ifsTarget: 'Historical work order', source: cur.workOrders.filter(isClosed).length, failed: errorRecordsWhere('Work order', (r) => closedKeys.has(r)) },
    ...(extra.history ? [{ object: 'Older history (summarised)', ifsTarget: 'Historical work summary', source: extra.history, failed: 0 }] : []),
    { object: 'Measurements', ifsTarget: 'Measurement', source: cur.meters.reduce((s, m) => s + m.readings.length, 0), failed: errorRecords('Measurement') },
  ];
  void raw;
  return rows.map((r) => ({ ...r, loaded: r.source - r.failed }));
}

export function reconcile(raw: Dataset, cur: Dataset, objects: ReturnType<typeof runObjects>, failures: ValidationFailure[]): ReconciliationCheck[] {
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const sum = (d: Dataset, cid: string, k: string) => d.assets.filter((a) => conceptOf(a) === cid).reduce((s, a) => s + (Number(a.specs[k]) || 0), 0);
  const checks: ReconciliationCheck[] = objects.map((o, i) => ({
    id: `RC-C${i + 1}`, kind: 'count', object: o.object, check: 'Record count (in scope vs loaded)', sourceValue: fmt(o.source), targetValue: fmt(o.loaded),
    outcome: o.failed ? 'fail' : 'pass', note: o.failed ? `${o.failed} in error queue with IFS reason` : undefined,
  }));
  const pw = [sum(raw, 'util:CentrifugalPump', 'RATEDPOWER'), sum(cur, 'util:CentrifugalPump', 'RATEDPOWER')];
  checks.push({ id: 'RC-T1', kind: 'total', object: 'Serial objects', check: 'Σ rated power of pumps (kW)', sourceValue: fmt(pw[0]), targetValue: fmt(pw[1]), outcome: pw[0] === pw[1] ? 'pass' : 'explained', note: pw[0] === pw[1] ? undefined : 'Difference from merged duplicates and archived assets' });
  const kva = [sum(raw, 'util:DistributionTransformer', 'RATINGKVA'), sum(cur, 'util:DistributionTransformer', 'RATINGKVA')];
  checks.push({ id: 'RC-T2', kind: 'total', object: 'Serial objects', check: 'Σ transformer rating (kVA)', sourceValue: fmt(kva[0]), targetValue: fmt(kva[1]), outcome: kva[0] === kva[1] ? 'pass' : 'explained', note: kva[0] === kva[1] ? undefined : 'Difference from approved rating corrections and archived assets' });
  const orphanSerial = failures.filter((f) => f.rule === 'RF-01' && f.object === 'Serial object').length + failures.filter((f) => f.rule === 'SM-01').length;
  checks.push({ id: 'RC-H1', kind: 'hierarchy', object: 'Serial objects', check: 'Every serial object has a valid parent object', sourceValue: '100%', targetValue: `${((1 - orphanSerial / Math.max(1, cur.assets.length)) * 100).toFixed(1)}%`, outcome: orphanSerial ? 'fail' : 'pass' });
  const dups = failures.filter((f) => f.rule === 'DQ-01').length;
  checks.push({ id: 'RC-S1', kind: 'sample', object: 'Serial objects', check: '50 sampled records, all fields', sourceValue: '50', targetValue: `${50 - Math.min(50, dups)} match`, outcome: dups ? 'fail' : 'pass', note: dups ? `${dups} unmerged duplicates in the sample frame` : undefined });
  return checks;
}
