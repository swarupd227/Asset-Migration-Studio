import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { one, q } from './db.js';
import { withUsage } from './usage.js';

// Work queue for long-running work (stage runs, decision batches, model training). Any replica's
// worker claims queued jobs with FOR UPDATE SKIP LOCKED; a project runs one job at a time. A job whose
// worker stops sending heartbeats is queued again once, then marked failed.

export type JobKind = 'stage.run' | 'decisions.run' | 'decisions.train';
export interface Job {
  id: string;
  projectId: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  attempts: number;
  worker: string | null;
  requestedBy: string;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  label: string;
}

const MAX_ATTEMPTS = 2;
const STALE_SECONDS = 90;
const WORKER = `${hostname()}:${process.pid}`;

export class JobConflict extends Error {}

type Row = { id: string; project_id: string; kind: JobKind; payload: Record<string, unknown>; status: Job['status']; attempts: number; worker: string | null; requested_by: string; error: string | null; created_at: Date; started_at: Date | null; finished_at: Date | null };

export function labelOf(kind: JobKind, payload: Record<string, unknown>) {
  if (kind === 'stage.run') return `Stage ${payload.n}`;
  if (kind === 'decisions.train') return 'Train in-environment model';
  const ids = payload.ids as string[];
  return ids.length > 1 ? 'All decision questions' : `Decision batch · ${ids[0]}`;
}

const toJob = (r: Row): Job => ({
  id: r.id, projectId: r.project_id, kind: r.kind, payload: r.payload, status: r.status, attempts: r.attempts, worker: r.worker,
  requestedBy: r.requested_by, error: r.error, createdAt: r.created_at.toISOString(), startedAt: r.started_at?.toISOString() ?? null,
  finishedAt: r.finished_at?.toISOString() ?? null, label: labelOf(r.kind, r.payload),
});

/** Queues a job. A project has at most one queued or running job. */
export async function enqueue(pid: string, kind: JobKind, payload: Record<string, unknown>, requestedBy: string): Promise<Job> {
  const id = `JOB-${randomBytes(4).toString('hex')}`;
  // The partial unique index makes the one-job-per-project rule hold across replicas.
  const row = await one<Row>(
    `INSERT INTO jobs (id, project_id, kind, payload, requested_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id) WHERE status IN ('queued', 'running') DO NOTHING RETURNING *`,
    [id, pid, kind, JSON.stringify(payload), requestedBy]);
  if (!row) {
    const active = await activeJob(pid);
    throw new JobConflict(active ? `${active.label} is ${active.status === 'queued' ? 'queued' : 'running'}; try again when it finishes` : 'Another job is running');
  }
  wake();
  return toJob(row);
}

export async function activeJob(pid: string) {
  const r = await one<Row>(`SELECT * FROM jobs WHERE project_id = $1 AND status IN ('queued', 'running') ORDER BY created_at LIMIT 1`, [pid]);
  return r ? toJob(r) : null;
}

export async function listJobs(pid: string, limit = 20) {
  return (await q<Row>('SELECT * FROM jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2', [pid, limit])).map(toJob);
}

// ---------------- Worker ----------------

type Handler = (job: Job) => Promise<void>;
const handlers = new Map<JobKind, Handler>();
export const handle = (kind: JobKind, fn: Handler) => { handlers.set(kind, fn); };

/** Called when a job fails for good, so the owner can put the project back in a usable state. */
let onFailed: (job: Job, error: string) => Promise<void> = async () => {};
export const onJobFailed = (fn: typeof onFailed) => { onFailed = fn; };

let timer: NodeJS.Timeout | null = null;
let stopping = false;
const inFlight = new Map<string, Promise<void>>();
let concurrency = 2;
let kick: () => void = () => {};
const wake = () => kick();

async function claim(): Promise<Job | null> {
  const r = await one<Row>(
    `UPDATE jobs SET status = 'running', worker = $1, attempts = attempts + 1, started_at = now(), heartbeat_at = now()
     WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING *`, [WORKER]);
  return r ? toJob(r) : null;
}

/** Records the outcome, unless the job was taken away from this worker in the meantime. */
async function finish(id: string, status: 'done' | 'failed', error?: string) {
  await q(`UPDATE jobs SET status = $2, error = $3, finished_at = now() WHERE id = $1 AND worker = $4 AND status = 'running'`, [id, status, error ?? null, WORKER]);
}

/** Jobs whose worker stopped: queued again while attempts remain, failed otherwise. */
export async function reap() {
  const stale = await q<Row>(
    `UPDATE jobs SET status = CASE WHEN attempts < $2 THEN 'queued' ELSE 'failed' END, worker = NULL,
       finished_at = CASE WHEN attempts < $2 THEN NULL ELSE now() END,
       error = CASE WHEN attempts < $2 THEN 'The worker running this job stopped; queued again' ELSE 'The worker stopped ' || attempts || ' times while running this job' END
     WHERE status = 'running' AND heartbeat_at < now() - ($1 || ' seconds')::interval RETURNING *`, [String(STALE_SECONDS), MAX_ATTEMPTS]);
  for (const r of stale) if (r.status === 'failed') await onFailed(toJob(r), r.error ?? 'Worker stopped').catch(() => {});
}

async function run(job: Job) {
  const fn = handlers.get(job.kind);
  const beat = setInterval(() => { q('UPDATE jobs SET heartbeat_at = now() WHERE id = $1', [job.id]).catch(() => {}); }, 15_000);
  try {
    if (!fn) throw new Error(`No handler for ${job.kind}`);
    await withUsage({ projectId: job.projectId, job: job.id, stage: job.kind === 'stage.run' ? Number(job.payload.n) : undefined }, () => fn(job));
    await finish(job.id, 'done');
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    await finish(job.id, 'failed', msg);
    await onFailed(job, msg).catch(() => {});
  } finally {
    clearInterval(beat);
  }
}

async function tick() {
  if (stopping) return;
  try {
    await reap();
    while (!stopping && inFlight.size < concurrency) {
      const job = await claim();
      if (!job) break;
      const p = run(job).finally(() => { inFlight.delete(job.id); void tick(); });
      inFlight.set(job.id, p);
    }
  } catch (e) {
    console.error('Job worker:', (e as Error).message);
  }
}

/** Starts this replica's worker. AMS_WORKER=off runs the API without one. */
export function startWorker(opts: { concurrency?: number; pollMs?: number } = {}) {
  if (process.env.AMS_WORKER === 'off') return false;
  concurrency = opts.concurrency ?? Number(process.env.AMS_WORKER_CONCURRENCY ?? 2);
  kick = () => { void tick(); };
  timer = setInterval(() => void tick(), opts.pollMs ?? 2000);
  void tick();
  return true;
}

/** Stops claiming work; jobs still running on this replica are queued again for another worker. */
export async function stopWorker() {
  stopping = true;
  if (timer) clearInterval(timer);
  if (inFlight.size) await q(`UPDATE jobs SET status = 'queued', worker = NULL, attempts = greatest(attempts - 1, 0), error = 'Queued again: the replica running it was stopped' WHERE worker = $1 AND status = 'running'`, [WORKER]);
}

export const workerId = WORKER;
