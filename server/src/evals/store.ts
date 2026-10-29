import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { one, q } from '../db.js';
import { GD01 } from './golden.js';
import { gate, runEval, type EvalMetrics, type EvalResult } from './run.js';

// Stored evaluation runs. Each run is gated against the previous run of the same model, or the
// committed baseline when there is none.

export const RELEASE = process.env.AMS_RELEASE ?? '1.3.0';

/** Curator limits for decision thresholds per industry pack; project overrides must stay inside. */
export const THRESHOLD_LIMITS: Record<string, { auto: [number, number]; human: [number, number] }> = {
  Utilities: { auto: [0.75, 0.97], human: [0.5, 0.75] },
};
export const limitsFor = (pack: string) => THRESHOLD_LIMITS[Object.keys(THRESHOLD_LIMITS).find((k) => pack.includes(k)) ?? 'Utilities'];

function baselineFile(): { model: string; metrics: Partial<EvalMetrics> } | undefined {
  for (const rel of ['./baseline.json', '../../src/evals/baseline.json']) {
    try { return JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')); } catch { /* next */ }
  }
  return undefined;
}

export async function recordEval(result: EvalResult, startedBy: string) {
  const prev = await one<{ result: EvalResult }>('SELECT result FROM eval_runs WHERE model = $1 AND dataset = $2 ORDER BY at DESC LIMIT 1', [result.model, result.dataset]);
  const base = prev?.result.metrics ?? (baselineFile()?.model === result.model ? baselineFile()!.metrics : undefined);
  const g = base ? gate(result.metrics, base) : { passed: true, regressions: [] };
  const id = `EV-${randomBytes(4).toString('hex')}`;
  await q('INSERT INTO eval_runs (id, release, dataset, model, passed, result, gate, started_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, RELEASE, result.dataset, result.model, g.passed, JSON.stringify(result), JSON.stringify({ ...g, against: prev ? 'previous run' : base ? 'baseline' : 'first run' }), startedBy]);
  return { id, ...g };
}

export async function listEvals() {
  return (await q<{ id: string; release: string; dataset: string; model: string; passed: boolean; result: EvalResult; gate: unknown; started_by: string; at: Date }>(
    'SELECT * FROM eval_runs ORDER BY at DESC LIMIT 50')).map((r) => ({ id: r.id, release: r.release, dataset: r.dataset, model: r.model, passed: r.passed, result: r.result, gate: r.gate, startedBy: r.started_by, at: r.at.toISOString() }));
}

/** Records a first evaluation with the in-environment model when none exists. */
export async function ensureFirstEval() {
  const has = await one<{ n: number }>('SELECT count(*)::int AS n FROM eval_runs');
  if (has?.n) return;
  await recordEval(await runEval({ model: 'local' }), 'release pipeline');
}

export const datasets = [GD01];
