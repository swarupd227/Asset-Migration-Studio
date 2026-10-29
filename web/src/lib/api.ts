// Thin client for the Asset Migration Studio API (proxied to :8787 in dev, same origin in production).

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

// Paths are project-scoped unless they belong to the platform itself.
let projectId: string | null = null;
export const setApiProject = (id: string | null) => { projectId = id; };
const GLOBAL = /^\/(meta|projects$|projects\?|ontology|health|admin|evals|curator)/;
function url(path: string) {
  if (GLOBAL.test(path) || !projectId) return `/api${path}`;
  return `/api/projects/${encodeURIComponent(projectId)}${path}`;
}

export const api = {
  get: <T,>(path: string) => fetch(url(path)).then((r) => handle<T>(r)),
  post: <T,>(path: string, body: unknown = {}) =>
    fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<T>(r)),
  upload: <T,>(path: string, file: File, fields: Record<string, string>) => {
    const qs = new URLSearchParams({ ...fields, filename: file.name }).toString();
    return fetch(`${url(path)}?${qs}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }).then((r) => handle<T>(r));
  },
};

/** Streams the Review Assistant answer; calls onText for each chunk. */
export async function streamAssistant(
  messages: { role: 'user' | 'assistant'; content: string }[],
  context: { page?: string; itemId?: string },
  onText: (t: string) => void,
  signal?: AbortSignal,
): Promise<{ live: boolean }> {
  const res = await fetch(url('/assistant'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context }),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, 'Assistant unavailable');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let live = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const p of parts) {
      const line = p.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const msg = JSON.parse(line.slice(6));
      if (msg.text) onText(msg.text);
      if (msg.error) throw new Error(msg.error);
      if (msg.done) live = !!msg.live;
    }
  }
  return { live };
}
