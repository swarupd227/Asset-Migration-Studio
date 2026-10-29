import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, Hourglass, Lock } from 'lucide-react';
import type { Project } from '@shared/types';
import { useApp } from '@/lib/app';
import { api } from '@/lib/api';
import { Button, Card, cx, PageHeader } from '@/components/ui';

const SOURCES = ['IBM Maximo 7.6', 'IBM Maximo Application Suite (Manage)', 'SAP ECC Plant Maintenance', 'SAP S/4HANA Asset Management'];
const TARGETS = ['IFS Cloud 25R2 · sandbox', 'IFS Cloud 25R1 · sandbox'];
const PACKS = [{ id: 'Utilities · electric & water · 1.3', ok: true }, { id: 'Oil & gas and process', ok: false }, { id: 'Manufacturing', ok: false }, { id: 'Aerospace & defense', ok: false }];
const REGIONS = ['Azure · UK South', 'Azure · West Europe', 'Azure · North Europe', 'Azure · East US'];

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[12.5px] font-medium text-ink">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11.5px] text-ink-3">{hint}</div>}
    </label>
  );
}
const inputCls = 'h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] outline-none transition placeholder:text-ink-4 focus:border-accent focus:ring-2 focus:ring-accent/10';

export default function NewProject() {
  const [params] = useSearchParams();
  const { persona, act, reloadProjects, setProjectId, meta } = useApp();
  const nav = useNavigate();
  const isSales = persona?.role === 'Sales engineer';
  const [mode, setMode] = useState<'delivery' | 'preview'>(params.get('mode') === 'preview' || isSales ? 'preview' : 'delivery');
  const [customer, setCustomer] = useState('');
  const [name, setName] = useState('');
  const [source, setSource] = useState(SOURCES[0]);
  const [target, setTarget] = useState(TARGETS[0]);
  const [pack, setPack] = useState(PACKS[0].id);
  const [region, setRegion] = useState(REGIONS[0]);
  const [busy, setBusy] = useState(false);
  const canCreate = persona && ['Migration lead', 'Sales engineer'].includes(persona.role);
  const autoName = `${customer || 'Customer'} ${source.split(' ').slice(0, 2).join(' ')} → IFS Cloud`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persona) return;
    setBusy(true);
    const p = await act(() => api.post<Project>('/projects', {
      actor: persona.id, mode, customer: customer.trim(), name: (name || autoName).trim(), sourceSystems: [source], target, industryPack: pack, region,
    }), mode === 'preview' ? 'Preview workspace created' : 'Project created');
    setBusy(false);
    if (p) {
      await reloadProjects();
      setProjectId(p.id);
      nav('/connect');
    }
  };

  return (
    <div className="max-w-3xl">
      <button onClick={() => nav('/projects')} className="mb-3 flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" />Projects</button>
      <PageHeader title={mode === 'preview' ? 'New preview workspace' : 'New project'} description={mode === 'preview' ? 'Runs discovery to target design on a prospect extract. Deleted after 30 days.' : 'A delivery project runs all fourteen stages up to cutover.'} />
      <form onSubmit={submit}>
        <Card className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { id: 'delivery', icon: Briefcase, title: 'Delivery project', text: 'Full migration with review, dry runs, proof pack and cutover.', disabled: isSales },
              { id: 'preview', icon: Hourglass, title: 'Preview workspace', text: 'Stages 1–6 in an isolated sandbox. Personal data is masked.', disabled: false },
            ] as const).map((o) => (
              <button type="button" key={o.id} disabled={o.disabled} onClick={() => setMode(o.id)}
                className={cx('flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-45', mode === o.id ? 'border-accent bg-accent-soft/40 ring-2 ring-accent/10' : 'border-line hover:border-line-strong')}>
                <o.icon className={cx('mt-0.5 size-4', mode === o.id ? 'text-accent' : 'text-ink-3')} />
                <div><div className="text-[13px] font-semibold">{o.title}</div><div className="mt-0.5 text-xs text-ink-3">{o.text}</div></div>
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer"><input required minLength={2} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Coastline Energy" className={inputCls} /></Field>
            <Field label="Project name" hint="Leave empty to use the suggested name."><input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName} className={inputCls} /></Field>
            <Field label="Source system"><select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Target environment"><select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls}>{TARGETS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Industry pack">
              <select value={pack} onChange={(e) => setPack(e.target.value)} className={inputCls}>
                {PACKS.map((p) => <option key={p.id} value={p.id} disabled={!p.ok}>{p.id}{p.ok ? '' : ' (not licensed)'}</option>)}
              </select>
            </Field>
            <Field label="Ontology version" hint="Pinned for the life of the project."><input disabled value={meta?.ontologyVersion ?? ''} className={cx(inputCls, 'bg-sunken text-ink-3')} /></Field>
            <Field label="Data residency" hint="Customer data stays in this region."><select value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls}>{REGIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <span className="flex items-center gap-1.5 text-xs text-ink-3"><Lock className="size-3.5" />Shared learning is off until the contract allows it.</span>
            <div className="flex gap-2">
              <Button type="button" onClick={() => nav('/projects')}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={!canCreate || busy || customer.trim().length < 2}>{busy ? 'Creating…' : mode === 'preview' ? 'Create workspace' : 'Create project'}</Button>
            </div>
          </div>
          {!canCreate && <div className="text-xs text-warn">Signed in as {persona?.role}. Migration leads and sales engineers create projects.</div>}
        </Card>
      </form>
    </div>
  );
}
