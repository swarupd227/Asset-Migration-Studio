import { readFileSync, writeFileSync } from 'node:fs';
import { gate, runEval, type EvalMetrics } from './run.js';

// npm run eval [-- --model configured] [-- --write-baseline]
// Runs GD-01 and fails (exit 1) when any metric is worse than the committed baseline.

const args = process.argv.slice(2);
const model = args.includes('--model') ? (args[args.indexOf('--model') + 1] as 'local' | 'configured') : 'local';
const baselinePath = new URL('./baseline.json', import.meta.url);

const result = await runEval({ model });
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as { model: string; metrics: Partial<EvalMetrics> };

console.log(`${result.dataset} · ${result.model} · ${result.ontologyVersion} · ${result.ms} ms`);
for (const [k, v] of Object.entries(result.metrics)) {
  const b = baseline.metrics[k as keyof EvalMetrics];
  console.log(`  ${k.padEnd(24)} ${String(v).padEnd(8)} baseline ${b ?? '-'}`);
}
console.log(`  suggested auto-accept threshold ${result.thresholdSuggestion.auto} (precision ${result.thresholdSuggestion.precisionAtAuto})`);

if (args.includes('--write-baseline')) {
  writeFileSync(baselinePath, `${JSON.stringify({ model: result.model, dataset: result.dataset, ontologyVersion: result.ontologyVersion, metrics: result.metrics }, null, 2)}\n`);
  console.log('Baseline written.');
} else if (result.model === baseline.model) {
  const g = gate(result.metrics, baseline.metrics);
  if (!g.passed) {
    for (const r of g.regressions) console.error(`REGRESSION ${r.metric}: ${r.now} (baseline ${r.baseline})`);
    process.exit(1);
  }
  console.log('Release gate passed: no metric below baseline.');
} else {
  console.log(`Baseline is for ${baseline.model}; gate not applied to ${result.model}.`);
}
