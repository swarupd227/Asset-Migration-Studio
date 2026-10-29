import type { Skill } from '../types.js';
import { one, q } from '../db.js';
import { getRuns } from '../store.js';
import { saveSkill, skillUseCounts } from './store.js';

// Measured effect of a skill (AL-05): reviewer acceptance of what the skill settled, review load on the
// questions it covers, and load errors for the rules it targets, before and after approval.

const MIN_USES = 20;

export interface Baseline { needsReview: number | null; loadErrors: number | null; at: string }

async function reviewLoad(pid: string, s: Skill) {
  const qs = [...new Set(s.effects.flatMap((e) => (e.type === 'decision_rule' ? [e.question] : [])).concat(s.conditions.questions ?? []))];
  if (!qs.length) return null;
  return (await one<{ n: number }>(`SELECT count(*)::int AS n FROM model_decisions WHERE project_id = $1 AND status = 'needs_review' AND question_id = ANY($2)`, [pid, qs]))?.n ?? 0;
}

async function loadErrors(pid: string, s: Skill) {
  const rule = s.trigger?.kind === 'load_errors' ? s.trigger.key.split(':')[1] : undefined;
  const run = (await getRuns(pid)).at(-1);
  if (!run) return null;
  return rule ? run.errors.filter((e) => e.ifsMessage.startsWith(`${rule}:`)).length : run.errors.length;
}

/** Snapshot taken when a skill is approved, to compare against later. */
export async function baseline(pid: string, s: Skill): Promise<Baseline> {
  return { needsReview: await reviewLoad(pid, s), loadErrors: await loadErrors(pid, s), at: new Date().toISOString() };
}

export async function measure(pid: string, s: Skill & { baseline?: Baseline }): Promise<Skill['measuredEffect']> {
  const uses = (await skillUseCounts(pid)).get(s.id)?.uses ?? 0;
  const settled = await one<{ n: number; overturned: number }>(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'overridden')::int AS overturned FROM model_decisions WHERE project_id = $1 AND data->'skill'->>'id' = $2`, [pid, s.id]);
  const acceptance = settled?.n ? (settled.n - settled.overturned) / settled.n : null;
  const after = { acceptance, needsReview: await reviewLoad(pid, s), loadErrors: await loadErrors(pid, s), reviewMinutes: null };
  const before = { acceptance: null, needsReview: s.baseline?.needsReview ?? null, loadErrors: s.baseline?.loadErrors ?? null, reviewMinutes: null };
  const enoughData = uses >= MIN_USES || (s.trigger?.kind === 'load_errors' && (await getRuns(pid)).some((r) => r.startedAt > (s.approvedAt ?? '')));
  return { uses, before, after, enoughData, at: new Date().toISOString() };
}

/** Updates measured effects and moves approved skills with enough data to "measured". */
export async function measureProjectSkills(pid: string) {
  const rows = await q<{ id: string; version: number; data: Skill & { baseline?: Baseline }; status: string }>(
    `SELECT id, version, data, status FROM skills WHERE project_id = $1 AND status IN ('approved', 'measured')`, [pid]);
  for (const r of rows) {
    const skill = { ...r.data, id: r.id, version: r.version, status: r.status as Skill['status'] };
    const m = await measure(pid, skill);
    await saveSkill({ ...skill, measuredEffect: m, status: m?.enoughData ? 'measured' : skill.status });
  }
}
