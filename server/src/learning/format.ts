import type { Skill } from '../types.js';

// Agent Skills format: a SKILL.md file with YAML front matter (name, description, metadata)
// followed by Markdown instructions.

const yamlStr = (s: string) => JSON.stringify(s);

export function toSkillMd(s: Skill): string {
  const meta = {
    id: s.id, version: s.version, scope: s.scope, status: s.status, owner: s.owner, learned_from: s.learnedFrom,
    conditions: s.conditions, effects: s.effects,
  };
  return [
    '---',
    `name: ${yamlStr(s.name)}`,
    `description: ${yamlStr(s.description)}`,
    `metadata: ${JSON.stringify(meta)}`,
    '---',
    '',
    `# ${s.name}`,
    '',
    s.description,
    '',
    '## Steps',
    '',
    ...s.steps.map((x, i) => `${i + 1}. ${x}`),
    ...(s.examples.length ? ['', '## Worked examples', '', ...s.examples.map((x) => `- ${x}`)] : []),
    ...(s.evidence.length ? ['', '## Evidence', '', ...s.evidence.map((e) => `- ${e.kind} ${e.ref}: ${e.text}`)] : []),
    '',
  ].join('\n');
}

/** Reads the front matter of a SKILL.md file. Values are JSON-compatible YAML scalars. */
export function parseSkillMd(md: string): { name: string; description: string; metadata: Record<string, unknown>; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('SKILL.md needs front matter');
  const fields: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    try { fields[k] = JSON.parse(v); } catch { fields[k] = v; }
  }
  if (typeof fields.name !== 'string' || typeof fields.description !== 'string') throw new Error('SKILL.md needs name and description');
  return { name: fields.name, description: fields.description, metadata: (fields.metadata as Record<string, unknown>) ?? {}, body: m[2] };
}
