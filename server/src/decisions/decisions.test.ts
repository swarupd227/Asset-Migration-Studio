import { describe, expect, it } from 'vitest';
import type { Dataset, Project } from '../types.js';
import { assets, closedWorkOrders, locations, meters, people, pmPlans, workOrders } from '../data/seed.js';
import { buildMappings } from '../data/catalog.js';
import { validate } from '../rules.js';
import { agrees, band, confidenceOf, DEFAULT_THRESHOLDS, inputHash, inSample } from './flow.js';
import { mask, normaliseText } from './mask.js';
import { normalise, top, validateOptions } from './model.js';
import { localDecisionModel } from './adapters/local.js';
import { itemsFor, NONE_OPTION, questionById, QUESTIONS, RUN_ORDER, type ItemContext } from './questions.js';

const terms = { people: people.map((p) => p.name), customers: ['Northvale Water & Power'], sites: ['Riverside Pumping', 'North Water Treatment Works'] };
const ds: Dataset = structuredClone({ assets, locations, workOrders: [...workOrders, ...closedWorkOrders], pms: pmPlans, meters });
const project = { id: 'p', name: 'Northvale', customer: 'Northvale Water & Power', mode: 'delivery', sourceSystems: ['IBM Maximo 7.6.1.3'], target: 'IFS Cloud', industryPack: 'Utilities', ontologyVersion: 'IAO 2.4.0', region: 'UK South', sharedLearning: false, createdAt: '', status: '' } as Project;
const ctx = (prior: Record<string, [string, string][]> = {}): ItemContext => ({
  ds, mappings: buildMappings(), project,
  prior: (id) => new Map((prior[id] ?? []).map(([k, a]) => [k, { answer: a, confidence: 0.9, status: 'accepted' }])),
});
const items = (id: string, prior?: Record<string, [string, string][]>) => itemsFor(id, ctx(prior));
const failureMode = questionById('wo.failure_mode')!;

describe('masking', () => {
  it('removes technician names written in work orders', () => {
    expect(mask('Pump seal leaking - J. Patel', terms)).toBe('Pump seal leaking - [person]');
    expect(mask('Reported by Sam Okoye on night shift. pump noisy', terms)).toBe('Reported by [person] on night shift. pump noisy');
  });
  it('removes platform users, customer and site names', () => {
    expect(mask('Dev Raman checked it at Riverside Pumping for Northvale Water & Power', terms)).toBe('[person] checked it at [site] for [customer]');
  });
  it('leaves equipment wording alone', () => {
    expect(mask('Mech seal weeping on DE side', terms)).toBe('Mech seal weeping on DE side');
  });
  it('leaves no known name in any work order the model would see', () => {
    const names = [...terms.people, 'J. Patel', 'Sam Okoye', 'R. Lindqvist', 'Aisha Rahman', 'M. Kowalski'];
    const leaked = items('wo.failure_mode').map((i) => mask(i.text, terms)).filter((t) => names.some((n) => t.includes(n)));
    expect(leaked).toEqual([]);
  });
});

describe('flow', () => {
  it('routes by confidence band', () => {
    expect(band(0.9, DEFAULT_THRESHOLDS)).toBe('model');
    expect(band(0.85, DEFAULT_THRESHOLDS)).toBe('model');
    expect(band(0.7, DEFAULT_THRESHOLDS)).toBe('reasoning');
    expect(band(0.59, DEFAULT_THRESHOLDS)).toBe('human');
  });
  it('measures score confidence within one level and lets scores agree within one level', () => {
    const p = { 1: 0.4, 2: 0.35, 3: 0.2, 4: 0.05, 5: 0 };
    expect(confidenceOf('score', p, '1')).toBeCloseTo(0.75);
    expect(confidenceOf('choice', { a: 0.6, b: 0.4 }, 'a')).toBe(0.6);
    expect(agrees('score', '2', '3')).toBe(true);
    expect(agrees('score', '2', '4')).toBe(false);
    expect(agrees('choice', 'a', 'b')).toBe(false);
  });
  it('lets failure questions abstain instead of asking a person', () => {
    expect(questionById('wo.failure_cause')!.abstain).toBe(NONE_OPTION);
    expect(questionById('asset.same_asset')!.abstain).toBeUndefined();
  });
  it('samples about 5% of records, the same ones every time', () => {
    const keys = closedWorkOrders.map((w) => w.wonum);
    const first = keys.filter((k) => inSample(k, 0.05));
    expect(keys.filter((k) => inSample(k, 0.05))).toEqual(first);
    expect(first.length / keys.length).toBeGreaterThan(0.035);
    expect(first.length / keys.length).toBeLessThan(0.065);
  });
  it('keys the cache on question, ontology version, options and normalised text', () => {
    const o = ['A (ELP)', NONE_OPTION];
    expect(inputHash('q', '2.4', o, 'Pump seal leaking.')).toBe(inputHash('q', '2.4', o, '  pump SEAL leaking '));
    expect(inputHash('q', '2.4', o, 'Pump seal leaking')).not.toBe(inputHash('q', '2.5', o, 'Pump seal leaking'));
  });
  it('sends far fewer distinct texts than records', () => {
    const its = items('wo.failure_mode').filter((i) => !i.ruleAnswer);
    const unique = new Set(its.map((i) => inputHash('wo.failure_mode', '2.4', i.options, mask(i.text, terms))));
    expect(its.length).toBeGreaterThan(5000);
    expect(unique.size).toBeLessThan(its.length / 5);
    expect(normaliseText('A  B.')).toBe('a b');
  });
  it('runs every question in the catalogue, in dependency order', () => {
    expect([...RUN_ORDER].sort()).toEqual(QUESTIONS.map((q) => q.id).sort());
    expect(RUN_ORDER.indexOf('wo.failure_cause')).toBeGreaterThan(RUN_ORDER.indexOf('wo.failure_mode'));
    expect(RUN_ORDER.indexOf('asset.class')).toBeGreaterThan(RUN_ORDER.indexOf('asset.family'));
  });
});

describe('questions', () => {
  it('offers only failure modes valid for the asset class, plus none', () => {
    const v = items('wo.failure_mode').find((i) => i.context.assetClass === 'Valve')!;
    expect(v.options).toContain('Fail to close (FTC)');
    expect(v.options).not.toContain('Tap changer failure (TCF)');
    expect(v.options.at(-1)).toBe(NONE_OPTION);
  });
  it('keeps every question within the typed-question limits', () => {
    for (const id of RUN_ORDER) {
      const q = questionById(id)!;
      for (const i of items(id, { 'wo.failure_mode': [['WO-060000', 'Vibration (VIB)']], 'asset.family': [[assets.find((a) => !a.classstructure)!.assetnum, 'Rotating equipment']] }).slice(0, 300)) {
        expect(() => validateOptions(q, i.options)).not.toThrow();
      }
    }
  });
  it('settles routine preventive work by rule', () => {
    expect(items('wo.failure_mode').filter((i) => i.ruleAnswer).length).toBeGreaterThan(500);
  });
  it('asks for a cause only where a failure mode was found', () => {
    const its = items('wo.failure_cause', { 'wo.failure_mode': [['WO-060001', 'Vibration (VIB)'], ['WO-060002', NONE_OPTION]] });
    expect(its.map((i) => i.recordKey)).toEqual(['WO-060001']);
    expect(its[0].context.failureMode).toBe('Vibration (VIB)');
  });
  it('settles single-class families by rule in the second classification step', () => {
    const a = assets.find((x) => !x.classstructure)!;
    const flow = items('asset.class', { 'asset.family': [[a.assetnum, 'Flow control']] });
    expect(flow[0].ruleAnswer).toBe('Valve');
    const rot = items('asset.class', { 'asset.family': [[a.assetnum, 'Rotating equipment']] });
    expect(rot[0].ruleAnswer).toBeUndefined();
    expect(rot[0].options).toContain('Electric motor');
  });
  it('settles exact serial duplicates by rule and sends looser pairs to the model', () => {
    const pairs = items('asset.same_asset');
    expect(pairs.filter((p) => p.ruleAnswer === 'Yes')).toHaveLength(18);
    expect(pairs.filter((p) => !p.ruleAnswer).length).toBeGreaterThan(0);
  });
  it('always sends local status codes to a person', () => {
    const codes = items('code.map');
    expect(codes.find((c) => c.recordKey === 'NV-HOLD')!.alwaysHuman).toBe(true);
    expect(codes.find((c) => c.recordKey === 'APPR')!.ruleAnswer).toBe('Approved and released');
  });
  it('screens only text with instruction trigger words through a model', () => {
    const t = items('text.instruction_like');
    const toModel = t.filter((i) => !i.ruleAnswer).map((i) => i.recordKey);
    expect(toModel).toContain('workorder:WO-064211');
    expect(toModel.length).toBeLessThan(5);
  });
  it('rates safety-critical and regulatory mappings at the top by rule', () => {
    const r = items('review.risk');
    expect(r.find((i) => i.recordKey === 'M-026')!.ruleAnswer).toBe('5');
    expect(r.find((i) => i.recordKey === 'M-025')!.ruleAnswer).toBe('5');
  });
});

describe('local model', () => {
  it('picks the failure mode the text names', async () => {
    const options = ['External leakage – process medium (ELP)', 'Vibration (VIB)', 'Fail to start on demand (FTS)', NONE_OPTION];
    const { answers } = await localDecisionModel.decide(failureMode, [
      { hash: 'a', text: 'Pump seal leaking, replaced mechanical seal', options, context: {} },
      { hash: 'b', text: 'High vibration on pump', options, context: {} },
      { hash: 'c', text: 'Replaced gasket', options, context: {} },
    ]);
    expect(top(answers[0].probabilities)[0]).toBe(options[0]);
    expect(top(answers[1].probabilities)[0]).toBe(options[1]);
    expect(top(answers[2].probabilities)[1]).toBeLessThan(0.85);
  });
  it('tells a motor from the pump it drives', async () => {
    const q = questionById('asset.class')!;
    const options = ['Centrifugal pump', 'Electric motor', 'Blower'];
    const { answers } = await localDecisionModel.decide(q, [{ hash: 'm', text: 'Motor for pump PU-10012', options, context: {} }]);
    expect(top(answers[0].probabilities)[0]).toBe('Electric motor');
  });
  it('does not call suction and discharge valves the same asset', async () => {
    const q = questionById('asset.same_asset')!;
    const { answers } = await localDecisionModel.decide(q, [{ hash: 'v', text: 'A: Suction valve pump PU-1 (serial AV1, status OPERATING) | B: Discharge valve pump PU-1 (serial AV2, status OPERATING)', options: ['Yes', 'No'], context: {} }]);
    expect(top(answers[0].probabilities)[0]).toBe('No');
  });
  it('normalises probabilities over the options', () => {
    expect(normalise(['a', 'b'], { a: 3, b: 1, c: 10 })).toEqual({ a: 0.75, b: 0.25 });
  });
});

describe('decisions feed the rules', () => {
  it('reports duplicates the decision layer settled, and only those', () => {
    const pairs = new Map([['PU-10023|PU-10023A', { same: true, confidence: 0.97 }], ['VA-10024|VA-10025', { same: false, confidence: 0.9 }]]);
    const withDups = structuredClone(ds);
    withDups.assets.push({ ...withDups.assets.find((a) => a.assetnum.startsWith('PU-'))!, assetnum: 'PU-10023A' });
    const f = validate(withDups, { pairs }).filter((x) => x.rule === 'DQ-01');
    expect(f.every((x) => !x.record.includes('VA-10024'))).toBe(true);
  });
  it('raises SM-02 from a low plausibility score', () => {
    const w = ds.workOrders.find((x) => x.causecode)!;
    const f = validate(ds, { causeScores: new Map([[w.wonum, { score: 1, confidence: 0.9 }]]) }).filter((x) => x.rule === 'SM-02' && x.record === w.wonum);
    expect(f).toHaveLength(1);
    expect(f[0].reason).toMatch(/scores 1 of 5/);
  });
});
