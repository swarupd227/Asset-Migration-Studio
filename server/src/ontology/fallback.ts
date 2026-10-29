import type { Concept, ConceptProperty, EnhancementSuggestion, RelationType } from '../types.js';
import { assets } from '../data/seed.js';
import { buildMappings } from '../data/catalog.js';
import { classToConcept } from '../rules.js';
import { ancestorsOf, effectiveRelations, failureCode, indexOf, norm } from './graph.js';
import { screenItems } from './validate.js';

// In-environment enhancement: additions derived from the ontology itself and the source catalogue,
// with no model call. Deterministic for the same ontology and source data.

const humanise = (key: string) => {
  const s = key.toLowerCase().replace(/_/g, ' ').replace(/^rated(?=\w)/, 'rated ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w.endsWith('y') ? `${w.slice(0, -1)}ies` : `${w}s`}`;
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Short phrases that end in the concept's head noun, mined from source asset descriptions. */
function descriptionPhrases(c: Concept): Map<string, number> {
  const heads = new Set([c.label, ...c.synonyms].map((s) => s.toLowerCase().split(/\s+/).at(-1)!).filter((h) => h.length > 2));
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.conceptId !== c.id) continue;
    const words = a.description.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      if (!heads.has(words[i].toLowerCase())) continue;
      const run: string[] = [words[i]];
      for (let j = i - 1; j >= 0 && run.length < 3; j--) {
        if (/\d|^(for|of|to|and|on|at)$/i.test(words[j])) break;
        run.unshift(words[j]);
      }
      if (run.length < 2) continue;
      const phrase = run.join(' ').toLowerCase();
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return counts;
}

export function fallbackSuggestion(conceptId: string, concepts: Concept[]): EnhancementSuggestion {
  const byId = indexOf(concepts);
  const c = byId.get(conceptId);
  const generatedAt = new Date().toISOString();
  if (!c) return { conceptId, source: 'in-environment', summary: 'Unknown concept.', basis: '', items: [], dropped: 0, generatedAt };
  const siblings = concepts.filter((x) => x.id !== c.id && x.parent && x.parent === c.parent);
  // Something most siblings share: at least two of them and at least two thirds.
  const quorum = Math.max(2, Math.ceil((siblings.length * 2) / 3));
  const raw: unknown[] = [];
  const basis: string[] = [];

  // Synonyms: source classification codes, bound catalogue columns and recurring description phrases.
  const classCodes = Object.entries(classToConcept).filter(([, v]) => v === c.id).map(([k]) => k);
  for (const k of classCodes) raw.push({ kind: 'synonym', value: k, system: 'maximo', rationale: `Maximo classification ${k} resolves to this concept in the source catalogue.` });
  // Specification columns describe a property of the class, not another name for it.
  const columns = [...new Set(buildMappings().filter((m) => m.conceptId === c.id).flatMap((m) => m.sourceElements).filter((e) => /^[A-Z_]+\.[A-Z_]+$/.test(e) && !/SPEC\./.test(e)))];
  for (const e of columns) raw.push({ kind: 'synonym', value: e.split('.')[1], system: 'maximo', rationale: `Source column ${e} is bound to this concept by an approved mapping.` });
  const phrases = [...descriptionPhrases(c)].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [p, n] of phrases) raw.push({ kind: 'synonym', value: p, system: 'general', rationale: `Used in ${n} source asset descriptions of this class.` });
  if (classCodes.length || columns.length || phrases.length) basis.push('source catalogue');

  // Properties: specification keys on source assets of this class, and properties most siblings share.
  const specKeys = new Map<string, unknown[]>();
  for (const a of assets) if (a.conceptId === c.id) for (const [k, v] of Object.entries(a.specs ?? {})) specKeys.set(k, [...(specKeys.get(k) ?? []), v]);
  const known = [c, ...ancestorsOf(c.id, byId)].flatMap((x) => x.properties ?? []).map((p) => squash(p.name));
  for (const [k, values] of specKeys) {
    const sk = squash(k);
    if (known.some((n) => n === sk || n.includes(sk) || sk.includes(n))) continue;
    const numeric = values.every((v) => typeof v === 'number');
    raw.push({ kind: 'property', property: { name: humanise(k), datatype: numeric ? 'number' : 'text' }, rationale: `Specification ${k} is recorded on ${values.length} source assets of this class.` });
  }
  if (specKeys.size) basis.push('asset specifications');
  const propCount = new Map<string, { p: ConceptProperty; n: number }>();
  for (const s of siblings) for (const p of s.properties ?? []) {
    const e = propCount.get(norm(p.name));
    propCount.set(norm(p.name), { p, n: (e?.n ?? 0) + 1 });
  }
  for (const { p, n } of propCount.values()) {
    if (n < quorum) continue;
    const { origin: _origin, ...property } = p;
    raw.push({ kind: 'property', property, rationale: `Held by ${n} of ${siblings.length} sibling concepts under ${byId.get(c.parent!)?.label}.` });
  }

  // Failure modes shared by most siblings or held by the parent, matched on code.
  const fmCount = new Map<string, { text: string; n: number }>();
  for (const s of siblings) for (const f of s.failureModes) {
    const k = failureCode(f) ?? f;
    fmCount.set(k, { text: fmCount.get(k)?.text ?? f, n: (fmCount.get(k)?.n ?? 0) + 1 });
  }
  for (const { text, n } of fmCount.values()) if (n >= quorum) raw.push({ kind: 'failureMode', value: text, rationale: `Valid for ${n} of ${siblings.length} sibling classes.` });
  for (const f of c.parent ? byId.get(c.parent)?.failureModes ?? [] : []) raw.push({ kind: 'failureMode', value: f, rationale: `Valid for the parent class ${byId.get(c.parent!)?.label}.` });
  if (siblings.length) basis.push(`${siblings.length} sibling concepts`);

  // Relationships: those most siblings hold, and allowed-parent rules not yet expressed as a relationship.
  const relCount = new Map<string, { type: RelationType; target: string; cardinality?: string; n: number }>();
  for (const s of siblings) for (const r of s.relations ?? []) {
    if (r.derived || r.type === 'isA' || r.type === 'hasSubtype') continue;
    const k = `${r.type}>${r.target}`;
    relCount.set(k, { type: r.type, target: r.target, cardinality: r.cardinality, n: (relCount.get(k)?.n ?? 0) + 1 });
  }
  for (const r of relCount.values()) if (r.n >= quorum) raw.push({ kind: 'relation', relation: { type: r.type, target: r.target, cardinality: r.cardinality }, rationale: `Held by ${r.n} of ${siblings.length} sibling concepts.` });

  const lineage = (id: string) => new Set([id, ...ancestorsOf(id, byId).map((x) => x.id)]);
  const mine = lineage(c.id);
  const isMeasuring = mine.has('util:Instrument') || mine.has('core:MeasurementPoint');
  const related = effectiveRelations(c, byId);
  for (const p of c.allowedParents) {
    if (['core:FunctionalLocation', 'core:PhysicalAsset', 'core:Site'].includes(p) || !byId.has(p)) continue;
    const theirs = lineage(p);
    const already = related.some((r) => theirs.has(r.relation.target))
      || [...theirs].some((t) => (byId.get(t)?.relations ?? []).some((r) => mine.has(r.target)));
    if (already) continue;
    const place = theirs.has('core:FunctionalLocation') || theirs.has('core:AssetSystem');
    const type: RelationType = place ? 'locatedIn' : isMeasuring ? 'measures' : 'partOf';
    raw.push({ kind: 'relation', relation: { type, target: p, cardinality: '0..1' }, rationale: `The hierarchy rules allow ${c.label.toLowerCase()} under ${byId.get(p)!.label.toLowerCase()}; no relationship says how they relate.` });
  }
  if (c.allowedParents.length) basis.push('allowed-parent rules');

  const { items } = screenItems(c.id, raw, concepts);
  const summary = items.length
    ? `${plural(items.length, 'addition')} for ${c.label}: ${(['synonym', 'property', 'failureMode', 'relation'] as const)
      .map((k) => [items.filter((i) => i.kind === k).length, { synonym: 'synonym', property: 'property', failureMode: 'failure mode', relation: 'relationship' }[k]] as const)
      .filter(([n]) => n).map(([n, w]) => plural(n, w)).join(', ')}.`
    : `No new additions for ${c.label} could be derived from the ontology and source catalogue.`;
  return { conceptId: c.id, source: 'in-environment', summary, basis: `Derived from ${basis.join(', ') || 'the ontology'}.`, items, dropped: 0, generatedAt };
}
