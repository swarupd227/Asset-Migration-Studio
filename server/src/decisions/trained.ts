import { createHash } from 'node:crypto';
import { one, q, tx } from '../db.js';
import { normalise, top, type DecisionInput, type DecisionModel, type TypedQuestion } from './model.js';
import { questionById } from './questions.js';
import { GUARDED_QUESTIONS } from '../learning/schema.js';

/** Questions a trained model may answer: not the guardrail screens, which stay with keyword rules and people. */
export const trainable = (id: string) => !GUARDED_QUESTIONS.includes(id);

// In-environment decision model trained on this project's own decisions (DM-02 second fallback, DM-07).
// Labels are answers a person gave or confirmed, and answers the reasoning model confirmed; plain
// model answers are never used, so the model does not learn from itself. It runs inside the
// platform with no external calls and is only switched on when it beats keyword evidence on held-out
// decisions.

export const MIN_EXAMPLES = 30;
/** A trained version is never used below this held-out accuracy, however weak the keyword evidence is. */
export const MIN_ACCURACY = 0.75;
const HOLDOUT = 0.2;
const MAX_TOKENS = 3000;
const PERSON_WEIGHT = 3;

export interface TrainedData {
  options: string[];
  priors: Record<string, number>;
  /** Weighted token counts per option. */
  counts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  vocab: number;
  /** How much the trained model counts against keyword evidence (0–1). */
  weight: number;
  examples: { total: number; person: number; reasoning: number };
  holdout: { n: number; accuracy: number; baseAccuracy: number };
}

export interface TrainedModelRow { questionId: string; version: number; active: boolean; data: TrainedData; trainedBy: string; trainedAt: string }

export function tokens(text: string) {
  const w = text.toLowerCase().replace(/\[[a-z ]+\]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length > 1 && !/^\d+$/.test(x));
  const out = new Set(w);
  for (let i = 0; i + 1 < w.length; i++) out.add(`${w[i]}_${w[i + 1]}`);
  return [...out];
}

export interface Example { text: string; answer: string; weight: number; key: string }

export function fit(examples: Example[], weight = 0.7): Omit<TrainedData, 'examples' | 'holdout'> {
  const options = [...new Set(examples.map((e) => e.answer))];
  const counts: Record<string, Record<string, number>> = Object.fromEntries(options.map((o) => [o, {}]));
  const totals: Record<string, number> = Object.fromEntries(options.map((o) => [o, 0]));
  const priors: Record<string, number> = Object.fromEntries(options.map((o) => [o, 0]));
  const df = new Map<string, number>();
  for (const e of examples) {
    priors[e.answer] += e.weight;
    for (const t of tokens(e.text)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  // Keep the most frequent tokens; rare ones are noise and make the stored model large.
  const keep = new Set([...df.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_TOKENS).map(([t]) => t));
  for (const e of examples) for (const t of tokens(e.text)) if (keep.has(t)) {
    counts[e.answer][t] = (counts[e.answer][t] ?? 0) + e.weight;
    totals[e.answer] += e.weight;
  }
  return { options, priors, counts, totals, vocab: keep.size, weight };
}

/** Naive Bayes probabilities over the options the model has seen; unseen options get nothing. */
export function predict(m: Pick<TrainedData, 'options' | 'priors' | 'counts' | 'totals' | 'vocab'>, text: string): Record<string, number> {
  const toks = tokens(text);
  const prior = Object.values(m.priors).reduce((a, b) => a + b, 0);
  const logs = m.options.map((o) => {
    let l = Math.log((m.priors[o] + 1) / (prior + m.options.length));
    for (const t of toks) l += Math.log(((m.counts[o][t] ?? 0) + 1) / (m.totals[o] + m.vocab + 1));
    return l;
  });
  const max = Math.max(...logs);
  const ex = logs.map((l) => Math.exp(l - max));
  const sum = ex.reduce((a, b) => a + b, 0);
  return Object.fromEntries(m.options.map((o, i) => [o, ex[i] / sum]));
}

/** Blends trained probabilities with the base model's: the trained model only shifts weight between options it knows. */
export function blend(options: string[], base: Record<string, number>, trained: Record<string, number>, weight: number) {
  return normalise(options, Object.fromEntries(options.map((o) => [o, (1 - weight) * (base[o] ?? 0) + weight * (trained[o] ?? 0)])));
}

const isHoldout = (key: string) => createHash('sha256').update(key).digest().readUInt32BE(0) / 0xffffffff < HOLDOUT;

/** Trains on the examples and measures the result on a fixed held-out share against the base model. */
export async function trainOn(question: TypedQuestion, examples: (Example & { options: string[]; context: Record<string, string> })[], base: DecisionModel): Promise<TrainedData> {
  const test = examples.filter((e) => isHoldout(e.key));
  const train = examples.filter((e) => !isHoldout(e.key));
  const n = Math.max(1, train.length);
  const weight = Math.min(0.8, n / (n + 40));
  const probe = fit(train, weight);
  const baseAnswers = new Map((await base.decide(question, test.map((e, i) => ({ hash: String(i), text: e.text, options: e.options, context: e.context })))).answers.map((a) => [a.hash, a.probabilities]));
  // Scores count as right within one level, as in the decision flow.
  const right = (a: string) => (question.kind === 'score' ? (e: Example) => Math.abs(Number(a) - Number(e.answer)) <= 1 : (e: Example) => a === e.answer);
  let ok = 0;
  let baseOk = 0;
  test.forEach((e, i) => {
    const b = baseAnswers.get(String(i)) ?? {};
    if (right(top(b)[0])(e)) baseOk++;
    if (right(top(blend(e.options, b, predict(probe, e.text), weight))[0])(e)) ok++;
  });
  const full = fit(examples, Math.min(0.8, examples.length / (examples.length + 40)));
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    ...full,
    examples: { total: examples.length, person: examples.filter((e) => e.weight === PERSON_WEIGHT).length, reasoning: examples.filter((e) => e.weight !== PERSON_WEIGHT).length },
    holdout: { n: test.length, accuracy: test.length ? round(ok / test.length) : 0, baseAccuracy: test.length ? round(baseOk / test.length) : 0 },
  };
}

/** Whether a trained model may replace keyword evidence: enough held-out decisions and no worse than the base. */
export const passes = (d: TrainedData) => d.examples.total >= MIN_EXAMPLES && d.holdout.n >= 5 && d.holdout.accuracy >= MIN_ACCURACY && d.holdout.accuracy >= d.holdout.baseAccuracy;

/** Decisions usable as labels for a question. */
export async function labels(pid: string, questionId: string) {
  const rows = await q<{ record_key: string; answer: string; data: { input: string; options: string[]; context: Record<string, string>; decidedBy?: string; step: string; abstained?: boolean } }>(
    `SELECT record_key, answer, data FROM model_decisions WHERE project_id = $1 AND question_id = $2
       AND ((data->>'decidedBy') IS NOT NULL OR (step = 'reasoning' AND status = 'accepted'))`, [pid, questionId]);
  return rows.filter((r) => !r.data.abstained).map((r) => ({ key: r.record_key, text: r.data.input, answer: r.answer, options: r.data.options, context: r.data.context ?? {}, weight: r.data.decidedBy ? PERSON_WEIGHT : 1 }));
}

export async function trainQuestion(pid: string, questionId: string, base: DecisionModel, actor: string): Promise<TrainedModelRow & { reason?: string }> {
  const question = questionById(questionId);
  if (!question) throw new Error(`Unknown question ${questionId}`);
  if (!trainable(questionId)) throw new Error(`${question.label} is a guardrail question and is not trained`);
  const examples = await labels(pid, questionId);
  const data = await trainOn(question, examples, base);
  const ok = passes(data);
  const prev = await one<{ v: number }>('SELECT coalesce(max(version), 0) AS v FROM trained_models WHERE project_id = $1 AND question_id = $2', [pid, questionId]);
  const version = (prev?.v ?? 0) + 1;
  await tx(async (c) => {
    if (ok) await c.query('UPDATE trained_models SET active = false WHERE project_id = $1 AND question_id = $2', [pid, questionId]);
    else {
      // The version in use stays only while it still meets the current rules.
      const current = await c.query<{ version: number; data: TrainedData }>('SELECT version, data FROM trained_models WHERE project_id = $1 AND question_id = $2 AND active', [pid, questionId]);
      for (const r of current.rows) if (!passes(r.data)) await c.query('UPDATE trained_models SET active = false WHERE project_id = $1 AND question_id = $2 AND version = $3', [pid, questionId, r.version]);
    }
    await c.query('INSERT INTO trained_models (project_id, question_id, version, active, data, trained_by) VALUES ($1, $2, $3, $4, $5, $6)', [pid, questionId, version, ok, JSON.stringify(data), actor]);
  });
  const reason = ok ? undefined
    : data.examples.total < MIN_EXAMPLES ? `${MIN_EXAMPLES - data.examples.total} more decided records needed`
    : data.holdout.n < 5 ? 'Too few held-out decisions to measure it'
    : data.holdout.accuracy < MIN_ACCURACY ? `Held-out accuracy ${pct(data.holdout.accuracy)} is below the ${pct(MIN_ACCURACY)} minimum`
    : `Held-out accuracy ${pct(data.holdout.accuracy)} is below keyword evidence (${pct(data.holdout.baseAccuracy)})`;
  return { questionId, version, active: ok, data, trainedBy: actor, trainedAt: new Date().toISOString(), reason };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export async function trainedModels(pid: string): Promise<TrainedModelRow[]> {
  const rows = await q<{ question_id: string; version: number; active: boolean; data: TrainedData; trained_by: string; trained_at: Date }>(
    'SELECT * FROM trained_models WHERE project_id = $1 ORDER BY question_id, version DESC', [pid]);
  return rows.map((r) => ({ questionId: r.question_id, version: r.version, active: r.active, data: r.data, trainedBy: r.trained_by, trainedAt: r.trained_at.toISOString() }));
}

/**
 * The project's in-environment model: trained models where active, the base model elsewhere.
 * Its name changes with the active versions, so cached answers of an older version are not reused.
 */
export async function trainedDecisionModel(pid: string, base: DecisionModel): Promise<DecisionModel> {
  const active = (await trainedModels(pid)).filter((m) => m.active);
  if (!active.length) return base;
  const byQ = new Map(active.map((m) => [m.questionId, m]));
  const tag = createHash('sha256').update(active.map((m) => `${m.questionId}@${m.version}`).sort().join(',')).digest('hex').slice(0, 6);
  return {
    name: `trained-${tag}`,
    version: active.map((m) => `${m.questionId}@${m.version}`).join(' '),
    async decide(question: TypedQuestion, inputs: DecisionInput[], hints?: string[]) {
      const r = await base.decide(question, inputs, hints);
      const m = byQ.get(question.id);
      if (!m) return r;
      const byHash = new Map(inputs.map((i) => [i.hash, i]));
      return { ...r, answers: r.answers.map((a) => { const inp = byHash.get(a.hash)!; return { ...a, probabilities: blend(inp.options, a.probabilities, predict(m.data, inp.text), m.data.weight) }; }) };
    },
  };
}

/** Retrains every question with enough decided records; reports what changed. */
export async function trainProject(pid: string, base: DecisionModel, actor: string, questionIds: string[]) {
  const { audit, emitAgent } = await import('../store.js');
  const results: (TrainedModelRow & { reason?: string })[] = [];
  for (const id of questionIds.filter(trainable)) {
    const n = (await labels(pid, id)).length;
    if (n < MIN_EXAMPLES && questionIds.length > 1) continue;
    const r = await trainQuestion(pid, id, base, actor);
    results.push(r);
    const label = questionById(id)?.label ?? id;
    await emitAgent(pid, {
      agent: 'decision-model', kind: r.active ? 'result' : 'tool', tool: r.active ? undefined : 'model.train',
      text: r.active
        ? `${label}: trained version ${r.version} on ${r.data.examples.total} decided records; held-out accuracy ${pct(r.data.holdout.accuracy)} against ${pct(r.data.holdout.baseAccuracy)} for keyword evidence. Now used in the environment.`
        : `${label}: version ${r.version} not switched on. ${r.reason}.`,
    });
    await audit(pid, actor, actor === 'steward' ? 'agent' : 'user', 'model.train', `${id} v${r.version}`,
      `${r.data.examples.person} person and ${r.data.examples.reasoning} reasoning-confirmed labels · held-out ${r.data.holdout.n} · accuracy ${r.data.holdout.accuracy} vs ${r.data.holdout.baseAccuracy} · ${r.active ? 'active' : 'not active'}`);
  }
  if (!results.length) await emitAgent(pid, { agent: 'decision-model', kind: 'done', text: `No question has ${MIN_EXAMPLES} decided records yet; the in-environment model keeps using keyword evidence.` });
  return results;
}
