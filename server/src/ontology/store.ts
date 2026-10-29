import { randomBytes } from 'node:crypto';
import type { Concept, EnhancementItem, EnhancementSource, OntologyProposalRecord, Person } from '../types.js';
import { one, q, tx } from '../db.js';
import { audit, listProjects } from '../store.js';
import { concepts as releaseConcepts, ontologyChangeLog, ONTOLOGY_VERSION } from '../data/ontology.js';
import { applyExtensions, describeItem, indexOf } from './graph.js';
import { screenItems } from './validate.js';

// Ontology proposals and accepted extensions. The release ontology is code; accepted proposals are rows
// that are merged into the served ontology and each acceptance publishes a new patch version.

type ExtensionRow = { id: string; proposal_id: string; concept_id: string | null; kind: string; data: EnhancementItem | Record<string, never>; version: string; change: string; reason: string; source: string; accepted_by: string; accepted_at: Date };

const parseVersion = (v: string) => {
  const m = v.match(/^(.*?)(\d+)\.(\d+)\.(\d+)$/);
  return m ? { prefix: m[1], major: +m[2], minor: +m[3], patch: +m[4] } : undefined;
};
const BASE = parseVersion(ONTOLOGY_VERSION)!;
const sameRelease = (v: string) => { const p = parseVersion(v); return !!p && p.major === BASE.major && p.minor === BASE.minor; };

/** Next patch version on top of the release and the extensions already published. */
export function nextVersion(published: string[]): string {
  const patches = published.filter(sameRelease).map((v) => parseVersion(v)!.patch);
  return `${BASE.prefix}${BASE.major}.${BASE.minor}.${Math.max(BASE.patch, ...patches) + 1}`;
}

async function extensionRows(): Promise<ExtensionRow[]> {
  return q<ExtensionRow>('SELECT * FROM ontology_extensions ORDER BY accepted_at, id');
}

export async function servedOntology(): Promise<{ version: string; concepts: Concept[]; changeLog: typeof ontologyChangeLog; extensions: number }> {
  const rows = await extensionRows();
  const live = rows.filter((r) => r.concept_id && r.kind !== 'note' && sameRelease(r.version));
  const concepts = applyExtensions(releaseConcepts, live.map((r) => ({ conceptId: r.concept_id!, item: r.data as EnhancementItem })));
  const versions = rows.map((r) => r.version).filter(sameRelease);
  const version = versions.length ? `${BASE.prefix}${BASE.major}.${BASE.minor}.${Math.max(...versions.map((v) => parseVersion(v)!.patch))}` : ONTOLOGY_VERSION;
  const changeLog = [
    ...rows.slice().reverse().map((r) => ({ version: r.version.replace(BASE.prefix, ''), date: r.accepted_at.toISOString().slice(0, 10), change: r.change, reason: r.reason, source: r.source, author: r.accepted_by })),
    ...ontologyChangeLog,
  ];
  return { version, concepts, changeLog, extensions: live.length };
}

export async function listProposals(): Promise<OntologyProposalRecord[]> {
  return (await q<{ data: OntologyProposalRecord; status: OntologyProposalRecord['status'] }>('SELECT data, status FROM ontology_proposals ORDER BY id')).map((r) => ({ ...r.data, status: r.status }));
}

async function auditAll(actor: string, action: string, target: string, detail: string) {
  for (const p of await listProjects()) await audit(p.id, actor, 'user', action, target, detail);
}

/** Records suggested additions as proposals. Items are screened again against the served ontology. */
export async function createProposals(conceptId: string, raw: unknown[], meta: { origin: EnhancementSource; model?: string; actor: Person }): Promise<{ created: OntologyProposalRecord[]; skipped: number }> {
  const { concepts } = await servedOntology();
  const byId = indexOf(concepts);
  const { items, dropped } = screenItems(conceptId, raw, concepts);
  const open = new Set((await listProposals()).filter((p) => p.status === 'proposed' && p.conceptId === conceptId && p.item).map((p) => p.item!.key));
  const fresh = items.filter((i) => !open.has(i.key));
  const now = new Date().toISOString();
  const source = meta.origin === 'model' ? `Ontology Steward · ${meta.model ?? 'model'}` : 'Ontology Steward · in-environment';
  const created: OntologyProposalRecord[] = [];
  for (const item of fresh) {
    const rec: OntologyProposalRecord = {
      id: `OP-${randomBytes(3).toString('hex').toUpperCase()}`, change: describeItem(conceptId, item, byId), reason: item.rationale || 'Suggested by the Ontology Steward',
      source, status: 'proposed', conceptId, kind: item.kind, item, origin: meta.origin, ...(meta.model ? { model: meta.model } : {}), proposedBy: meta.actor.name, proposedAt: now,
    };
    await q('INSERT INTO ontology_proposals (id, status, data) VALUES ($1, $2, $3)', [rec.id, rec.status, JSON.stringify(rec)]);
    created.push(rec);
  }
  if (created.length) await auditAll(meta.actor.name, 'ontology.propose', created.map((c) => c.id).join(', '), `${created.length} addition(s) to ${byId.get(conceptId)?.label ?? conceptId} · ${source}`);
  return { created, skipped: dropped + (items.length - fresh.length) };
}

export class ProposalError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Accepts or rejects proposals. Accepted proposals with a structured addition become extensions of the
 * served ontology under one new patch version; every acceptance is recorded in the change log.
 */
export async function decideProposals(ids: string[], decision: 'accept' | 'reject', actor: Person): Promise<{ records: OntologyProposalRecord[]; version?: string }> {
  if (actor.role !== 'Ontology curator') throw new ProposalError(403, 'Only the ontology curator can accept ontology proposals');
  const status = decision === 'reject' ? 'rejected' : 'accepted';
  const now = new Date().toISOString();
  const result = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['ontology_extensions']);
    const rows = (await c.query<{ id: string; status: string; data: OntologyProposalRecord }>('SELECT id, status, data FROM ontology_proposals WHERE id = ANY($1) FOR UPDATE', [ids])).rows;
    if (rows.length !== ids.length) throw new ProposalError(404, 'Not found');
    const decided = rows.find((r) => r.status !== 'proposed');
    if (decided) throw new ProposalError(409, `Proposal ${decided.id} is already ${decided.status}`);
    const version = status === 'accepted' ? nextVersion((await c.query<{ version: string }>('SELECT version FROM ontology_extensions')).rows.map((r) => r.version)) : undefined;
    const records: OntologyProposalRecord[] = [];
    for (const r of rows) {
      const rec: OntologyProposalRecord = { ...r.data, status, decidedBy: actor.name, decidedAt: now, ...(version ? { version } : {}) };
      await c.query('UPDATE ontology_proposals SET status = $2, data = $3 WHERE id = $1', [r.id, status, JSON.stringify(rec)]);
      if (status === 'accepted') {
        await c.query(
          'INSERT INTO ontology_extensions (id, proposal_id, concept_id, kind, data, version, change, reason, source, accepted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [`OX-${randomBytes(4).toString('hex').toUpperCase()}`, r.id, rec.conceptId ?? null, rec.item ? rec.kind : 'note', JSON.stringify(rec.item ?? {}), version, rec.change, rec.reason, rec.source, actor.name],
        );
      }
      records.push(rec);
    }
    return { records, version };
  });
  await auditAll(actor.name, `ontology.${decision}`, ids.join(', '), result.version ? `Published ${result.version} · ${result.records.map((r) => r.change).join('; ').slice(0, 300)}` : result.records.map((r) => r.change).join('; ').slice(0, 300));
  return result;
}

export async function proposalById(id: string) {
  return one<{ data: OntologyProposalRecord; status: string }>('SELECT data, status FROM ontology_proposals WHERE id = $1', [id]);
}
