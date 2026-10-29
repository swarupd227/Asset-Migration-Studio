import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, BrainCircuit, CheckCircle2, CircleDashed, FileCode2, Gauge, Hand, Loader2, Lock, Play, Sparkles, Timer } from 'lucide-react';
import type { Stage } from '@shared/types';
import { useApp } from '@/lib/app';
import { num, pct } from '@/lib/format';
import { Badge, Button, Card, CardHeader, cx, PageHeader, Progress, Skeleton, Stat } from '@/components/ui';
import { AgentAvatar, agentName } from '@/components/agents';
import { BackgroundWork, UsagePanel } from '@/components/operations';

const phases = [
  { label: 'Understand', sub: 'Available in preview workspaces', range: [1, 6] },
  { label: 'Decide', sub: '', range: [7, 7] },
  { label: 'Build & prove', sub: 'Numbered dry runs', range: [8, 11] },
  { label: 'Go live', sub: '', range: [12, 14] },
];

const statusMeta: Record<Stage['status'], { label: string; icon: typeof CheckCircle2; cls: string }> = {
  done: { label: 'Done', icon: CheckCircle2, cls: 'text-ok' },
  running: { label: 'Running', icon: Loader2, cls: 'text-agent' },
  waiting: { label: 'Waiting on people', icon: Hand, cls: 'text-warn' },
  ready: { label: 'Ready', icon: CircleDashed, cls: 'text-accent' },
  locked: { label: 'Locked', icon: Lock, cls: 'text-ink-4' },
};

const stageLink: Record<number, string> = { 1: '/connect', 2: '/discovery', 3: '/discovery', 4: '/discovery?tab=rules', 5: '/alignment', 6: '/alignment', 7: '/review', 8: '/validation', 9: '/validation', 10: '/validation', 11: '/proof', 12: '/proof', 13: '/proof', 14: '/memory' };

function StageTile({ s, busy }: { s: Stage; busy: boolean }) {
  const { runStage } = useApp();
  const m = statusMeta[s.status];
  const runnable = s.status !== 'locked' && s.n !== 12 && s.n !== 7;
  return (
    <div className={cx('group relative flex min-h-[124px] flex-col rounded-xl border bg-surface p-3 transition', s.status === 'running' ? 'border-agent/50 shadow-pop ring-4 ring-agent/10' : s.status === 'waiting' ? 'border-warn/40' : 'border-line hover:border-line-strong hover:shadow-pop')}>
      <Link to={stageLink[s.n]} className="absolute inset-0 rounded-xl" aria-label={`Open ${s.name}`} />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-ink-4">{String(s.n).padStart(2, '0')}</span>
        <m.icon className={cx('size-4', m.cls, s.status === 'running' && 'animate-spin')} />
      </div>
      <div className="mt-1.5 text-[13px] font-semibold leading-tight">{s.name}</div>
      <div className={cx('mt-0.5 text-[11px] font-medium', m.cls)}>{s.metric && s.status !== 'locked' ? s.metric : m.label}</div>
      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="flex -space-x-1.5">
          {s.agents.slice(0, 3).map((a) => <div key={a} className="rounded-md ring-2 ring-surface"><AgentAvatar id={a} size="sm" /></div>)}
        </div>
        {runnable && (
          <button onClick={() => runStage(s.n)} disabled={busy}
            className="relative z-10 flex items-center gap-1 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-2 opacity-0 transition group-hover:opacity-100 hover:bg-agent hover:text-white disabled:opacity-0">
            <Play className="size-3" /> {s.status === 'done' ? 'Re-run' : 'Run'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MissionControl() {
  const { dashboard: d, runStage, ask, activeAgents, meta, events, persona } = useApp();
  if (!d || !meta) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const k = d.kpis;
  const busy = !!d.running || !!d.job;
  const totalPaths = k.autoAccepted + k.quickReview + k.expertReview + k.namedReview;
  const decided = k.mapped + k.notMigrated;
  const nextRun = d.stages.find((s) => s.n === 8);
  const recent = events.slice(-4).reverse();
  // The current person's work first, then everyone else's, each in severity order.
  const mine = (n: { role: string }) => n.role === persona?.role;
  const waiting = [...d.needsYou].sort((a, b) => Number(mine(b)) - Number(mine(a)));
  const mineCount = waiting.filter(mine).length;

  return (
    <>
      <PageHeader
        eyebrow={<><span className="size-1.5 rounded-full bg-warn" />{d.project.status} · created {new Date(d.project.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>}
        title={d.project.name}
                badges={<>
          <Badge tone="neutral">{d.project.sourceSystems[0]}</Badge>
          <Badge tone="neutral">→ {d.project.target}</Badge>
          <Badge tone="accent">{d.project.industryPack}</Badge>
          <Badge tone="agent">Pinned {d.project.ontologyVersion}</Badge>
          <Badge tone="neutral">{d.project.region}</Badge>
          <Badge tone={d.project.sharedLearning ? 'ok' : 'neutral'}>Shared learning {d.project.sharedLearning ? 'on' : 'off'}</Badge>
        </>}
        actions={<>
          <Button icon={Sparkles} onClick={() => ask('What needs my attention?')}>What needs me?</Button>
          <Button variant="agent" icon={Play} disabled={busy || nextRun?.status === 'locked'} onClick={() => runStage(8)}>
            {d.job?.status === 'queued' ? 'Queued…' : busy ? 'Agents working…' : `Start Run ${(Number(d.stages.find((s) => s.n === 9)?.metric?.match(/Run (\d+)/)?.[1]) || 0) + 1}`}
          </Button>
        </>}
      />

      {/* Pipeline */}
      <Card className="mb-5" pad={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[13.5px] font-semibold">Migration pipeline</h2>
            <p className="text-xs text-ink-3">Stages 8 to 11 run together as a numbered dry run.</p>
          </div>
        </div>
        <div className="@container">
        <div className="grid grid-cols-1 gap-4 p-4 @[1080px]:grid-cols-[minmax(0,6fr)_minmax(0,1.1fr)_minmax(0,4fr)_minmax(0,3fr)]">
          {phases.map((p) => (
            <div key={p.label} className="min-w-0">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{p.label}</span>
                <span className="truncate text-[11px] text-ink-4">{p.sub}</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${p.range[1] - p.range[0] + 1}, minmax(0, 1fr))` }}>
                {d.stages.filter((s) => s.n >= p.range[0] && s.n <= p.range[1]).map((s) => <StageTile key={s.n} s={s} busy={busy} />)}
              </div>
            </div>
          ))}
        </div>
        </div>
      </Card>

      <div className="@container">
      <div className="grid grid-cols-1 gap-5 @[980px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Needs you */}
        <Card pad={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Hand className="size-4 text-warn" />
              <h2 className="text-[13.5px] font-semibold">Waiting for people</h2>
              <Badge tone="warn">{d.needsYou.length}</Badge>
            </div>
            <span className="text-xs text-ink-3">{persona ? (mineCount ? `${mineCount} for you as ${persona.role.toLowerCase()}` : `Nothing for you as ${persona.role.toLowerCase()}`) : 'Assigned by role'}</span>
          </div>
          <ul className="divide-y divide-line">
            {waiting.map((n, i) => (
              <motion.li key={n.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <Link to={n.href} className={cx('group flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2', persona && !mine(n) && 'opacity-70')}>
                  <span className={cx('h-9 w-1 shrink-0 rounded-full', n.severity === 'high' ? 'bg-crit' : n.severity === 'medium' ? 'bg-warn' : 'bg-info')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{n.title}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-3">{n.detail}</div>
                  </div>
                  <Badge tone={mine(n) ? 'accent' : 'neutral'}>{mine(n) ? 'Yours' : n.role}</Badge>
                  <ArrowRight className="size-4 text-ink-4 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              </motion.li>
            ))}
            {!d.needsYou.length && <li className="px-4 py-10 text-center text-sm text-ink-3">Nothing is waiting on your team.</li>}
          </ul>
        </Card>

        <div className="grid gap-5 sm:grid-cols-2">
          <Card className="sm:col-span-2">
            <CardHeader title="Review routing" subtitle="Routing by calibrated confidence" icon={Gauge} right={<span className="text-xs text-ink-3 tabular">{decided}/{k.sourceElements} decided</span>} />
            <div className="flex h-3 overflow-hidden rounded-full">
              {[
                { n: k.autoAccepted, c: 'bg-ok', l: 'Auto ≥ 0.95' },
                { n: k.quickReview, c: 'bg-info', l: 'Quick 0.75–0.95' },
                { n: k.expertReview, c: 'bg-warn', l: 'Expert < 0.75' },
                { n: k.namedReview, c: 'bg-crit', l: 'Named (safety / regulatory)' },
              ].map((x) => <motion.div key={x.l} className={x.c} initial={{ width: 0 }} animate={{ width: `${totalPaths ? (x.n / totalPaths) * 100 : 0}%` }} title={`${x.l}: ${x.n}`} />)}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
              {[
                { n: k.autoAccepted, c: 'bg-ok', l: 'Auto', to: '/review?path=auto' },
                { n: k.quickReview, c: 'bg-info', l: 'Quick', to: '/review?path=quick' },
                { n: k.expertReview, c: 'bg-warn', l: 'Expert', to: '/review?path=expert' },
                { n: k.namedReview, c: 'bg-crit', l: 'Named', to: '/review?path=named' },
              ].map((x) => (
                <Link key={x.l} to={x.to} className="rounded-lg p-1.5 hover:bg-sunken">
                  <div className="flex items-center gap-1.5 text-ink-3"><span className={cx('size-2 rounded-sm', x.c)} />{x.l}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular">{x.n}</div>
                </Link>
              ))}
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-ink-3"><span>Decisions made</span><span className="tabular">{pct(k.sourceElements ? decided / k.sourceElements : 0, 0)}</span></div>
              <Progress value={k.sourceElements ? decided / k.sourceElements : 0} tone="ok" />
            </div>
          </Card>
          <Stat label="Data quality score" icon={CheckCircle2} tone="ok" to="/quality"
            value={<span>{pct(k.dqAfter)}</span>}
            sub={<span>from <b className="font-semibold text-ink-2">{pct(k.dqBefore)}</b> before migration</span>} />
          <Stat label="From precedents" icon={BrainCircuit} tone="agent" to="/memory"
            value={pct(k.precedentShare, 0)} sub="of proposals reuse approved mappings" />
          <Stat label="Hidden business rules" icon={FileCode2} tone="info" to="/discovery?tab=rules" value={k.hiddenRules} sub="found in scripts, Java and escalations" />
          <Stat label="Source volume" icon={Timer} to="/discovery" value={num(k.assets)} sub={`assets · ${num(k.workOrders)} work orders`} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 @[980px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <UsagePanel />
        <BackgroundWork />
      </div>
      </div>

      {/* Agents */}
      <Card className="mt-5" pad={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[13.5px] font-semibold">Agent team</h2>
            <p className="text-xs text-ink-3">{meta.agents.length} agents · live status</p>
          </div>
          <Link to="/agents" className="text-xs font-medium text-accent hover:underline">Agents & evals →</Link>
        </div>
        <div className="grid gap-px bg-line" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          {meta.agents.map((a) => {
            const live = activeAgents.has(a.id);
            return (
              <div key={a.id} className={cx('flex items-start gap-2.5 bg-surface p-3 transition', live && 'bg-agent-soft/50')}>
                <AgentAvatar id={a.id} active={live} />
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold">{a.name}</div>
                  <div className={cx('text-[11px]', live ? 'font-medium text-agent' : 'text-ink-4')}>{live ? 'Working…' : 'Idle'}</div>
                </div>
              </div>
            );
          })}
        </div>
        {recent.length > 0 && (
          <div className="border-t border-line px-4 py-2.5">
            {recent.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1 text-xs text-ink-3">
                <span className="font-medium text-ink-2">{agentName[e.agent]}</span>
                <span className="truncate">{e.text}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
