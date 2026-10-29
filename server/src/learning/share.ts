import { randomBytes } from 'node:crypto';
import type { Skill } from '../types.js';
import { one, q } from '../db.js';
import { getProject, listUsers, loadDataset } from '../store.js';
import { runEval } from '../evals/run.js';
import { recordEval } from '../evals/store.js';
import { anonymiseSkill } from './anonymise.js';
import { getSkill, saveSkill } from './store.js';

// Across-projects loop: a measured project skill is anonymised and proposed, tested on the golden
// datasets, and published by the curator in a new version of the shared library.

export class ShareError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** A skill helped when it lowered the review load or what it decided was kept by reviewers. */
export function helped(s: Skill) {
  const m = s.measuredEffect;
  if (!m?.enoughData) return false;
  const lowerLoad = m.before.needsReview !== null && m.after.needsReview !== null && m.after.needsReview < m.before.needsReview;
  const fewerErrors = m.before.loadErrors !== null && m.after.loadErrors !== null && m.after.loadErrors < m.before.loadErrors;
  return lowerLoad || fewerErrors || (m.after.acceptance ?? 0) >= 0.9;
}

export async function proposeForSharing(pid: string, skillId: string): Promise<Skill> {
  const project = await getProject(pid);
  const s = await getSkill(skillId);
  if (!project || !s || s.projectId !== pid) throw new ShareError(404, 'Not found');
  if (!project.sharedLearning) throw new ShareError(400, "Shared learning is off for this project; the customer's contract does not allow sharing");
  if (s.status !== 'measured') throw new ShareError(400, 'Only measured skills can be proposed');
  if (!helped(s)) throw new ShareError(400, 'The measured effect does not show a benefit yet');
  const ds = await loadDataset(pid);
  const terms = { people: (await listUsers()).map((u) => u.name), customers: [project.customer], sites: ds.locations.filter((l) => l.type === 'SITE').flatMap((l) => [l.description, l.location]) };
  const now = new Date().toISOString();
  const candidate: Skill = {
    ...s, ...anonymiseSkill(s, terms),
    id: `SK-S-${randomBytes(3).toString('hex').toUpperCase()}`, version: 1, scope: 'shared', projectId: undefined, status: 'proposed', owner: 'Ontology curator',
    learnedFrom: `${s.learnedFrom} (anonymised project skill)`, sourceProjects: [pid], sourceSkill: { id: s.id, version: s.version },
    approvedBy: undefined, approvedAt: undefined, measuredEffect: s.measuredEffect, createdAt: now, updatedAt: now,
  };
  await saveSkill(candidate);
  await saveSkill({ ...s, status: 'proposed', statusNote: `Proposed for sharing as ${candidate.id}` });
  return candidate;
}

/** Runs the golden datasets with the candidate loaded; it must not lower any metric. */
export async function testCandidate(skillId: string, actor: string): Promise<Skill> {
  const s = await getSkill(skillId);
  if (!s || s.scope !== 'shared') throw new ShareError(404, 'Not found');
  if (!['proposed', 'tested'].includes(s.status)) throw new ShareError(400, 'Only proposed skills are tested');
  const result = await runEval({ model: 'local', skills: [s] });
  const rec = await recordEval({ ...result, dataset: result.dataset }, `${actor} · testing ${s.id}`);
  const next: Skill = { ...s, status: rec.passed ? 'tested' : 'proposed', testRun: { id: rec.id, passed: rec.passed, regressions: rec.regressions }, statusNote: rec.passed ? 'Passed the golden datasets' : 'Lowered a metric on the golden datasets' };
  await saveSkill(next);
  return next;
}

const bump = (v: string) => { const m = v.match(/(\d+)\.(\d+)\.(\d+)/); return m ? `SL ${m[1]}.${Number(m[2]) + 1}.0` : 'SL 1.1.0'; };

/** Publishes every tested candidate in a new library version that keeps the previous skills. */
export async function publishLibrary(actor: string): Promise<{ version: string; added: string[] }> {
  const latest = await one<{ version: string; skills: { id: string; version: number; name: string }[] }>('SELECT version, skills FROM skill_library ORDER BY published_at DESC LIMIT 1');
  const tested = (await q<{ id: string; version: number; data: Skill }>(`SELECT id, version, data FROM skills WHERE scope = 'shared' AND status = 'tested'`)).map((r) => ({ ...r.data, id: r.id, version: r.version }));
  if (!tested.length) throw new ShareError(400, 'No tested skills to publish');
  const version = bump(latest?.version ?? 'SL 1.0.0');
  const skills = [...(latest?.skills ?? []), ...tested.map((s) => ({ id: s.id, version: s.version, name: s.name }))];
  for (const s of tested) await saveSkill({ ...s, status: 'published', statusNote: `Published in ${version}`, approvedBy: actor, approvedAt: new Date().toISOString() });
  await q('INSERT INTO skill_library (version, published_by, skills) VALUES ($1, $2, $3)', [version, actor, JSON.stringify(skills)]);
  return { version, added: tested.map((s) => s.id) };
}

/** Shared candidates and published shared skills, for the curator. */
export async function sharedSkills(): Promise<Skill[]> {
  return (await q<{ id: string; version: number; data: Skill; status: Skill['status'] }>(`SELECT id, version, data, status FROM skills WHERE scope = 'shared' ORDER BY updated_at DESC`))
    .map((r) => ({ ...r.data, id: r.id, version: r.version, status: r.status }));
}
