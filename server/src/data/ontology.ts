import type { Cardinality, CodeListEntry, Concept, ConceptProperty, ConceptRelation, RelationType, RelationTypeDef } from '../types.js';

// Industrial Asset Ontology, L0 core and L1 utilities pack (electric and water). Equipment classes
// and failure modes follow ISO 14224, vocabulary follows ISO 55000, the electric network follows
// IEC CIM (61968/61970) and IEC 61850. IFS Cloud bindings are marked "to be confirmed with IFS"
// where they rest on public material only.

export const ONTOLOGY_VERSION = 'IAO 2.5.0';
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

// ---------------- 2.5.0 additions ----------------

const releaseConceptCount = concepts.length;

type NewConcept = Omit<Concept, 'synonyms' | 'attributes' | 'failureModes' | 'allowedParents' | 'bindings' | 'layer'> &
  Partial<Pick<Concept, 'synonyms' | 'attributes' | 'failureModes' | 'allowedParents' | 'bindings' | 'layer'>>;
const add = (...list: NewConcept[]) => {
  for (const c of list) concepts.push({ layer: 'L1', synonyms: [], attributes: [], failureModes: [], allowedParents: [], bindings: {}, ...c });
};

// ISO 14224 failure modes reused across classes (utilities pack wording).
const FM = {
  FTS: 'Fail to start on demand (FTS)', STP: 'Fail to stop on demand (STP)', UST: 'Spurious stop (UST)', BRD: 'Breakdown (BRD)',
  LOO: 'Low output (LOO)', HIO: 'High output (HIO)', VIB: 'Vibration (VIB)', NOI: 'Noise (NOI)', OHE: 'Overheating (OHE)',
  ELP: 'External leakage (ELP)', ELPP: 'External leakage – process medium (ELP)', ELU: 'External leakage – utility medium (ELU)',
  INL: 'Internal leakage (INL)', PLU: 'Plugged or choked (PLU)', STD: 'Structural deficiency (STD)', PDE: 'Parameter deviation (PDE)',
  FTO: 'Fail to open (FTO)', FTC: 'Fail to close (FTC)', DOP: 'Delayed operation (DOP)', FTF: 'Fail to function on demand (FTF)',
  SPO: 'Spurious operation (SPO)', ERO: 'Erratic output (ERO)', NOO: 'No output (NOO)', OOC: 'Out of calibration (OOC)',
  INS: 'Insulation failure (INS)', PD: 'Partial discharge (PD)', FTT: 'Fail to trip (FTT)', SPT: 'Spurious trip (SPT)', TCF: 'Tap changer failure (TCF)',
  BUR: 'Burst (BUR)', LOC: 'Loss of communication (LOC)',
};

// L0 core
add(
  {
    id: 'core:AssetSystem', label: 'Asset system', layer: 'L0', definition: 'A set of assets that interact to deliver a required function, such as a supply zone or a primary network.',
    synonyms: ['system of assets', 'asset group'], bindings: { maximo: 'LOCSYSTEM (network system)', sap: 'Object network / functional location structure', ifs: 'Functional object structure' }, standard: 'ISO 55000',
  },
  {
    id: 'core:MaintainableItem', label: 'Maintainable item', layer: 'L0', parent: 'core:PhysicalAsset',
    definition: 'A part or assembly of parts that is the lowest level of the equipment hierarchy at which maintenance is planned and recorded.',
    synonyms: ['sub-unit', 'subassembly', 'maintainable component'], allowedParents: ['core:PhysicalAsset'],
    bindings: { maximo: 'Child ASSET or rotating ITEM', sap: 'Sub-equipment or assembly (IHPA / MARA)', ifs: 'Child serial object or part' }, standard: 'ISO 14224 · level 9',
  },
  {
    id: 'core:ConditionAssessment', label: 'Condition assessment', layer: 'L0', definition: 'A dated, graded judgement of the physical state of an asset, from inspection, testing or monitoring.',
    synonyms: ['condition grade', 'asset condition', 'condition survey'],
    bindings: { maximo: 'Inspection result / ASSET condition field', sap: 'Measurement document (IMRG) or notification', ifs: 'Inspection note (to be confirmed with IFS)' }, standard: 'ISO 55000',
  },
  {
    id: 'core:WorkRequest', label: 'Work request', layer: 'L0', definition: 'A report of a defect or a request for work that has not yet been planned or authorised.',
    synonyms: ['service request', 'fault report', 'maintenance notification'],
    bindings: { maximo: 'SR / TICKET', sap: 'PM notification (QMEL)', ifs: 'Work request (to be confirmed with IFS)' }, standard: 'ISO 55000',
  },
);

// L1 facilities and networks
add(
  {
    id: 'util:TreatmentWorks', label: 'Treatment works', parent: 'core:FunctionalLocation', category: 'Facilities and networks',
    definition: 'A site-level functional location where raw water or wastewater is treated to a regulated standard.',
    synonyms: ['water treatment works', 'WTW', 'wastewater treatment works', 'WwTW', 'treatment plant'], allowedParents: ['core:Site'],
    bindings: { maximo: 'LOCATIONS type OPERATING (works level)', sap: 'Functional location (level 1–2)', ifs: 'Functional object' }, standard: 'Utilities pack',
  },
  {
    id: 'util:ServiceReservoir', label: 'Service reservoir', parent: 'core:FunctionalLocation', category: 'Facilities and networks',
    definition: 'A covered storage of treated water that balances supply and demand and holds pressure for a supply zone.',
    synonyms: ['reservoir', 'water tower', 'storage reservoir', 'clear water tank'], allowedParents: ['core:Site'],
    bindings: { maximo: 'LOCATIONS type OPERATING', sap: 'Functional location', ifs: 'Functional object' }, standard: 'Utilities pack',
  },
  {
    id: 'util:PressureZone', label: 'District metered area', parent: 'core:AssetSystem', category: 'Facilities and networks',
    definition: 'A discrete part of the distribution network with metered inlets, used to manage pressure and measure leakage.',
    synonyms: ['DMA', 'supply zone', 'metered zone'], allowedParents: ['core:Site'],
    bindings: { maximo: 'LOCSYSTEM network system', sap: 'Functional location (network)', ifs: 'Functional object (network)' }, standard: 'Utilities pack',
  },
  {
    id: 'util:Borehole', label: 'Borehole', parent: 'core:FunctionalLocation', category: 'Facilities and networks',
    definition: 'A drilled groundwater source with its headworks, abstraction licence and pump.',
    synonyms: ['water well', 'groundwater source', 'abstraction borehole'], allowedParents: ['core:Site'],
    bindings: { maximo: 'LOCATIONS type OPERATING', sap: 'Functional location', ifs: 'Functional object' }, standard: 'Utilities pack',
  },
  {
    id: 'util:PrimarySubstation', label: 'Primary substation', parent: 'core:FunctionalLocation', category: 'Electrical network',
    definition: 'A substation that transforms sub-transmission voltage down to distribution voltage and feeds several feeders.',
    synonyms: ['grid substation', 'bulk supply point', 'zone substation'], allowedParents: ['core:Site'],
    bindings: { maximo: 'LOCATIONS type OPERATING', sap: 'Functional location', ifs: 'Functional object' }, standard: 'IEC CIM · Substation',
  },
  {
    id: 'util:SecondarySubstation', label: 'Secondary substation', parent: 'core:FunctionalLocation', category: 'Electrical network',
    definition: 'A distribution substation that steps distribution voltage down to low voltage for customers.',
    synonyms: ['distribution substation', 'package substation', 'kiosk substation'], allowedParents: ['core:Site', 'util:Feeder'],
    bindings: { maximo: 'LOCATIONS type OPERATING', sap: 'Functional location', ifs: 'Functional object' }, standard: 'IEC CIM · Substation',
  },
  {
    id: 'util:Feeder', label: 'Feeder', parent: 'core:FunctionalLocation', category: 'Electrical network',
    definition: 'A distribution circuit leaving a substation, together with the cables, lines and switching devices it supplies.',
    synonyms: ['distribution feeder', 'MV feeder', 'outgoing circuit'], allowedParents: ['util:PrimarySubstation', 'core:Site'],
    bindings: { maximo: 'LOCATIONS type OPERATING (circuit)', sap: 'Functional location (linear)', ifs: 'Functional object' }, standard: 'IEC CIM · Feeder',
  },
);

// L1 rotating equipment
add(
  {
    id: 'util:SubmersiblePump', label: 'Submersible pump', parent: 'util:Pump', category: 'Rotating equipment',
    definition: 'A pump with a close-coupled sealed motor that runs submerged in the liquid it pumps, such as in a borehole or wet well.',
    synonyms: ['borehole pump', 'sewage pump', 'wet well pump'],
    failureModes: [FM.FTS, FM.LOO, FM.VIB, FM.OHE, FM.PLU, FM.INS, FM.BRD], allowedParents: ['util:PumpingStation', 'util:Borehole', 'core:FunctionalLocation'], neverUnder: ['util:Valve'],
    bindings: { maximo: 'Asset class PUMP\\SUBMERSIBLE', sap: 'Equipment class PUMP_SUBM', ifs: 'Serial object, object type PUMP-SUBM (to be confirmed with IFS)' }, standard: 'ISO 14224 · 1.4.4',
  },
  {
    id: 'util:PositiveDisplacementPump', label: 'Positive displacement pump', parent: 'util:Pump', category: 'Rotating equipment',
    definition: 'A pump that moves a fixed volume of liquid per cycle, used for sludge, viscous media and dosing.',
    synonyms: ['PD pump', 'progressive cavity pump', 'screw pump', 'sludge pump'],
    failureModes: [FM.FTS, FM.LOO, FM.ELPP, FM.VIB, FM.OHE, FM.BRD], allowedParents: ['util:PumpingStation', 'util:ProcessSystem', 'core:FunctionalLocation'], neverUnder: ['util:Valve'],
    bindings: { maximo: 'Asset class PUMP\\PD', sap: 'Equipment class PUMP_PD', ifs: 'Serial object, object type PUMP-PD (to be confirmed with IFS)' }, standard: 'ISO 14224 · 1.4.4',
  },
  {
    id: 'util:MeteringPump', label: 'Metering pump', parent: 'util:PositiveDisplacementPump', category: 'Treatment and dosing',
    definition: 'A positive displacement pump that delivers a precise, adjustable flow of chemical for dosing.',
    synonyms: ['diaphragm pump', 'chemical metering pump', 'peristaltic pump'],
    failureModes: [FM.LOO, FM.HIO, FM.ELPP, FM.FTS, FM.PDE], allowedParents: ['util:ProcessSystem', 'util:Chlorinator', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class PUMP\\METERING', sap: 'Equipment class DOSING_PUMP', ifs: 'Serial object, object type PUMP-DOSE (to be confirmed with IFS)' }, standard: 'ISO 14224',
  },
  {
    id: 'util:InductionMotor', label: 'Induction motor', parent: 'util:ElectricMotor', category: 'Rotating equipment',
    definition: 'An AC motor whose rotor current is induced by the rotating stator field; the usual driver for pumps and blowers.',
    synonyms: ['squirrel cage motor', 'asynchronous motor', 'TEFC motor'],
    failureModes: ['Overheating (OHE)', 'Vibration (VIB)', 'Fail to start on demand (FTS)', 'Insulation failure (INS)', FM.NOI], allowedParents: ['util:Pump', 'util:Blower', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class MOTOR\\AC', sap: 'Equipment class MOTOR', ifs: 'Serial object, object type MOTOR' }, standard: 'ISO 14224 · IEC 60034',
  },
  {
    id: 'util:Compressor', label: 'Air compressor', parent: 'util:RotatingEquipment', category: 'Rotating equipment',
    definition: 'A machine that raises the pressure of air for instrument air, pneumatic actuators or process use.',
    synonyms: ['screw compressor', 'instrument air compressor', 'reciprocating compressor'],
    failureModes: [FM.FTS, FM.LOO, FM.OHE, FM.VIB, FM.ELU, FM.UST], allowedParents: ['util:ProcessSystem', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class COMPRESSOR', sap: 'Equipment class COMPRESSOR', ifs: 'Serial object, object type COMPRESSOR' }, standard: 'ISO 14224 · 1.4.1',
  },
  {
    id: 'util:Generator', label: 'Standby generator', parent: 'util:RotatingEquipment', category: 'Rotating equipment',
    definition: 'An engine-driven generating set that supplies a site when the network supply is lost.',
    synonyms: ['genset', 'diesel generator', 'emergency generator', 'generating set'],
    failureModes: [FM.FTS, FM.UST, FM.LOO, FM.OHE, FM.VIB, FM.ELU], allowedParents: ['core:FunctionalLocation', 'util:PumpingStation', 'util:TreatmentWorks'],
    bindings: { maximo: 'Asset class GENERATOR', sap: 'Equipment class GENSET', ifs: 'Serial object, object type GENERATOR' }, standard: 'ISO 14224 · 1.3.2',
  },
  {
    id: 'util:Mixer', label: 'Mixer', parent: 'util:RotatingEquipment', category: 'Rotating equipment',
    definition: 'A machine that keeps solids in suspension or blends chemicals in a tank or channel.',
    synonyms: ['agitator', 'stirrer', 'submersible mixer', 'flash mixer'],
    failureModes: [FM.VIB, FM.BRD, FM.OHE, FM.LOO], allowedParents: ['util:ProcessSystem', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class MIXER', sap: 'Equipment class MIXER', ifs: 'Serial object, object type MIXER' }, standard: 'ISO 14224',
  },
);

// L1 valves and flow control
add(
  {
    id: 'util:PressureReducingValve', label: 'Pressure reducing valve', parent: 'util:Valve', category: 'Valves and flow control',
    definition: 'A self-acting or controlled valve that holds a set downstream pressure, typically at a district metered area inlet.',
    synonyms: ['PRV', 'pressure regulating valve', 'pressure control valve'],
    failureModes: [FM.PDE, FM.FTC, FM.FTO, FM.INL, FM.ELP, FM.DOP], allowedParents: ['util:PumpingStation', 'core:FunctionalLocation'], neverUnder: ['util:CentrifugalPump'],
    bindings: { maximo: 'Asset class VALVE\\PRV', sap: 'Equipment class VALVE_PRV', ifs: 'Serial object, object type VALVE-PRV (to be confirmed with IFS)' }, standard: 'ISO 14224 · 1.6.4',
  },
  {
    id: 'util:AirValve', label: 'Air release valve', parent: 'util:Valve', category: 'Valves and flow control',
    definition: 'A valve at a high point of a main that releases trapped air and admits air on draining.',
    synonyms: ['air valve', 'ARV', 'double orifice air valve'],
    failureModes: [FM.ELP, FM.FTC, FM.PLU], allowedParents: ['core:FunctionalLocation'],
    bindings: { maximo: 'Asset class VALVE\\AIR', sap: 'Equipment class VALVE_AIR', ifs: 'Serial object, object type VALVE-AIR (to be confirmed with IFS)' }, standard: 'ISO 14224',
  },
  {
    id: 'util:ControlValve', label: 'Control valve', parent: 'util:Valve', category: 'Valves and flow control',
    definition: 'A modulating valve positioned by a controller to hold flow, level or pressure at a set point.',
    synonyms: ['modulating valve', 'globe valve', 'flow control valve'],
    failureModes: [FM.PDE, FM.FTO, FM.FTC, FM.INL, FM.DOP], allowedParents: ['util:PumpingStation', 'util:ProcessSystem', 'core:FunctionalLocation'], neverUnder: ['util:CentrifugalPump'],
    bindings: { maximo: 'Asset class VALVE\\CONTROL', sap: 'Equipment class VALVE_CTRL', ifs: 'Serial object, object type VALVE-CTRL (to be confirmed with IFS)' }, standard: 'ISO 14224 · 1.6.4',
  },
  {
    id: 'util:Hydrant', label: 'Fire hydrant', parent: 'util:Valve', category: 'Valves and flow control',
    definition: 'An outlet on a water main for fire-fighting and flushing, maintained under a statutory inspection regime.',
    synonyms: ['hydrant', 'fire plug', 'washout hydrant', 'pillar hydrant'],
    failureModes: [FM.FTO, FM.ELP, FM.FTC, FM.STD], allowedParents: ['util:PressureZone', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class HYDRANT', sap: 'Equipment class HYDRANT', ifs: 'Serial object, object type HYDRANT' }, standard: 'Utilities pack',
  },
  {
    id: 'util:ValveActuator', label: 'Valve actuator', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'The electric, pneumatic or hydraulic device that opens and closes a valve.',
    synonyms: ['actuator', 'motorised actuator', 'MOV', 'electric actuator'],
    failureModes: [FM.FTF, FM.DOP, FM.SPO], allowedParents: ['util:Valve'],
    bindings: { maximo: 'Child asset class ACTUATOR', sap: 'Sub-equipment class ACTUATOR', ifs: 'Child serial object, object type ACTUATOR' }, standard: 'ISO 14224 · 1.6.4',
  },
);

// L1 instruments and meters
add(
  {
    id: 'util:PressureTransmitter', label: 'Pressure transmitter', parent: 'util:Instrument', category: 'Instruments and meters',
    definition: 'An instrument that converts process pressure into a standard signal.',
    synonyms: ['pressure sensor', 'pressure transducer'],
    failureModes: ['Erratic output (ERO)', 'No output (NOO)', 'Out of calibration (OOC)'], allowedParents: ['core:FunctionalLocation', 'util:CentrifugalPump'],
    bindings: { maximo: 'Asset class INSTR\\PRESS', sap: 'Equipment class INSTRUMENT', ifs: 'Serial object, object type INSTRUMENT' }, standard: 'ISO 14224 · 1.5.1',
  },
  {
    id: 'util:LevelTransmitter', label: 'Level transmitter', parent: 'util:Instrument', category: 'Instruments and meters',
    definition: 'An instrument that measures the level of liquid in a reservoir, tank or wet well.',
    synonyms: ['level sensor', 'ultrasonic level', 'level probe'],
    failureModes: ['Erratic output (ERO)', 'No output (NOO)', 'Out of calibration (OOC)'], allowedParents: ['core:FunctionalLocation'],
    bindings: { maximo: 'Asset class INSTR\\LEVEL', sap: 'Equipment class INSTRUMENT', ifs: 'Serial object, object type INSTRUMENT' }, standard: 'ISO 14224 · 1.5.1',
  },
  {
    id: 'util:WaterQualityAnalyser', label: 'Water quality analyser', parent: 'util:Instrument', category: 'Instruments and meters',
    definition: 'An online analyser of a water quality parameter such as chlorine residual, turbidity or pH. Regulated for drinking water compliance.',
    synonyms: ['chlorine analyser', 'turbidimeter', 'pH probe', 'online analyser'],
    failureModes: ['Erratic output (ERO)', 'No output (NOO)', 'Out of calibration (OOC)'], allowedParents: ['core:FunctionalLocation', 'util:ProcessSystem'],
    bindings: { maximo: 'Asset class INSTR\\ANALYSER', sap: 'Equipment class ANALYSER', ifs: 'Serial object, object type ANALYSER' }, standard: 'Utilities pack',
  },
  {
    id: 'util:WaterMeter', label: 'Water meter', parent: 'util:FlowMeter', category: 'Instruments and meters',
    definition: 'A totalising flow meter used for billing or for metering a district or bulk supply.',
    synonyms: ['customer water meter', 'bulk meter', 'district meter', 'AMR meter'],
    failureModes: ['Erratic output (ERO)', 'No output (NOO)', FM.OOC, FM.ELP], allowedParents: ['core:FunctionalLocation', 'util:PressureZone'],
    bindings: { maximo: 'Asset class METER\\WATER', sap: 'Device (IS-U EQUI) / equipment class WATER_METER', ifs: 'Serial object, object type WATER-METER' }, standard: 'ISO 4064',
  },
  {
    id: 'util:ElectricityMeter', label: 'Electricity meter', parent: 'util:Instrument', category: 'Instruments and meters',
    definition: 'A meter that registers active and reactive energy for billing or network monitoring.',
    synonyms: ['smart meter', 'kWh meter', 'AMI meter', 'revenue meter'],
    failureModes: ['Erratic output (ERO)', 'No output (NOO)', FM.OOC, FM.LOC], allowedParents: ['core:FunctionalLocation', 'util:SecondarySubstation'],
    bindings: { maximo: 'Asset class METER\\ELEC', sap: 'Device (IS-U EQUI)', ifs: 'Serial object, object type ELEC-METER' }, standard: 'IEC 62053',
  },
  {
    id: 'util:CurrentTransformer', label: 'Current transformer', parent: 'util:Instrument', category: 'Electrical network',
    definition: 'An instrument transformer that produces a secondary current proportional to the primary current for protection or metering.',
    synonyms: ['CT', 'protection CT', 'metering CT'],
    failureModes: [FM.INS, FM.ERO, FM.OHE], allowedParents: ['util:Switchgear', 'util:Substation'],
    bindings: { maximo: 'Asset class ELEC\\CT', sap: 'Equipment class CT', ifs: 'Serial object, object type CT' }, standard: 'IEC 61869 · CIM CurrentTransformer',
  },
  {
    id: 'util:VoltageTransformer', label: 'Voltage transformer', parent: 'util:Instrument', category: 'Electrical network',
    definition: 'An instrument transformer that produces a secondary voltage proportional to the primary voltage for protection or metering.',
    synonyms: ['VT', 'potential transformer'],
    failureModes: [FM.INS, FM.ERO, FM.OHE], allowedParents: ['util:Switchgear', 'util:Substation'],
    bindings: { maximo: 'Asset class ELEC\\VT', sap: 'Equipment class VT', ifs: 'Serial object, object type VT' }, standard: 'IEC 61869 · CIM PotentialTransformer',
  },
);

// L1 electrical network
add(
  {
    id: 'util:ElectricalEquipment', label: 'Electrical equipment', parent: 'core:PhysicalAsset', category: 'Electrical network',
    definition: 'Physical assets that generate, transform, switch, convert or protect electrical power.',
    synonyms: ['electrical plant'], bindings: {}, standard: 'ISO 14224 · 1.3',
  },
  {
    id: 'util:PowerTransformer', label: 'Power transformer', parent: 'util:ElectricalEquipment', category: 'Electrical network',
    definition: 'A large oil-filled transformer at a primary or grid substation, usually with an on-load tap changer.',
    synonyms: ['grid transformer', 'primary transformer', 'supergrid transformer'],
    failureModes: [FM.INS, FM.OHE, 'Oil leakage (ELP)', FM.TCF, FM.PD], allowedParents: ['util:Substation', 'util:PrimarySubstation'],
    bindings: { maximo: 'Asset class ELEC\\PWRTX', sap: 'Equipment class TRANSFORMER', ifs: 'Serial object, object type TRANSFORMER' }, standard: 'IEC 60076 · CIM PowerTransformer',
  },
  {
    id: 'util:Busbar', label: 'Busbar', parent: 'util:ElectricalEquipment', category: 'Electrical network',
    definition: 'A conductor that collects and distributes power between the circuits of a switchboard or substation.',
    synonyms: ['busbar section', 'bus section'],
    failureModes: [FM.INS, FM.OHE, FM.PD], allowedParents: ['util:Switchgear', 'util:Substation'],
    bindings: { maximo: 'Asset class ELEC\\BUSBAR', sap: 'Equipment class BUSBAR', ifs: 'Serial object, object type BUSBAR' }, standard: 'IEC CIM · BusbarSection',
  },
  {
    id: 'util:Disconnector', label: 'Disconnector', parent: 'util:ElectricalEquipment', category: 'Electrical network',
    definition: 'A switch that provides a visible isolation gap for safe work; it is not rated to break load current.',
    synonyms: ['isolator', 'disconnect switch', 'air break switch'],
    failureModes: [FM.FTO, FM.FTC, FM.OHE], allowedParents: ['util:Switchgear', 'util:Substation', 'util:Feeder'],
    bindings: { maximo: 'Asset class ELEC\\DISCONNECTOR', sap: 'Equipment class DISCONNECTOR', ifs: 'Serial object, object type DISCONNECTOR' }, standard: 'IEC 62271-102 · CIM Disconnector',
  },
  {
    id: 'util:ProtectionRelay', label: 'Protection relay', parent: 'util:ElectricalEquipment', category: 'Electrical network',
    definition: 'An intelligent electronic device that detects faults from measured current and voltage and trips circuit breakers.',
    synonyms: ['IED', 'numerical relay', 'overcurrent relay', 'distance relay'],
    failureModes: [FM.FTT, FM.SPT, FM.ERO, FM.NOO], allowedParents: ['util:Substation', 'util:Switchgear'],
    bindings: { maximo: 'Asset class ELEC\\RELAY', sap: 'Equipment class PROT_RELAY', ifs: 'Serial object, object type RELAY' }, standard: 'IEC 61850 · CIM ProtectionEquipment',
  },
  {
    id: 'util:VariableSpeedDrive', label: 'Variable speed drive', parent: 'util:ElectricalEquipment', category: 'Electrical network',
    definition: 'A power electronic converter that varies motor speed by controlling supply frequency and voltage.',
    synonyms: ['VSD', 'VFD', 'variable frequency drive', 'frequency converter', 'inverter drive'],
    failureModes: [FM.FTS, FM.UST, FM.OHE, FM.ERO], allowedParents: ['util:PumpingStation', 'util:MotorControlCentre', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class ELEC\\VSD', sap: 'Equipment class VSD', ifs: 'Serial object, object type VSD' }, standard: 'ISO 14224 · 1.3.4',
  },
  {
    id: 'util:SoftStarter', label: 'Soft starter', parent: 'util:ElectricalEquipment', category: 'Electrical network',
    definition: 'A device that ramps motor voltage on start to limit inrush current and mechanical shock.',
    synonyms: ['soft start', 'electronic starter'],
    failureModes: [FM.FTS, FM.OHE, FM.UST], allowedParents: ['util:MotorControlCentre', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class ELEC\\STARTER', sap: 'Equipment class STARTER', ifs: 'Serial object, object type STARTER' }, standard: 'IEC 60947-4-2',
  },
  {
    id: 'util:MotorControlCentre', label: 'Motor control centre', parent: 'util:ElectricalEquipment', category: 'Electrical network',
    definition: 'A low-voltage switchboard that houses the starters, drives and protection for a group of motors.',
    synonyms: ['MCC', 'motor control center', 'LV switchboard'],
    failureModes: [FM.INS, FM.OHE, FM.BRD], allowedParents: ['util:PumpingStation', 'util:ProcessSystem', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class ELEC\\MCC', sap: 'Equipment class MCC', ifs: 'Serial object, object type MCC' }, standard: 'IEC 61439',
  },
  {
    id: 'util:SubstationBattery', label: 'Substation battery', parent: 'util:ElectricalEquipment', category: 'Electrical network',
    definition: 'The DC battery and charger that power protection, control and breaker tripping when AC supply is lost.',
    synonyms: ['DC battery', 'battery bank', 'tripping battery'],
    failureModes: [FM.LOO, FM.BRD, FM.OHE], allowedParents: ['util:Substation', 'util:PrimarySubstation'],
    bindings: { maximo: 'Asset class ELEC\\BATTERY', sap: 'Equipment class BATTERY', ifs: 'Serial object, object type BATTERY' }, standard: 'IEC 60896',
  },
  {
    id: 'util:Pole', label: 'Pole', parent: 'core:PhysicalAsset', category: 'Electrical network',
    definition: 'A wood, concrete or steel support for overhead lines and pole-mounted equipment.',
    synonyms: ['wood pole', 'steel pole', 'support structure'],
    failureModes: [FM.STD], allowedParents: ['util:Feeder', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class ELEC\\POLE', sap: 'Equipment class POLE', ifs: 'Serial object, object type POLE' }, standard: 'IEC CIM · Pole',
  },
  {
    id: 'util:TransformerRectifier', label: 'Transformer rectifier', parent: 'util:ElectricalEquipment', category: 'Corrosion protection',
    definition: 'The DC power source of an impressed current cathodic protection system.',
    synonyms: ['T/R unit', 'CP rectifier'],
    failureModes: [FM.NOO, FM.LOO, FM.OHE], allowedParents: ['core:FunctionalLocation'],
    bindings: { maximo: 'Asset class CP\\TR', sap: 'Equipment class CP_RECT', ifs: 'Serial object, object type CP-RECT' }, standard: 'ISO 15589-1',
  },
);

// L1 components (maintainable items)
add(
  {
    id: 'util:TapChanger', label: 'On-load tap changer', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'The mechanism that changes transformer turns ratio under load to hold the output voltage.',
    synonyms: ['OLTC', 'tap changer', 'diverter switch'],
    failureModes: [FM.TCF, FM.FTF, 'Oil leakage (ELP)'], allowedParents: ['util:PowerTransformer', 'util:DistributionTransformer'],
    bindings: { maximo: 'Child asset class ELEC\\OLTC', sap: 'Sub-equipment class OLTC', ifs: 'Child serial object, object type OLTC' }, standard: 'IEC 60214',
  },
  {
    id: 'util:Bushing', label: 'Bushing', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'An insulated conductor that carries current through the tank or wall of a transformer or breaker.',
    synonyms: ['HV bushing', 'condenser bushing'],
    failureModes: [FM.INS, FM.PD, 'Oil leakage (ELP)'], allowedParents: ['util:PowerTransformer', 'util:DistributionTransformer', 'util:CircuitBreaker'],
    bindings: { maximo: 'Child asset class ELEC\\BUSHING', sap: 'Sub-equipment class BUSHING', ifs: 'Child serial object' }, standard: 'IEC 60137',
  },
  {
    id: 'util:Winding', label: 'Winding', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'An insulated coil of a transformer or the stator of a motor.',
    synonyms: ['stator winding', 'transformer winding'],
    failureModes: [FM.INS, FM.OHE], allowedParents: ['util:PowerTransformer', 'util:DistributionTransformer', 'util:ElectricMotor'],
    bindings: { maximo: 'Not held as an asset; condition on parent', sap: 'Assembly', ifs: 'Not held as an object; condition on parent' }, standard: 'IEC 60076 · IEC 60034',
  },
  {
    id: 'util:CoolingSystem', label: 'Transformer cooling', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'Radiators, fans and oil pumps that remove heat from a transformer.',
    synonyms: ['radiator bank', 'cooling fans', 'cooler bank'],
    failureModes: [FM.OHE, FM.ELP, FM.FTS], allowedParents: ['util:PowerTransformer'],
    bindings: { maximo: 'Child asset class ELEC\\COOLING', sap: 'Sub-equipment', ifs: 'Child serial object' }, standard: 'IEC 60076-2',
  },
  {
    id: 'util:MechanicalSeal', label: 'Mechanical seal', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'Rotating and stationary faces that seal the shaft of a pump or mixer against the process liquid.',
    synonyms: ['shaft seal', 'cartridge seal', 'pump seal'],
    failureModes: [FM.ELPP, FM.OHE], allowedParents: ['util:Pump', 'util:Mixer'],
    bindings: { maximo: 'Rotating ITEM or SPAREPART', sap: 'Assembly (MARA)', ifs: 'Part / object spare part' }, standard: 'ISO 14224 · ISO 21049',
  },
  {
    id: 'util:Bearing', label: 'Bearing', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'A rolling element or plain bearing that supports a rotating shaft.',
    synonyms: ['rolling element bearing', 'journal bearing', 'DE bearing', 'NDE bearing'],
    failureModes: [FM.VIB, FM.OHE, FM.NOI, FM.BRD], allowedParents: ['util:RotatingEquipment'],
    bindings: { maximo: 'SPAREPART / rotating ITEM', sap: 'Assembly (MARA)', ifs: 'Part / object spare part' }, standard: 'ISO 14224',
  },
  {
    id: 'util:Impeller', label: 'Impeller', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'The rotating vaned element of a centrifugal pump or blower that adds energy to the fluid.',
    synonyms: ['pump impeller', 'runner'],
    failureModes: [FM.LOO, FM.VIB, FM.STD], allowedParents: ['util:Pump', 'util:Blower'],
    bindings: { maximo: 'SPAREPART', sap: 'Assembly (MARA)', ifs: 'Object spare part' }, standard: 'ISO 14224',
  },
  {
    id: 'util:Coupling', label: 'Coupling', parent: 'core:MaintainableItem', category: 'Components',
    definition: 'The device that transmits torque from a driver shaft to a driven shaft.',
    synonyms: ['shaft coupling', 'flexible coupling'],
    failureModes: [FM.VIB, FM.BRD], allowedParents: ['util:RotatingEquipment'],
    bindings: { maximo: 'SPAREPART', sap: 'Assembly (MARA)', ifs: 'Object spare part' }, standard: 'ISO 14224',
  },
  {
    id: 'util:Anode', label: 'Sacrificial anode', parent: 'core:MaintainableItem', category: 'Corrosion protection',
    definition: 'A more reactive metal, or an inert groundbed, that supplies cathodic protection current.',
    synonyms: ['galvanic anode', 'anode bed', 'groundbed'],
    failureModes: [FM.LOO, FM.STD], allowedParents: ['util:CathodicProtectionSystem'],
    bindings: { maximo: 'Child asset class CP\\ANODE', sap: 'Sub-equipment class ANODE', ifs: 'Child serial object' }, standard: 'ISO 15589-1',
  },
);

// L1 control and telemetry
add(
  {
    id: 'util:ControlEquipment', label: 'Control and telemetry equipment', parent: 'core:PhysicalAsset', category: 'Control and telemetry',
    definition: 'Physical assets that acquire signals, run control logic and report to a control centre.',
    synonyms: ['ICA equipment', 'control and automation'], bindings: {}, standard: 'ISO 14224 · 1.5',
  },
  {
    id: 'util:RemoteTerminalUnit', label: 'Remote terminal unit', parent: 'util:ControlEquipment', category: 'Control and telemetry',
    definition: 'An outstation that collects signals at a remote site and exchanges them with the SCADA master.',
    synonyms: ['RTU', 'telemetry outstation', 'outstation'],
    failureModes: [FM.NOO, FM.ERO, FM.FTF, FM.LOC], allowedParents: ['core:FunctionalLocation'],
    bindings: { maximo: 'Asset class ICA\\RTU', sap: 'Equipment class RTU', ifs: 'Serial object, object type RTU' }, standard: 'IEC 60870-5-104 · DNP3',
  },
  {
    id: 'util:PLC', label: 'Programmable logic controller', parent: 'util:ControlEquipment', category: 'Control and telemetry',
    definition: 'A controller that runs the local control logic of a station or process.',
    synonyms: ['PLC', 'logic controller'],
    failureModes: [FM.NOO, FM.ERO, FM.FTF, FM.SPO], allowedParents: ['core:FunctionalLocation', 'util:MotorControlCentre'],
    bindings: { maximo: 'Asset class ICA\\PLC', sap: 'Equipment class PLC', ifs: 'Serial object, object type PLC' }, standard: 'IEC 61131',
  },
  {
    id: 'util:SCADASystem', label: 'SCADA system', parent: 'util:ControlEquipment', category: 'Control and telemetry',
    definition: 'The supervisory system that monitors and operates remote sites through outstations and holds the alarm and event history.',
    synonyms: ['SCADA', 'telemetry system', 'DCS'],
    failureModes: [FM.LOC, FM.ERO, FM.BRD], allowedParents: ['core:Site'],
    bindings: { maximo: 'Asset class ICA\\SCADA', sap: 'Equipment class SCADA', ifs: 'Serial object, object type SCADA' }, standard: 'IEC 61850 · IEC 62351',
  },
);

// L1 treatment and dosing
add(
  {
    id: 'util:RapidGravityFilter', label: 'Rapid gravity filter', parent: 'core:PhysicalAsset', category: 'Treatment and dosing',
    definition: 'A bed of sand or anthracite through which water flows by gravity to remove particles; cleaned by backwash.',
    synonyms: ['RGF', 'sand filter', 'filter bed'],
    failureModes: [FM.PLU, FM.LOO, FM.STD], allowedParents: ['util:ProcessSystem', 'util:TreatmentWorks'],
    bindings: { maximo: 'Asset class TREAT\\FILTER', sap: 'Equipment class FILTER', ifs: 'Serial object, object type FILTER' }, standard: 'Utilities pack',
  },
  {
    id: 'util:UVReactor', label: 'UV disinfection reactor', parent: 'core:PhysicalAsset', category: 'Treatment and dosing',
    definition: 'A reactor that inactivates pathogens with ultraviolet light. Regulated for drinking water compliance.',
    synonyms: ['UV reactor', 'ultraviolet disinfection', 'UV unit'],
    failureModes: [FM.LOO, FM.NOO, FM.BRD], allowedParents: ['util:ProcessSystem', 'util:TreatmentWorks'],
    bindings: { maximo: 'Asset class TREAT\\UV', sap: 'Equipment class UV', ifs: 'Serial object, object type UV' }, standard: 'Utilities pack',
  },
  {
    id: 'util:StorageTank', label: 'Storage tank', parent: 'core:PhysicalAsset', category: 'Treatment and dosing',
    definition: 'A vessel that stores chemicals, sludge or process water, usually within a bund.',
    synonyms: ['bulk tank', 'chemical tank', 'day tank'],
    failureModes: [FM.ELP, FM.STD], allowedParents: ['util:ProcessSystem', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class TANK', sap: 'Equipment class TANK', ifs: 'Serial object, object type TANK' }, standard: 'ISO 14224 · 1.4.12',
  },
  {
    id: 'util:InletScreen', label: 'Inlet screen', parent: 'core:PhysicalAsset', category: 'Treatment and dosing',
    definition: 'A screen at an intake or works inlet that removes debris before pumping and treatment.',
    synonyms: ['bar screen', 'band screen', 'drum screen'],
    failureModes: [FM.PLU, FM.BRD], allowedParents: ['util:ProcessSystem', 'util:TreatmentWorks'],
    bindings: { maximo: 'Asset class TREAT\\SCREEN', sap: 'Equipment class SCREEN', ifs: 'Serial object, object type SCREEN' }, standard: 'Utilities pack',
  },
);

// L1 linear assets
add(
  {
    id: 'util:LinearAsset', label: 'Linear asset', parent: 'core:PhysicalAsset', category: 'Linear assets',
    definition: 'A network asset identified by length and route rather than a single position, such as a main or cable.',
    synonyms: ['network asset', 'linear feature'], standard: 'IEC CIM · ACLineSegment / ISO 55000',
    bindings: { maximo: 'Linear ASSET (Maximo Linear)', sap: 'Linear asset management (LAM) equipment', ifs: 'Linear serial object (to be confirmed with IFS)' },
  },
  {
    id: 'util:WaterMain', label: 'Water main', parent: 'util:LinearAsset', category: 'Linear assets',
    definition: 'A pressurised pipe that carries treated or raw water through the network.',
    synonyms: ['trunk main', 'distribution main', 'rising main', 'pipeline'],
    failureModes: [FM.BUR, FM.ELP, FM.STD], allowedParents: ['util:PressureZone', 'core:FunctionalLocation'],
    bindings: { maximo: 'Linear asset class PIPE\\MAIN', sap: 'LAM equipment class PIPE', ifs: 'Linear serial object, object type MAIN' }, standard: 'Utilities pack',
  },
  {
    id: 'util:SewerMain', label: 'Sewer', parent: 'util:LinearAsset', category: 'Linear assets',
    definition: 'A gravity or pumped pipe that carries foul or surface water to a treatment works or outfall.',
    synonyms: ['gravity sewer', 'foul sewer', 'storm sewer', 'sewer pipe'],
    failureModes: [FM.PLU, FM.STD, FM.ELP], allowedParents: ['core:FunctionalLocation'],
    bindings: { maximo: 'Linear asset class PIPE\\SEWER', sap: 'LAM equipment class SEWER', ifs: 'Linear serial object, object type SEWER' }, standard: 'EN 13508 · Utilities pack',
  },
  {
    id: 'util:ServiceConnection', label: 'Service connection', parent: 'util:LinearAsset', category: 'Linear assets',
    definition: 'The pipe from a main to a customer boundary, with its stop tap and meter position.',
    synonyms: ['service pipe', 'communication pipe', 'customer connection'],
    failureModes: [FM.ELP, FM.BUR], allowedParents: ['util:PressureZone', 'core:FunctionalLocation'],
    bindings: { maximo: 'Asset class PIPE\\SERVICE', sap: 'Connection object (IS-U)', ifs: 'Serial object, object type SERVICE (to be confirmed with IFS)' }, standard: 'Utilities pack',
  },
  {
    id: 'util:PowerCable', label: 'Power cable', parent: 'util:LinearAsset', category: 'Electrical network',
    definition: 'An insulated underground or ducted conductor that carries power between network nodes.',
    synonyms: ['underground cable', 'feeder cable', 'HV cable', 'LV cable'],
    failureModes: [FM.INS, FM.PD, FM.BRD], allowedParents: ['util:Feeder', 'core:FunctionalLocation'],
    bindings: { maximo: 'Linear asset class ELEC\\CABLE', sap: 'LAM equipment class CABLE', ifs: 'Linear serial object, object type CABLE' }, standard: 'IEC CIM · ACLineSegment',
  },
  {
    id: 'util:OverheadLine', label: 'Overhead line', parent: 'util:LinearAsset', category: 'Electrical network',
    definition: 'Bare or covered conductors strung between poles or towers.',
    synonyms: ['OHL', 'overhead conductor', 'line span'],
    failureModes: [FM.BRD, FM.STD, FM.INS], allowedParents: ['util:Feeder', 'core:FunctionalLocation'],
    bindings: { maximo: 'Linear asset class ELEC\\OHL', sap: 'LAM equipment class OHL', ifs: 'Linear serial object, object type OHL' }, standard: 'IEC CIM · ACLineSegment',
  },
);

// L1 corrosion protection and condition measurements
add(
  {
    id: 'util:CathodicProtectionSystem', label: 'Cathodic protection system', parent: 'core:PhysicalAsset', category: 'Corrosion protection',
    definition: 'An impressed current or sacrificial anode system that holds a buried or immersed steel structure at a protective potential.',
    synonyms: ['CP system', 'ICCP system', 'impressed current system', 'sacrificial anode system'],
    failureModes: [FM.LOO, FM.NOO, FM.PDE], allowedParents: ['core:FunctionalLocation'],
    bindings: { maximo: 'Asset class CP\\SYSTEM', sap: 'Equipment class CP_SYSTEM', ifs: 'Serial object, object type CP-SYSTEM' }, standard: 'ISO 15589-1 · EN 12954',
  },
  {
    id: 'util:TestPost', label: 'CP test post', parent: 'core:PhysicalAsset', category: 'Corrosion protection',
    definition: 'A test point where pipe-to-soil potential is measured to confirm cathodic protection.',
    synonyms: ['CP test point', 'test station', 'test post'],
    failureModes: [FM.STD, FM.ERO], allowedParents: ['core:FunctionalLocation'],
    bindings: { maximo: 'Asset class CP\\TESTPOST', sap: 'Equipment class CP_TEST', ifs: 'Serial object, object type CP-TEST' }, standard: 'ISO 15589-1',
  },
  {
    id: 'util:VibrationLevel', label: 'Vibration level', parent: 'core:MeasurementPoint', category: 'Measurements',
    definition: 'Overall vibration velocity measured on a bearing housing, compared with ISO 10816 / 20816 zones.',
    synonyms: ['vibration velocity', 'overall vibration'], allowedParents: ['util:RotatingEquipment'],
    bindings: { maximo: 'METER type GAUGE', sap: 'Measuring point', ifs: 'Measurement parameter' }, standard: 'ISO 20816',
  },
  {
    id: 'util:DissolvedGas', label: 'Dissolved gas analysis', parent: 'core:MeasurementPoint', category: 'Measurements',
    definition: 'Concentrations of fault gases in transformer oil, used to detect overheating, arcing and partial discharge.',
    synonyms: ['DGA', 'transformer oil analysis'], allowedParents: ['util:PowerTransformer', 'util:DistributionTransformer'],
    bindings: { maximo: 'METER type CHARACTERISTIC / condition monitoring', sap: 'Measuring point (characteristic)', ifs: 'Measurement parameter' }, standard: 'IEC 60599',
  },
);

// Categories of the release concepts (2.4 and earlier).
const releaseCategory: Record<string, string> = {
  'util:PumpingStation': 'Facilities and networks', 'util:ProcessSystem': 'Facilities and networks', 'util:Substation': 'Electrical network',
  'util:CentrifugalPump': 'Rotating equipment', 'util:Pump': 'Rotating equipment', 'util:RotatingEquipment': 'Rotating equipment', 'util:ElectricMotor': 'Rotating equipment',
  'util:Blower': 'Rotating equipment', 'util:Valve': 'Valves and flow control', 'util:FlowMeter': 'Instruments and meters', 'util:Instrument': 'Instruments and meters',
  'util:DistributionTransformer': 'Electrical network', 'util:CircuitBreaker': 'Electrical network', 'util:Switchgear': 'Electrical network',
  'util:Chlorinator': 'Treatment and dosing', 'util:RuntimeHours': 'Measurements',
};

// ---------------- Properties (characteristics with datatype and unit) ----------------

type P = ConceptProperty;
const num = (name: string, unit?: string, range?: string, definition?: string): P => ({ name, datatype: 'number', ...(unit ? { unit } : {}), ...(range ? { range } : {}), ...(definition ? { definition } : {}) });
const txt = (name: string, definition?: string): P => ({ name, datatype: 'text', ...(definition ? { definition } : {}) });
const code = (name: string, definition?: string): P => ({ name, datatype: 'code', ...(definition ? { definition } : {}) });
const day = (name: string, definition?: string): P => ({ name, datatype: 'date', ...(definition ? { definition } : {}) });
const flag = (name: string, definition?: string): P => ({ name, datatype: 'boolean', ...(definition ? { definition } : {}) });

const conceptProperties: Record<string, P[]> = {
  'core:Site': [txt('Region'), code('Time zone', 'IANA time zone'), txt('Address'), num('Latitude', '°', '-90–90'), num('Longitude', '°', '-180–180')],
  'core:FunctionalLocation': [txt('Reference designation', 'IEC 81346 designation of the function'), code('Structure indicator'), code('Operational status'), code('Criticality')],
  'core:PhysicalAsset': [txt('Serial number'), txt('Manufacturer'), txt('Model'), day('Install date'), day('Commissioning date'), num('Expected life', 'a', '1–100'), num('Replacement value', 'GBP'), code('Operational status'), day('Warranty end date')],
  'core:AssetClass': [code('Class code'), code('Parent class')],
  'core:MeasurementPoint': [code('Unit', 'UCUM unit code'), flag('Cumulative'), num('Upper limit'), num('Lower limit'), code('Reading frequency')],
  'core:FailureMode': [code('Code'), txt('Description'), code('Scheme', 'Code scheme, such as ISO 14224 Table B.6')],
  'core:FailureCause': [code('Code'), txt('Description'), code('Cause category')],
  'core:MaintenancePlan': [num('Interval'), code('Interval unit'), code('Trigger type', 'Calendar, meter or condition'), num('Lead time', 'd'), day('Next due date')],
  'core:Task': [num('Duration', 'h'), code('Craft'), txt('Safety precautions'), code('Permit type')],
  'core:WorkOrder': [code('Status'), code('Priority'), code('Work type'), day('Reported date'), day('Target finish'), num('Actual labour', 'h'), num('Actual cost', 'GBP')],
  'core:Resource': [code('Craft code'), num('Hourly rate', 'GBP/h'), txt('Qualification')],
  'core:SparePart': [code('Part number'), num('Quantity', '1'), code('Unit of issue')],
  'core:Document': [code('Document type'), code('Revision'), day('Issue date')],
  'core:AssetSystem': [txt('Required function'), code('Service level')],
  'core:MaintainableItem': [code('Item type'), txt('Position on parent'), num('Mean time to repair', 'h')],
  'core:ConditionAssessment': [num('Condition grade', '1', '1–5', '1 very good, 5 very poor'), day('Assessment date'), code('Method', 'Visual, test, monitoring'), txt('Assessor'), num('Remaining useful life', 'a')],
  'core:WorkRequest': [code('Status'), day('Reported date'), txt('Reported by'), code('Symptom code')],
  'util:PumpingStation': [num('Duty pumps', '1'), num('Standby pumps', '1'), num('Wet well volume', 'm³'), code('Station type', 'Booster, lift, raw water, treated water')],
  'util:ProcessSystem': [code('Process type', 'Filtration, dosing, aeration, disinfection')],
  'util:Substation': [code('Bay type', 'Transformer, feeder, bus section, incomer'), num('Circuits', '1')],
  'util:TreatmentWorks': [num('Design throughput', 'm³/d', '100–1500000'), code('Treatment type'), num('Population equivalent', '1'), flag('Regulated site')],
  'util:ServiceReservoir': [num('Capacity', 'm³', '50–200000'), num('Top water level', 'm AOD'), num('Bottom water level', 'm AOD'), num('Cells', '1', '1–6')],
  'util:PressureZone': [num('Connected properties', '1'), num('Average zone night pressure', 'm', '10–100'), num('Inlets', '1'), num('Night flow', 'l/s')],
  'util:Borehole': [num('Depth', 'm', '10–500'), num('Licensed abstraction', 'm³/d'), num('Rest water level', 'm bgl'), code('Aquifer')],
  'util:PrimarySubstation': [num('Firm capacity', 'MVA', '5–240'), txt('Voltage ratio', 'For example 33/11 kV'), num('Bays', '1')],
  'util:SecondarySubstation': [num('Transformer rating', 'kVA', '50–2000'), num('Customers supplied', '1'), code('Enclosure type')],
  'util:Feeder': [num('Nominal voltage', 'kV', '0.4–66'), num('Route length', 'km'), num('Customers connected', '1'), num('Peak load', 'A')],
  'util:RotatingEquipment': [num('Rated speed', 'rpm', '100–30000'), num('Running hours', 'h', undefined, 'Cumulative; read from the runtime counter'), num('Vibration alarm', 'mm/s', '1–20')],
  'util:Pump': [num('Rated flow', 'm³/h'), num('Rated head', 'm'), num('Rated power', 'kW'), code('Fluid pumped')],
  'util:CentrifugalPump': [code('Driver type'), code('Seal type'), num('Impeller diameter', 'mm', '80–1500'), num('Speed', 'rpm', '700–3600'), num('NPSH required', 'm', '1–15'), code('Casing material')],
  'util:SubmersiblePump': [num('Rated flow', 'm³/h', '1–3000'), num('Rated head', 'm', '5–400'), num('Rated power', 'kW', '0.5–800'), num('Cable length', 'm'), num('Setting depth', 'm'), code('Impeller type')],
  'util:PositiveDisplacementPump': [num('Displacement', 'L/rev'), num('Rated pressure', 'bar', '1–40'), num('Rated flow', 'm³/h', '0.01–500'), num('Speed', 'rpm', '20–1800')],
  'util:MeteringPump': [num('Maximum dose rate', 'L/h', '0.1–2000'), num('Stroke length', '%', '0–100'), txt('Turndown ratio'), code('Chemical')],
  'util:ElectricMotor': [num('Rated current', 'A'), code('Efficiency class', 'IEC 60034-30-1 IE class'), code('Frame size'), code('Insulation class'), code('IP rating'), num('Poles', '1', '2–12')],
  'util:InductionMotor': [code('Starting method', 'DOL, star-delta, soft start, VSD'), code('Enclosure', 'TEFC, ODP, submersible')],
  'util:Blower': [num('Discharge pressure', 'mbar', '200–1200'), num('Rated power', 'kW', '5–500'), code('Blower type', 'Rotary lobe, screw, turbo')],
  'util:Compressor': [num('Free air delivery', 'm³/min', '0.1–100'), num('Discharge pressure', 'bar', '5–15'), num('Rated power', 'kW', '1–500')],
  'util:Generator': [num('Rated output', 'kVA', '10–5000'), num('Voltage', 'V'), code('Fuel type'), num('Fuel tank capacity', 'L'), num('Autonomy', 'h')],
  'util:Mixer': [num('Rated power', 'kW', '0.5–50'), num('Propeller diameter', 'mm'), num('Speed', 'rpm')],
  'util:Valve': [num('Pressure rating', 'bar', '6–40', 'PN class'), code('Body material'), code('Normal position', 'Normally open or normally closed'), code('End connection')],
  'util:PressureReducingValve': [num('Inlet pressure', 'bar'), num('Outlet set point', 'bar', '0.5–16'), code('Pilot type')],
  'util:AirValve': [code('Orifice type', 'Single, double, triple')],
  'util:ControlValve': [num('Flow coefficient Kv', 'm³/h'), code('Characteristic', 'Linear, equal percentage'), code('Fail position')],
  'util:Hydrant': [code('Hydrant type', 'Pillar or underground'), num('Outlet size', 'mm', '50–150'), num('Test flow', 'l/s'), day('Last inspection')],
  'util:ValveActuator': [num('Output torque', 'N·m', '10–50000'), num('Supply voltage', 'V'), num('Operating time', 's'), code('Fail-safe action')],
  'util:Instrument': [code('Measured variable'), txt('Measuring range'), code('Output signal', '4–20 mA, HART, Modbus, Profibus'), num('Calibration interval', 'd', '30–1095'), num('Accuracy', '%')],
  'util:FlowMeter': [code('Technology', 'Electromagnetic, ultrasonic, mechanical'), num('Pipe diameter', 'mm', '15–3000'), num('Accuracy', '%', '0.1–5')],
  'util:PressureTransmitter': [num('Upper range limit', 'bar', '0.1–400')],
  'util:LevelTransmitter': [num('Measuring span', 'm', '0.1–40'), code('Technology', 'Ultrasonic, radar, hydrostatic')],
  'util:WaterQualityAnalyser': [code('Parameter', 'Free chlorine, turbidity, pH, conductivity'), flag('Regulatory monitoring point')],
  'util:WaterMeter': [num('Meter size', 'mm', '15–600'), num('Permanent flow Q3', 'm³/h'), num('Register reading', 'm³'), txt('Metrological ratio', 'R value under ISO 4064'), code('Read type', 'Manual, AMR, AMI')],
  'util:ElectricityMeter': [code('Accuracy class'), txt('CT ratio'), code('Communications'), num('Register reading', 'kWh')],
  'util:CurrentTransformer': [txt('Ratio', 'For example 400/1 A'), code('Accuracy class'), num('Burden', 'VA')],
  'util:VoltageTransformer': [txt('Ratio', 'For example 11000/110 V'), code('Accuracy class'), num('Burden', 'VA')],
  'util:DistributionTransformer': [num('Secondary voltage', 'V', '230–1000'), code('Vector group'), num('Impedance', '%', '2–8'), code('Mounting', 'Pole or ground'), num('Year of manufacture', 'a')],
  'util:PowerTransformer': [num('Rating', 'MVA', '5–240'), txt('Voltage ratio'), code('Vector group'), code('Cooling type', 'ONAN, ONAF, OFAF'), num('Oil volume', 'L'), num('Impedance', '%', '6–20')],
  'util:CircuitBreaker': [num('Rated voltage', 'kV'), code('Operating mechanism'), num('Operation count', '1'), num('Trip time', 'ms', '20–120')],
  'util:Switchgear': [num('Rated current', 'A'), code('Insulation medium', 'SF6, air, vacuum, solid'), num('Panels', '1'), num('Short-time withstand', 'kA', '12.5–63')],
  'util:ElectricalEquipment': [num('Rated voltage', 'kV')],
  'util:Busbar': [num('Rated current', 'A'), num('Short-time withstand', 'kA')],
  'util:Disconnector': [num('Rated current', 'A'), num('Rated voltage', 'kV'), code('Operating mechanism')],
  'util:ProtectionRelay': [txt('Protection functions', 'ANSI device numbers, such as 50/51, 87T'), txt('Firmware version'), code('Settings group'), txt('Logical device', 'IEC 61850 logical device name')],
  'util:VariableSpeedDrive': [num('Rated power', 'kW', '0.37–3000'), num('Rated current', 'A'), num('Supply voltage', 'V'), txt('Output frequency range', 'Hz'), txt('Firmware version')],
  'util:SoftStarter': [num('Rated current', 'A'), num('Ramp time', 's')],
  'util:MotorControlCentre': [num('Busbar rating', 'A'), code('Form of separation', 'IEC 61439 form 1–4')],
  'util:SubstationBattery': [num('Nominal voltage', 'V DC', '24–220'), num('Capacity', 'Ah'), code('Battery type'), num('Autonomy', 'h')],
  'util:Pole': [code('Material'), num('Height', 'm', '7–25'), code('Treatment'), day('Last test date'), code('Test result')],
  'util:TransformerRectifier': [num('Rated output voltage', 'V DC'), num('Rated output current', 'A'), num('Output setting', 'A')],
  'util:TapChanger': [num('Tap positions', '1', '5–33'), num('Step voltage', '%'), num('Operation count', '1')],
  'util:Bushing': [num('Rated voltage', 'kV'), num('Rated current', 'A'), num('Dissipation factor', '%', '0.1–1'), num('Capacitance', 'pF')],
  'util:Winding': [num('Insulation resistance', 'MΩ'), num('Hot spot temperature', '°C', '40–140'), num('Polarisation index', '1')],
  'util:CoolingSystem': [code('Cooling stage'), num('Fans', '1')],
  'util:MechanicalSeal': [code('Seal arrangement', 'Single, double, tandem'), code('Seal plan', 'API 682 piping plan'), code('Face material')],
  'util:Bearing': [code('Bearing designation', 'ISO 15 designation, such as 6312-2Z'), code('Lubrication'), num('Relubrication interval', 'h')],
  'util:Impeller': [num('Diameter', 'mm'), code('Material'), num('Vanes', '1')],
  'util:Coupling': [code('Coupling type'), num('Alignment tolerance', 'mm')],
  'util:Anode': [code('Anode material', 'Magnesium, zinc, MMO, graphite'), num('Mass', 'kg'), num('Design life', 'a')],
  'util:ControlEquipment': [txt('Firmware version'), num('I/O count', '1')],
  'util:RemoteTerminalUnit': [code('Protocol', 'DNP3, IEC 60870-5-104, Modbus'), code('Communications bearer'), num('Battery autonomy', 'h')],
  'util:PLC': [code('Platform'), txt('Program version')],
  'util:SCADASystem': [code('Platform'), num('Tag count', '1'), code('Historian')],
  'util:Chlorinator': [code('Chemical', 'Sodium hypochlorite, chlorine gas'), num('Maximum dose rate', 'kg/day'), flag('Regulatory monitoring point')],
  'util:RapidGravityFilter': [num('Filter area', 'm²', '5–200'), code('Media type'), num('Media depth', 'mm', '500–2000'), num('Filtration rate', 'm/h', '4–15'), num('Backwash interval', 'h')],
  'util:UVReactor': [num('Validated dose', 'mJ/cm²', '16–186'), num('Lamps', '1'), num('Lamp hours', 'h'), num('Validated flow', 'm³/h')],
  'util:StorageTank': [num('Capacity', 'm³'), code('Material'), code('Contents'), num('Bund capacity', '%', '110–150')],
  'util:InletScreen': [num('Aperture', 'mm', '1–100'), code('Screen type')],
  'util:LinearAsset': [num('Length', 'm'), txt('Start node'), txt('End node'), txt('GIS identifier')],
  'util:WaterMain': [num('Nominal diameter', 'mm', '50–2000'), code('Material', 'DI, CI, PE, PVC, AC, steel'), num('Install year', 'a'), num('Pressure rating', 'bar'), code('Lining')],
  'util:SewerMain': [num('Diameter', 'mm', '100–3000'), code('Material'), num('Gradient', '%'), num('Structural grade', '1', '1–5', 'Sewer condition grade')],
  'util:ServiceConnection': [num('Diameter', 'mm', '15–63'), code('Material'), flag('Lead pipe'), txt('Property reference')],
  'util:PowerCable': [num('Conductor size', 'mm²', '16–1000'), code('Conductor material'), code('Insulation type', 'XLPE, PILC, EPR'), num('Voltage', 'kV')],
  'util:OverheadLine': [code('Conductor type'), num('Span length', 'm'), num('Voltage', 'kV')],
  'util:CathodicProtectionSystem': [code('Protection type', 'Impressed current or sacrificial anode'), num('Design current', 'A'), txt('Protected structure'), num('Protection criterion', 'mV', undefined, 'Pipe-to-soil potential against Cu/CuSO₄, typically -850 mV')],
  'util:TestPost': [num('Pipe-to-soil potential', 'mV', '-1200–-500'), day('Last survey date')],
  'util:RuntimeHours': [num('Reading', 'h'), flag('Replacement reading', 'True when the reading follows a meter replacement')],
  'util:VibrationLevel': [num('Velocity RMS', 'mm/s', '0–45'), code('Measurement direction', 'Horizontal, vertical, axial'), code('Zone', 'ISO 20816 evaluation zone A–D')],
  'util:DissolvedGas': [num('Hydrogen', 'ppm'), num('Acetylene', 'ppm'), num('Total dissolved combustible gas', 'ppm'), code('Duval triangle zone')],
};

// ---------------- Relationship types and relationships ----------------

export const relationTypes: RelationTypeDef[] = [
  { id: 'isA', label: 'is a kind of', inverse: 'hasSubtype', definition: 'Every instance of this concept is also an instance of the target.', standard: 'OWL subClassOf' },
  { id: 'hasSubtype', label: 'has subtype', inverse: 'isA', definition: 'The target is a more specific kind of this concept.', standard: 'OWL subClassOf' },
  { id: 'partOf', label: 'part of', inverse: 'hasPart', definition: 'Is a component of the target; it is maintained with, and contributes to, the function of the target.', standard: 'ISO 14224 taxonomy · IEC 81346' },
  { id: 'hasPart', label: 'has part', inverse: 'partOf', definition: 'The target is a component of this concept.', standard: 'ISO 14224 taxonomy · IEC 81346' },
  { id: 'locatedIn', label: 'located in', inverse: 'contains', definition: 'Is installed at, or housed within, the target place.', standard: 'IEC 81346 · CIM EquipmentContainer' },
  { id: 'contains', label: 'contains', inverse: 'locatedIn', definition: 'The target is installed at or housed within this place.', standard: 'IEC 81346 · CIM EquipmentContainer' },
  { id: 'drives', label: 'drives', inverse: 'drivenBy', definition: 'Supplies mechanical power to the target through a shaft or coupling.', standard: 'ISO 14224 driver / driven unit' },
  { id: 'drivenBy', label: 'driven by', inverse: 'drives', definition: 'Receives mechanical power from the target.', standard: 'ISO 14224 driver / driven unit' },
  { id: 'feeds', label: 'feeds', inverse: 'fedBy', definition: 'Supplies the target with water, product or electrical energy.', standard: 'CIM Terminal connectivity' },
  { id: 'fedBy', label: 'fed by', inverse: 'feeds', definition: 'Receives water, product or electrical energy from the target.', standard: 'CIM Terminal connectivity' },
  { id: 'protects', label: 'protects', inverse: 'protectedBy', definition: 'Detects or prevents a hazardous condition on the target, such as fault current or corrosion.', standard: 'IEC 61850 · CIM ProtectionEquipment' },
  { id: 'protectedBy', label: 'protected by', inverse: 'protects', definition: 'Is kept safe from a hazardous condition by the target.', standard: 'IEC 61850 · CIM ProtectionEquipment' },
  { id: 'measures', label: 'measures', inverse: 'measuredBy', definition: 'Senses, counts or records a quantity of the target.', standard: 'MIMOSA CCOM · CIM Measurement' },
  { id: 'measuredBy', label: 'measured by', inverse: 'measures', definition: 'A quantity of this concept is sensed or recorded by the target.', standard: 'MIMOSA CCOM · CIM Measurement' },
  { id: 'controls', label: 'controls', inverse: 'controlledBy', definition: 'Sets or changes the operating state or output of the target.', standard: 'IEC 61131 · CIM Control' },
  { id: 'controlledBy', label: 'controlled by', inverse: 'controls', definition: 'Has its operating state or output set by the target.', standard: 'IEC 61131 · CIM Control' },
  { id: 'monitors', label: 'monitors', inverse: 'monitoredBy', definition: 'Collects status, alarms or condition of the target without operating it.', standard: 'IEC 60870-5 · MIMOSA CCOM' },
  { id: 'monitoredBy', label: 'monitored by', inverse: 'monitors', definition: 'Has its status, alarms or condition collected by the target.', standard: 'IEC 60870-5 · MIMOSA CCOM' },
  { id: 'maintains', label: 'maintains', inverse: 'maintainedBy', definition: 'Plans or records maintenance work on the target.', standard: 'ISO 55000 · EN 13306' },
  { id: 'maintainedBy', label: 'maintained by', inverse: 'maintains', definition: 'Has maintenance planned or recorded by the target.', standard: 'ISO 55000 · EN 13306' },
  { id: 'supports', label: 'supports', inverse: 'supportedBy', definition: 'Carries the target mechanically.', standard: 'CIM Structure' },
  { id: 'supportedBy', label: 'supported by', inverse: 'supports', definition: 'Is carried mechanically by the target.', standard: 'CIM Structure' },
  { id: 'requires', label: 'requires', inverse: 'requiredBy', definition: 'Needs the target to be carried out or kept in service.', standard: 'ISO 55000' },
  { id: 'requiredBy', label: 'required by', inverse: 'requires', definition: 'Is needed by the target.', standard: 'ISO 55000' },
  { id: 'describes', label: 'describes', inverse: 'describedBy', definition: 'Identifies, documents or qualifies the target.', standard: 'ISO 55000' },
  { id: 'describedBy', label: 'described by', inverse: 'describes', definition: 'Is identified, documented or qualified by the target.', standard: 'ISO 55000' },
  { id: 'connectedTo', label: 'connected to', inverse: 'connectedTo', definition: 'Is physically or logically connected to the target, with no direction of flow implied.', standard: 'CIM ConnectivityNode' },
];
export const relationTypeById = new Map(relationTypes.map((t) => [t.id, t]));

/** Concepts whose `parent` means "belongs to" rather than "is a kind of". */
const qualifierConcepts = new Set(['core:SerialNumber', 'core:AssetCriticality', 'core:WorkPriority']);

type R = [from: string, type: RelationType, to: string, cardinality?: Cardinality, note?: string];
export const relationships: R[] = [
  // Core structure and maintenance
  ['core:FunctionalLocation', 'partOf', 'core:Site', '1'],
  ['core:PhysicalAsset', 'locatedIn', 'core:FunctionalLocation', '0..1', 'Installed position; a spare in stock has none'],
  ['core:PhysicalAsset', 'partOf', 'core:AssetSystem', '0..*'],
  ['core:MaintainableItem', 'partOf', 'core:PhysicalAsset', '1'],
  ['core:PhysicalAsset', 'requires', 'core:SparePart', '0..*', 'Spare parts list'],
  ['core:MeasurementPoint', 'measures', 'core:PhysicalAsset', '0..1'],
  ['core:MeasurementPoint', 'measures', 'core:FunctionalLocation', '0..1'],
  ['core:ConditionAssessment', 'monitors', 'core:PhysicalAsset', '1'],
  ['core:MaintenancePlan', 'maintains', 'core:PhysicalAsset', '0..*'],
  ['core:MaintenancePlan', 'maintains', 'core:FunctionalLocation', '0..*'],
  ['core:MaintenancePlan', 'requires', 'core:Task', '1..*'],
  ['core:Task', 'requires', 'core:Resource', '0..*'],
  ['core:Task', 'requires', 'core:SparePart', '0..*'],
  ['core:WorkOrder', 'maintains', 'core:PhysicalAsset', '0..1'],
  ['core:WorkOrder', 'maintains', 'core:FunctionalLocation', '0..1'],
  ['core:WorkOrder', 'requires', 'core:Task', '0..*'],
  ['core:WorkOrder', 'describedBy', 'core:FailureMode', '0..1', 'Reported failure mode'],
  ['core:WorkOrder', 'describedBy', 'core:FailureCause', '0..1', 'Recorded cause'],
  ['core:WorkRequest', 'describedBy', 'core:FailureMode', '0..1', 'Symptom'],
  ['core:WorkRequest', 'locatedIn', 'core:FunctionalLocation', '0..1', 'Where the defect was found'],
  ['core:SerialNumber', 'describes', 'core:PhysicalAsset', '1'],
  ['core:AssetCriticality', 'describes', 'core:PhysicalAsset', '1'],
  ['core:WorkPriority', 'describes', 'core:WorkOrder', '1'],
  ['core:AssetClass', 'describes', 'core:PhysicalAsset', '0..*'],
  ['core:Document', 'describes', 'core:PhysicalAsset', '0..*'],
  ['core:Document', 'describes', 'core:FunctionalLocation', '0..*'],

  // Water supply chain
  ['util:Borehole', 'feeds', 'util:TreatmentWorks', '1'],
  ['util:TreatmentWorks', 'feeds', 'util:ServiceReservoir', '0..*'],
  ['util:PumpingStation', 'feeds', 'util:ServiceReservoir', '0..*'],
  ['util:PumpingStation', 'feeds', 'util:PressureZone', '0..*', 'Booster supply'],
  ['util:ServiceReservoir', 'feeds', 'util:PressureZone', '0..*'],
  ['util:WaterMain', 'locatedIn', 'util:PressureZone', '0..1'],
  ['util:WaterMain', 'feeds', 'util:ServiceConnection', '0..*'],
  ['util:Hydrant', 'connectedTo', 'util:WaterMain', '1'],
  ['util:Hydrant', 'locatedIn', 'util:PressureZone', '0..1'],
  ['util:Valve', 'connectedTo', 'util:WaterMain', '0..1'],
  ['util:Valve', 'locatedIn', 'util:PumpingStation', '0..1'],
  ['util:PressureReducingValve', 'controls', 'util:PressureZone', '0..1', 'Holds inlet pressure'],
  ['util:SewerMain', 'feeds', 'util:PumpingStation', '0..1', 'Wastewater lift station'],
  ['util:SewerMain', 'feeds', 'util:TreatmentWorks', '0..1'],
  ['util:ProcessSystem', 'partOf', 'util:TreatmentWorks', '0..1'],

  // Pump sets and drives
  ['util:Pump', 'locatedIn', 'util:PumpingStation', '0..1'],
  ['util:SubmersiblePump', 'locatedIn', 'util:Borehole', '0..1'],
  ['util:ElectricMotor', 'drives', 'util:Pump', '0..1'],
  ['util:ElectricMotor', 'drives', 'util:Blower', '0..1'],
  ['util:ElectricMotor', 'drives', 'util:Compressor', '0..1'],
  ['util:ElectricMotor', 'drives', 'util:Mixer', '0..1'],
  ['util:Pump', 'hasPart', 'util:Impeller', '1..*'],
  ['util:Pump', 'hasPart', 'util:MechanicalSeal', '0..*'],
  ['util:RotatingEquipment', 'hasPart', 'util:Bearing', '0..*'],
  ['util:RotatingEquipment', 'hasPart', 'util:Coupling', '0..1'],
  ['util:Blower', 'hasPart', 'util:Impeller', '0..*'],
  ['util:ElectricMotor', 'hasPart', 'util:Winding', '1..*'],
  ['util:VariableSpeedDrive', 'controls', 'util:ElectricMotor', '1..*'],
  ['util:SoftStarter', 'controls', 'util:ElectricMotor', '1'],
  ['util:MotorControlCentre', 'feeds', 'util:ElectricMotor', '0..*'],
  ['util:MotorControlCentre', 'feeds', 'util:VariableSpeedDrive', '0..*'],
  ['util:MotorControlCentre', 'feeds', 'util:SoftStarter', '0..*'],
  ['util:MotorControlCentre', 'locatedIn', 'util:PumpingStation', '0..1'],
  ['util:Generator', 'feeds', 'util:MotorControlCentre', '0..*', 'On loss of network supply'],
  ['util:Valve', 'hasPart', 'util:ValveActuator', '0..1'],
  ['util:RuntimeHours', 'measures', 'util:RotatingEquipment', '1'],
  ['util:VibrationLevel', 'measures', 'util:RotatingEquipment', '1'],

  // Treatment and dosing
  ['util:Chlorinator', 'locatedIn', 'util:TreatmentWorks', '0..1'],
  ['util:Chlorinator', 'hasPart', 'util:MeteringPump', '0..*'],
  ['util:StorageTank', 'feeds', 'util:MeteringPump', '0..*'],
  ['util:RapidGravityFilter', 'locatedIn', 'util:TreatmentWorks', '1'],
  ['util:UVReactor', 'locatedIn', 'util:TreatmentWorks', '1'],
  ['util:InletScreen', 'locatedIn', 'util:TreatmentWorks', '0..1'],
  ['util:Blower', 'locatedIn', 'util:ProcessSystem', '0..1'],
  ['util:Mixer', 'locatedIn', 'util:ProcessSystem', '0..1'],

  // Measurement
  ['util:FlowMeter', 'measures', 'util:WaterMain', '0..1'],
  ['util:WaterMeter', 'measures', 'util:ServiceConnection', '0..1'],
  ['util:WaterMeter', 'measures', 'util:PressureZone', '0..1', 'District inlet meter'],
  ['util:PressureTransmitter', 'measures', 'util:Pump', '0..1', 'Discharge pressure'],
  ['util:PressureTransmitter', 'measures', 'util:WaterMain', '0..1'],
  ['util:LevelTransmitter', 'measures', 'util:ServiceReservoir', '0..1'],
  ['util:LevelTransmitter', 'measures', 'util:StorageTank', '0..1'],
  ['util:WaterQualityAnalyser', 'measures', 'util:TreatmentWorks', '0..1', 'Final water quality'],
  ['util:WaterQualityAnalyser', 'measures', 'util:ServiceReservoir', '0..1'],
  ['util:ElectricityMeter', 'measures', 'util:Feeder', '0..1'],
  ['util:CurrentTransformer', 'measures', 'util:Feeder', '0..1'],
  ['util:DissolvedGas', 'measures', 'util:PowerTransformer', '1'],

  // Control and telemetry
  ['util:PLC', 'controls', 'util:Pump', '0..*'],
  ['util:PLC', 'controls', 'util:Valve', '0..*'],
  ['util:PLC', 'controls', 'util:Blower', '0..*'],
  ['util:PLC', 'controls', 'util:Chlorinator', '0..*'],
  ['util:PLC', 'controls', 'util:VariableSpeedDrive', '0..*'],
  ['util:PLC', 'connectedTo', 'util:RemoteTerminalUnit', '0..1'],
  ['util:WaterQualityAnalyser', 'connectedTo', 'util:PLC', '0..1', 'Dose control loop'],
  ['util:RemoteTerminalUnit', 'partOf', 'util:SCADASystem', '1'],
  ['util:RemoteTerminalUnit', 'monitors', 'util:PumpingStation', '0..1'],
  ['util:RemoteTerminalUnit', 'monitors', 'util:ServiceReservoir', '0..1'],
  ['util:RemoteTerminalUnit', 'monitors', 'util:Borehole', '0..1'],
  ['util:RemoteTerminalUnit', 'monitors', 'util:Substation', '0..1'],
  ['util:SCADASystem', 'monitors', 'util:TreatmentWorks', '0..*'],
  ['util:SCADASystem', 'monitors', 'util:PrimarySubstation', '0..*'],

  // Electrical network
  ['util:Substation', 'partOf', 'util:PrimarySubstation', '0..1'],
  ['util:PrimarySubstation', 'feeds', 'util:Feeder', '1..*'],
  ['util:Feeder', 'feeds', 'util:SecondarySubstation', '0..*'],
  ['util:Feeder', 'feeds', 'util:DistributionTransformer', '0..*'],
  ['util:PowerCable', 'partOf', 'util:Feeder', '0..1'],
  ['util:OverheadLine', 'partOf', 'util:Feeder', '0..1'],
  ['util:Pole', 'supports', 'util:OverheadLine', '1..*'],
  ['util:Pole', 'supports', 'util:DistributionTransformer', '0..1', 'Pole-mounted transformer'],
  ['util:DistributionTransformer', 'locatedIn', 'util:SecondarySubstation', '0..1'],
  ['util:PowerTransformer', 'locatedIn', 'util:PrimarySubstation', '1'],
  ['util:PowerTransformer', 'feeds', 'util:Busbar', '1..*'],
  ['util:PowerTransformer', 'hasPart', 'util:TapChanger', '0..1'],
  ['util:PowerTransformer', 'hasPart', 'util:Bushing', '1..*'],
  ['util:PowerTransformer', 'hasPart', 'util:Winding', '1..*'],
  ['util:PowerTransformer', 'hasPart', 'util:CoolingSystem', '0..1'],
  ['util:DistributionTransformer', 'hasPart', 'util:Bushing', '1..*'],
  ['util:DistributionTransformer', 'hasPart', 'util:Winding', '1..*'],
  ['util:Switchgear', 'locatedIn', 'util:Substation', '0..1'],
  ['util:Switchgear', 'locatedIn', 'util:SecondarySubstation', '0..1', 'Ring main unit'],
  ['util:Switchgear', 'hasPart', 'util:CircuitBreaker', '0..*'],
  ['util:Switchgear', 'hasPart', 'util:Busbar', '1..*'],
  ['util:Switchgear', 'hasPart', 'util:Disconnector', '0..*'],
  ['util:Switchgear', 'hasPart', 'util:CurrentTransformer', '0..*'],
  ['util:Switchgear', 'hasPart', 'util:VoltageTransformer', '0..*'],
  ['util:CircuitBreaker', 'protects', 'util:Feeder', '0..1'],
  ['util:CircuitBreaker', 'protects', 'util:PowerTransformer', '0..1'],
  ['util:ProtectionRelay', 'protects', 'util:Feeder', '0..*'],
  ['util:ProtectionRelay', 'protects', 'util:PowerTransformer', '0..*'],
  ['util:ProtectionRelay', 'protects', 'util:Busbar', '0..*'],
  ['util:ProtectionRelay', 'protects', 'util:ElectricMotor', '0..*', 'Motor protection relay'],
  ['util:ProtectionRelay', 'controls', 'util:CircuitBreaker', '1..*', 'Trip and close commands'],
  ['util:ProtectionRelay', 'connectedTo', 'util:RemoteTerminalUnit', '0..1', 'Station bus or serial link'],
  ['util:CurrentTransformer', 'connectedTo', 'util:ProtectionRelay', '0..*'],
  ['util:VoltageTransformer', 'connectedTo', 'util:ProtectionRelay', '0..*'],
  ['util:SubstationBattery', 'feeds', 'util:ProtectionRelay', '0..*', 'DC auxiliary supply'],
  ['util:SubstationBattery', 'feeds', 'util:CircuitBreaker', '0..*', 'Trip coil supply'],
  ['util:SubstationBattery', 'locatedIn', 'util:PrimarySubstation', '0..1'],

  // Corrosion protection
  ['util:CathodicProtectionSystem', 'protects', 'util:WaterMain', '0..*'],
  ['util:CathodicProtectionSystem', 'protects', 'util:StorageTank', '0..*'],
  ['util:CathodicProtectionSystem', 'hasPart', 'util:TransformerRectifier', '0..*'],
  ['util:CathodicProtectionSystem', 'hasPart', 'util:Anode', '1..*'],
  ['util:CathodicProtectionSystem', 'hasPart', 'util:TestPost', '0..*'],
  ['util:TestPost', 'monitors', 'util:CathodicProtectionSystem', '1'],
];

export const conceptById = new Map(concepts.map((c) => [c.id, c]));

/** Builds properties and both directions of every relationship onto a list of concepts. */
export function linkConcepts(list: Concept[], rels: R[], extraProps: Record<string, P[]> = {}, origin: 'release' | 'extension' = 'release') {
  const byId = new Map(list.map((c) => [c.id, c]));
  const pushRel = (c: Concept | undefined, r: ConceptRelation) => {
    if (!c) return;
    c.relations ??= [];
    if (!c.relations.some((x) => x.type === r.type && x.target === r.target)) c.relations.push(r);
  };
  for (const c of list) {
    const own = (extraProps[c.id] ?? []).map((p) => ({ ...p, origin: p.origin ?? origin }));
    const fromAttributes = c.attributes.map<P>((a) => ({ name: a.name, datatype: a.unit && a.name !== 'Unit' ? 'number' : 'text', ...(a.unit ? { unit: a.unit } : {}), ...(a.range ? { range: a.range } : {}), origin }));
    const merged = [...(c.properties ?? [])];
    for (const p of [...fromAttributes, ...own]) {
      const i = merged.findIndex((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (i < 0) merged.push(p); else merged[i] = { ...merged[i], ...Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'origin')), datatype: p.datatype ?? merged[i].datatype };
    }
    c.properties = merged;
    c.relations ??= [];
    if (c.parent && byId.has(c.parent)) {
      const t: RelationType = qualifierConcepts.has(c.id) ? 'describes' : 'isA';
      if (t === 'isA') {
        pushRel(c, { type: 'isA', target: c.parent, cardinality: '1', derived: true, origin: 'release' });
        pushRel(byId.get(c.parent), { type: 'hasSubtype', target: c.id, derived: true, origin: 'release' });
      }
    }
  }
  for (const [from, type, to, cardinality, note] of rels) {
    const inv = relationTypeById.get(type)!.inverse;
    pushRel(byId.get(from), { type, target: to, ...(cardinality ? { cardinality } : {}), ...(note ? { note } : {}), origin });
    pushRel(byId.get(to), { type: inv, target: from, ...(note ? { note } : {}), derived: true, origin });
  }
}

for (const c of concepts) if (!c.category) c.category = c.layer === 'L0' ? 'Core' : releaseCategory[c.id] ?? 'Other';
linkConcepts(concepts, relationships, conceptProperties);

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
  { id: 'IEC 61850', contributes: 'Substation automation: logical nodes for protection, control and measurement', usedIn: 'Protection relays, SCADA' },
  { id: 'IEC 61968 / 61970', contributes: 'CIM classes and connectivity for distribution and transmission networks', usedIn: 'Electrical network, relationships' },
  { id: 'IEC 60076', contributes: 'Power transformer ratings, cooling and tap changers', usedIn: 'Transformers and components' },
  { id: 'IEC 62271', contributes: 'High-voltage switchgear, breakers and disconnectors', usedIn: 'Switchgear' },
  { id: 'ISO 4064', contributes: 'Water meter metrology: Q3, R ratio, accuracy classes', usedIn: 'Water meters' },
  { id: 'ISO 15589-1 / EN 12954', contributes: 'Cathodic protection design and criteria', usedIn: 'Corrosion protection' },
  { id: 'ISO 20816', contributes: 'Vibration evaluation zones for rotating machinery', usedIn: 'Condition measurements' },
  { id: 'IEC 61131', contributes: 'Programmable controller languages and behaviour', usedIn: 'Control and telemetry' },
];

export const ontologyChangeLog: { version: string; date: string; change: string; reason: string; source: string; author: string }[] = [
  { version: '2.5.0', date: '2026-10-28', change: `${concepts.length - releaseConceptCount} new concepts: pump, valve and motor subtypes, VSDs, MCCs, protection relays, power transformer components, meters, reservoirs, mains, hydrants, SCADA and RTUs, cathodic protection`, reason: 'ISO 14224 taxonomy, IEC CIM and IEC 61850 coverage for utilities', source: 'Standard', author: 'Curator' },
  { version: '2.5.0', date: '2026-10-28', change: `${relationships.length} typed relationships across ${new Set(relationTypes.map((t) => [t.id, t.inverse].sort().join('/'))).size} relationship types, with inverses and cardinality`, reason: 'Agents and the hierarchy rules need explicit structure, not only parents', source: 'Standard', author: 'Curator' },
  { version: '2.5.0', date: '2026-10-28', change: 'Properties with datatype, unit (UCUM) and plausible range on every equipment class', reason: 'Semantic validation and AI-ready asset export', source: 'Expert review', author: 'Curator' },
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
