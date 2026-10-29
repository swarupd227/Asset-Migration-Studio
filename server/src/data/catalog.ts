import type { Alternative, CatalogueTable, CodeRule, Evidence, Mapping, MappingKind, Precedent, ReviewPath } from '../types.js';
import { conceptById } from './ontology.js';
import { assets, locations, untypedAssets, workOrderStats, sampleOpenWorkOrders, rng } from './seed.js';

// ---------------- Source catalogue (Metadata Harvester + Profiler) ----------------

const pct = (n: number, d: number) => Math.round((n / d) * 1000) / 10;
const A = assets.length;
const sampleAsset = (i: number) => assets[(i * 131) % assets.length];

const classCounts = (() => {
  const m = new Map<string, number>();
  for (const a of assets) m.set(a.classstructure ?? '(null)', (m.get(a.classstructure ?? '(null)') ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, n]) => ({ value, pct: pct(n, A) }));
})();

export const catalogue: CatalogueTable[] = [
  {
    name: 'ASSET', description: 'Physical assets', rows: A, custom: false, inScope: true, ifsTarget: 'EquipmentSerial',
    fields: [
      { name: 'ASSETNUM', type: 'UPPER', length: 12, description: 'Asset identifier', nullRate: 0, distinct: A, topValues: [], pattern: 'AA-99999[A]', custom: false },
      { name: 'DESCRIPTION', type: 'ALN', length: 100, description: 'Asset description', nullRate: 0.4, distinct: A - 31, topValues: [], custom: false },
      { name: 'SERIALNUM', type: 'ALN', length: 64, description: 'Serial number', nullRate: 0, distinct: A - 18, topValues: [], pattern: 'AA99-99999 (98.1%)', custom: false, touchedByRule: 'CR-02' },
      { name: 'SITEID', type: 'UPPER', length: 8, description: 'Site', nullRate: 0, distinct: 5, topValues: [{ value: 'HARB', pct: 24.1 }, { value: 'EAST', pct: 21.3 }, { value: 'NORTH', pct: 20.9 }, { value: 'RIVR', pct: 18.2 }, { value: 'LAKE', pct: 15.5 }], custom: false },
      { name: 'LOCATION', type: 'UPPER', length: 12, description: 'Location', nullRate: 0, distinct: 1104, topValues: [], custom: false, brokenRefs: 4 },
      { name: 'PARENT', type: 'UPPER', length: 12, description: 'Parent asset', nullRate: pct(assets.filter((a) => !a.parent).length, A), distinct: 712, topValues: [], custom: false },
      { name: 'CLASSSTRUCTUREID', type: 'UPPER', length: 20, description: 'Classification', nullRate: pct(untypedAssets.length, A), distinct: 12, topValues: classCounts, custom: false },
      { name: 'MANUFACTURER', type: 'UPPER', length: 12, description: 'Manufacturer company', nullRate: 1.2, distinct: 21, topValues: [{ value: 'ABB', pct: 18.7 }, { value: 'SIEMENS', pct: 14.2 }, { value: 'SCHNEIDER', pct: 11.0 }], custom: false },
      { name: 'STATUS', type: 'UPPER', length: 20, description: 'Status', nullRate: 0, distinct: 3, topValues: [{ value: 'OPERATING', pct: 96.6 }, { value: 'DECOMMISSIONED', pct: 2.3 }, { value: 'NOT READY', pct: 1.1 }], custom: false },
      { name: 'INSTALLDATE', type: 'DATE', description: 'Installation date', nullRate: 3.8, distinct: 1640, topValues: [], custom: false },
      { name: 'PRIORITY', type: 'INTEGER', description: 'Asset priority', nullRate: 71.4, distinct: 4, topValues: [{ value: '(null)', pct: 71.4 }, { value: '3', pct: 15.1 }], custom: false },
      { name: 'ASSETTYPE', type: 'UPPER', length: 16, description: 'Asset type', nullRate: 54.0, distinct: 6, topValues: [{ value: '(null)', pct: 54 }, { value: 'FACILITIES', pct: 22.5 }, { value: 'PRODUCTION', pct: 18.1 }], custom: false },
      { name: 'NV_CRITCODE', type: 'INTEGER', description: 'Northvale criticality (1–5)', nullRate: 0.6, distinct: 5, topValues: [{ value: '3', pct: 22.8 }, { value: '4', pct: 20.4 }, { value: '5', pct: 19.9 }], custom: true, touchedByRule: 'CR-01' },
      { name: 'NV_LEGACYID', type: 'ALN', length: 30, description: 'Legacy GIS / CMMS id', nullRate: 38.2, distinct: 1302, topValues: [], pattern: 'NVW/99999 · GIS-AAA-9999', custom: true },
      { name: 'TOTALCOST', type: 'AMOUNT', description: 'Total cost to date', nullRate: 0, distinct: 1880, topValues: [], custom: false },
      { name: 'CHANGEBY', type: 'UPPER', length: 30, description: 'Changed by', nullRate: 0, distinct: 61, topValues: [], custom: false },
    ],
  },
  {
    name: 'LOCATIONS', description: 'Locations (operating, system, position)', rows: locations.length, custom: false, inScope: true, ifsTarget: 'EquipmentFunctional',
    fields: [
      { name: 'LOCATION', type: 'UPPER', length: 12, description: 'Location', nullRate: 0, distinct: locations.length, topValues: [], custom: false },
      { name: 'DESCRIPTION', type: 'ALN', length: 100, description: 'Description', nullRate: 0, distinct: locations.length, topValues: [], custom: false },
      { name: 'TYPE', type: 'UPPER', length: 16, description: 'Location type', nullRate: 0, distinct: 4, topValues: [{ value: 'POSITION', pct: 88.2 }, { value: 'OPERATING', pct: 8.1 }, { value: 'SYSTEM', pct: 3.3 }], custom: false },
      { name: 'NV_ZONE', type: 'UPPER', length: 10, description: 'Pressure zone', nullRate: 41.0, distinct: 14, topValues: [{ value: 'PZ-03', pct: 12.0 }], custom: true },
    ],
  },
  {
    name: 'LOCHIERARCHY', description: 'Location hierarchy (systems)', rows: locations.length - 5, custom: false, inScope: true, ifsTarget: 'EquipmentFunctional.SupMchCode',
    fields: [
      { name: 'LOCATION', type: 'UPPER', length: 12, description: 'Location', nullRate: 0, distinct: locations.length - 5, topValues: [], custom: false },
      { name: 'PARENT', type: 'UPPER', length: 12, description: 'Parent location', nullRate: 0, distinct: 190, topValues: [], custom: false, brokenRefs: 1 },
      { name: 'SYSTEMID', type: 'UPPER', length: 8, description: 'System', nullRate: 0, distinct: 2, topValues: [{ value: 'PRIMARY', pct: 100 }], custom: false },
    ],
  },
  {
    name: 'WORKORDER', description: 'Work orders', rows: workOrderStats.closed + workOrderStats.open, custom: false, inScope: true, ifsTarget: 'WorkOrder (to be confirmed)',
    fields: [
      { name: 'WONUM', type: 'UPPER', length: 10, description: 'Work order', nullRate: 0, distinct: 15420, topValues: [], custom: false },
      { name: 'STATUS', type: 'UPPER', length: 16, description: 'Status', nullRate: 0, distinct: 10, topValues: [{ value: 'CLOSE', pct: 82.9 }, { value: 'COMP', pct: 14.3 }, { value: 'APPR', pct: 0.8 }, { value: 'NV-HOLD', pct: 0.25 }], custom: false },
      { name: 'WOPRIORITY', type: 'INTEGER', description: 'Priority', nullRate: 2.1, distinct: 4, topValues: [{ value: '3', pct: 41.0 }, { value: '1', pct: 27.2 }, { value: '2', pct: 24.4 }], custom: false, touchedByRule: 'CR-01' },
      { name: 'WORKTYPE', type: 'UPPER', length: 5, description: 'Work type', nullRate: 0.3, distinct: 5, topValues: [{ value: 'PM', pct: 58.0 }, { value: 'CM', pct: 33.1 }, { value: 'EM', pct: 6.2 }], custom: false },
      { name: 'ASSETNUM', type: 'UPPER', length: 12, description: 'Asset', nullRate: 4.4, distinct: 1810, topValues: [], custom: false, brokenRefs: 22 },
      { name: 'REPORTDATE', type: 'DATETIME', description: 'Reported date', nullRate: 0, distinct: 15100, topValues: [], custom: false },
      { name: 'NV_REGFLAG', type: 'YORN', description: 'Regulatory reportable', nullRate: 0, distinct: 2, topValues: [{ value: '0', pct: 97.3 }, { value: '1', pct: 2.7 }], custom: true, touchedByRule: 'CR-03' },
    ],
  },
  { name: 'PM', description: 'Preventive maintenance', rows: workOrderStats.pmPlans, custom: false, inScope: true, ifsTarget: 'PmAction', fields: [
    { name: 'PMNUM', type: 'UPPER', length: 8, description: 'PM', nullRate: 0, distinct: 300, topValues: [], custom: false },
    { name: 'FREQUENCY', type: 'INTEGER', description: 'Frequency', nullRate: 6.3, distinct: 14, topValues: [{ value: '1', pct: 31 }, { value: '6', pct: 22 }], custom: false },
    { name: 'FREQUNIT', type: 'UPPER', length: 8, description: 'Frequency units', nullRate: 6.3, distinct: 5, topValues: [{ value: 'MONTHS', pct: 61 }, { value: 'WEEKS', pct: 21 }, { value: 'HOURS', pct: 4 }], custom: false },
    { name: 'JPNUM', type: 'UPPER', length: 10, description: 'Job plan', nullRate: 8.0, distinct: 160, topValues: [], custom: false },
  ] },
  { name: 'JOBPLAN', description: 'Job plans', rows: 180, custom: false, inScope: true, ifsTarget: 'StandardJob', fields: [] },
  { name: 'ASSETMETER', description: 'Asset meters', rows: workOrderStats.meters, custom: false, inScope: true, ifsTarget: 'Measurement parameter', fields: [] },
  { name: 'MEASUREMENT', description: 'Meter readings', rows: workOrderStats.readings, custom: false, inScope: true, ifsTarget: 'Measurement value', fields: [] },
  { name: 'FAILURECODE', description: 'Failure codes', rows: workOrderStats.failureCodes, custom: false, inScope: true, ifsTarget: 'Discovery / cause codes', fields: [] },
  { name: 'CLASSSTRUCTURE', description: 'Classifications', rows: 64, custom: false, inScope: true, ifsTarget: 'Object type + technical class', fields: [] },
  { name: 'ASSETSPEC', description: 'Asset specification attributes', rows: 9810, custom: false, inScope: true, ifsTarget: 'Technical attributes', fields: [] },
  { name: 'SPAREPART', description: 'Spare parts', rows: workOrderStats.spareParts, custom: false, inScope: true, ifsTarget: 'Object spare part', fields: [] },
  { name: 'CRAFT', description: 'Crafts', rows: workOrderStats.crafts, custom: false, inScope: true, ifsTarget: 'Competence', fields: [] },
  { name: 'DOCLINKS', description: 'Attached documents', rows: workOrderStats.documents, custom: false, inScope: true, ifsTarget: 'Document connection', fields: [] },
  {
    name: 'NV_INSPECTLOG', description: 'Custom table · field inspection log', rows: 9214, custom: true, inScope: true,
    fields: [
      { name: 'INSPID', type: 'BIGINT', description: 'Inspection id', nullRate: 0, distinct: 9214, topValues: [], custom: true },
      { name: 'ASSETNUM', type: 'UPPER', length: 12, description: 'Asset', nullRate: 0.2, distinct: 1644, topValues: [], custom: true },
      { name: 'CONDSCORE', type: 'INTEGER', description: 'Condition score 1–5', nullRate: 4.1, distinct: 5, topValues: [], custom: true },
    ],
  },
  { name: 'GLCOMPONENTS', description: 'GL components', rows: 1210, custom: false, inScope: false, fields: [] },
  { name: 'MATUSETRANS', description: 'Material use transactions', rows: 66400, custom: false, inScope: false, fields: [] },
];

// ---------------- Hidden business rules (Code Reader via Astra RE Harness) ----------------

export const codeRules: CodeRule[] = [
  {
    id: 'CR-01', sourceFile: 'autoscript/NV_WOPRIORITY.py', language: 'Jython · Maximo automation script', launchPoint: 'Object launch point · WORKORDER · Save (add, update)',
    ruleText: 'Work order priority is derived from the asset criticality: critical assets (NV_CRITCODE 4–5) get priority 1 for corrective and emergency work, criticality 3 gets priority 2, and everything else keeps the entered priority, defaulting to 3.',
    fieldsTouched: ['WORKORDER.WOPRIORITY', 'ASSET.NV_CRITCODE', 'WORKORDER.WORKTYPE'], confidence: 0.94,
    impact: '27% of work order priorities were set by this script, not by a person. IFS Cloud needs an equivalent rule, or the derived values must be migrated as data and the rule rebuilt as configuration.',
    highlight: [9, 17], status: 'proposed',
    snippet: `# NV_WOPRIORITY - set priority from asset criticality
# Launch point: WORKORDER, on save
from psdi.mbo import MboConstants

asset = mbo.getMboSet("ASSET").getMbo(0)
if asset is None:
    return

crit = asset.getInt("NV_CRITCODE")
wtype = mbo.getString("WORKTYPE")

if crit >= 4 and wtype in ("CM", "EM"):
    mbo.setValue("WOPRIORITY", 1, MboConstants.NOACCESSCHECK)
elif crit == 3:
    mbo.setValue("WOPRIORITY", 2, MboConstants.NOACCESSCHECK)
elif mbo.isNull("WOPRIORITY"):
    mbo.setValue("WOPRIORITY", 3, MboConstants.NOACCESSCHECK)

# legacy: emergency on chlorinators is always reportable
if asset.getString("CLASSSTRUCTUREID") == "CHEM\\\\CHLOR" and wtype == "EM":
    mbo.setValue("NV_REGFLAG", True)`,
  },
  {
    id: 'CR-02', sourceFile: 'java/com/northvale/app/asset/FldAssetSerial.java', language: 'Java · field class', launchPoint: 'ASSET.SERIALNUM · field validation',
    ruleText: 'Serial numbers are converted to upper case and spaces and dashes after the second character are removed before save.',
    fieldsTouched: ['ASSET.SERIALNUM'], confidence: 0.88,
    impact: 'Duplicate detection must apply the same normalisation, otherwise 6 duplicate pairs created before 2017 are missed.',
    highlight: [6, 9], status: 'proposed',
    snippet: `public class FldAssetSerial extends MboValueAdapter {
  public FldAssetSerial(MboValue mbv) { super(mbv); }

  @Override
  public void validate() throws MXException, RemoteException {
    String s = getMboValue().getString();
    if (s == null) return;
    String norm = s.toUpperCase().replaceAll("\\\\s", "");
    getMboValue().setValue(norm, MboConstants.NOVALIDATION);
    super.validate();
  }
}`,
  },
  {
    id: 'CR-03', sourceFile: 'escalation/NVREGESC', language: 'Maximo escalation', launchPoint: 'Escalation · every 4 hours · WORKORDER',
    ruleText: 'Open work orders on chlorinators that are more than 24 hours past their target start are flagged as regulatory reportable.',
    fieldsTouched: ['WORKORDER.NV_REGFLAG', 'WORKORDER.TARGSTARTDATE'], confidence: 0.91,
    impact: 'NV_REGFLAG is a regulatory field. It needs a named reviewer, and the escalation must be rebuilt in IFS Cloud before cutover.',
    highlight: [2, 4], status: 'proposed',
    snippet: `ESCALATION NVREGESC  OBJECT WORKORDER  SCHEDULE 4h
CONDITION  status in ('APPR','INPRG','WSCH')
           and assetnum in (select assetnum from asset where classstructureid = 'CHEM\\\\CHLOR')
           and targstartdate < sysdate - 1
ACTION     SETVALUE NV_REGFLAG = 1
NOTIFY     NV_REG_TEAM`,
  },
];

// ---------------- Mappings (Concept Aligner, Target Designer, Code List Agent) ----------------

const PROJECTS = ['Water utility · UK · 2025', 'Electric distribution · Nordics · 2025', 'Water & wastewater · Australia · 2024', 'Multi-utility · Canada · 2026', 'Power generation · US · 2025', 'Water utility · Netherlands · 2026'];
const pr = rng(4242);

function precedents(signature: string, approved: number, extra?: Partial<Precedent>[]): Precedent[] {
  const out: Precedent[] = [];
  for (let i = 0; i < Math.min(approved, 4); i++) {
    out.push({ id: `PR-${signature.length * 7 + i}`, signature, project: PROJECTS[(i + signature.length) % PROJECTS.length], outcome: 'approved', count: 1 + Math.floor(pr() * 3), note: 'Approved without change' });
  }
  if (extra) for (const e of extra) out.push({ id: `PR-x${out.length}`, signature, project: PROJECTS[out.length % PROJECTS.length], outcome: 'approved', count: 1, note: '', ...e });
  return out;
}

function pathFor(conf: number, safety: boolean, regulatory: boolean): ReviewPath {
  if (safety || regulatory) return 'named';
  if (conf >= 0.95) return 'auto';
  if (conf >= 0.75) return 'quick';
  return 'expert';
}

interface Def {
  id: string; object: string; src: string[]; concept: string; target: string; kind: MappingKind; rule: string; conf: number;
  risk?: Mapping['risk']; safety?: boolean; regulatory?: boolean; custom?: boolean; agent?: string; targetNote?: string;
  evidence?: Evidence[]; prec?: number; precExtra?: Partial<Precedent>[]; alts?: Alternative[]; samples?: { source: string; target: string }[];
  status?: Mapping['status']; patternKey?: string; reviewer?: string; sampled?: boolean;
}

const ev = (type: Evidence['type'], content: string, source: string, weight: number): Evidence => ({ type, content, source, weight });

function genericEvidence(d: Def): Evidence[] {
  const c = conceptById.get(d.concept);
  const field = d.src[0];
  const out: Evidence[] = [
    ev('metadata', `${field} is described in MAXATTRIBUTE as "${catalogue.find((t) => t.name === d.object)?.fields.find((f) => `${d.object}.${f.name}` === field)?.description ?? (field.split('.')[1] ?? field).toLowerCase()}".`, 'Metadata Harvester', 0.3),
  ];
  if (c) out.push(ev('ontology', `Concept "${c.label}" binds to ${c.bindings.maximo ?? 'this object'} in Maximo and to ${c.bindings.ifs ?? d.target} in IFS Cloud.`, `Ontology Service · get_vendor_binding · ${c.id}`, 0.35));
  if (d.prec) out.push(ev('precedent', `The same binding was approved in ${d.prec} earlier project${d.prec > 1 ? 's' : ''}.`, 'Mapping memory · get_precedents', 0.25));
  return out;
}

const s = sampleAsset;

const defs: Def[] = [
  // ---- ASSET ----
  { id: 'M-001', object: 'ASSET', src: ['ASSET.ASSETNUM'], concept: 'core:PhysicalAsset', target: 'EquipmentSerial.MchCode', kind: 'one_to_one', rule: 'Copy as is. Object id is unique within site.', conf: 0.98, prec: 6, samples: [0, 1, 2].map((i) => ({ source: s(i).assetnum, target: s(i).assetnum })) },
  {
    id: 'M-002', object: 'ASSET', src: ['ASSET.SERIALNUM'], concept: 'core:SerialNumber', target: 'EquipmentSerial.SerialNo', kind: 'one_to_one', rule: 'Upper case, remove spaces (same normalisation as FldAssetSerial). Trim to 50 characters.', conf: 0.97, prec: 4,
    evidence: [
      ev('metadata', 'The Maximo field ASSET.SERIALNUM is described as "Serial number" and is a 64-character text field.', 'Metadata Harvester · MAXATTRIBUTE', 0.25),
      ev('profile', '98.1% of values match the serial number pattern of a known manufacturer. 0% null. 18 values are repeated, all on suspected duplicate assets.', 'Profiler', 0.25),
      ev('ontology', 'The concept "serial number" belongs to a physical asset, not to a location.', 'Ontology Service · get_concept · core:SerialNumber', 0.2),
      ev('code', 'Java field class FldAssetSerial normalises the value on save (CR-02). The rule is reproduced in the transformation.', 'Code Reader · Astra RE Harness', 0.1),
      ev('precedent', 'The same binding was approved in 4 earlier projects.', 'Mapping memory', 0.2),
    ],
    samples: [3, 4, 5].map((i) => ({ source: s(i).serialnum!.toLowerCase().replace('-', ' - '), target: s(i).serialnum!.replace('-', '') })),
  },
  { id: 'M-003', object: 'ASSET', src: ['ASSET.DESCRIPTION'], concept: 'core:PhysicalAsset', target: 'EquipmentSerial.MchName', kind: 'one_to_one', rule: 'Copy. Remove the prefix "OLD - " when the asset is merged.', conf: 0.96, prec: 6, samples: [6, 7].map((i) => ({ source: s(i).description, target: s(i).description })) },
  { id: 'M-004', object: 'ASSET', src: ['ASSET.SITEID'], concept: 'core:Site', target: 'EquipmentSerial.Contract', kind: 'lookup', rule: 'Lookup site → IFS site (contract): NORTH→NV10, RIVR→NV20, LAKE→NV30, HARB→NV40, EAST→NV50.', conf: 0.93, prec: 5, targetNote: 'IFS Cloud stores the site as "Contract"', samples: [{ source: 'RIVR', target: 'NV20' }, { source: 'HARB', target: 'NV40' }] },
  {
    id: 'M-005', object: 'ASSET', src: ['ASSET.PARENT', 'ASSET.LOCATION'], concept: 'core:PhysicalAsset', target: 'EquipmentSerial.SupMchCode', kind: 'many_to_one', risk: 'high',
    rule: 'Parent object = parent asset when it exists and is allowed by the ontology, otherwise the functional object built from LOCATION. Rejects parents that break allowed-parent rules (SM-01).', conf: 0.81, prec: 3, agent: 'Hierarchy Agent',
    evidence: [
      ev('metadata', 'Maximo keeps two hierarchies: LOCATIONS/LOCHIERARCHY for places and ASSET.PARENT for equipment. IFS Cloud has one structure of functional and serial objects.', 'Metadata Harvester', 0.25),
      ev('ontology', 'Allowed parents of a centrifugal pump are a pumping station or a process system. Never a valve, meter or instrument.', 'Ontology Service · get_constraints · util:CentrifugalPump', 0.3),
      ev('profile', '7 pumps have a valve as parent asset, and 4 assets point to a location that does not exist.', 'Profiler', 0.1),
      ev('precedent', 'Approved in 3 earlier Maximo projects, changed in 1 to prefer location over parent asset.', 'Mapping memory', 0.16),
    ],
    precExtra: [{ outcome: 'changed', note: 'Reviewer preferred location over parent asset for instruments' }],
    alts: [{ concept: 'core:FunctionalLocation', target: 'EquipmentSerial.SupMchCode = LOCATION only', confidence: 0.62, whyNot: 'Loses motor-under-pump structure used by 1,140 child assets.' }],
    samples: [{ source: 'PARENT=PU-10012 · LOCATION=NORTH-PS01-P01', target: 'PU-10012' }, { source: 'PARENT=(null) · LOCATION=RIVR-PS02-P04', target: 'RIVR-PS02-P04' }],
  },
  { id: 'M-006', object: 'ASSET', src: ['ASSET.MANUFACTURER'], concept: 'core:PhysicalAsset', target: 'EquipmentSerial.ManufacturerNo', kind: 'lookup', rule: 'Lookup Maximo company → IFS manufacturer id. 3 companies need creating.', conf: 0.9, prec: 4, patternKey: 'company-lookup', samples: [{ source: 'ABB', target: 'ABB' }, { source: 'E+H', target: 'ENDRESS' }] },
  { id: 'M-007', object: 'ASSET', src: ['ASSET.INSTALLDATE'], concept: 'core:PhysicalAsset', target: 'EquipmentSerial.InstallationDate', kind: 'one_to_one', rule: 'Convert to date (drop time). 3.8% null stays null.', conf: 0.92, prec: 5, status: 'approved', reviewer: 'Dev Raman' },
  { id: 'M-008', object: 'ASSET', src: ['ASSET.STATUS'], concept: 'core:PhysicalAsset', target: 'EquipmentSerial.OperationalStatus', kind: 'lookup', rule: 'OPERATING→In operation, NOT READY→Planned for operation, DECOMMISSIONED→Scrapped (and BR-02 archive rule).', conf: 0.86, prec: 3, patternKey: 'status-lookup' },
  {
    id: 'M-009', object: 'ASSET', src: ['ASSET.CLASSSTRUCTUREID'], concept: 'core:AssetClass', target: 'EquipmentSerial.MchType + TechnicalClass', kind: 'one_to_many', rule: 'Lookup classification → ontology class → IFS object type and technical class. 64 untyped assets go to the Remediation Agent.', conf: 0.88, prec: 4,
    evidence: [
      ev('metadata', 'CLASSSTRUCTURE holds 12 classes in use, such as PUMP\\CENTRIFUGAL and ELEC\\TRANSFORMER.', 'Metadata Harvester', 0.25),
      ev('ontology', 'Every class in use resolves to a utilities pack concept (find_concept top match ≥ 0.91).', 'Ontology Service · find_concept', 0.35),
      ev('profile', `${untypedAssets.length} assets (${pct(untypedAssets.length, A)}%) have no classification.`, 'Profiler', 0.08),
      ev('precedent', 'The same lookup pattern was approved in 4 earlier projects.', 'Mapping memory', 0.2),
    ],
    samples: [{ source: 'PUMP\\CENTRIFUGAL', target: 'PUMP-CENT · util:CentrifugalPump' }, { source: 'ELEC\\TRANSFORMER', target: 'TRANSFORMER · util:DistributionTransformer' }],
  },
  {
    id: 'M-010', object: 'ASSET', src: ['ASSET.NV_CRITCODE'], concept: 'core:AssetCriticality', target: 'EquipmentSerial.Criticality', kind: 'lookup', custom: true, risk: 'high', agent: 'Concept Aligner',
    rule: 'Lookup 1–5 → IFS criticality A–E (5→A). Feeds the priority rule CR-01.', conf: 0.71, prec: 1,
    evidence: [
      ev('metadata', 'Custom field (NV_ prefix), described as "Northvale criticality (1–5)". Not in standard Maximo.', 'Metadata Harvester', 0.2),
      ev('profile', 'Five values, 0.6% null, distribution skewed to 3–5 which is typical for a criticality rank.', 'Profiler', 0.15),
      ev('code', 'Automation script NV_WOPRIORITY reads it to derive work order priority (CR-01).', 'Code Reader', 0.2),
      ev('ontology', 'Closest concept is "Asset criticality" (find_concept score 0.83). The standard ASSET.PRIORITY is a competing candidate.', 'Ontology Service · find_concept', 0.12),
    ],
    alts: [{ concept: 'core:WorkPriority', target: 'WorkOrder.PriorityId', confidence: 0.22, whyNot: 'It describes the asset, not the work.' }],
    samples: [{ source: '5', target: 'A' }, { source: '3', target: 'C' }],
  },
  {
    id: 'M-011', object: 'ASSET', src: ['ASSET.PRIORITY'], concept: 'core:AssetCriticality', target: 'Not migrated', kind: 'constant', agent: 'Concept Aligner',
    rule: 'Propose "not migrated": 71% null and superseded by NV_CRITCODE.', conf: 0.58, prec: 0,
    evidence: [
      ev('profile', '71.4% null. Where filled, it agrees with NV_CRITCODE in only 48% of assets.', 'Profiler', 0.2),
      ev('ontology', 'Same concept as NV_CRITCODE. Two sources for one concept need a decision.', 'Ontology Service', 0.2),
    ],
    alts: [{ concept: 'core:AssetCriticality', target: 'EquipmentSerial.Criticality (when NV_CRITCODE null)', confidence: 0.41, whyNot: 'Values disagree with NV_CRITCODE half of the time.' }],
  },
  { id: 'M-012', object: 'ASSET', src: ['ASSET.NV_LEGACYID'], concept: 'core:PhysicalAsset', target: 'EquipmentSerial.C_LEGACY_ID (new custom field)', kind: 'one_to_one', custom: true, agent: 'Target Designer', rule: 'Copy to a new custom field. Needs IFS configuration approval.', conf: 0.66, prec: 1, targetNote: 'Requires IFS configuration: custom field C_LEGACY_ID', alts: [{ concept: 'core:Document', target: 'Object note', confidence: 0.3, whyNot: 'Not searchable.' }] },
  { id: 'M-013', object: 'ASSET', src: ['ASSET.TOTALCOST'], concept: 'core:PhysicalAsset', target: 'Not migrated', kind: 'constant', rule: 'Financial postings are out of scope for the first release.', conf: 0.97, prec: 5, status: 'not_migrated', reviewer: 'Maya Okafor' },
  { id: 'M-014', object: 'ASSET', src: ['ASSET.CHANGEBY', 'ASSET.CHANGEDATE'], concept: 'core:PhysicalAsset', target: 'Not migrated', kind: 'constant', rule: 'Audit fields stay in the source archive; IFS sets its own.', conf: 0.96, prec: 6, status: 'auto_accepted' },
  { id: 'M-015', object: 'ASSET', src: ['ASSET.ASSETTYPE'], concept: 'core:AssetClass', target: 'EquipmentSerial.GroupId', kind: 'lookup', rule: 'Lookup FACILITIES/PRODUCTION → IFS object group.', conf: 0.64, prec: 0, alts: [{ concept: 'core:AssetClass', target: 'Not migrated', confidence: 0.33, whyNot: '54% null, no business use found.' }] },
  // ---- ASSETSPEC (technical attributes) ----
  { id: 'M-020', object: 'ASSETSPEC', src: ['ASSETSPEC.RATEDFLOW'], concept: 'util:CentrifugalPump', target: 'TechnicalAttribute RATED_FLOW (m³/h)', kind: 'one_to_one', rule: 'Numeric attribute, unit m³/h (UCUM m3/h). Range check 5–5000.', conf: 0.91, prec: 4, patternKey: 'assetspec-numeric', samples: [{ source: '420', target: '420 m3/h' }] },
  { id: 'M-021', object: 'ASSETSPEC', src: ['ASSETSPEC.RATEDHEAD'], concept: 'util:CentrifugalPump', target: 'TechnicalAttribute RATED_HEAD (m)', kind: 'one_to_one', rule: 'Numeric attribute, unit m. Range check 5–250.', conf: 0.9, prec: 4, patternKey: 'assetspec-numeric' },
  { id: 'M-022', object: 'ASSETSPEC', src: ['ASSETSPEC.RATEDPOWER'], concept: 'util:CentrifugalPump', target: 'TechnicalAttribute RATED_POWER (kW)', kind: 'one_to_one', rule: 'Numeric attribute, unit kW.', conf: 0.89, prec: 4, patternKey: 'assetspec-numeric' },
  { id: 'M-023', object: 'ASSETSPEC', src: ['ASSETSPEC.SEALTYPE'], concept: 'util:CentrifugalPump', target: 'TechnicalAttribute SEAL_TYPE', kind: 'lookup', rule: 'Alphanumeric attribute, values Mechanical / Packed gland.', conf: 0.83, prec: 3, patternKey: 'assetspec-numeric' },
  { id: 'M-024', object: 'ASSETSPEC', src: ['ASSETSPEC.RATINGKVA'], concept: 'util:DistributionTransformer', target: 'TechnicalAttribute RATING (kVA)', kind: 'one_to_one', rule: 'Numeric, unit kVA. SM-05 range 15–5000 kVA.', conf: 0.87, prec: 3, patternKey: 'assetspec-numeric' },
  { id: 'M-025', object: 'ASSETSPEC', src: ['ASSETSPEC.DOSERATE'], concept: 'util:Chlorinator', target: 'TechnicalAttribute DOSE_RATE (kg/day)', kind: 'one_to_one', regulatory: true, rule: 'Numeric, unit kg/day. Drinking water compliance attribute.', conf: 0.93, prec: 2 },
  { id: 'M-026', object: 'ASSETSPEC', src: ['ASSETSPEC.BREAKKA'], concept: 'util:CircuitBreaker', target: 'TechnicalAttribute BREAKING_CAPACITY (kA)', kind: 'one_to_one', safety: true, rule: 'Numeric, unit kA. Protection settings depend on it.', conf: 0.96, prec: 3 },
  { id: 'M-027', object: 'ASSETSPEC', src: ['ASSETSPEC.VOLTAGE'], concept: 'util:ElectricMotor', target: 'TechnicalAttribute VOLTAGE (V)', kind: 'one_to_one', rule: 'Numeric, unit V.', conf: 0.95, prec: 4, patternKey: 'assetspec-numeric', status: 'auto_accepted' },
  // ---- LOCATIONS ----
  { id: 'M-030', object: 'LOCATIONS', src: ['LOCATIONS.LOCATION'], concept: 'core:FunctionalLocation', target: 'EquipmentFunctional.MchCode', kind: 'one_to_one', rule: 'Copy as is.', conf: 0.97, prec: 6 },
  { id: 'M-031', object: 'LOCATIONS', src: ['LOCATIONS.DESCRIPTION'], concept: 'core:FunctionalLocation', target: 'EquipmentFunctional.MchName', kind: 'one_to_one', rule: 'Copy as is.', conf: 0.96, prec: 6 },
  {
    id: 'M-032', object: 'LOCATIONS', src: ['LOCATIONS.TYPE'], concept: 'core:FunctionalLocation', target: 'EquipmentFunctional.ObjLevel + MchType', kind: 'derived', agent: 'Hierarchy Agent',
    rule: 'SITE → site root; SYSTEM → process system; OPERATING → pumping station or substation bay (by site kind); POSITION → functional position.', conf: 0.74, prec: 2,
    evidence: [
      ev('profile', '4 location types in use. OPERATING is used for both pumping stations and substation bays.', 'Profiler', 0.2),
      ev('ontology', 'Two different L1 concepts (util:PumpingStation, util:Substation) share one Maximo type; the site kind decides.', 'Ontology Service · find_concept', 0.25),
      ev('precedent', 'Approved in 2 projects with a site-kind rule.', 'Mapping memory', 0.2),
    ],
  },
  { id: 'M-033', object: 'LOCHIERARCHY', src: ['LOCHIERARCHY.PARENT'], concept: 'core:FunctionalLocation', target: 'EquipmentFunctional.SupMchCode', kind: 'one_to_one', rule: 'Primary system only. 1 broken reference goes to the issue list.', conf: 0.9, prec: 5, status: 'approved', reviewer: 'Dev Raman' },
  { id: 'M-034', object: 'LOCATIONS', src: ['LOCATIONS.NV_ZONE'], concept: 'util:PumpingStation', target: 'TechnicalAttribute PRESSURE_ZONE', kind: 'one_to_one', custom: true, rule: 'New technical attribute on pumping station class.', conf: 0.69, prec: 0 },
  // ---- WORKORDER ----
  { id: 'M-040', object: 'WORKORDER', src: ['WORKORDER.WONUM'], concept: 'core:WorkOrder', target: 'WorkOrder.WoNo', kind: 'derived', rule: 'IFS generates the number; WONUM kept as external reference.', conf: 0.95, prec: 5, status: 'auto_accepted', sampled: true },
  {
    id: 'M-041', object: 'WORKORDER', src: ['WORKORDER.STATUS'], concept: 'core:WorkOrder', target: 'WorkOrder.ObjState', kind: 'lookup', agent: 'Code List Agent',
    rule: 'Status code list (see Ontology → code lists). 3 local codes have no match and are sent to a person.', conf: 0.82, prec: 5,
    evidence: [
      ev('ontology', 'Code list "work order status" holds exact matches for WAPPR, APPR, INPRG, COMP, CLOSE, CAN and a close match for WSCH.', 'Ontology Service · get_vendor_binding', 0.35),
      ev('profile', 'Three local codes NV-HOLD (38), FLDCOMP (27) and PEND-REG (15) are not in the Maximo standard domain.', 'Profiler', 0.1),
      ev('precedent', 'The vendor status → ontology status equivalence was approved in 5 projects.', 'Mapping memory', 0.25),
    ],
    samples: [{ source: 'WAPPR', target: 'Prepared' }, { source: 'INPRG', target: 'Work started' }, { source: 'NV-HOLD', target: '? (open question)' }],
  },
  {
    id: 'M-042', object: 'WORKORDER', src: ['WORKORDER.WOPRIORITY'], concept: 'core:WorkPriority', target: 'WorkOrder.PriorityId', kind: 'lookup', risk: 'high', agent: 'Concept Aligner',
    rule: 'Migrate stored values 1–4 → IFS priority. Rebuild CR-01 as IFS configuration for new work.', conf: 0.73, prec: 3,
    evidence: [
      ev('metadata', 'Standard Maximo field "Priority", integer.', 'Metadata Harvester', 0.2),
      ev('code', 'NV_WOPRIORITY sets this field from NV_CRITCODE and WORKTYPE on every save (CR-01). 27% of values are derived.', 'Code Reader · Astra RE Harness', 0.15),
      ev('precedent', 'Approved in 3 projects, but none had a derivation script.', 'Mapping memory', 0.15),
      ev('ontology', 'Work priority is a property of the work order, not of the asset.', 'Ontology Service', 0.2),
    ],
    alts: [{ concept: 'core:WorkPriority', target: 'Derive in IFS from criticality at load time', confidence: 0.44, whyNot: 'Would overwrite priorities a planner changed by hand after save.' }],
  },
  { id: 'M-043', object: 'WORKORDER', src: ['WORKORDER.WORKTYPE'], concept: 'core:WorkOrder', target: 'WorkOrder.WorkTypeId', kind: 'lookup', rule: 'PM→PM, CM→CORR, EM→EMERG, CP→CAP, IN→INSP.', conf: 0.88, prec: 4, patternKey: 'status-lookup' },
  { id: 'M-044', object: 'WORKORDER', src: ['WORKORDER.ASSETNUM'], concept: 'core:PhysicalAsset', target: 'WorkOrder.MchCode', kind: 'lookup', rule: 'Resolve to migrated object id; merged duplicates resolve to the kept asset. 22 broken references raise RF-01.', conf: 0.94, prec: 6 },
  { id: 'M-045', object: 'WORKORDER', src: ['WORKORDER.REPORTDATE'], concept: 'core:WorkOrder', target: 'WorkOrder.RegDate', kind: 'one_to_one', rule: 'Convert timezone to site time.', conf: 0.95, prec: 5, status: 'auto_accepted' },
  { id: 'M-046', object: 'WORKORDER', src: ['WORKORDER.DESCRIPTION', 'WORKORDER.LONGDESCRIPTION'], concept: 'core:WorkOrder', target: 'WorkOrder.ErrDescr + note', kind: 'split', rule: 'Short description to ErrDescr (60), long description to note. Text treated as data only.', conf: 0.85, prec: 4 },
  { id: 'M-047', object: 'WORKORDER', src: ['WORKORDER.NV_REGFLAG'], concept: 'core:WorkOrder', target: 'WorkOrder.C_REG_REPORTABLE (new custom field)', kind: 'one_to_one', custom: true, regulatory: true, rule: 'Copy flag. Escalation NVREGESC (CR-03) must be rebuilt in IFS.', conf: 0.77, prec: 1 },
  { id: 'M-048', object: 'WORKORDER', src: ['WORKORDER.*'], concept: 'core:WorkOrder', target: 'Historical work summary', kind: 'merge', risk: 'high', rule: 'Closed work orders older than five years are summarised per asset and year (BR-01). Open work orders migrate in full.', conf: 0.8, prec: 3 },
  // ---- PM / JOBPLAN ----
  {
    id: 'M-050', object: 'PM', src: ['PM.FREQUENCY', 'PM.FREQUNIT'], concept: 'core:MaintenancePlan', target: 'PmAction.Interval + IntervalUnit', kind: 'split', agent: 'Concept Aligner',
    rule: 'Calendar units to calendar interval; HOURS moves to a meter trigger on runtime hours (SM-04 forbids mixing).', conf: 0.79, prec: 3,
    evidence: [
      ev('profile', '4% of PMs use FREQUNIT = HOURS, which is a meter trigger in disguise.', 'Profiler', 0.2),
      ev('ontology', 'Plan rules: calendar and meter triggers are not mixed in one interval field (SM-04).', 'Ontology Service · get_constraints', 0.3),
      ev('precedent', 'Approved in 3 projects.', 'Mapping memory', 0.2),
    ],
  },
  { id: 'M-051', object: 'PM', src: ['PM.JPNUM'], concept: 'core:Task', target: 'PmAction.StdJobId', kind: 'lookup', rule: 'Resolve to migrated standard job.', conf: 0.86, prec: 4 },
  { id: 'M-052', object: 'JOBPLAN', src: ['JOBPLAN.JPNUM'], concept: 'core:Task', target: 'StandardJob.StdJobId', kind: 'one_to_one', rule: 'Copy as is.', conf: 0.92, prec: 5, status: 'approved', reviewer: 'Dev Raman' },
  // ---- METERS ----
  { id: 'M-060', object: 'ASSETMETER', src: ['ASSETMETER.METERNAME'], concept: 'util:RuntimeHours', target: 'Measurement parameter RUNTIME (accumulated)', kind: 'lookup', rule: 'RUNHRS → accumulated runtime parameter. SM-03 checks monotonic readings.', conf: 0.88, prec: 4 },
  { id: 'M-061', object: 'MEASUREMENT', src: ['MEASUREMENT.MEASUREMENTVALUE', 'MEASUREMENT.MEASUREDATE'], concept: 'core:MeasurementPoint', target: 'Measurement values', kind: 'one_to_one', rule: 'Last 24 months of readings.', conf: 0.9, prec: 4, status: 'approved', reviewer: 'Dev Raman' },
  // ---- FAILURE CODES ----
  { id: 'M-070', object: 'FAILURECODE', src: ['FAILURECODE (PROBLEM)'], concept: 'core:FailureMode', target: 'Discovery code', kind: 'lookup', rule: 'Map local problem codes to ISO 14224 failure modes via the utilities pack.', conf: 0.8, prec: 3, samples: [{ source: 'LEAK', target: 'ELP · External leakage' }, { source: 'NOISY', target: 'VIB · Vibration' }] },
  { id: 'M-071', object: 'FAILURECODE', src: ['FAILURECODE (CAUSE)'], concept: 'core:FailureCause', target: 'Cause code', kind: 'lookup', rule: 'Map to ontology failure causes; SM-02 validates cause vs mode and class.', conf: 0.78, prec: 2 },
  { id: 'M-072', object: 'FAILURELIST', src: ['FAILURELIST.PARENT'], concept: 'core:FailureMode', target: 'Failure model per object type', kind: 'derived', rule: 'Rebuild failure hierarchies per IFS object type from ontology valid failure modes.', conf: 0.72, prec: 1 },
  // ---- OTHER ----
  { id: 'M-080', object: 'CRAFT', src: ['CRAFT.CRAFT'], concept: 'core:Resource', target: 'Competence', kind: 'lookup', rule: 'Lookup 24 crafts to IFS competences; ELEC-HV is safety critical.', conf: 0.84, prec: 3, status: 'approved', reviewer: 'Dev Raman' },
  { id: 'M-081', object: 'SPAREPART', src: ['SPAREPART.ITEMNUM'], concept: 'core:SparePart', target: 'Object spare part', kind: 'lookup', rule: 'Resolve to IFS inventory part. RF-02 checks existence.', conf: 0.89, prec: 4 },
  { id: 'M-082', object: 'DOCLINKS', src: ['DOCLINKS.URLNAME'], concept: 'core:Document', target: 'Document connection', kind: 'one_to_one', rule: 'Upload files through IFS document API; keep folder structure.', conf: 0.81, prec: 2 },
  { id: 'M-083', object: 'NV_INSPECTLOG', src: ['NV_INSPECTLOG.CONDSCORE'], concept: 'core:MeasurementPoint', target: 'Measurement parameter CONDITION', kind: 'derived', custom: true, rule: 'Custom table → condition score measurements on the asset.', conf: 0.68, prec: 1 },
  { id: 'M-084', object: '(constant)', src: ['(constant)'], concept: 'core:Site', target: 'EquipmentSerial.Company', kind: 'constant', rule: 'Constant "NVWP".', conf: 0.99, prec: 6, status: 'auto_accepted' },
];

export function buildMappings(): Mapping[] {
  return defs.map((d) => {
    const path = pathFor(d.conf, !!d.safety, !!d.regulatory);
    const c = conceptById.get(d.concept);
    let status: Mapping['status'] = d.status ?? (path === 'auto' ? 'auto_accepted' : 'proposed');
    if (d.id === 'M-041') status = 'question';
    return {
      id: d.id,
      object: d.object,
      sourceElements: d.src,
      conceptId: d.concept,
      conceptLabel: c?.label ?? d.concept,
      target: d.target,
      targetNote: d.targetNote,
      kind: d.kind,
      rule: d.rule,
      confidence: d.conf,
      risk: d.risk ?? (d.safety || d.regulatory ? 'high' : d.conf < 0.75 ? 'medium' : 'low'),
      safetyCritical: !!d.safety,
      regulatory: !!d.regulatory,
      path,
      status,
      sampled: d.sampled ?? (path === 'auto' && d.id.endsWith('1')),
      evidence: d.evidence ?? genericEvidence(d),
      precedents: precedents(d.src[0], d.prec ?? 0, d.precExtra),
      alternatives: d.alts ?? [],
      samples: d.samples ?? [],
      agent: d.agent ?? 'Concept Aligner',
      custom: d.custom,
      version: 1,
      reviewer: d.reviewer,
      patternKey: d.patternKey,
    } satisfies Mapping;
  });
}

export { sampleOpenWorkOrders };
