import { motion } from 'motion/react';
import { Clock, Database, EyeOff, FileSpreadsheet, KeyRound, Lock, Play, PlugZap, Server, ShieldCheck, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { useApp } from '@/lib/app';
import { Badge, Button, Card, CardHeader, cx, PageHeader, ScriptedNote, SectionLabel, Skeleton } from '@/components/ui';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
      <span className="text-ink-3">{k}</span>
      <span className="text-right font-medium text-ink-2">{v}</span>
    </div>
  );
}

export default function Connect() {
  const { dashboard: d, runStage, toast, persona } = useApp();
  if (!d) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  const s1 = d.stages.find((s) => s.n === 1)!;
  const s2 = d.stages.find((s) => s.n === 2)!;
  const busy = !!d.running;

  return (
    <>
      <PageHeader
        eyebrow={<><PlugZap className="size-3.5" />Stage 1 · Connect</>}
        title="Sources and target"
        description="Read-only access to the source systems and an IFS Cloud sandbox. Data is loaded only through IFS migration tooling and APIs, never by writing to the database."
        actions={<>
          <ScriptedNote />
          <Button icon={Play} disabled={busy} onClick={() => runStage(1)}>Test connections</Button>
          <Button variant="agent" icon={Play} disabled={busy} onClick={() => runStage(2)}>Run discovery</Button>
        </>}
      />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <SectionLabel right={<Badge tone={s1.status === 'done' ? 'ok' : 'neutral'} dot>{s1.status === 'done' ? 'Healthy' : s1.status}</Badge>}>Source systems</SectionLabel>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader icon={Database} title="IBM Maximo 7.6.1.3" subtitle="Oracle 19c · schema MAXIMO · database read access"
                right={<Badge tone="ok" icon={Lock}>Read-only</Badge>} />
              <div className="grid gap-x-6 sm:grid-cols-2">
                <div className="divide-y divide-line">
                  <Row k="Grants" v="SELECT only, no DML" />
                  <Row k="Objects in scope" v="17 tables · 412 fields" />
                  <Row k="Custom code" v="41 scripts · 12 Java classes · 9 escalations" />
                </div>
                <div className="divide-y divide-line">
                  <Row k="Credentials" v={<span className="inline-flex items-center gap-1"><KeyRound className="size-3.5 text-ok" />Azure Key Vault</span>} />
                  <Row k="Last discovery" v={s2.finishedAt ? new Date(s2.finishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'} />
                  <Row k="Delta (CDC)" v={<Badge tone="neutral">Later release</Badge>} />
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="opacity-80">
              <CardHeader icon={Server} title="SAP ECC Plant Maintenance / S/4HANA Asset Management" subtitle="DD02L, DD03L, check tables and DD07L domain values"
                right={<Badge tone="neutral">Release 2</Badge>} />
              <p className="text-xs text-ink-3">Same connector and ontology pattern. Planned for the second phase together with a second industry pack.</p>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader icon={FileSpreadsheet} title="Flat file extract" subtitle="CSV, Parquet or Excel, with a manifest that names each table" />
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-6 py-8 text-center transition hover:border-accent hover:bg-accent-soft/40">
                <UploadCloud className="size-6 text-ink-3" />
                <span className="text-[13px] font-medium">Drop extract files and manifest.json</span>
                <span className="text-xs text-ink-3">Files stay in the project's isolated storage in {d.project.region}</span>
                <input type="file" multiple className="sr-only" aria-label="Upload extract files"
                  onChange={(e) => { if (e.target.files?.length) toast(`${e.target.files.length} file(s) selected. Upload is a concept in this demo.`, 'info'); }} />
              </label>
            </Card>
          </motion.div>

          <SectionLabel>Target</SectionLabel>
          <Card>
            <CardHeader icon={ShieldCheck} title={d.project.target} subtitle="Metadata from OData projections · loads through IFS data migration tooling"
              right={<Badge tone="accent">Works through IFS tooling</Badge>} />
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
            <p className="mt-3 text-xs text-ink-3">IFS Cloud object names and the preferred load method are to be confirmed with IFS.</p>
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
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">Pinning the ontology version means the same inputs, code version and ontology version always give the same output.</p>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-agent/10 blur-2xl" />
            <CardHeader icon={Sparkles} title="Sales preview mode" subtitle="Show a prospect their own data in IFS during the sales cycle" right={<Badge tone="agent">D10</Badge>} />
            <ul className="space-y-2.5 text-[12.5px] text-ink-2">
              <li className="flex gap-2"><Play className="mt-0.5 size-3.5 shrink-0 text-agent" />Runs stages 1–6 on an uploaded prospect extract</li>
              <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0 text-agent" />Isolated sandbox, separate from delivery projects</li>
              <li className="flex gap-2"><EyeOff className="mt-0.5 size-3.5 shrink-0 text-agent" />Personal data such as technician names is masked</li>
              <li className="flex gap-2"><Trash2 className="mt-0.5 size-3.5 shrink-0 text-agent" />Deleted automatically after 30 days</li>
              <li className="flex gap-2"><Clock className="mt-0.5 size-3.5 shrink-0 text-agent" />Assets, hierarchy and work history in the IFS model within days, plus a data quality summary</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-1">
              {d.stages.filter((s) => s.previewEligible).map((s) => <Badge key={s.n} tone="neutral">{s.n}. {s.name}</Badge>)}
            </div>
            <Button variant="agent" className="mt-4 w-full" icon={Sparkles} onClick={() => toast('Preview workspaces are a concept in this demo. Run by a sales engineer, expiring in 30 days.', 'info')}>
              Create preview workspace
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
