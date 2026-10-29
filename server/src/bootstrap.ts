import { randomBytes } from 'node:crypto';
import type { Project, Question } from './types.js';
import { migrate, one, q } from './db.js';
import { INDUSTRY_PACK, ONTOLOGY_VERSION } from './data/ontology.js';
import { assets, closedWorkOrders, locations, meters, people, pmPlans, workOrders } from './data/seed.js';
import { buildMappings, catalogue, codeRules } from './data/catalog.js';
import { proposeFixes, validate } from './rules.js';
import { seedSharedLibrary } from './learning/library.js';
import { ensureFirstEval } from './evals/store.js';
import { addRun, audit, buildRun, getProject, insertRecords, loadDataset, putItems, setStage, STAGES } from './store.js';

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
const DAY = 60 * 24;

export interface NewProject {
  name: string;
  customer: string;
  mode: 'delivery' | 'preview';
  sourceSystems: string[];
  target: string;
  industryPack?: string;
  ontologyVersion?: string;
  region: string;
}

export async function createProject(input: NewProject, actor: { id: string; name: string }, id?: string): Promise<Project> {
  const pid = id ?? `${input.customer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)}-${randomBytes(3).toString('hex')}`;
  const expires = input.mode === 'preview' ? new Date(Date.now() + 30 * 86400_000) : null;
  await q(
    `INSERT INTO projects (id, name, customer, mode, source_systems, target, industry_pack, ontology_version, region, status, created_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [pid, input.name, input.customer, input.mode, JSON.stringify(input.sourceSystems), input.target, input.industryPack ?? INDUSTRY_PACK,
      input.ontologyVersion ?? ONTOLOGY_VERSION, input.region, 'Setting up', actor.id, expires],
  );
  for (const s of STAGES) {
    if (input.mode === 'preview' && !s.previewEligible) continue;
    await setStage(pid, s.n, { status: s.n === 1 ? 'ready' : 'locked' });
  }
  await seedSharedLibrary();
  await audit(pid, actor.name, 'user', 'project.create', pid, `Pinned ontology ${input.ontologyVersion ?? ONTOLOGY_VERSION}, pack ${input.industryPack ?? INDUSTRY_PACK}${expires ? `, expires ${expires.toISOString().slice(0, 10)}` : ''}`);
  return (await getProject(pid))!;
}

function questions(): Question[] {
  return [
    { id: 'Q-01', item: 'M-041', text: 'What does the local work order status NV-HOLD mean, and where should its 38 work orders go in IFS?', assignedTo: 'u-tom', status: 'open', options: ['Released, with a hold reason "Waiting for parts"', 'Prepared (not yet released)', 'Treat as cancelled'] },
    { id: 'Q-02', item: 'M-041', text: 'FLDCOMP is used on 27 work orders. Is it "field work complete, paperwork pending"?', assignedTo: 'u-tom', status: 'open', options: ['Yes → Work done or reported', 'No → Work started'] },
    { id: 'Q-03', item: 'M-041', text: 'PEND-REG (15 work orders) appears only on chlorinator work. Does it mean "pending regulator approval"?', assignedTo: 'u-tom', status: 'open', options: ['Yes → Released + regulatory flag', 'No → ask the site'] },
    { id: 'Q-04', item: 'BR-01', text: 'Confirm business rule BR-01: migrate open work orders and five years of closed history (8,068 work orders), and summarise older history per asset and year.', assignedTo: 'u-tom', status: 'answered', answer: 'Confirmed. Five years in full, older history summarised.' },
    { id: 'Q-05', item: 'M-012', text: 'Can we add custom field C_LEGACY_ID on serial objects in IFS Cloud for the GIS legacy id?', assignedTo: 'u-lena', status: 'open', options: ['Yes, add the custom field', 'No, store it as an object note'] },
  ];
}

/** Loads the Northvale Water & Power Maximo extract and its project history. */
async function seedNorthvale() {
  const pid = 'nvwp-mx-ifs';
  const maya = { id: 'u-maya', name: 'Maya Okafor' };
  await q(
    `INSERT INTO projects (id, name, customer, mode, source_systems, target, industry_pack, ontology_version, region, status, created_by, created_at)
     VALUES ($1,$2,$3,'delivery',$4,$5,$6,$7,$8,'In review',$9,$10)`,
    [pid, 'Northvale Maximo → IFS Cloud', 'Northvale Water & Power', JSON.stringify(['IBM Maximo 7.6.1.3']), 'IFS Cloud 25R2 · sandbox', INDUSTRY_PACK, ONTOLOGY_VERSION, 'Azure · UK South', maya.id, ago(21 * DAY)],
  );
  await insertRecords(pid, [
    ...locations.map((l) => ({ kind: 'location', key: l.location, data: l })),
    ...assets.map((a) => ({ kind: 'asset', key: a.assetnum, data: a })),
    ...[...workOrders, ...closedWorkOrders].map((w) => ({ kind: 'workorder', key: w.wonum, data: w })),
    ...pmPlans.map((p) => ({ kind: 'pm', key: p.pmnum, data: p })),
    ...meters.map((m) => ({ kind: 'meter', key: `${m.assetnum}:${m.metername}`, data: m })),
  ]);
  for (const t of catalogue) await q('INSERT INTO catalogue_tables (project_id, name, data) VALUES ($1, $2, $3)', [pid, t.name, JSON.stringify(t)]);
  await putItems(pid, 'mapping', buildMappings());
  await putItems(pid, 'code_rule', codeRules.map((r) => ({ ...r })));
  await putItems(pid, 'question', questions());

  const raw = await loadDataset(pid);
  const failures = validate(raw);
  await putItems(pid, 'fix', proposeFixes(raw, failures));

  const hist: [number, string, 'user' | 'agent', string, string?, string?][] = [
    [21 * DAY, 'Maya Okafor', 'user', 'project.create', pid, `Pinned ontology ${ONTOLOGY_VERSION}, pack ${INDUSTRY_PACK}`],
    [20 * DAY, 'Maya Okafor', 'user', 'connector.add', 'Maximo 7.6 (read-only, Oracle)', 'Credentials stored in Azure Key Vault'],
    [20 * DAY, 'Maya Okafor', 'user', 'connector.add', 'IFS Cloud sandbox', 'OData metadata + data migration tooling'],
    [11 * DAY, 'harvester', 'agent', 'stage.complete', 'Discover', `${catalogue.length} tables catalogued`],
    [10 * DAY, 'profiler', 'agent', 'stage.complete', 'Profile', `${raw.assets.length} assets, ${raw.workOrders.length} open work orders profiled`],
    [9 * DAY, 'code-reader', 'agent', 'stage.complete', 'Read custom code', `${codeRules.length} rules found in 41 scripts and classes`],
    [8 * DAY, 'aligner', 'agent', 'stage.complete', 'Align to ontology', `${buildMappings().length} bindings proposed`],
    [7 * DAY, 'target-designer', 'agent', 'stage.complete', 'Design target', '4 configuration items proposed'],
    [6 * DAY, 'orchestrator', 'agent', 'load.run', 'RUN-1', 'Dry run through IFS data migration tooling'],
    [5 * DAY, 'Dev Raman', 'user', 'mapping.approve', 'M-007'],
    [5 * DAY, 'Dev Raman', 'user', 'mapping.approve', 'M-033'],
    [5 * DAY, 'Dev Raman', 'user', 'mapping.approve', 'M-052'],
    [4 * DAY, 'Dev Raman', 'user', 'mapping.approve', 'M-061'],
    [4 * DAY, 'Dev Raman', 'user', 'mapping.approve', 'M-080'],
    [4 * DAY, 'Maya Okafor', 'user', 'mapping.not_migrated', 'M-013', 'Financial postings out of scope'],
    [4 * DAY, 'Tom Hughes', 'user', 'question.answer', 'Q-04', 'BR-01 confirmed'],
    [3 * DAY, 'orchestrator', 'agent', 'load.run', 'RUN-2', 'Dry run through IFS data migration tooling'],
  ];
  for (const [m, actor, kind, action, target, detail] of hist) await audit(pid, actor, kind, action, target, detail, ago(m));

  for (const n of [1, 2]) {
    const run = await buildRun(pid, n);
    run.startedAt = ago((n === 1 ? 6 : 3) * DAY);
    run.finishedAt = ago((n === 1 ? 6 : 3) * DAY - 42);
    await addRun(pid, run);
  }
  const run2 = await buildRun(pid, 2);
  const failing = run2.reconciliation!.filter((c) => c.outcome === 'fail').length;
  const metrics: Record<number, string> = {
    2: `${catalogue.length} tables · ${catalogue.filter((t) => t.custom).length} custom`, 3: `${raw.assets.length.toLocaleString('en-GB')} assets profiled`, 4: `${codeRules.length} business rules`,
    5: `${buildMappings().length} bindings`, 6: '4 config items', 7: `${buildMappings().filter((m) => m.status === 'proposed' || m.status === 'question').length} items to decide`,
    9: 'Run 2', 10: `${failures.length} findings`, 11: `${failing} checks failing`,
  };
  for (const s of STAGES) {
    const status = s.n <= 6 ? 'done' : s.n === 7 ? 'waiting' : s.n <= 11 ? 'done' : 'locked';
    await setStage(pid, s.n, { status, metric: metrics[s.n], finished: s.n <= 11 && s.n !== 7 });
  }
  await q(`UPDATE project_stages SET finished_at = now() - ((12 - n) || ' days')::interval WHERE project_id = $1 AND n <= 6`, [pid]);
  await q(`UPDATE project_stages SET finished_at = now() - interval '3 days' WHERE project_id = $1 AND n BETWEEN 8 AND 11`, [pid]);
}

export async function bootstrap() {
  await migrate();
  const hasUsers = await one<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if (!hasUsers?.n) {
    for (const p of people) {
      await q('INSERT INTO users (id, name, email, role, org, initials, can_approve) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [p.id, p.name, `${p.name.split(' ')[0].toLowerCase()}@${p.org === 'Northvale Water & Power' ? 'northvale.co.uk' : p.org === 'Artizent' ? 'artizent.com' : 'ifspartner.com'}`, p.role, p.org, p.initials, p.canApprove]);
    }
  }
  const proposals = await one<{ n: number }>('SELECT count(*)::int AS n FROM ontology_proposals');
  if (!proposals?.n) {
    for (const p of [
      { id: 'OP-01', change: 'Add synonym "booster station" (local term) to Pumping station', reason: 'Used for 3 Northvale locations; matched with 0.88 confidence', source: 'Project decision M-032', status: 'proposed' },
      { id: 'OP-02', change: 'Add local status pattern "field complete" as close match to Work complete', reason: 'Seen in 2 projects (anonymised)', source: 'Code list decision Q-02', status: 'proposed' },
    ]) await q('INSERT INTO ontology_proposals (id, status, data) VALUES ($1, $2, $3)', [p.id, p.status, JSON.stringify(p)]);
  }
  const hasProjects = await one<{ n: number }>('SELECT count(*)::int AS n FROM projects');
  if (!hasProjects?.n) await seedNorthvale();
  else await backfillClosedHistory();
  await seedSharedLibrary();
  await ensureFirstEval();
}

/** Projects loaded before closed history was part of the Northvale extract get it added once. */
async function backfillClosedHistory() {
  const pid = 'nvwp-mx-ifs';
  const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM source_records WHERE project_id = $1 AND kind = 'workorder' AND data->>'status' IN ('CLOSE', 'COMP')`, [pid]);
  const exists = await one<{ id: string }>('SELECT id FROM projects WHERE id = $1', [pid]);
  if (!exists || (n?.n ?? 0) > 0) return;
  await insertRecords(pid, closedWorkOrders.map((w) => ({ kind: 'workorder', key: w.wonum, data: w })));
  await audit(pid, 'system', 'system', 'extract.backfill', 'WORKORDER', `${closedWorkOrders.length.toLocaleString('en-GB')} closed work orders (five years) loaded`);
}

/** Removes the Northvale project and loads it again from its extract (admin operation). */
export async function reloadNorthvale() {
  await q(`DELETE FROM projects WHERE id = 'nvwp-mx-ifs'`);
  await q(`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update`);
  try {
    await q(`DELETE FROM audit_log WHERE project_id = 'nvwp-mx-ifs'`);
  } finally {
    await q(`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update`);
  }
  await seedNorthvale();
}
