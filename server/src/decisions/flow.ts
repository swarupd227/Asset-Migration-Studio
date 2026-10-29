import { createHash, randomBytes } from 'node:crypto';
import type { DecisionBatch, DecisionStep, ModelDecision } from '../types.js';
import { one, q } from '../db.js';
import { ONTOLOGY_VERSION } from '../data/ontology.js';
import { audit, emitAgent, listUsers, loadDataset, getProject } from '../store.js';
import { claudeDecisionModel } from './adapters/claude.js';
import { localDecisionModel } from './adapters/local.js';
import { mask, normaliseText } from './mask.js';
import { top, validateOptions, type DecisionModel } from './model.js';
import { itemsFor, questionById } from './questions.js';
import { reason, reasoningAvailable } from './reasoning.js';

// Four-step decision flow: rules → decision model → reasoning model → person.

export interface Thresholds { auto: number; human: number; sample: number }
export const DEFAULT_THRESHOLDS: Thresholds = { auto: 0.85, human: 0.6, sample: 0.05 };

/** Which step settles a model answer with this confidence. */
export function band(confidence: number, t: Thresholds): Exclude<DecisionStep, 'rule'> {
  if (confidence >= t.auto) return 'model';
  if (confidence >= t.human) return 'reasoning';
  return 'human';
}

/** Deterministic review sample of auto-accepted answers: the same records on every run. */
export function inSample(recordKey: string, rate: number) {
  const h = createHash('sha256').update(recordKey).digest().readUInt32BE(0);
  return h / 0xffffffff < rate;
}

export function inputHash(questionId: string, ontologyVersion: string, options: string[], text: string) {
  return createHash('sha256').update([questionId, ontologyVersion, options.join('|'), normaliseText(text)].join('\u0000')).digest('hex').slice(0, 32);
}

export async function decisionModelFor(pid: string): Promise<DecisionModel> {
  const row = await one<{ decision_model: string }>('SELECT decision_model FROM projects WHERE id = $1', [pid]);
  const choice = row?.decision_model ?? 'auto';
  if (choice === 'local') return localDecisionModel;
  return reasoningAvailable() ? claudeDecisionModel() : localDecisionModel;
}

export async function thresholdsFor(pid: string): Promise<Thresholds> {
  const row = await one<{ decision_thresholds: Thresholds }>('SELECT decision_thresholds FROM projects WHERE id = $1', [pid]);
  return { ...DEFAULT_THRESHOLDS, ...(row?.decision_thresholds ?? {}) };
}

type CacheEntry = { probabilities: Record<string, number> } | { answer: string; explanation: string };

async function cacheGet(pid: string, questionId: string, model: string, hashes: string[]) {
  if (!hashes.length) return new Map<string, CacheEntry>();
  const rows = await q<{ input_hash: string; data: CacheEntry }>(
    'SELECT input_hash, data FROM decision_cache WHERE project_id = $1 AND question_id = $2 AND ontology_version = $3 AND model = $4 AND input_hash = ANY($5)',
    [pid, questionId, ONTOLOGY_VERSION, model, hashes],
  );
  return new Map(rows.map((r) => [r.input_hash, r.data]));
}
async function cachePut(pid: string, questionId: string, model: string, entries: [string, CacheEntry][]) {
  if (!entries.length) return;
  await q(
    `INSERT INTO decision_cache (project_id, input_hash, question_id, ontology_version, model, data)
     SELECT $1, x.h, $2, $3, $4, x.d FROM jsonb_to_recordset($5::jsonb) AS x(h text, d jsonb) ON CONFLICT DO NOTHING`,
    [pid, questionId, ONTOLOGY_VERSION, model, JSON.stringify(entries.map(([h, d]) => ({ h, d })))],
  );
}

export async function runQuestion(pid: string, questionId: string, actor: string): Promise<DecisionBatch> {
  const question = questionById(questionId);
  if (!question) throw new Error(`Unknown question ${questionId}`);
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const [ds, project, users, thresholds, model] = await Promise.all([loadDataset(pid), getProject(pid), listUsers(), thresholdsFor(pid), decisionModelFor(pid)]);
  const terms = {
    people: users.map((u) => u.name),
    customers: project ? [project.customer] : [],
    sites: ds.locations.filter((l) => l.type === 'SITE').flatMap((l) => [l.description]),
  };
  const items = itemsFor(questionId, ds).map((it) => {
    validateOptions(question, it.options);
    const text = mask(it.text, terms);
    return { ...it, text, hash: inputHash(questionId, ONTOLOGY_VERSION, it.options, text) };
  });
  const toModel = items.filter((i) => !i.ruleAnswer);
  const unique = [...new Map(toModel.map((i) => [i.hash, i])).values()];
  await emitAgent(pid, { agent: 'decision-model', kind: 'plan', text: `${question.label}: ${items.length.toLocaleString('en-GB')} records, ${(items.length - toModel.length).toLocaleString('en-GB')} settled by rules, ${unique.length.toLocaleString('en-GB')} distinct texts for ${model.name}.` });

  // Decision model, with the per-project cache in front of it.
  const cached = await cacheGet(pid, questionId, model.name, unique.map((u) => u.hash));
  const misses = unique.filter((u) => !cached.has(u.hash));
  let tokens = 0;
  let cost = 0;
  if (misses.length) {
    const r = await model.decide(question, misses.map((m) => ({ hash: m.hash, text: m.text, options: m.options, context: m.context })));
    tokens += r.tokens;
    cost += r.costUsd;
    for (const a of r.answers) cached.set(a.hash, { probabilities: a.probabilities });
    await cachePut(pid, questionId, model.name, r.answers.map((a) => [a.hash, { probabilities: a.probabilities }]));
  }
  await emitAgent(pid, { agent: 'decision-model', kind: 'tool', tool: 'decision_model.decide', args: model.name, text: `${misses.length.toLocaleString('en-GB')} model calls, ${(unique.length - misses.length).toLocaleString('en-GB')} answers from cache.`, ms: Date.now() - t0 });

  // Reasoning model for the middle band and the review sample (one call per distinct text).
  const probs = (h: string) => ((cached.get(h) as { probabilities?: Record<string, number> })?.probabilities ?? {});
  const needsReasoning = new Map<string, (typeof unique)[number]>();
  for (const it of toModel) {
    const [, conf] = top(probs(it.hash));
    const b = band(conf, thresholds);
    if (b === 'reasoning' || (b === 'model' && inSample(it.recordKey, thresholds.sample))) needsReasoning.set(it.hash, it);
  }
  const reasoningModel = reasoningAvailable() ? `${process.env.AMS_MODEL ?? 'claude-opus-5-5'}` : 'none';
  const rCached = await cacheGet(pid, questionId, `${reasoningModel}:reasoning`, [...needsReasoning.keys()]);
  const rMiss = [...needsReasoning.values()].filter((i) => !rCached.has(i.hash));
  if (rMiss.length && reasoningAvailable()) {
    const r = await reason(question, rMiss.map((i) => { const [ans, conf] = top(probs(i.hash)); return { hash: i.hash, text: i.text, options: i.options, context: i.context, modelAnswer: ans, modelConfidence: Math.round(conf * 100) / 100 }; }));
    tokens += r.tokens;
    cost += r.costUsd;
    for (const o of r.outputs) rCached.set(o.hash, { answer: o.answer, explanation: o.explanation });
    await cachePut(pid, questionId, `${reasoningModel}:reasoning`, r.outputs.map((o) => [o.hash, { answer: o.answer, explanation: o.explanation }]));
    await emitAgent(pid, { agent: 'decision-model', kind: 'tool', tool: 'reasoning.check', args: reasoningModel, text: `Reasoning model checked ${rMiss.length.toLocaleString('en-GB')} distinct texts in the middle band and the review sample.` });
  }

  // Settle every record.
  const counts = { records: items.length, unique: unique.length, cacheHits: unique.length - misses.length, modelCalls: misses.length, rule: 0, model: 0, reasoning: 0, human: 0, sampled: 0 };
  const now = new Date().toISOString();
  const decisions: ModelDecision[] = items.map((it) => {
    const base = { id: `${questionId}:${it.recordKey}`, questionId, recordKind: question.recordKind, recordKey: it.recordKey, inputHash: it.hash, input: it.text, context: it.context, options: it.options, ontologyVersion: ONTOLOGY_VERSION, createdAt: now };
    if (it.ruleAnswer) {
      counts.rule++;
      return { ...base, answer: it.ruleAnswer, probabilities: { [it.ruleAnswer]: 1 }, confidence: 1, step: 'rule', status: 'accepted', model: 'rule', modelVersion: '1' };
    }
    const p = probs(it.hash);
    const [answer, confidence] = top(p);
    const m = { ...base, answer, probabilities: p, confidence, model: model.name, modelVersion: model.version };
    const b = band(confidence, thresholds);
    const r = rCached.get(it.hash) as { answer: string; explanation: string } | undefined;
    const reasoning = r ? { answer: r.answer, explanation: r.explanation, model: reasoningModel } : undefined;
    if (b === 'model') {
      const sampled = inSample(it.recordKey, thresholds.sample);
      if (sampled) counts.sampled++;
      if (sampled && reasoning && reasoning.answer !== answer) { counts.human++; return { ...m, step: 'human', status: 'needs_review', reasoning, sampled }; }
      counts.model++;
      return { ...m, step: 'model', status: 'accepted', reasoning, sampled };
    }
    if (b === 'reasoning' && reasoning) {
      if (reasoning.answer === answer) { counts.reasoning++; return { ...m, step: 'reasoning', status: 'accepted', reasoning }; }
      counts.human++;
      return { ...m, step: 'human', status: 'needs_review', reasoning };
    }
    counts.human++;
    return { ...m, step: 'human', status: 'needs_review', reasoning };
  });

  // Persist; a person's override is never replaced by a later run.
  for (let i = 0; i < decisions.length; i += 2000) {
    await q(
      `INSERT INTO model_decisions (project_id, id, question_id, record_kind, record_key, input_hash, step, status, confidence, answer, data)
       SELECT $1, x.id, x."questionId", x."recordKind", x."recordKey", x."inputHash", x.step, x.status, x.confidence, x.answer, x.d
       FROM jsonb_to_recordset($2::jsonb) AS x(id text, "questionId" text, "recordKind" text, "recordKey" text, "inputHash" text, step text, status text, confidence real, answer text, d jsonb)
       ON CONFLICT (project_id, id) DO UPDATE SET input_hash = EXCLUDED.input_hash, step = EXCLUDED.step, status = EXCLUDED.status, confidence = EXCLUDED.confidence, answer = EXCLUDED.answer, data = EXCLUDED.data, created_at = now()
       WHERE model_decisions.status <> 'overridden'`,
      [pid, JSON.stringify(decisions.slice(i, i + 2000).map((d) => ({ ...d, d })))],
    );
  }
  const batch: DecisionBatch = { id: `DB-${randomBytes(4).toString('hex')}`, questionId, model: model.name, reasoningModel, startedAt, finishedAt: new Date().toISOString(), counts, tokens, costUsd: Math.round(cost * 10000) / 10000, ms: Date.now() - t0 };
  await q('INSERT INTO decision_batches (project_id, id, question_id, data) VALUES ($1, $2, $3, $4)', [pid, batch.id, questionId, JSON.stringify(batch)]);
  const digest = createHash('sha256').update(decisions.map((d) => `${d.id}=${d.answer}`).join('\n')).digest('hex').slice(0, 16);
  await audit(pid, actor, 'agent', 'decision.batch', `${questionId} · ${batch.id}`, `${counts.records} records · rules ${counts.rule} · model ${counts.model} · reasoning ${counts.reasoning} · people ${counts.human} · ${model.name} · digest ${digest}`);
  await emitAgent(pid, { agent: 'decision-model', kind: counts.human ? 'needs_human' : 'done', text: `${question.label}: ${counts.rule + counts.model + counts.reasoning} settled automatically, ${counts.human} need a person.` });
  return batch;
}
