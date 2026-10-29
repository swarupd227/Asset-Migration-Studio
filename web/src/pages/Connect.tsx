import { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Clock, Database, EyeOff, FileSpreadsheet, KeyRound, Lock, Play, PlugZap, Server, ShieldCheck, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { useApi, useApp } from '@/lib/app';
import { api, ApiError } from '@/lib/api';
import { day, num } from '@/lib/format';
import type { CatalogueTable, CodeRule } from '@shared/types';
import { Badge, Button, Card, CardHeader, cx, PageHeader, SectionLabel, Skeleton } from '@/components/ui';

interface Extract { id: string; filename: string; table: string; rows: number; columns: string[]; format: 'csv' | 'xlsx' | 'parquet'; sheet: string | null; uploadedBy: string; uploadedAt: string }
interface UploadResult { format: string; tables: { table: string; sheet?: string; rows: number; custom: string[] }[] }

const formatLabel = { csv: 'CSV', xlsx: 'Excel', parquet: 'Parquet' } as const;
const ACCEPTED = /\.(csv|txt|xlsx|parquet)$/i;

function ExtractUpload({ region }: { region: string }) {
  const { persona, act } = useApp();
  const { data: extracts } = useApi<Extract[]>('/extracts');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  // The customer data owner and the ontology curator review data; they do not load it.
  const blocked = !persona || ['Customer data owner', 'Ontology curator'].includes(persona.role);
  const upload = async (files: FileList | File[]) => {
    if (!persona || blocked) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      if (!ACCEPTED.test(f.name)) { await act(() => Promise.reject(new ApiError(400, `${f.name}: upload CSV, Excel (.xlsx) or Parquet files`))); continue; }
      const r = await act(() => api.upload<UploadResult>('/extracts', f, { actor: persona.id }));
      if (r) await act(async () => r, r.tables.length > 1
        ? `${f.name}: ${r.tables.length} sheets loaded (${r.tables.map((t) => `${t.table} ${num(t.rows)}`).join(', ')})`
        : `${f.name} loaded into ${r.tables[0].table}: ${num(r.tables[0].rows)} rows`);
    }
    setBusy(false);
  };
  return (
    <Card>
      <CardHeader icon={FileSpreadsheet} title="Flat file extracts" subtitle="CSV, Excel or Parquet with a header row. One file per table (ASSET, LOCATIONS, WORKORDER, PM), or one workbook with a sheet per table." />
      <label onDragOver={(e) => { e.preventDefault(); if (!blocked) setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
        aria-disabled={blocked}
        className={cx('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition',
          blocked ? 'cursor-not-allowed border-line bg-sunken/60 opacity-70' : over ? 'cursor-pointer border-accent bg-accent-soft/50' : 'cursor-pointer border-line-strong bg-surface-2 hover:border-accent hover:bg-accent-soft/40')}>
        {blocked ? <Lock className="size-6 text-ink-4" /> : <UploadCloud className={cx('size-6', busy ? 'animate-bounce text-accent' : 'text-ink-3')} />}
        <span className="text-[13px] font-medium">{blocked ? `${persona?.role ?? 'This role'} cannot upload extracts` : busy ? 'Uploading and profiling…' : 'Drop extract files or browse'}</span>
        <span className="text-xs text-ink-3">{blocked ? 'A migration lead or data subject expert loads source extracts.' : `Files stay in the project's isolated storage in ${region}`}</span>
        <input type="file" multiple accept=".csv,.txt,.xlsx,.parquet,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Upload extract files" disabled={busy || blocked}
          onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
      </label>
      {!!extracts?.length && (
        <div className="mt-3 divide-y divide-line rounded-lg border border-line">
          {extracts.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
              <FileSpreadsheet className="size-4 text-ink-3" />
              <span className="font-medium">{x.filename}{x.sheet && <span className="font-normal text-ink-3"> · {x.sheet}</span>}</span>
              <Badge tone="neutral">{x.table}</Badge>
              <Badge tone="info">{formatLabel[x.format] ?? x.format}</Badge>
              <span className="tabular text-ink-3">{num(x.rows)} rows · {x.columns.length} columns</span>
              <span className="ml-auto text-xs text-ink-4">{x.uploadedBy} · {day(x.uploadedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
      <span className="text-ink-3">{k}</span>
      <span className="text-right font-medium text-ink-2">{v}</span>
    </div>
  );
}

export default function Connect() {
  const { dashboard: d, runStage, persona } = useApp();
  const { data: cat } = useApi<{ tables: CatalogueTable[] }>('/catalogue');
  const { data: rules } = useApi<CodeRule[]>('/code-rules');
  const navigate = useNavigate();
  if (!d) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  const s1 = d.stages.find((s) => s.n === 1)!;
  const s2 = d.stages.find((s) => s.n === 2)!;
  const busy = !!d.running;
  // Projects with a database connection read custom code; the others are loaded from extracts.
  const fileBased = !rules?.length;

  return (
    <>
      <PageHeader
        eyebrow={<><PlugZap className="size-3.5" />Stage 1 · Connect</>}
        title="Sources and target"
        description="Source connectors, extract uploads and the IFS Cloud target for this project."
        actions={<>
          <Button icon={Play} disabled={busy} onClick={() => runStage(1)}>Test connections</Button>
          <Button variant="agent" icon={Play} disabled={busy} onClick={() => runStage(2)}>Run discovery</Button>
        </>}
      />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <SectionLabel right={<Badge tone={s1.status === 'done' ? 'ok' : 'neutral'} dot>{s1.status === 'done' ? 'Healthy' : s1.status}</Badge>}>Source systems</SectionLabel>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader icon={Database} title={d.project.sourceSystems[0]} subtitle={fileBased ? 'Loaded from flat file extracts' : 'Oracle 19c · schema MAXIMO · database read access'}
                right={<Badge tone="ok" icon={Lock}>Read-only</Badge>} />
              <div className="grid gap-x-6 sm:grid-cols-2">
                <div className="divide-y divide-line">
                  <Row k="Connection" v={fileBased ? 'Extract files' : 'Database, SELECT only'} />
                  <Row k="Objects in scope" v={cat?.tables.length ? `${cat.tables.length} tables · ${cat.tables.reduce((n, t) => n + t.fields.length, 0)} profiled fields` : 'None yet'} />
                  <Row k="Business rules in code" v={fileBased ? 'Needs a database connection' : `${rules!.length} found`} />
                </div>
                <div className="divide-y divide-line">
                  <Row k="Credentials" v={fileBased ? 'None stored' : <span className="inline-flex items-center gap-1"><KeyRound className="size-3.5 text-ok" />Azure Key Vault</span>} />
                  <Row k="Last discovery" v={s2.finishedAt ? new Date(s2.finishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'} />
                  <Row k="Delta loads" v={<Badge tone="neutral">{fileBased ? 'Upload newer extracts' : 'Not enabled'}</Badge>} />
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card>
              <CardHeader icon={Server} title="Add a source system" subtitle="A second Maximo instance, SAP ECC Plant Maintenance or S/4HANA Asset Management for this project. Database connectors are set up by your platform administrator; until then, load extracts below." />
              <Button size="sm" disabled title="Your platform administrator sets up database connectors">Request a connector</Button>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <ExtractUpload region={d.project.region} />
          </motion.div>

          <SectionLabel>Target</SectionLabel>
          <Card>
            <CardHeader icon={ShieldCheck} title={d.project.target} subtitle="Metadata from OData projections · loads through IFS data migration tooling"
              right={<Badge tone="ok" dot>Connected</Badge>} />
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['Read', 'OData $metadata for 38 projections'],
                ['Load', 'IFS migration jobs and REST/OData APIs'],
                ['Never', 'Direct writes to the IFS database'],
              ].map(([k, v]) => (
                <div key={k} className={cx('rounded-lg border p-3', k === 'Never' ? 'border-crit/30 bg-crit-soft' : 'border-line bg-surface-2')}>
                  <div className={cx('text-[11px] font-semibold uppercase tracking-wider', k === 'Never' ? 'text-crit' : 'text-ink-3')}>{k}</div>
                  <div className="mt-1 text-[12.5px] text-ink-2">{v}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <SectionLabel>Project settings</SectionLabel>
          <Card>
            <div className="divide-y divide-line">
              <Row k="Customer" v={d.project.customer} />
              <Row k="Industry pack" v={<Badge tone="accent">{d.project.industryPack}</Badge>} />
              <Row k="Ontology version" v={<Badge tone="agent">Pinned {d.project.ontologyVersion}</Badge>} />
              <Row k="Data residency" v={d.project.region} />
              <Row k="Shared learning" v={<Badge tone="neutral">{d.project.sharedLearning ? 'On' : 'Off · contract'}</Badge>} />
              <Row k="Sign-in" v="Microsoft Entra ID" />
              <Row k="Acting as" v={persona ? `${persona.name} · ${persona.role}` : '—'} />
            </div>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-agent/10 blur-2xl" />
            <CardHeader icon={Sparkles} title="Preview workspaces" subtitle="Run discovery and alignment on a prospect extract" right={<Badge tone="neutral">30-day retention</Badge>} />
            <ul className="space-y-2.5 text-[12.5px] text-ink-2">
              <li className="flex gap-2"><Play className="mt-0.5 size-3.5 shrink-0 text-agent" />Stages 1–6 on an uploaded extract</li>
              <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0 text-agent" />Isolated from delivery projects</li>
              <li className="flex gap-2"><EyeOff className="mt-0.5 size-3.5 shrink-0 text-agent" />Personal data masked</li>
              <li className="flex gap-2"><Trash2 className="mt-0.5 size-3.5 shrink-0 text-agent" />Deleted automatically after 30 days</li>
              <li className="flex gap-2"><Clock className="mt-0.5 size-3.5 shrink-0 text-agent" />Assets, hierarchy, work history and data quality summary</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-1">
              {d.stages.filter((s) => s.previewEligible).map((s) => <Badge key={s.n} tone="neutral">{s.n}. {s.name}</Badge>)}
            </div>
            <Button variant="agent" className="mt-4 w-full" icon={Sparkles} onClick={() => navigate('/projects/new?mode=preview')}>
              Create preview workspace
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
