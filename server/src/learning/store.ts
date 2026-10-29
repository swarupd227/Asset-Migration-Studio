import type { Project, Skill, SkillEffect, SkillRef } from '../types.js';
import { one, q } from '../db.js';

// Skill storage and loading. A project uses the shared skills of its pinned library version plus its
// own approved skills, when their conditions match the project.

type Row = { id: string; version: number; project_id: string | null; scope: Skill['scope']; status: Skill['status']; data: Skill; created_at: Date; updated_at: Date };
const toSkill = (r: Row): Skill => ({ ...r.data, id: r.id, version: r.version, scope: r.scope, status: r.status, projectId: r.project_id ?? undefined, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() });

export async function saveSkill(s: Skill) {
  await q(
    `INSERT INTO skills (id, version, project_id, scope, status, data) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id, version) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, updated_at = now()`,
    [s.id, s.version, s.projectId ?? null, s.scope, s.status, JSON.stringify(s)],
  );
}

export async function getSkill(id: string, version?: number): Promise<Skill | undefined> {
  const r = await one<Row>(`SELECT * FROM skills WHERE id = $1 ${version ? 'AND version = $2' : ''} ORDER BY version DESC LIMIT 1`, version ? [id, version] : [id]);
  return r ? toSkill(r) : undefined;
}

export async function pinnedLibrary(pid: string) {
  const p = await one<{ skill_library_version: string | null }>('SELECT skill_library_version FROM projects WHERE id = $1', [pid]);
  if (!p?.skill_library_version) return { version: null, skills: [] as SkillRef[] };
  const lib = await one<{ version: string; skills: SkillRef[] }>('SELECT version, skills FROM skill_library WHERE version = $1', [p.skill_library_version]);
  return { version: lib?.version ?? p.skill_library_version, skills: lib?.skills ?? [] };
}

/** All skills a project sees: the pinned shared library and every project skill, in any status. */
export async function projectSkills(pid: string): Promise<{ library: string | null; shared: Skill[]; project: Skill[] }> {
  const lib = await pinnedLibrary(pid);
  const shared: Skill[] = [];
  for (const ref of lib.skills) { const s = await getSkill(ref.id, ref.version); if (s) shared.push(s); }
  const project = (await q<Row>('SELECT * FROM skills WHERE project_id = $1 ORDER BY created_at DESC', [pid])).map(toSkill);
  return { library: lib.version, shared, project };
}

export function matches(s: Skill, p: Project) {
  const c = s.conditions;
  if (c.sourceSystems?.length && !c.sourceSystems.some((x) => p.sourceSystems.some((y) => y.toLowerCase().startsWith(x.toLowerCase())))) return false;
  if (c.industryPacks?.length && !c.industryPacks.some((x) => p.industryPack.toLowerCase().includes(x.toLowerCase()))) return false;
  return true;
}

const ACTIVE = new Set(['approved', 'measured', 'proposed', 'tested', 'published']);

/** Skills in effect for a project: published shared skills of the pinned library and approved project skills. */
export async function activeSkills(pid: string, project: Project): Promise<Skill[]> {
  const { shared, project: own } = await projectSkills(pid);
  return [...shared.filter((s) => s.status === 'published'), ...own.filter((s) => ACTIVE.has(s.status))].filter((s) => matches(s, project));
}

export const effectsOf = <T extends SkillEffect['type']>(skills: Skill[], type: T) =>
  skills.flatMap((s) => s.effects.filter((e): e is Extract<SkillEffect, { type: T }> => e.type === type).map((e) => ({ skill: s, effect: e })));

export const refs = (skills: Skill[]): { id: string; version: number }[] => skills.map((s) => ({ id: s.id, version: s.version }));

export async function recordUse(pid: string, s: Skill, agent: string, ref: string, items = 1) {
  if (items <= 0) return;
  await q('INSERT INTO skill_uses (project_id, skill_id, version, agent, ref, items) VALUES ($1,$2,$3,$4,$5,$6)', [pid, s.id, s.version, agent, ref, items]);
}

export async function skillUseCounts(pid: string) {
  return new Map((await q<{ skill_id: string; n: number; last: Date }>('SELECT skill_id, sum(items)::int AS n, max(at) AS last FROM skill_uses WHERE project_id = $1 GROUP BY skill_id', [pid]))
    .map((r) => [r.skill_id, { uses: r.n, last: r.last.toISOString() }]));
}
