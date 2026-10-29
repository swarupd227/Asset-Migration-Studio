import { describe, expect, it } from 'vitest';
import { concepts, conceptById, families, relationTypeById, relationTypes, relationships } from '../data/ontology.js';
import { applyExtensions, effectiveProperties, indexOf, itemKey } from './graph.js';
import { itemsFromModel, modelOutputSchema, screenItems } from './validate.js';
import { fallbackSuggestion } from './fallback.js';
import { nextVersion } from './store.js';
import { suggestEnhancement } from './enhance.js';

describe('ontology integrity', () => {
  it('has unique ids and labels, and every parent, allowed parent and family member exists', () => {
    expect(new Set(concepts.map((c) => c.id)).size).toBe(concepts.length);
    expect(new Set(concepts.map((c) => c.label.toLowerCase())).size).toBe(concepts.length);
    for (const c of concepts) {
      if (c.parent) expect(conceptById.has(c.parent), `${c.id} parent ${c.parent}`).toBe(true);
      for (const p of [...c.allowedParents, ...(c.neverUnder ?? [])]) expect(conceptById.has(p), `${c.id} → ${p}`).toBe(true);
    }
    for (const f of families) for (const id of f.concepts) expect(conceptById.has(id)).toBe(true);
  });

  it('has no cycles in the subclass hierarchy', () => {
    for (const c of concepts) {
      const seen = new Set<string>();
      let p: string | undefined = c.id;
      while (p) { expect(seen.has(p), `cycle at ${c.id}`).toBe(false); seen.add(p); p = conceptById.get(p)?.parent; }
    }
  });

  it('declares every relationship type with an inverse that points back', () => {
    for (const t of relationTypes) {
      const inv = relationTypeById.get(t.inverse);
      expect(inv, t.id).toBeDefined();
      expect(inv!.inverse).toBe(t.id);
      expect(t.definition.length).toBeGreaterThan(10);
    }
  });

  it('points every relationship at an existing concept and holds both directions', () => {
    for (const [from, type, to] of relationships) {
      expect(conceptById.has(from), from).toBe(true);
      expect(conceptById.has(to), to).toBe(true);
      expect(from).not.toBe(to);
      expect(relationTypeById.has(type)).toBe(true);
    }
    for (const c of concepts) {
      for (const r of c.relations ?? []) {
        const target = conceptById.get(r.target);
        expect(target, `${c.id} ${r.type} ${r.target}`).toBeDefined();
        const inverse = relationTypeById.get(r.type)!.inverse;
        expect(target!.relations?.some((x) => x.type === inverse && x.target === c.id), `${r.target} lacks ${inverse} ${c.id}`).toBe(true);
      }
    }
  });

  it('keeps the release concepts, bindings and failure modes that agents and rules depend on', () => {
    const pump = conceptById.get('util:CentrifugalPump')!;
    expect(pump.failureModes).toEqual(['External leakage – process medium (ELP)', 'Vibration (VIB)', 'Fail to start on demand (FTS)', 'Overheating (OHE)', 'Low output (LOO)']);
    expect(pump.attributes.find((a) => a.name === 'Rated flow')?.range).toBe('5–5000');
    expect(conceptById.get('util:Valve')!.bindings.ifs).toBe('Serial object, object type VALVE');
    expect(families.map((f) => f.label)).toEqual(['Rotating equipment', 'Flow control', 'Instruments and meters', 'Electrical network', 'Treatment and dosing']);
    // Attributes are carried into properties with their units.
    expect(pump.properties?.find((p) => p.name === 'Rated head')).toMatchObject({ unit: 'm', datatype: 'number' });
  });

  it('derives subtype links from parents', () => {
    expect(conceptById.get('util:CentrifugalPump')!.relations).toContainEqual(expect.objectContaining({ type: 'isA', target: 'util:Pump' }));
    expect(conceptById.get('util:Pump')!.relations).toContainEqual(expect.objectContaining({ type: 'hasSubtype', target: 'util:CentrifugalPump' }));
  });
});

describe('enhancement validation', () => {
  const pumpProps = (id: string) => effectiveProperties(conceptById.get(id)!, indexOf(concepts)).map((p) => p.property.name);

  it('drops relationships to unknown concept ids, to itself and ones that already exist', () => {
    const { items, dropped } = screenItems('util:CentrifugalPump', [
      { kind: 'relation', relation: { type: 'protectedBy', target: 'util:DoesNotExist' } },
      { kind: 'relation', relation: { type: 'connectedTo', target: 'util:CentrifugalPump' } },
      { kind: 'relation', relation: { type: 'drivenBy', target: 'util:ElectricMotor' } }, // inherited from Pump
      { kind: 'relation', relation: { type: 'isA', target: 'util:RotatingEquipment' } },
      { kind: 'relation', relation: { type: 'controlledBy', target: 'util:VariableSpeedDrive', cardinality: '0..1' }, rationale: 'Speed control' },
    ], concepts);
    expect(items).toHaveLength(1);
    expect(items[0].relation).toEqual({ type: 'controlledBy', target: 'util:VariableSpeedDrive', cardinality: '0..1' });
    expect(dropped).toBe(4);
  });

  it('drops malformed items, repeated synonyms, inherited properties and failure modes without a code', () => {
    const { items } = screenItems('util:CentrifugalPump', [
      { kind: 'synonym', value: 'lift pump' }, // already a synonym
      { kind: 'synonym', value: 'Valve' }, // another concept's label
      { kind: 'synonym', value: 'PUMP-CENT', system: 'ifs' },
      { kind: 'property', property: { name: 'Install date', datatype: 'date' } }, // inherited from physical asset
      { kind: 'property', property: { name: 'Best efficiency flow', datatype: 'number', unit: 'm³/h', range: '' } },
      { kind: 'failureMode', value: 'Seal leak' },
      { kind: 'failureMode', value: 'Breakdown (BRD)' },
      { kind: 'colour', value: 'blue' },
      'not an object',
    ], concepts);
    expect(items.map((i) => i.kind)).toEqual(['synonym', 'property', 'failureMode']);
    expect(items[1].property).toEqual({ name: 'Best efficiency flow', datatype: 'number', unit: 'm³/h' });
    expect(pumpProps('util:CentrifugalPump')).toContain('Install date');
  });

  it('reads model output through the same checks', () => {
    const out = modelOutputSchema.parse({
      summary: 'x', synonyms: [{ value: 'end-suction pump', system: 'general', rationale: 'r' }], properties: [],
      failureModes: [], relations: [{ type: 'monitoredBy', target: 'util:Nowhere', cardinality: '0..1', rationale: 'r' }, { type: 'monitoredBy', target: 'util:RemoteTerminalUnit', cardinality: '0..1', rationale: 'r' }],
    });
    const { items, dropped } = screenItems('util:CentrifugalPump', itemsFromModel(out), concepts);
    expect(items.map((i) => i.relation?.target ?? i.value)).toEqual(['end-suction pump', 'util:RemoteTerminalUnit']);
    expect(dropped).toBe(1);
  });
});

describe('in-environment suggestion', () => {
  it('derives additions from the source catalogue and sibling concepts', () => {
    const s = fallbackSuggestion('util:Valve', concepts);
    expect(s.source).toBe('in-environment');
    expect(s.items.map((i) => i.value)).toEqual(expect.arrayContaining(['VALVE\\GATE', 'VALVE\\BUTTERFLY', 'suction valve', 'discharge valve']));
    expect(s.basis).toMatch(/source catalogue/);
    const pump = fallbackSuggestion('util:CentrifugalPump', concepts);
    expect(pump.items).toContainEqual(expect.objectContaining({ kind: 'failureMode', value: 'Breakdown (BRD)' }));
    // Every suggestion passes validation and is new.
    for (const id of ['util:CentrifugalPump', 'util:Instrument', 'util:Hydrant', 'core:SerialNumber']) {
      const f = fallbackSuggestion(id, concepts);
      expect(screenItems(id, f.items, concepts).items).toHaveLength(f.items.length);
    }
  });

  it('is deterministic', () => {
    const a = fallbackSuggestion('util:Valve', concepts);
    const b = fallbackSuggestion('util:Valve', concepts);
    expect(a.items).toEqual(b.items);
  });

  it('is used when no model is configured', async () => {
    const saved = [process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_AUTH_TOKEN];
    delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
    try {
      const s = await suggestEnhancement('util:Valve', concepts);
      expect(s.source).toBe('in-environment');
      expect(s.model).toBeUndefined();
    } finally {
      if (saved[0] !== undefined) process.env.ANTHROPIC_API_KEY = saved[0];
      if (saved[1] !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = saved[1];
    }
  });
});

describe('accepted extensions', () => {
  it('extend a copy of the ontology, with the inverse relationship, and leave the release untouched', () => {
    const rel = { kind: 'relation' as const, relation: { type: 'controlledBy' as const, target: 'util:VariableSpeedDrive' }, rationale: '', key: '' };
    rel.key = itemKey('util:CentrifugalPump', rel);
    const served = applyExtensions(concepts, [
      { conceptId: 'util:CentrifugalPump', item: rel },
      { conceptId: 'util:CentrifugalPump', item: { kind: 'synonym', value: 'PUMP-CENT', key: 'k1', rationale: '' } },
      { conceptId: 'util:CentrifugalPump', item: { kind: 'property', property: { name: 'BEP flow', datatype: 'number', unit: 'm³/h' }, key: 'k2', rationale: '' } },
    ]);
    const byId = indexOf(served);
    const pump = byId.get('util:CentrifugalPump')!;
    expect(pump.synonyms).toContain('PUMP-CENT');
    expect(pump.properties).toContainEqual(expect.objectContaining({ name: 'BEP flow', origin: 'extension' }));
    expect(pump.relations).toContainEqual(expect.objectContaining({ type: 'controlledBy', target: 'util:VariableSpeedDrive', origin: 'extension' }));
    expect(byId.get('util:VariableSpeedDrive')!.relations).toContainEqual(expect.objectContaining({ type: 'controls', target: 'util:CentrifugalPump', derived: true }));
    expect(conceptById.get('util:CentrifugalPump')!.synonyms).not.toContain('PUMP-CENT');
  });

  it('publishes a new patch version on top of the release', () => {
    expect(nextVersion([])).toBe('IAO 2.5.1');
    expect(nextVersion(['IAO 2.5.1', 'IAO 2.5.3', 'IAO 2.4.9'])).toBe('IAO 2.5.4');
  });
});
