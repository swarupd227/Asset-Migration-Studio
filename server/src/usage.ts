import { AsyncLocalStorage } from 'node:async_hooks';
import { q } from './db.js';

// Model usage: tokens, cost and time of every external model call, by project, agent and stage.

/** USD per token, for prompts under 200K tokens. */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4 / 1e6, output: 20 / 1e6 },
  'claude-haiku-5-5': { input: 0.1 / 1e6, output: 0.5 / 1e6 },
};

export function costOf(model: string, input: number, output: number) {
  const p = PRICES[model];
  return p ? input * p.input + output * p.output : 0;
}

/** Where a call is made from: set once by a job or request, read by every model call inside it. */
export interface UsageContext { projectId?: string; stage?: number; job?: string }
const context = new AsyncLocalStorage<UsageContext>();
export const withUsage = <T,>(ctx: UsageContext, fn: () => Promise<T>) => context.run({ ...context.getStore(), ...ctx }, fn);

export interface CallRecord {
  agent: string;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  outcome: 'ok' | 'refusal' | 'error';
  error?: string;
  projectId?: string;
}

interface Usage { input_tokens?: number | null; output_tokens?: number | null }

/** Records one model call. Never throws: usage tracking must not break the work it measures. */
export async function recordCall(c: CallRecord) {
  const ctx = context.getStore() ?? {};
  const cost = costOf(c.model, c.inputTokens, c.outputTokens);
  try {
    await q(
      `INSERT INTO model_calls (project_id, stage, job_id, agent, model, purpose, input_tokens, output_tokens, cost_usd, ms, outcome, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [c.projectId ?? ctx.projectId ?? null, ctx.stage ?? null, ctx.job ?? null, c.agent, c.model, c.purpose, c.inputTokens, c.outputTokens, cost, Math.round(c.ms), c.outcome, c.error?.slice(0, 500) ?? null],
    );
  } catch (e) {
    console.error('Model usage not recorded:', (e as Error).message);
  }
  return cost;
}

/**
 * Times a model call and records it. `fn` returns the API response; its usage and stop reason are read from it.
 * Errors are recorded and rethrown.
 */
export async function tracked<T extends { usage?: Usage | null; stop_reason?: string | null }>(meta: { agent: string; model: string; purpose: string; projectId?: string }, fn: () => Promise<T>): Promise<{ res: T; cost: number; tokens: number }> {
  const t0 = Date.now();
  try {
    const res = await fn();
    const input = res.usage?.input_tokens ?? 0;
    const output = res.usage?.output_tokens ?? 0;
    const cost = await recordCall({ ...meta, inputTokens: input, outputTokens: output, ms: Date.now() - t0, outcome: res.stop_reason === 'refusal' ? 'refusal' : 'ok' });
    return { res, cost, tokens: input + output };
  } catch (e) {
    await recordCall({ ...meta, inputTokens: 0, outputTokens: 0, ms: Date.now() - t0, outcome: 'error', error: (e as Error).message });
    throw e;
  }
}

export interface UsageSummary {
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number; errors: number; refusals: number; p50Ms: number; p95Ms: number };
  byAgent: { agent: string; calls: number; tokens: number; costUsd: number; avgMs: number }[];
  byModel: { model: string; calls: number; tokens: number; costUsd: number }[];
  byStage: { stage: number; calls: number; costUsd: number }[];
  byDay: { day: string; calls: number; costUsd: number }[];
  recent: { at: string; agent: string; model: string; purpose: string; tokens: number; costUsd: number; ms: number; outcome: string; stage: number | null }[];
  inEnvironment: { batches: number; records: number };
  budgetUsd: number | null;
}

/** Usage for one project, or for the whole platform when `pid` is null. */
export async function usageSummary(pid: string | null, days = 30): Promise<UsageSummary> {
  const where = `at > now() - ($1 || ' days')::interval${pid ? ' AND project_id = $2' : ''}`;
  const args: unknown[] = pid ? [String(days), pid] : [String(days)];
  const num = (v: unknown) => Number(v ?? 0);
  const [t] = await q<Record<string, unknown>>(
    `SELECT count(*) AS calls, coalesce(sum(input_tokens),0) AS i, coalesce(sum(output_tokens),0) AS o, coalesce(sum(cost_usd),0) AS c,
            count(*) FILTER (WHERE outcome = 'error') AS e, count(*) FILTER (WHERE outcome = 'refusal') AS r,
            coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY ms),0) AS p50, coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY ms),0) AS p95
     FROM model_calls WHERE ${where}`, args);
  const byAgent = await q<Record<string, unknown>>(`SELECT agent, count(*) AS calls, sum(input_tokens + output_tokens) AS tokens, sum(cost_usd) AS c, avg(ms) AS ms FROM model_calls WHERE ${where} GROUP BY agent ORDER BY c DESC`, args);
  const byModel = await q<Record<string, unknown>>(`SELECT model, count(*) AS calls, sum(input_tokens + output_tokens) AS tokens, sum(cost_usd) AS c FROM model_calls WHERE ${where} GROUP BY model ORDER BY c DESC`, args);
  const byStage = await q<Record<string, unknown>>(`SELECT stage, count(*) AS calls, sum(cost_usd) AS c FROM model_calls WHERE ${where} AND stage IS NOT NULL GROUP BY stage ORDER BY stage`, args);
  const byDay = await q<Record<string, unknown>>(`SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day, count(*) AS calls, sum(cost_usd) AS c FROM model_calls WHERE ${where} GROUP BY 1 ORDER BY 1`, args);
  const recent = await q<Record<string, unknown>>(`SELECT at, agent, model, purpose, input_tokens + output_tokens AS tokens, cost_usd, ms, outcome, stage FROM model_calls WHERE ${where} ORDER BY at DESC LIMIT 25`, args);
  // Decision batches settled by the in-environment model make no external calls; they are counted separately.
  const [env] = await q<Record<string, unknown>>(
    `SELECT count(*) AS b, coalesce(sum((data->'counts'->>'records')::int),0) AS n FROM decision_batches
     WHERE created_at > now() - ($1 || ' days')::interval${pid ? ' AND project_id = $2' : ''} AND (data->>'model' LIKE 'local%' OR data->>'model' LIKE 'trained%')`, args);
  const budget = pid ? (await q<{ model_budget_usd: number | null }>('SELECT model_budget_usd FROM projects WHERE id = $1', [pid]))[0]?.model_budget_usd ?? null : null;
  return {
    totals: { calls: num(t.calls), inputTokens: num(t.i), outputTokens: num(t.o), costUsd: num(t.c), errors: num(t.e), refusals: num(t.r), p50Ms: num(t.p50), p95Ms: num(t.p95) },
    byAgent: byAgent.map((r) => ({ agent: String(r.agent), calls: num(r.calls), tokens: num(r.tokens), costUsd: num(r.c), avgMs: Math.round(num(r.ms)) })),
    byModel: byModel.map((r) => ({ model: String(r.model), calls: num(r.calls), tokens: num(r.tokens), costUsd: num(r.c) })),
    byStage: byStage.map((r) => ({ stage: num(r.stage), calls: num(r.calls), costUsd: num(r.c) })),
    byDay: byDay.map((r) => ({ day: String(r.day), calls: num(r.calls), costUsd: num(r.c) })),
    recent: recent.map((r) => ({ at: (r.at as Date).toISOString(), agent: String(r.agent), model: String(r.model), purpose: String(r.purpose), tokens: num(r.tokens), costUsd: num(r.cost_usd), ms: num(r.ms), outcome: String(r.outcome), stage: r.stage == null ? null : num(r.stage) })),
    inEnvironment: { batches: num(env?.b), records: num(env?.n) },
    budgetUsd: budget == null ? null : Number(budget),
  };
}

/** Spend this calendar month, for the budget check before external calls. */
export async function monthSpend(pid: string) {
  const [r] = await q<{ c: string }>(`SELECT coalesce(sum(cost_usd),0) AS c FROM model_calls WHERE project_id = $1 AND at >= date_trunc('month', now())`, [pid]);
  return Number(r?.c ?? 0);
}

/** Whether the project has used its monthly model budget; external calls then stop until next month or a higher budget. */
export async function budgetReached(pid: string) {
  const [r] = await q<{ model_budget_usd: string | null }>('SELECT model_budget_usd FROM projects WHERE id = $1', [pid]);
  if (r?.model_budget_usd == null) return false;
  return (await monthSpend(pid)) >= Number(r.model_budget_usd);
}
