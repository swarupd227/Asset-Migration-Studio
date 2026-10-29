import type { CodeListEntry, Concept } from '../types.js';

// A small slice of the Industrial Asset Ontology (utilities pack) used by the concept demo.
// IFS Cloud bindings are based on public material and are marked "to be confirmed with IFS".

export const ONTOLOGY_VERSION = 'IAO 2.4.0';
export const INDUSTRY_PACK = 'Utilities · electric & water · 1.3';

export const concepts: Concept[] = [
  // L0 core
  {
    id: 'core:Site', label: 'Site', layer: 'L0', definition: 'A geographic place where assets are operated and maintained as one organisational unit.',
    synonyms: ['plant', 'facility', 'works'], attributes: [{ name: 'Region' }, { name: 'Time zone' }], failureModes: [], allowedParents: [],
    bindings: { maximo: 'SITE', sap: 'Plant (WERKS)', ifs: 'Site' }, standard: 'ISO 55000',
  },
  {
    id: 'core:FunctionalLocation', label: 'Functional location', layer: 'L0', definition: 'A place in a technical structure where a function is performed, independent of the physical asset installed there.',
    synonyms: ['location', 'position', 'functional position', 'tag'], attributes: [{ name: 'Reference designation' }], failureModes: [],
    allowedParents: ['core:Site', 'core:FunctionalLocation'],
    bindings: { maximo: 'LOCATIONS (type OPERATING)', sap: 'Functional location (IFLOT)', ifs: 'Functional object (EquipmentFunctional)' }, standard: 'IEC 81346',
  },
  {
    id: 'core:PhysicalAsset', label: 'Physical asset', layer: 'L0', definition: 'An individually identifiable item of equipment with its own serial identity and lifecycle.',
    synonyms: ['equipment', 'asset', 'serial object'], attributes: [{ name: 'Serial number' }, { name: 'Manufacturer' }, { name: 'Model' }, { name: 'Install date' }], failureModes: [],
    allowedParents: ['core:FunctionalLocation', 'core:PhysicalAsset'],
    bindings: { maximo: 'ASSET', sap: 'Equipment (EQUI)', ifs: 'Serial object (EquipmentSerial)' }, standard: 'ISO 55000',
  },
  {
    id: 'core:SerialNumber', label: 'Serial number', layer: 'L0', parent: 'core:PhysicalAsset', definition: 'The manufacturer-assigned identifier that distinguishes one physical asset from others of the same model.',
    synonyms: ['serial', 'S/N', 'serial no'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'ASSET.SERIALNUM', sap: 'EQUI.SERGE', ifs: 'EquipmentSerial.SerialNo' }, standard: 'ISO 55000',
  },
  {
    id: 'core:AssetClass', label: 'Asset class', layer: 'L0', definition: 'A category of physical assets that share attributes, failure behaviour and maintenance strategy.',
    synonyms: ['classification', 'equipment class', 'object type', 'equipment category'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'CLASSSTRUCTURE', sap: 'Class (KLAH) / equipment category', ifs: 'Object type + technical class' }, standard: 'ISO 14224',
  },
  {
    id: 'core:MeasurementPoint', label: 'Measurement point', layer: 'L0', definition: 'A point on an asset or location where a quantity is measured or counted over time.',
    synonyms: ['meter', 'counter', 'gauge'], attributes: [{ name: 'Unit' }, { name: 'Cumulative' }], failureModes: [], allowedParents: ['core:PhysicalAsset', 'core:FunctionalLocation'],
    bindings: { maximo: 'ASSETMETER / METER', sap: 'Measuring point (IMPTT)', ifs: 'Measurement parameter on object' }, standard: 'MIMOSA CCOM',
  },
  {
    id: 'core:FailureMode', label: 'Failure mode', layer: 'L0', definition: 'The observed manner in which an asset fails to perform its intended function.',
    synonyms: ['problem code', 'symptom', 'damage code'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'FAILURECODE (PROBLEM)', sap: 'Damage code (QPCD, catalog C)', ifs: 'Discovery / symptom code' }, standard: 'ISO 14224',
  },
  {
    id: 'core:FailureCause', label: 'Failure cause', layer: 'L0', definition: 'The circumstance during design, manufacture or use that led to a failure.',
    synonyms: ['cause code', 'root cause'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'FAILURECODE (CAUSE)', sap: 'Cause code (catalog 5)', ifs: 'Cause code' }, standard: 'ISO 14224',
  },
  {
    id: 'core:MaintenancePlan', label: 'Maintenance plan', layer: 'L0', definition: 'A schedule that generates preventive work on an asset or location from calendar or meter triggers.',
    synonyms: ['PM', 'preventive maintenance', 'maintenance plan', 'PM schedule'], attributes: [{ name: 'Interval' }, { name: 'Interval unit' }, { name: 'Trigger type' }], failureModes: [], allowedParents: [],
    bindings: { maximo: 'PM', sap: 'Maintenance plan (MPLA)', ifs: 'PM action (PmAction)' }, standard: 'ISO 55000',
  },
  {
    id: 'core:Task', label: 'Task', layer: 'L0', definition: 'A defined unit of maintenance work with steps, resources and duration.',
    synonyms: ['job plan', 'task list', 'operation'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'JOBPLAN / JOBTASK', sap: 'Task list (PLKO/PLPO)', ifs: 'Standard job' }, standard: 'ISO 55000',
  },
  {
    id: 'core:WorkOrder', label: 'Work order', layer: 'L0', definition: 'An authorised request to perform maintenance work, with planned and actual resources.',
    synonyms: ['WO', 'job', 'maintenance order'], attributes: [{ name: 'Status' }, { name: 'Priority' }, { name: 'Work type' }], failureModes: [], allowedParents: [],
    bindings: { maximo: 'WORKORDER', sap: 'PM order (AUFK/AFIH)', ifs: 'Work order (to be confirmed)' }, standard: 'ISO 55000',
  },
  {
    id: 'core:WorkPriority', label: 'Work priority', layer: 'L0', parent: 'core:WorkOrder', definition: 'The urgency of a work order, used to schedule resources.',
    synonyms: ['priority', 'urgency'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'WORKORDER.WOPRIORITY', sap: 'AFIH.PRIOK', ifs: 'Work order priority' },
  },
  {
    id: 'core:AssetCriticality', label: 'Asset criticality', layer: 'L0', parent: 'core:PhysicalAsset', definition: 'The consequence rating of an asset failing, used to prioritise work and plans.',
    synonyms: ['criticality', 'risk rank', 'ABC indicator'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'ASSET.PRIORITY or custom field', sap: 'EQUZ.ABCKZ', ifs: 'Criticality' },
  },
  {
    id: 'core:Resource', label: 'Craft / skill', layer: 'L0', definition: 'A labour type with the qualifications needed for a task.',
    synonyms: ['craft', 'trade', 'work centre', 'skill'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'CRAFT', sap: 'Work centre (CRHD)', ifs: 'Competence / resource group' },
  },
  {
    id: 'core:SparePart', label: 'Spare part', layer: 'L0', definition: 'An inventory item that is kept to repair a specific asset.',
    synonyms: ['spare', 'BOM item', 'part'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'SPAREPART', sap: 'Equipment BOM (EQST)', ifs: 'Object spare part' },
  },
  {
    id: 'core:Document', label: 'Document', layer: 'L0', definition: 'A drawing, manual or certificate attached to an asset or location.',
    synonyms: ['attachment', 'doclink', 'drawing'], attributes: [], failureModes: [], allowedParents: [],
    bindings: { maximo: 'DOCLINKS', sap: 'DMS document (DRAW)', ifs: 'Document connection' },
  },
  // L1 utilities pack
  {
    id: 'util:PumpingStation', label: 'Pumping station', layer: 'L1', parent: 'core:FunctionalLocation', definition: 'A functional location that houses pumps moving water between pressure zones.',
    synonyms: ['lift station', 'booster station', 'pump house', 'PS'], attributes: [{ name: 'Design capacity', unit: 'm³/h' }], failureModes: [],
    allowedParents: ['core:Site', 'util:ProcessSystem'], bindings: { maximo: 'LOCATIONS type OPERATING', sap: 'Functional location', ifs: 'Functional object' },
  },
  {
    id: 'util:ProcessSystem', label: 'Process system', layer: 'L1', parent: 'core:FunctionalLocation', definition: 'A group of functional locations that together perform one process, such as filtration or dosing.',
    synonyms: ['system', 'process unit', 'train'], attributes: [], failureModes: [], allowedParents: ['core:Site'],
    bindings: { maximo: 'LOCATIONS type SYSTEM', sap: 'Functional location (level 2)', ifs: 'Functional object' }, standard: 'IEC 81346',
  },
  {
    id: 'util:Substation', label: 'Substation bay', layer: 'L1', parent: 'core:FunctionalLocation', definition: 'A section of a substation that groups switching and transforming equipment for one circuit.',
    synonyms: ['bay', 'switchyard', 'feeder bay'], attributes: [{ name: 'Nominal voltage', unit: 'kV' }], failureModes: [],
    allowedParents: ['core:Site'], bindings: { maximo: 'LOCATIONS type OPERATING', sap: 'Functional location', ifs: 'Functional object' }, standard: 'IEC CIM',
  },
  {
    id: 'util:CentrifugalPump', label: 'Centrifugal pump', layer: 'L1', parent: 'util:Pump', definition: 'A rotodynamic pump that moves water by converting rotational energy from an impeller into flow and pressure.',
    synonyms: ['pump', 'end suction pump', 'split case pump', 'lift pump'],
    attributes: [{ name: 'Rated flow', unit: 'm³/h', range: '5–5000' }, { name: 'Rated head', unit: 'm', range: '5–250' }, { name: 'Driver type' }, { name: 'Rated power', unit: 'kW', range: '0.5–2000' }, { name: 'Seal type' }],
    failureModes: ['External leakage – process medium (ELP)', 'Vibration (VIB)', 'Fail to start on demand (FTS)', 'Overheating (OHE)', 'Low output (LOO)'],
    allowedParents: ['util:PumpingStation', 'util:ProcessSystem', 'core:FunctionalLocation'], neverUnder: ['util:Valve', 'util:FlowMeter', 'util:Instrument'],
    bindings: { maximo: 'Asset with classification PUMP\\CENTRIFUGAL, attributes in ASSETSPEC', sap: 'Equipment, category M, class PUMP_CENTRIF with characteristics', ifs: 'Serial object, object type PUMP-CENT, technical attributes (to be confirmed with IFS)' },
    standard: 'ISO 14224 · 1.4.4',
  },
  {
    id: 'util:Pump', label: 'Pump', layer: 'L1', parent: 'util:RotatingEquipment', definition: 'Equipment that moves fluid by mechanical action.',
    synonyms: ['pump'], attributes: [], failureModes: [], allowedParents: ['util:PumpingStation', 'util:ProcessSystem'], neverUnder: ['util:Valve'], bindings: {}, standard: 'ISO 14224',
  },
  {
    id: 'util:RotatingEquipment', label: 'Rotating equipment', layer: 'L1', parent: 'core:PhysicalAsset', definition: 'Physical assets whose function depends on rotating parts.',
    synonyms: [], attributes: [], failureModes: [], allowedParents: [], bindings: {}, standard: 'ISO 14224',
  },
  {
    id: 'util:ElectricMotor', label: 'Electric motor', layer: 'L1', parent: 'util:RotatingEquipment', definition: 'A machine that converts electrical energy into rotation to drive equipment such as pumps.',
    synonyms: ['motor', 'drive motor', 'driver'], attributes: [{ name: 'Rated power', unit: 'kW', range: '0.1–5000' }, { name: 'Voltage', unit: 'V' }, { name: 'Speed', unit: 'rpm' }],
    failureModes: ['Overheating (OHE)', 'Vibration (VIB)', 'Fail to start on demand (FTS)', 'Insulation failure (INS)'],
    allowedParents: ['util:CentrifugalPump', 'util:Blower', 'core:FunctionalLocation'], bindings: { maximo: 'Asset class MOTOR\\AC', sap: 'Equipment class MOTOR', ifs: 'Serial object, object type MOTOR' }, standard: 'ISO 14224',
  },
  {
    id: 'util:Valve', label: 'Valve', layer: 'L1', parent: 'core:PhysicalAsset', definition: 'A device that controls or isolates flow in a pipe.',
    synonyms: ['gate valve', 'butterfly valve', 'check valve', 'isolation valve'], attributes: [{ name: 'Nominal size', unit: 'mm', range: '15–3000' }, { name: 'Valve type' }, { name: 'Actuation' }],
    failureModes: ['Fail to close (FTC)', 'Fail to open (FTO)', 'Internal leakage (INL)', 'External leakage (ELP)'],
    allowedParents: ['util:PumpingStation', 'util:ProcessSystem', 'core:FunctionalLocation'], neverUnder: ['util:CentrifugalPump'],
    bindings: { maximo: 'Asset class VALVE\\GATE or VALVE\\BUTTERFLY', sap: 'Equipment class VALVE', ifs: 'Serial object, object type VALVE' }, standard: 'ISO 14224',
  },
  {
    id: 'util:FlowMeter', label: 'Flow meter', layer: 'L1', parent: 'util:Instrument', definition: 'An instrument that measures volumetric or mass flow.',
    synonyms: ['mag meter', 'flowmeter', 'FIT'], attributes: [{ name: 'Range', unit: 'm³/h' }], failureModes: ['Erratic output (ERO)', 'No output (NOO)'],
    allowedParents: ['core:FunctionalLocation'], bindings: { maximo: 'Asset class INSTR\\FLOW', sap: 'Equipment class FLOWMETER', ifs: 'Serial object, object type FLOW-METER' }, standard: 'ISO 14224',
  },
  {
    id: 'util:Instrument', label: 'Instrument', layer: 'L1', parent: 'core:PhysicalAsset', definition: 'A device that senses or measures a process value.',
    synonyms: ['transmitter', 'sensor', 'gauge', 'PIT'], attributes: [], failureModes: ['Erratic output (ERO)', 'No output (NOO)', 'Out of calibration (OOC)'],
    allowedParents: ['core:FunctionalLocation', 'util:CentrifugalPump'], bindings: { maximo: 'Asset class INSTR\\PRESS', sap: 'Equipment class INSTRUMENT', ifs: 'Serial object, object type INSTRUMENT' }, standard: 'ISO 14224',
  },
  {
    id: 'util:DistributionTransformer', label: 'Distribution transformer', layer: 'L1', parent: 'core:PhysicalAsset', definition: 'A transformer that steps medium voltage down to the voltage used by customers.',
    synonyms: ['transformer', 'TX', 'pole mount transformer', 'ground mount transformer'],
    attributes: [{ name: 'Rating', unit: 'kVA', range: '15–5000' }, { name: 'Primary voltage', unit: 'kV' }, { name: 'Cooling type' }, { name: 'Oil volume', unit: 'L' }],
    failureModes: ['Insulation failure (INS)', 'Overheating (OHE)', 'Oil leakage (ELP)', 'Tap changer failure (TCF)'],
    allowedParents: ['util:Substation', 'core:FunctionalLocation'], bindings: { maximo: 'Asset class ELEC\\TRANSFORMER', sap: 'Equipment class TRANSFORMER', ifs: 'Serial object, object type TRANSFORMER' }, standard: 'IEC CIM · PowerTransformer',
  },
  {
    id: 'util:CircuitBreaker', label: 'Circuit breaker', layer: 'L1', parent: 'core:PhysicalAsset', definition: 'A switching device that interrupts fault current to protect a circuit.',
    synonyms: ['breaker', 'CB', 'recloser'], attributes: [{ name: 'Rated current', unit: 'A' }, { name: 'Breaking capacity', unit: 'kA' }, { name: 'Interrupting medium' }],
    failureModes: ['Fail to trip (FTT)', 'Spurious trip (SPT)', 'Fail to close (FTC)'], allowedParents: ['util:Substation'],
    bindings: { maximo: 'Asset class ELEC\\BREAKER', sap: 'Equipment class BREAKER', ifs: 'Serial object, object type BREAKER' }, standard: 'IEC CIM · Breaker',
  },
  {
    id: 'util:Switchgear', label: 'Switchgear', layer: 'L1', parent: 'core:PhysicalAsset', definition: 'An assembly of switching and protection devices for a busbar.',
    synonyms: ['switchboard', 'RMU', 'ring main unit'], attributes: [{ name: 'Rated voltage', unit: 'kV' }], failureModes: ['Insulation failure (INS)', 'Partial discharge (PD)'],
    allowedParents: ['util:Substation'], bindings: { maximo: 'Asset class ELEC\\SWGR', sap: 'Equipment class SWITCHGEAR', ifs: 'Serial object, object type SWITCHGEAR' }, standard: 'IEC CIM',
  },
  {
    id: 'util:Blower', label: 'Blower', layer: 'L1', parent: 'util:RotatingEquipment', definition: 'A machine that moves air, used for aeration in treatment.',
    synonyms: ['aeration blower', 'fan'], attributes: [{ name: 'Rated flow', unit: 'Nm³/h' }], failureModes: ['Vibration (VIB)', 'Overheating (OHE)'],
    allowedParents: ['util:ProcessSystem'], bindings: { maximo: 'Asset class BLOWER', sap: 'Equipment class BLOWER', ifs: 'Serial object, object type BLOWER' }, standard: 'ISO 14224',
  },
  {
    id: 'util:Chlorinator', label: 'Chlorinator', layer: 'L1', parent: 'core:PhysicalAsset', definition: 'Dosing equipment that adds chlorine for disinfection. Regulated for drinking water compliance.',
    synonyms: ['dosing pump', 'hypo dosing', 'disinfection unit'], attributes: [{ name: 'Dose rate', unit: 'kg/day' }], failureModes: ['Low output (LOO)', 'External leakage (ELP)'],
    allowedParents: ['util:ProcessSystem'], bindings: { maximo: 'Asset class CHEM\\CHLOR', sap: 'Equipment class DOSING', ifs: 'Serial object, object type DOSING' }, standard: 'Utilities pack',
  },
  {
    id: 'util:RuntimeHours', label: 'Runtime hours (cumulative)', layer: 'L1', parent: 'core:MeasurementPoint', definition: 'A cumulative counter of operating hours. It never decreases except at a recorded meter replacement.',
    synonyms: ['run hours', 'hour meter', 'RUNHRS'], attributes: [{ name: 'Unit', unit: 'h' }], failureModes: [], allowedParents: ['util:RotatingEquipment'],
    bindings: { maximo: 'METER type CONTINUOUS, METERNAME RUNHRS', sap: 'Measuring point, counter', ifs: 'Measurement parameter, accumulated' }, standard: 'MIMOSA CCOM',
  },
];

export const conceptById = new Map(concepts.map((c) => [c.id, c]));

export const woStatusCodeList: CodeListEntry[] = [
  { ontology: 'Requested, waiting for approval', maximo: 'WAPPR', sap: 'CRTD', ifs: 'Prepared', match: 'exact', count: 61 },
  { ontology: 'Approved and released', maximo: 'APPR', sap: 'REL', ifs: 'Released', match: 'exact', count: 118 },
  { ontology: 'Approved and released', maximo: 'WSCH', sap: 'REL', ifs: 'Released', match: 'close', count: 44 },
  { ontology: 'Work in progress', maximo: 'INPRG', sap: 'REL with confirmation', ifs: 'Work started', match: 'exact', count: 97 },
  { ontology: 'Work complete', maximo: 'COMP', sap: 'TECO', ifs: 'Work done or reported', match: 'exact', count: 2210 },
  { ontology: 'Closed', maximo: 'CLOSE', sap: 'CLSD', ifs: 'Finished', match: 'exact', count: 12790 },
  { ontology: 'Cancelled', maximo: 'CAN', sap: 'Deletion flag', ifs: 'Cancelled', match: 'exact', count: 0 },
  { ontology: '—', maximo: 'NV-HOLD', sap: '—', ifs: '?', match: 'unmatched', count: 38 },
  { ontology: '—', maximo: 'FLDCOMP', sap: '—', ifs: '?', match: 'unmatched', count: 27 },
  { ontology: '—', maximo: 'PEND-REG', sap: '—', ifs: '?', match: 'unmatched', count: 15 },
];

export const standards = [
  { id: 'ISO 14224', contributes: 'Equipment taxonomy, classes and failure mode codes', usedIn: 'Rotating equipment in utilities' },
  { id: 'ISO 55000', contributes: 'Asset management vocabulary', usedIn: 'L0 Core' },
  { id: 'IEC 81346', contributes: 'Reference designations and plant structuring', usedIn: 'L0 Core, hierarchy rules' },
  { id: 'IEC CIM', contributes: 'Utility network asset classes', usedIn: 'Utilities pack' },
  { id: 'MIMOSA CCOM', contributes: 'Asset and condition data exchange', usedIn: 'L0 Core, measurements' },
  { id: 'UCUM / QUDT', contributes: 'Units of measure and conversions', usedIn: 'All layers' },
];

export const ontologyChangeLog = [
  { version: '2.4.0', date: '2026-09-30', change: 'Added "lift station" and "booster station" as synonyms of Pumping station', reason: 'Project precedent · 3 projects', source: 'Precedent', author: 'Curator' },
  { version: '2.4.0', date: '2026-09-30', change: 'Tightened Distribution transformer rating range to 15–5000 kVA', reason: 'Expert review · utilities panel', source: 'Expert review', author: 'Curator' },
  { version: '2.3.2', date: '2026-08-12', change: 'Runtime hours marked cumulative with replacement exception', reason: 'MIMOSA CCOM alignment', source: 'Standard', author: 'Curator' },
  { version: '2.3.0', date: '2026-07-01', change: 'New concept: Chlorinator, flagged regulatory', reason: 'Drinking water compliance', source: 'Expert review', author: 'Curator' },
];

// Equipment families group L1 classes, so class inference can run in two steps (family, then
// class) and stay within the option limit of a typed question as packs grow.
export const families: { label: string; concepts: string[] }[] = [
  { label: 'Rotating equipment', concepts: ['util:CentrifugalPump', 'util:ElectricMotor', 'util:Blower'] },
  { label: 'Flow control', concepts: ['util:Valve'] },
  { label: 'Instruments and meters', concepts: ['util:Instrument', 'util:FlowMeter'] },
  { label: 'Electrical network', concepts: ['util:DistributionTransformer', 'util:CircuitBreaker', 'util:Switchgear'] },
  { label: 'Treatment and dosing', concepts: ['util:Chlorinator'] },
];

// Failure causes (ISO 14224 style, utilities pack wording).
export const failureCauses = [
  'Mechanical wear or fatigue (MWF)', 'Corrosion or erosion (COR)', 'Electrical fault (ELF)', 'Instrument or control fault (ICF)',
  'Contamination or blockage (CON)', 'Operating error (OPE)', 'Maintenance error (MNE)', 'Design or installation (DES)', 'External cause (EXT)',
];

// Local cause codes found in the extract, with their meaning.
export const causeCodeMeaning: Record<string, string> = { TAPCHG: 'tap changer failure', MECH: 'mechanical failure – general', SEAL: 'seal failure', ELEC: 'electrical fault' };
