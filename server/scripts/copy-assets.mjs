// Copies non-TypeScript files the server reads at run time into the build output.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../dist/evals/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/evals/baseline.json', import.meta.url), new URL('../dist/evals/baseline.json', import.meta.url));
