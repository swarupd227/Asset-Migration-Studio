import { describe, expect, it } from 'vitest';
import { assets, closedWorkOrders, locations, meters, people, pmPlans, workOrders } from '../data/seed.js';
import { band, DEFAULT_THRESHOLDS, inputHash, inSample } from './flow.js';
import { mask, normaliseText } from './mask.js';
import { normalise, top, validateOptions } from './model.js';
import { localDecisionModel } from './adapters/local.js';
import { failureModeItems, NONE_OPTION, QUESTIONS } from './questions.js';

const terms = { people: people.map((p) => p.name), customers: ['Northvale Water & Power'], sites: ['Riverside Pumping', 'North Water Treatment Works'] };
const ds = { assets, locations, workOrders: [...workOrders, ...closedWorkOrders], pms: pmPlans, meters };

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
    const leaked = failureModeItems(ds).map((i) => mask(i.text, terms)).filter((t) => names.some((n) => t.includes(n)));
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
    const items = failureModeItems(ds).filter((i) => !i.ruleAnswer);
    const unique = new Set(items.map((i) => inputHash('wo.failure_mode', '2.4', i.options, mask(i.text, terms))));
    expect(items.length).toBeGreaterThan(5000);
    expect(unique.size).toBeLessThan(items.length / 5);
    expect(normaliseText('A  B.')).toBe('a b');
  });
});

describe('questions and models', () => {
  it('offers only failure modes valid for the asset class, plus none', () => {
    const it0 = failureModeItems(ds).find((i) => i.context.assetClass === 'Valve')!;
    expect(it0.options).toContain('Fail to close (FTC)');
    expect(it0.options).not.toContain('Tap changer failure (TCF)');
    expect(it0.options.at(-1)).toBe(NONE_OPTION);
    for (const i of failureModeItems(ds).slice(0, 200)) expect(() => validateOptions(QUESTIONS[0], i.options)).not.toThrow();
  });
  it('settles routine preventive work by rule', () => {
    expect(failureModeItems(ds).filter((i) => i.ruleAnswer).length).toBeGreaterThan(500);
  });
  it('local model picks the mode the text names', async () => {
    const options = ['External leakage – process medium (ELP)', 'Vibration (VIB)', 'Fail to start on demand (FTS)', NONE_OPTION];
    const { answers } = await localDecisionModel.decide(QUESTIONS[0], [
      { hash: 'a', text: 'Pump seal leaking, replaced mechanical seal', options, context: {} },
      { hash: 'b', text: 'High vibration on pump', options, context: {} },
      { hash: 'c', text: 'Replaced gasket', options, context: {} },
    ]);
    expect(top(answers[0].probabilities)[0]).toBe(options[0]);
    expect(top(answers[1].probabilities)[0]).toBe(options[1]);
    expect(top(answers[2].probabilities)[1]).toBeLessThan(0.85);
  });
  it('normalises probabilities over the options', () => {
    const p = normalise(['a', 'b'], { a: 3, b: 1, c: 10 });
    expect(p).toEqual({ a: 0.75, b: 0.25 });
  });
});
