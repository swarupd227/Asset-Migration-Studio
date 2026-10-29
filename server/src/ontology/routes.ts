import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Person } from '../types.js';
import { getUser } from '../store.js';
import { INDUSTRY_PACK, ONTOLOGY_VERSION, relationTypes, standards, woStatusCodeList } from '../data/ontology.js';
import { suggestEnhancement, liveEnhancement } from './enhance.js';
import { createProposals, decideProposals, listProposals, ProposalError, servedOntology } from './store.js';

// /api/ontology: the served ontology (release plus accepted extensions), AI enhancement of a concept,
// and the curator's proposal decisions.

class RouteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch((e: unknown) => {
    if (e instanceof RouteError || e instanceof ProposalError) return res.status(e.status).json({ error: e.message });
    next(e);
  });
};
const parse = <T,>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new RouteError(400, r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
};
async function actorOf(req: Request): Promise<Person> {
  const id = String(req.body?.actor ?? req.query.actor ?? req.header('x-user-id') ?? '');
  const u = await getUser(id);
  if (!u) throw new RouteError(401, 'Unknown user');
  return u;
}

// Model calls: 10 enhancement requests per client per minute.
const hits = new Map<string, number[]>();
function limited(req: Request) {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export const ontologyRouter = Router();

ontologyRouter.get('/', wrap(async (_req, res) => {
  const [served, proposals] = await Promise.all([servedOntology(), listProposals()]);
  res.json({
    version: served.version, releaseVersion: ONTOLOGY_VERSION, pack: INDUSTRY_PACK, concepts: served.concepts, relationTypes,
    codeList: woStatusCodeList, standards, changeLog: served.changeLog, proposals, extensions: served.extensions, enhancement: { live: liveEnhancement() },
  });
}));

ontologyRouter.post('/concepts/:id/enhance', wrap(async (req, res) => {
  await actorOf(req);
  if (limited(req)) { res.set('Retry-After', '30'); throw new RouteError(429, 'Too many enhancement requests; try again shortly'); }
  const { concepts } = await servedOntology();
  const id = String(req.params.id);
  if (!concepts.some((c) => c.id === id)) throw new RouteError(404, 'Unknown concept');
  const body = parse(z.object({ model: z.enum(['auto', 'local']).default('auto') }).passthrough(), req.body ?? {});
  res.json(await suggestEnhancement(id, concepts, { model: body.model }));
}));

const proposeBody = z.object({
  items: z.array(z.unknown()).min(1).max(60),
  origin: z.enum(['model', 'in-environment']),
  model: z.string().max(80).optional(),
  decision: z.enum(['propose', 'accept', 'reject']).default('propose'),
}).passthrough();

ontologyRouter.post('/concepts/:id/proposals', wrap(async (req, res) => {
  const actor = await actorOf(req);
  const body = parse(proposeBody, req.body);
  if (body.decision !== 'propose' && actor.role !== 'Ontology curator') throw new RouteError(403, 'Only the ontology curator can accept or reject additions; propose them instead');
  const { created, skipped } = await createProposals(String(req.params.id), body.items, { origin: body.origin, model: body.model, actor });
  if (!created.length) throw new RouteError(409, 'Nothing new to propose: every addition already exists, is already proposed, or does not fit the ontology');
  if (body.decision === 'propose') return res.json({ proposals: created, skipped });
  const { records, version } = await decideProposals(created.map((c) => c.id), body.decision, actor);
  res.json({ proposals: records, skipped, version });
}));

ontologyRouter.post('/proposals/:id', wrap(async (req, res) => {
  const actor = await actorOf(req);
  const decision = req.body?.decision === 'reject' ? 'reject' : 'accept';
  const { records, version } = await decideProposals([String(req.params.id)], decision, actor);
  res.json({ ...records[0], ...(version ? { version } : {}) });
}));
