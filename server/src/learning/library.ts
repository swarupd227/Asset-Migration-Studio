import type { Skill } from '../types.js';
import { one, q } from '../db.js';
import { saveSkill } from './store.js';

// Shared skill library. Version SL 1.0.0 holds general source-system knowledge maintained by the
// curator; projects pin a version and upgrade only by an explicit decision of the migration lead.

export const FIRST_LIBRARY = 'SL 1.0.0';

const shared = (s: Omit<Skill, 'scope' | 'status' | 'version' | 'createdAt' | 'updatedAt' | 'evidence'>): Skill => ({
  ...s, scope: 'shared', status: 'published', version: 1, evidence: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

const SKILLS: Skill[] = [
  shared({
    id: 'SK-MX-LOCTYPES', name: 'Maximo utility location types', owner: 'Ontology curator', learnedFrom: 'Repeated reviewer corrections',
    description: 'For utilities on Maximo 7.6, locations of type OPERATING usually become functional objects, and locations used only for courier or staging are not migrated.',
    conditions: { sourceSystems: ['IBM Maximo 7.6'], industryPacks: ['Utilities'], objects: ['LOCATIONS'] },
    steps: ['Treat LOCATIONS of type OPERATING as functional objects.', 'Exclude COURIER and STAGING locations from the load and record them as not migrated.', 'Keep SYSTEM locations as process systems in the functional structure.'],
    examples: ['RIVR-PS02 (OPERATING) → functional object', 'NORTH-STAGE01 (STAGING) → not migrated'],
    effects: [
      { type: 'location_type_rule', locationType: 'OPERATING', action: 'functional_object' },
      { type: 'location_type_rule', locationType: 'COURIER', action: 'not_migrated' },
      { type: 'location_type_rule', locationType: 'STAGING', action: 'not_migrated' },
    ],
  }),
  shared({
    id: 'SK-SAP-NAMEPLATE', name: 'SAP nameplate data', owner: 'Ontology curator', learnedFrom: 'A failed dry run that was recovered',
    description: 'When SAP equipment keeps nameplate data in class characteristics, read the characteristic values before mapping the object, or attributes are lost.',
    conditions: { sourceSystems: ['SAP'], objects: ['EQUI'] },
    steps: ['Read class characteristics (AUSP) for each equipment class before mapping.', 'Map characteristic values to technical attributes, not to free-text fields.'],
    examples: ['Pump class with RATED_FLOW characteristic → TechnicalAttribute RATED_FLOW'],
    effects: [
      { type: 'load_precheck', check: 'class_characteristics' },
      { type: 'prompt_hint', agents: ['aligner'], text: 'For SAP equipment, nameplate values live in class characteristics; bind those characteristics to technical attributes before mapping the object.' },
    ],
  }),
  shared({
    id: 'SK-IFS-MISSINGSITE', name: 'Missing site on load', owner: 'Ontology curator', learnedFrom: 'Repeated load errors',
    description: "When IFS rejects work orders for a missing site, check the source system's default site setting before changing any mapping.",
    conditions: {},
    steps: ['Before a dry run, count work orders without a known site.', "If there are any, check the source system's default site setting first.", 'Change the site mapping only if the default is correct.'],
    examples: ['Work orders created by an integration user with no default site'],
    effects: [
      { type: 'load_precheck', check: 'default_site' },
      { type: 'prompt_hint', agents: ['assistant'], text: "If work orders are rejected for a missing site, advise checking the source system's default site setting before changing mappings." },
    ],
  }),
];

export async function seedSharedLibrary() {
  const has = await one<{ n: number }>('SELECT count(*)::int AS n FROM skill_library');
  if (!has?.n) {
    for (const s of SKILLS) await saveSkill(s);
    await q('INSERT INTO skill_library (version, published_by, skills) VALUES ($1, $2, $3)', [FIRST_LIBRARY, 'Ari Cohen', JSON.stringify(SKILLS.map((s) => ({ id: s.id, version: s.version, name: s.name })))]);
  }
  // Projects without a pinned version get the first library; later upgrades are explicit.
  await q('UPDATE projects SET skill_library_version = $1 WHERE skill_library_version IS NULL', [FIRST_LIBRARY]);
}
