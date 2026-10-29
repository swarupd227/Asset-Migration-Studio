import { describe, expect, it } from 'vitest';
import { blend, fit, passes, predict, tokens, trainable, trainOn, MIN_EXAMPLES } from './trained.js';
import { localDecisionModel } from './adapters/local.js';
import { costOf } from '../usage.js';

const options = ['Fail to open (FTO)', 'External leakage (ELP)', 'None or unclear'];
const q = { id: 'wo.failure_mode', kind: 'choice' as const, prompt: 'Failure mode' };

// The customer's own wording: "NV-STK" is site shorthand for a seized actuator the keyword model does not know.
const ex = (i: number) => {
  const kind = i % 3;
  const text = kind === 0 ? `NV-STK actuator seized, valve ${i} freed` : kind === 1 ? `Gland weeping on valve ${i}, repacked` : `Routine inspection ${i}, no defects`;
  return { key: `WO-${i}`, text, answer: options[kind], weight: 3, options, context: {} };
};

describe('in-environment trained model', () => {
  it('tokenises words and word pairs, without masked names or numbers', () => {
    expect(tokens('[person] said Valve 12 stuck closed')).toEqual(expect.arrayContaining(['said', 'valve', 'stuck', 'closed', 'stuck_closed']));
    expect(tokens('[person] 12')).toEqual([]);
  });
  it('learns wording the keyword model does not know', () => {
    const m = fit(Array.from({ length: 30 }, (_, i) => ex(i)));
    const p = predict(m, 'NV-STK actuator seized again');
    expect(Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]).toBe('Fail to open (FTO)');
  });
  it('only shifts weight between options it has seen', () => {
    const p = blend(['A', 'B', 'C'], { A: 0.2, B: 0.2, C: 0.6 }, { A: 1 }, 0.5);
    expect(p.A).toBeCloseTo(0.6);
    expect(p.C).toBeCloseTo(0.3);
  });
  it('is switched on only when it beats keyword evidence on held-out records', async () => {
    const d = await trainOn(q, Array.from({ length: 90 }, (_, i) => ex(i)), localDecisionModel);
    expect(d.examples.total).toBe(90);
    expect(d.holdout.n).toBeGreaterThanOrEqual(5);
    expect(d.holdout.accuracy).toBeGreaterThan(d.holdout.baseAccuracy);
    expect(passes(d)).toBe(true);
    expect(passes({ ...d, examples: { ...d.examples, total: MIN_EXAMPLES - 1 } })).toBe(false);
    expect(passes({ ...d, holdout: { ...d.holdout, accuracy: d.holdout.baseAccuracy - 0.01 } })).toBe(false);
    expect(passes({ ...d, holdout: { n: 10, accuracy: 0.3, baseAccuracy: 0 } })).toBe(false);
  });
  it('never trains the guardrail questions', () => {
    expect(trainable('text.instruction_like')).toBe(false);
    expect(trainable('code.map')).toBe(false);
    expect(trainable('wo.failure_mode')).toBe(true);
  });
});

describe('model usage', () => {
  it('prices calls per model and leaves unknown models at zero', () => {
    expect(costOf('claude-opus-5-5', 1_000_000, 100_000)).toBeCloseTo(6);
    expect(costOf('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6);
    expect(costOf('local-rules', 1000, 1000)).toBe(0);
  });
});
