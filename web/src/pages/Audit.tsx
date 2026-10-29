import { useMemo, useState } from 'react';
import { Bot, Fingerprint, Link2, Lock, ScrollText, Search, Server, ShieldCheck, Upload, UserRound } from 'lucide-react';
import type { AuditEntry } from '@shared/types';
import { useApi } from '@/lib/app';
import { clock, day } from '@/lib/format';
import { Badge, Button, Card, cx, Empty, Mono, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { agentName } from '@/components/agents';
import { downloadFile } from '@/components/c/charts';

interface AuditData { entries: AuditEntry[]; integrity: { ok: boolean; entries: number; head?: string; brokenAt?: number } }

const actionTone = (a: string) =>
  a.includes('reject') || a.includes('dismiss') ? 'neutral' : a.startsWith('signoff') ? 'accent' : a.startsWith('tool.') || a.startsWith('assistant') ? 'info' : a.includes('approve') || a.includes('confirm') || a.includes('complete') ? 'ok' : a.startsWith('load') || a.startsWith('stage') ? 'agent' : 'neutral';

export default function Audit() {
  const { data } = useApi<AuditData>('/audit');
  const [kind, setKind] = useState<'all' | AuditEntry['actorKind']>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.entries ?? []).filter((e) => (kind === 'all' || e.actorKind === kind) && (!t || `${e.actor} ${e.action} ${e.target ?? ''} ${e.detail ?? ''}`.toLowerCase().includes(t)));
  }, [data, kind, q]);

  if (!data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-[500px]" /></div>;
  const counts = { user: data.entries.filter((e) => e.actorKind === 'user').length, agent: data.entries.filter((e) => e.actorKind === 'agent').length };
  const exportJsonl = () => downloadFile(`ams-audit-${new Date().toISOString().slice(0, 10)}.jsonl`, [...data.entries].reverse().map((e) => JSON.stringify(e)).join('\n'), 'application/x-ndjson');

  return (
    <>
      <PageHeader
        eyebrow={<><ScrollText className="size-3.5" /> AU-01 · AU-02 · AU-03</>}
        title="Audit log"
        description="Every user action, agent call, approval and load is recorded with time, actor, inputs and outputs, plus the ontology and model version for agent calls."
        actions={<Button icon={Upload} onClick={exportJsonl}>Export to log store</Button>}
      />

      <Card className={cx('mb-5 flex flex-wrap items-center gap-4', data.integrity.ok ? 'border-ok/30' : 'border-crit/40')}>
        <div className={cx('grid size-11 place-items-center rounded-xl', data.integrity.ok ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit')}><Fingerprint className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{data.integrity.ok ? 'Hash chain verified' : `Chain broken at entry #${data.integrity.brokenAt}`}</span>
            <Badge tone="neutral" icon={Lock}>Write-once</Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-2">Entries are append-only and each one carries the SHA-256 of the one before it. No user can change the log, administrators included. Any edit would break the chain from that point on.</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-ink-3">Head</div>
          <Mono className="text-[11.5px] text-ink-2">{data.integrity.head?.slice(0, 16)}…</Mono>
          <div className="text-[11px] text-ink-3 tabular">{data.integrity.entries} entries</div>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={kind} onChange={setKind} options={[{ id: 'all', label: 'Everyone', count: data.entries.length }, { id: 'user', label: 'People', count: counts.user }, { id: 'agent', label: 'Agents', count: counts.agent }, { id: 'system', label: 'System' }]} />
        <div className="ml-auto flex h-8 w-72 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 shadow-card">
          <Search className="size-3.5 text-ink-4" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by actor, action, target…" className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-4" aria-label="Filter audit log" />
        </div>
      </div>

      {!rows.length ? <Empty icon={ShieldCheck} title="No entries match">Try a different filter.</Empty> : (
        <Card pad={false} className="overflow-hidden">
          <ol>
            {rows.map((e, i) => {
              const Icon = e.actorKind === 'user' ? UserRound : e.actorKind === 'agent' ? Bot : Server;
              const linked = rows[i + 1] && rows[i + 1].seq === e.seq - 1 && rows[i + 1].hash === e.prevHash;
              return (
                <li key={e.seq} className="group grid grid-cols-[3.5rem_7.5rem_1fr_auto] items-start gap-3 border-b border-line px-4 py-2.5 last:border-0 hover:bg-surface-2">
                  <Mono className="pt-0.5 text-ink-4">#{e.seq}</Mono>
                  <div className="text-[11.5px] leading-tight">
                    <div className="tabular text-ink-2">{clock(e.ts)}</div>
                    <div className="text-ink-4">{day(e.ts)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cx('grid size-5 place-items-center rounded-md', e.actorKind === 'agent' ? 'bg-agent-soft text-agent' : 'bg-sunken text-ink-2')}><Icon className="size-3" /></span>
                      <span className="text-[12.5px] font-medium">{e.actorKind === 'agent' ? agentName[e.actor] ?? e.actor : e.actor}</span>
                      <Badge tone={actionTone(e.action)}>{e.action}</Badge>
                      {e.target && <Mono className="text-ink-2">{e.target}</Mono>}
                    </div>
                    {e.detail && <div className="mt-0.5 truncate text-[12px] text-ink-3">{e.detail}</div>}
                    {e.model && <div className="mt-0.5 text-[10.5px] text-ink-4">{e.ontologyVersion} · {e.model}</div>}
                  </div>
                  <div className="text-right" title={`hash ${e.hash}\nprev ${e.prevHash}`}>
                    <Mono className="text-[11px] text-ink-2">{e.hash.slice(0, 10)}</Mono>
                    <div className="flex items-center justify-end gap-1 text-[10.5px] text-ink-4">
                      <Link2 className={cx('size-3', linked || e.seq === 1 ? 'text-ok' : 'text-ink-4')} />
                      {e.prevHash.slice(0, 8)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </>
  );
}
