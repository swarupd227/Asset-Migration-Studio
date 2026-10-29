// Shared domain types. The web app imports these as type-only imports (alias @shared/types).

export type StageStatus = 'done' | 'running' | 'waiting' | 'ready' | 'locked';

export interface Stage {
  n: number;
  key: string;
  name: string;
  summary: string;
  agents: string[];
  status: StageStatus;
  previewEligible: boolean;
  startedAt?: string;
  finishedAt?: string;
  metric?: string;
}

export interface AgentDef {
  id: string;
  name: string;
  job: string;
  guardrail: string;
  icon: string;
}

export interface Project {
  id: string;
  name: string;
  customer: string;
  mode: 'delivery' | 'preview';
  sourceSystems: string[];
  target: string;
  industryPack: string;
  ontologyVersion: string;
  region: string;
  sharedLearning: boolean;
  createdAt: string;
  expiresAt?: string;
  status: string;
}

export interface Site {
  id: string;
  name: string;
  kind: 'water' | 'power';
  region: string;
}

export interface SourceAsset {
  assetnum: string;
  description: string;
  siteid: string;
  location: string;
  /** Set by the transformation when the asset's location type is not migrated (e.g. stores staging). */
  stagedIn?: string;
  parent?: string;
  classstructure?: string; // e.g. PUMP\CENTRIFUGAL; undefined for untyped
  conceptId?: string; // ontology concept resolved from the classification
  manufacturer?: string;
  model?: string;
  serialnum?: string;
  status: 'OPERATING' | 'NOT READY' | 'DECOMMISSIONED' | 'ACTIVE';
  statusDate: string;
  installDate: string;
  criticality: number; // NV_CRITCODE 1..5
  specs: Record<string, string | number>;
}

export interface SourceWorkOrder {
  wonum: string;
  description: string;
  siteid: string;
  assetnum?: string;
  location?: string;
  status: string;
  worktype: string;
  wopriority: number;
  reportdate: string;
  failurecode?: string;
  causecode?: string;
}

export interface SourcePm {
  pmnum: string;
  description: string;
  siteid: string;
  assetnum: string;
  frequency: number;
  frequnit: 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS' | 'HOURS';
  jpnum?: string;
}

export interface SourceMeter {
  assetnum: string;
  metername: string;
  cumulative: boolean;
  readings: { date: string; value: number }[];
}

export interface Dataset {
  assets: SourceAsset[];
  locations: SourceLocation[];
  workOrders: SourceWorkOrder[];
  pms: SourcePm[];
  meters: SourceMeter[];
}

export interface SourceLocation {
  location: string;
  description: string;
  siteid: string;
  parent?: string;
  type: 'SITE' | 'SYSTEM' | 'OPERATING' | 'POSITION';
  conceptId: string;
}

export type MappingStatus =
  | 'proposed'
  | 'auto_accepted'
  | 'approved'
  | 'rejected'
  | 'changed'
  | 'not_migrated'
  | 'question';

export type ReviewPath = 'auto' | 'quick' | 'expert' | 'named';

export type EvidenceType = 'metadata' | 'profile' | 'ontology' | 'code' | 'precedent' | 'reviewer';

export interface Evidence {
  type: EvidenceType;
  content: string;
  source: string;
  weight: number; // contribution to confidence, 0..1
}

export interface Precedent {
  id: string;
  signature: string;
  project: string; // anonymised, e.g. "Water utility · UK · 2025"
  outcome: 'approved' | 'rejected' | 'changed';
  count: number;
  note: string;
  /** How relevant the precedent is to this project, 1 to 5, from the decision layer. */
  relevance?: number;
}

export interface Alternative {
  concept: string;
  target: string;
  confidence: number;
  whyNot: string;
}

export type MappingKind =
  | 'one_to_one'
  | 'one_to_many'
  | 'many_to_one'
  | 'lookup'
  | 'split'
  | 'merge'
  | 'derived'
  | 'constant';

export interface Mapping {
  id: string;
  object: string; // Maximo object, e.g. ASSET
  sourceElements: string[]; // e.g. ["ASSET.SERIALNUM"]
  conceptId: string;
  conceptLabel: string;
  target: string; // e.g. "EquipmentSerial.SerialNo"
  targetNote?: string;
  kind: MappingKind;
  rule: string; // transformation rule, readable
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  safetyCritical: boolean;
  regulatory: boolean;
  path: ReviewPath;
  status: MappingStatus;
  sampled?: boolean; // part of the 10% sample of auto-accepted items
  evidence: Evidence[];
  precedents: Precedent[];
  alternatives: Alternative[];
  samples: { source: string; target: string }[];
  agent: string;
  custom?: boolean;
  version: number;
  reviewer?: string;
  reviewNote?: string;
  patternKey?: string; // items sharing an evidence pattern can be bulk-approved
  /** Review risk from the decision layer, 1 (low) to 5 (high). */
  riskScore?: number;
  /** Kind of reviewer correction, used by skill triggers. */
  correctionKind?: 'target' | 'rule' | 'concept' | 'not_migrated' | 'reject';
  decidedAt?: string;
  /** Skills that shaped this proposal. */
  skills?: { id: string; version: number; name: string }[];
}

export interface CodeRule {
  id: string;
  sourceFile: string;
  language: string;
  launchPoint: string;
  ruleText: string;
  fieldsTouched: string[];
  confidence: number;
  snippet: string;
  highlight: [number, number]; // 1-based line range
  impact: string;
  status: 'proposed' | 'confirmed' | 'dismissed';
}

export interface CatalogueTable {
  name: string;
  description: string;
  rows: number;
  fields: CatalogueField[];
  custom: boolean;
  inScope: boolean;
  ifsTarget?: string;
}

export interface CatalogueField {
  name: string;
  type: string;
  length?: number;
  description: string;
  nullRate: number;
  distinct: number;
  topValues: { value: string; pct: number }[];
  pattern?: string;
  custom: boolean;
  brokenRefs?: number;
  touchedByRule?: string;
}

export interface Concept {
  id: string;
  label: string;
  layer: 'L0' | 'L1' | 'L2' | 'L3';
  parent?: string;
  definition: string;
  synonyms: string[];
  attributes: { name: string; unit?: string; range?: string }[];
  failureModes: string[];
  allowedParents: string[];
  neverUnder?: string[];
  bindings: { maximo?: string; sap?: string; ifs?: string };
  standard?: string;
  /** Browsing group, such as "Electrical network". */
  category?: string;
  /** Characteristics with datatype and unit; includes `attributes`. */
  properties?: ConceptProperty[];
  /** Typed relationships, outgoing and derived inverse, including isA from `parent`. */
  relations?: ConceptRelation[];
}

// ---------------- Ontology relationships, properties and enhancement ----------------

export type RelationType =
  | 'isA' | 'hasSubtype' | 'partOf' | 'hasPart' | 'locatedIn' | 'contains' | 'drives' | 'drivenBy' | 'feeds' | 'fedBy'
  | 'protects' | 'protectedBy' | 'measures' | 'measuredBy' | 'controls' | 'controlledBy' | 'monitors' | 'monitoredBy'
  | 'maintains' | 'maintainedBy' | 'supports' | 'supportedBy' | 'requires' | 'requiredBy' | 'describes' | 'describedBy' | 'connectedTo';
export type Cardinality = '1' | '0..1' | '0..*' | '1..*';

export interface RelationTypeDef {
  id: RelationType;
  label: string;
  inverse: RelationType;
  definition: string;
  standard?: string;
}

export interface ConceptProperty {
  name: string;
  datatype: 'number' | 'text' | 'code' | 'date' | 'boolean';
  unit?: string;
  range?: string;
  definition?: string;
  /** 'extension' when added through an accepted ontology proposal. */
  origin?: 'release' | 'extension';
}

export interface ConceptRelation {
  type: RelationType;
  target: string;
  cardinality?: Cardinality;
  note?: string;
  /** True when computed from the inverse side or from `parent`. */
  derived?: boolean;
  origin?: 'release' | 'extension';
}

export type EnhancementKind = 'synonym' | 'property' | 'failureMode' | 'relation';
export type EnhancementSource = 'model' | 'in-environment';

export interface EnhancementItem {
  key: string;
  kind: EnhancementKind;
  /** Synonym or failure mode text. */
  value?: string;
  /** Source system a synonym comes from. */
  system?: 'general' | 'maximo' | 'sap' | 'ifs';
  property?: ConceptProperty;
  relation?: { type: RelationType; target: string; cardinality?: Cardinality };
  rationale: string;
}

export interface EnhancementSuggestion {
  conceptId: string;
  source: EnhancementSource;
  model?: string;
  summary: string;
  basis: string;
  items: EnhancementItem[];
  /** Items the model proposed that were dropped by validation, such as unknown concept ids. */
  dropped: number;
  generatedAt: string;
}

export interface OntologyProposalRecord {
  id: string;
  change: string;
  reason: string;
  source: string;
  status: 'proposed' | 'accepted' | 'rejected';
  conceptId?: string;
  kind?: EnhancementKind;
  item?: EnhancementItem;
  origin?: EnhancementSource;
  model?: string;
  proposedBy?: string;
  proposedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  version?: string;
}

export interface CodeListEntry {
  ontology: string;
  maximo: string;
  sap: string;
  ifs: string;
  match: 'exact' | 'close' | 'broader' | 'unmatched';
  count?: number;
}

export interface HierarchyNode {
  id: string;
  label: string;
  kind: 'site' | 'functional' | 'serial';
  conceptId?: string;
  classLabel?: string;
  source: string; // maximo object it came from
  issues: string[]; // issue ids
  children: HierarchyNode[];
  childCount: number;
}

export interface HierarchyIssue {
  id: string;
  rule: string;
  kind: 'wrong_parent' | 'orphan' | 'cycle' | 'untyped';
  record: string;
  site: string;
  message: string;
  proposedFix: string;
  status: 'open' | 'fix_approved' | 'dismissed';
}

export interface Rule {
  id: string;
  level: 'Structural' | 'Reference' | 'Semantic' | 'Business' | 'Data quality';
  text: string;
  source: string;
}

export interface ValidationFailure {
  id: string;
  rule: string;
  record: string;
  object: string;
  site: string;
  reason: string; // plain language
  proposedFix: string;
  fixId?: string;
  severity: 'error' | 'warning';
}

export interface FixProposal {
  id: string;
  kind: 'merge_duplicate' | 'reparent' | 'classify' | 'meter_correction' | 'archive' | 'code_map';
  title: string;
  detail: string;
  records: string[];
  confidence: number;
  evidence: string[];
  status: 'proposed' | 'approved' | 'rejected';
  rule: string;
  diff?: { field: string; from: string; to: string }[];
  /** What the transformation does when the fix is approved (e.g. a new parent, class or value). */
  payload?: Record<string, unknown>;
}

export interface LoadRun {
  id: string;
  number: number;
  kind: 'dry_run' | 'production';
  startedAt: string;
  finishedAt?: string;
  transformationVersion: string;
  ontologyVersion: string;
  status: 'running' | 'complete' | 'failed';
  objects: { object: string; ifsTarget: string; source: number; loaded: number; failed: number }[];
  validation: { rule: string; failures: number }[];
  dqScore: number;
  reconciliation?: ReconciliationCheck[];
  errors: { record: string; object: string; ifsMessage: string }[];
}

export interface ReconciliationCheck {
  id: string;
  kind: 'count' | 'total' | 'hierarchy' | 'sample';
  object: string;
  check: string;
  sourceValue: string;
  targetValue: string;
  outcome: 'pass' | 'fail' | 'explained';
  note?: string;
}

export interface AuditEntry {
  seq: number;
  ts: string;
  actor: string; // user name or agent id
  actorKind: 'user' | 'agent' | 'system';
  action: string;
  target?: string;
  detail?: string;
  ontologyVersion?: string;
  model?: string;
  /** Skills loaded for this agent call (AL-04). */
  skills?: { id: string; version: number }[];
  prevHash: string;
  hash: string;
}

export interface AgentEvent {
  id: string;
  ts: string;
  agent: string;
  stage?: number;
  kind: 'plan' | 'thought' | 'tool' | 'result' | 'handoff' | 'needs_human' | 'done' | 'error';
  text: string;
  tool?: string; // e.g. ontology.find_concept
  args?: string;
  ms?: number;
}

export interface Person {
  id: string;
  name: string;
  role:
    | 'Migration lead'
    | 'Data subject expert'
    | 'IFS solution consultant'
    | 'Customer data owner'
    | 'Ontology curator'
    | 'Sales engineer';
  org: string;
  initials: string;
  canApprove: string;
}

export interface Question {
  id: string;
  item: string;
  text: string;
  assignedTo: string;
  answer?: string;
  options?: string[];
  status: 'open' | 'answered';
}

export interface DqSnapshot {
  overallBefore: number;
  overallAfter: number;
  byObject: { object: string; before: number; after: number; records: number }[];
  bySite: { site: string; before: number; after: number }[];
}

/** The queued or running background job of a project. */
export interface ActiveJob { id: string; label: string; status: 'queued' | 'running'; requestedBy: string; createdAt: string; startedAt: string | null }

export interface Dashboard {
  project: Project;
  stages: Stage[];
  kpis: {
    sourceElements: number;
    mapped: number;
    notMigrated: number;
    openQuestions: number;
    autoAccepted: number;
    quickReview: number;
    expertReview: number;
    namedReview: number;
    pendingReview: number;
    precedentShare: number;
    dqBefore: number;
    dqAfter: number;
    assets: number;
    workOrders: number;
    hiddenRules: number;
    fixesPending: number;
  };
  needsYou: { id: string; title: string; detail: string; href: string; role: string; severity: 'high' | 'medium' | 'low' }[];
}

// ---------------- Decision layer ----------------

export type DecisionStep = 'rule' | 'model' | 'reasoning' | 'human';
export type DecisionStatus = 'accepted' | 'needs_review' | 'overridden';

export interface ModelDecision {
  id: string;
  questionId: string;
  recordKind: string;
  recordKey: string;
  inputHash: string;
  /** The masked text the model saw. */
  input: string;
  context: Record<string, string>;
  options: string[];
  answer: string;
  probabilities: Record<string, number>;
  confidence: number;
  step: DecisionStep;
  status: DecisionStatus;
  model: string;
  modelVersion: string;
  ontologyVersion: string;
  /** Answer of the reasoning model when it checked this record, and why. */
  reasoning?: { answer: string; explanation: string; model: string };
  sampled?: boolean;
  /** Recorded as "none or unclear" because no answer was confident enough. */
  abstained?: boolean;
  /** Skill whose rule settled this record. */
  skill?: { id: string; version: number; name: string };
  decidedBy?: string;
  reviewNote?: string;
  createdAt: string;
}

export interface DecisionBatch {
  id: string;
  questionId: string;
  model: string;
  reasoningModel: string;
  startedAt: string;
  finishedAt: string;
  counts: { records: number; unique: number; cacheHits: number; modelCalls: number; rule: number; model: number; reasoning: number; human: number; sampled: number };
  tokens: number;
  costUsd: number;
  ms: number;
}

export interface DecisionQuestionInfo {
  id: string;
  label: string;
  kind: 'choice' | 'score' | 'yesno';
  recordKind: string;
  fields: string[];
  description: string;
}

// ---------------- Skill library ----------------

export type SkillStatus = 'draft' | 'approved' | 'measured' | 'proposed' | 'tested' | 'published' | 'rejected' | 'retired';

export interface SkillConditions {
  sourceSystems?: string[]; // matched as prefixes, e.g. "IBM Maximo 7.6"
  industryPacks?: string[];
  objects?: string[];
  questions?: string[];
}

export type SkillEffect =
  | { type: 'decision_rule'; question: string; pattern: string; answer: string }
  | { type: 'prompt_hint'; agents: ('decision-model' | 'reasoning' | 'aligner' | 'assistant')[]; text: string }
  | { type: 'location_type_rule'; locationType: string; action: 'functional_object' | 'not_migrated' }
  | { type: 'load_precheck'; check: 'default_site' | 'class_characteristics' };

export interface SkillEvidence { kind: string; ref: string; text: string }

export interface Skill {
  id: string;
  version: number;
  name: string;
  description: string;
  scope: 'project' | 'shared';
  projectId?: string;
  status: SkillStatus;
  owner: string;
  conditions: SkillConditions;
  steps: string[];
  examples: string[];
  effects: SkillEffect[];
  evidence: SkillEvidence[];
  trigger?: { kind: string; key: string };
  learnedFrom: string;
  approvedBy?: string;
  approvedAt?: string;
  statusNote?: string;
  /** Shared candidates: the projects that contributed, so a customer can ask for removal. */
  sourceProjects?: string[];
  sourceSkill?: { id: string; version: number };
  testRun?: { id: string; passed: boolean; regressions: { metric: string; baseline: number; now: number }[] };
  measuredEffect?: { uses: number; before: Record<string, number | null>; after: Record<string, number | null>; enoughData: boolean; at: string };
  createdAt: string;
  updatedAt: string;
}

export interface SkillRef { id: string; version: number; name?: string }
