// Model-neutral interface for typed decisions (DM-01). A decision model answers one typed question
// per record with a probability for every allowed option; it never generates free text.

export interface TypedQuestion {
  id: string;
  kind: 'choice' | 'score' | 'yesno';
  /** What is being decided, phrased as a single, well-scoped judgement. */
  prompt: string;
}

export interface DecisionInput {
  hash: string;
  text: string;
  options: string[];
  context: Record<string, string>;
}

export interface DecisionAnswer {
  hash: string;
  probabilities: Record<string, number>;
}

export interface DecisionModel {
  name: string;
  version: string;
  decide(question: TypedQuestion, inputs: DecisionInput[]): Promise<{ answers: DecisionAnswer[]; tokens: number; costUsd: number }>;
}

export const MAX_CHOICE_OPTIONS = 255;

export function validateOptions(q: TypedQuestion, options: string[]) {
  if (q.kind === 'choice' && (options.length < 2 || options.length > MAX_CHOICE_OPTIONS)) throw new Error(`${q.id}: a choice question needs 2–${MAX_CHOICE_OPTIONS} options`);
  if (q.kind === 'score' && (options.length < 2 || options.length > 10)) throw new Error(`${q.id}: a score question needs 2–10 levels`);
  if (q.kind === 'yesno' && options.length !== 2) throw new Error(`${q.id}: a yes/no question has exactly two options`);
}

/** Normalises a probability map over the given options (missing options get 0). */
export function normalise(options: string[], raw: Record<string, number>): Record<string, number> {
  const vals = options.map((o) => Math.max(0, Number(raw[o]) || 0));
  const sum = vals.reduce((a, b) => a + b, 0);
  return Object.fromEntries(options.map((o, i) => [o, sum > 0 ? vals[i] / sum : 1 / options.length]));
}

export function top(p: Record<string, number>): [string, number] {
  return Object.entries(p).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
}
