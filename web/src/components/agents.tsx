import {
  BarChart3, BookOpen, Database, Gauge, FileCode2, GitBranch, Hammer, LayoutTemplate, Link2, List, Scale, ShieldCheck, Sparkles, Wand2, Workflow,
  type LucideIcon,
} from 'lucide-react';
import { cx } from './ui';

export const agentIcon: Record<string, LucideIcon> = {
  orchestrator: Workflow, harvester: Database, profiler: BarChart3, 'code-reader': FileCode2, aligner: Link2, 'target-designer': LayoutTemplate,
  hierarchy: GitBranch, 'code-list': List, builder: Hammer, validator: ShieldCheck, remediator: Wand2, reconciler: Scale, assistant: Sparkles, steward: BookOpen, 'decision-model': Gauge,
};

export const agentName: Record<string, string> = {
  orchestrator: 'Orchestrator', harvester: 'Metadata Harvester', profiler: 'Profiler', 'code-reader': 'Code Reader', aligner: 'Concept Aligner',
  'target-designer': 'Target Designer', hierarchy: 'Hierarchy Agent', 'code-list': 'Code List Agent', builder: 'Transformation Builder',
  validator: 'Validation Agent', remediator: 'Remediation Agent', reconciler: 'Reconciliation Agent', assistant: 'Review Assistant', steward: 'Ontology Steward', 'decision-model': 'Decision model',
};

export function AgentAvatar({ id, size = 'md', active }: { id: string; size?: 'sm' | 'md' | 'lg'; active?: boolean }) {
  const Icon = agentIcon[id] ?? Sparkles;
  const s = size === 'sm' ? 'size-6 rounded-md' : size === 'lg' ? 'size-10 rounded-xl' : 'size-8 rounded-lg';
  return (
    <div className={cx('relative grid shrink-0 place-items-center bg-agent-soft text-agent', s, active && 'pulse-ring')} title={agentName[id] ?? id}>
      <Icon className={size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4'} strokeWidth={2} />
      {active && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-surface bg-agent" />}
    </div>
  );
}

export function PersonAvatar({ initials, size = 'md', className }: { initials: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div className={cx('grid shrink-0 place-items-center rounded-full bg-ink text-surface font-semibold', size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs', className)}>
      {initials}
    </div>
  );
}
