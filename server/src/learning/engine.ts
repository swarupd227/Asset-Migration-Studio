import { q } from '../db.js';
import { emitAgent, getMappings, getProject, getRuns, recentEvents, audit, touch } from '../store.js';
import { draftSkill } from '../agents/steward.js';
import { questionById } from '../decisions/questions.js';
import { chainTriggers, correctionTriggers, driftTriggers, loadErrorTriggers, type TriggerHit } from './triggers.js';
import { saveSkill } from './store.js';

// Evaluates the skill triggers for a project and drafts a skill for each new one.

const busy = new Set<string>();
const again = new Set<string>();

/** Evaluates triggers; a call that arrives while one is running makes it run once more afterwards. */
export async function evaluateTriggers(pid: string): Promise<TriggerHit[]> {
  if (busy.has(pid)) { again.add(pid); return []; }
  busy.add(pid);
  try {
    const hits = await evaluateOnce(pid);
    while (again.delete(pid)) hits.push(...(await evaluateOnce(pid)));
    return hits;
  } finally {
    busy.delete(pid);
  }
}

async function evaluateOnce(pid: string): Promise<TriggerHit[]> {
  {
    const project = await getProject(pid);
    if (!project) return [];
    const [mappings, runs, events, overrides, reviewed, fired] = await Promise.all([
      getMappings(pid), getRuns(pid), recentEvents(pid, 400),
      q<{ id: string; question_id: string; answer: string; data: { modelAnswer?: string; input: string; reviewNote?: string; decidedBy?: string } }>(
        `SELECT id, question_id, answer, data FROM model_decisions WHERE project_id = $1 AND status = 'overridden'`, [pid]),
      q<{ question_id: string; confidence: number; status: string; data: { modelConfidence?: number } }>(
        `SELECT question_id, confidence, status, data FROM model_decisions WHERE project_id = $1 AND step = 'human' AND data ? 'decidedBy'`, [pid]),
      q<{ key: string }>('SELECT key FROM skill_triggers WHERE project_id = $1', [pid]),
    ]);
    const corrections = mappings.filter((m) => m.correctionKind && ['changed', 'rejected', 'not_migrated'].includes(m.status))
      .map((m) => ({ id: m.id, object: m.object, kind: m.correctionKind!, note: m.reviewNote, reviewer: m.reviewer }));
    const tagOverrides = overrides.filter((o) => o.data.modelAnswer).map((o) => ({
      id: o.id, question: o.question_id, label: questionById(o.question_id)?.label ?? o.question_id, from: o.data.modelAnswer!, to: o.answer,
      input: o.data.input, note: o.data.reviewNote, reviewer: o.data.decidedBy,
    }));
    const drift = reviewed.map((r) => ({ question: r.question_id, label: questionById(r.question_id)?.label ?? r.question_id, confidence: r.data.modelConfidence ?? r.confidence, overturned: r.status === 'overridden' }));
    const hits = [...correctionTriggers(corrections, tagOverrides), ...loadErrorTriggers(runs.at(-1)), ...driftTriggers(drift), ...chainTriggers(events)];
    const seen = new Set(fired.map((f) => f.key));
    const fresh = hits.filter((h) => !seen.has(h.key));
    for (const hit of fresh) {
      const skill = await draftSkill(pid, hit, project);
      await saveSkill(skill);
      await q('INSERT INTO skill_triggers (project_id, key, kind, skill_id, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [pid, hit.key, hit.kind, skill.id, JSON.stringify(hit)]);
      await audit(pid, 'steward', 'agent', 'skill.draft', skill.id, `${hit.title} · ${skill.effects.length} effect(s)`);
      await emitAgent(pid, { agent: 'steward', kind: 'needs_human', text: `Drafted skill "${skill.name}" from: ${hit.title}. It has no effect until a data subject expert approves it.` });
    }
    if (fresh.length) await touch(pid);
    return fresh;
  }
}

export const evaluateLater = (pid: string) => { evaluateTriggers(pid).catch((e) => console.error('Skill triggers failed:', (e as Error).message)); };
