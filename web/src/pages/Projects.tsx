import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Clock, FolderPlus, Hourglass, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp, type ProjectSummary } from '@/lib/app';
import { day, num } from '@/lib/format';
import { Badge, Button, Card, cx, Empty, PageHeader, Progress, Segmented, Skeleton } from '@/components/ui';

function daysLeft(p: ProjectSummary) {
  return p.expiresAt ? Math.max(0, Math.ceil((new Date(p.expiresAt).getTime() - Date.now()) / 86400_000)) : null;
}

function ProjectCard({ p, current, onOpen }: { p: ProjectSummary; current: boolean; onOpen: () => void }) {
  const total = p.mode === 'preview' ? 6 : 14;
  const left = daysLeft(p);
  return (
    <motion.button layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} onClick={onOpen}
      className={cx('group flex h-full flex-col rounded-xl border bg-surface p-4 text-left shadow-card transition hover:border-line-strong hover:shadow-pop', current ? 'border-accent/50 ring-2 ring-accent/10' : 'border-line')}>
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 text-[11px] font-bold text-white">
          {p.customer.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold">{p.name}</div>
          <div className="truncate text-xs text-ink-3">{p.customer}</div>
        </div>
        {p.mode === 'preview' ? <Badge tone="agent" icon={Hourglass}>Preview · {left}d left</Badge> : <Badge tone="neutral">Delivery</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="neutral">{p.sourceSystems[0]}</Badge>
        <Badge tone="neutral">→ {p.target}</Badge>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-ink-3"><span>{p.status}</span><span className="tabular">{p.stagesDone}/{total} stages</span></div>
        <Progress value={p.stagesDone / total} tone={p.stagesDone === total ? 'ok' : 'accent'} />
      </div>
      <div className="mt-auto flex items-center justify-between pt-4 text-xs text-ink-3">
        <span className="flex items-center gap-1"><Clock className="size-3" />Created {day(p.createdAt)}</span>
        <span className="flex items-center gap-3">
          {p.records > 0 && <span className="tabular">{num(p.records)} records</span>}
          {p.pendingReview > 0 && <span className="font-medium text-accent tabular">{p.pendingReview} to review</span>}
          <ArrowRight className="size-3.5 text-ink-4 transition group-hover:translate-x-0.5 group-hover:text-ink" />
        </span>
      </div>
    </motion.button>
  );
}

export default function Projects() {
  const { projects, projectId, setProjectId, persona } = useApp();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | 'delivery' | 'preview'>('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => (projects ?? []).filter((p) => (filter === 'all' || p.mode === filter) && `${p.name} ${p.customer}`.toLowerCase().includes(q.toLowerCase())), [projects, filter, q]);
  const canCreate = persona && ['Migration lead', 'Sales engineer'].includes(persona.role);
  const open = (id: string) => { setProjectId(id); nav('/'); };

  return (
    <>
      <PageHeader title="Projects" description="Migration projects and preview workspaces in this tenant."
        actions={canCreate ? <Link to="/projects/new"><Button variant="primary" icon={FolderPlus}>New project</Button></Link> : <Button icon={FolderPlus} disabled title="Migration leads and sales engineers create projects">New project</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={filter} onChange={setFilter} options={[
          { id: 'all', label: 'All', count: projects?.length },
          { id: 'delivery', label: 'Delivery', count: projects?.filter((p) => p.mode === 'delivery').length },
          { id: 'preview', label: 'Preview', count: projects?.filter((p) => p.mode === 'preview').length },
        ]} />
        <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px]">
          <Search className="size-3.5 text-ink-4" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="flex-1 bg-transparent outline-none placeholder:text-ink-4" />
        </label>
      </div>
      {!projects ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : list.length ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {list.map((p) => <ProjectCard key={p.id} p={p} current={p.id === projectId} onOpen={() => open(p.id)} />)}
        </div>
      ) : (
        <Card><Empty icon={FolderPlus} title={projects.length ? 'No projects match' : 'No projects yet'}>{canCreate ? 'Create a project to connect a source system or upload an extract.' : 'Ask a migration lead to create a project.'}</Empty></Card>
      )}
    </>
  );
}
