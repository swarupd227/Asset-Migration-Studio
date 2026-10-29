import {
  Bot, BookOpenText, FolderKanban, Gauge, Library, BrainCircuit, CheckCheck, FileCheck2, GitFork, Inbox, LayoutDashboard, Network, PlugZap, ScanSearch, ScrollText, ShieldAlert, Sparkle,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; hint: string; stage?: number; badge?: 'review' | 'quality' | 'validation' }

export const navGroups: { label: string; items: NavItem[] }[] = [
  { label: '', items: [
    { to: '/', label: 'Mission control', icon: LayoutDashboard, hint: 'Pipeline, decisions waiting, live agents' },
    { to: '/projects', label: 'Projects', icon: FolderKanban, hint: 'All projects; create a delivery project or a preview workspace' },
  ] },
  {
    label: 'Understand',
    items: [
      { to: '/connect', label: 'Sources', icon: PlugZap, hint: 'Connectors and sales preview', stage: 1 },
      { to: '/discovery', label: 'Discovery', icon: ScanSearch, hint: 'Catalogue, profile, hidden business rules', stage: 2 },
      { to: '/alignment', label: 'Ontology alignment', icon: Network, hint: 'Source → concept → IFS Cloud with evidence', stage: 5 },
      { to: '/hierarchy', label: 'Hierarchy', icon: GitFork, hint: 'Maximo dual hierarchy rebuilt for IFS', stage: 5 },
    ],
  },
  {
    label: 'Decide',
    items: [
      { to: '/review', label: 'Review queue', icon: Inbox, hint: 'Approve, reject or change, riskiest first', stage: 7, badge: 'review' },
      { to: '/decisions', label: 'Bulk decisions', icon: Gauge, hint: 'Typed decisions on records: rules, model, reasoning, people', stage: 8 },
      { to: '/validation', label: 'Validation', icon: ShieldAlert, hint: 'Semantic rule failures in plain language', stage: 10, badge: 'validation' },
      { to: '/quality', label: 'Data quality', icon: CheckCheck, hint: 'Score before and after, fix proposals', stage: 10, badge: 'quality' },
    ],
  },
  {
    label: 'Deliver',
    items: [
      { to: '/ai-ready', label: 'AI-ready view', icon: Sparkle, hint: 'What a Loops Digital Worker receives' },
      { to: '/proof', label: 'Proof pack', icon: FileCheck2, hint: 'Lineage, approvals, reconciliation, sign-off', stage: 11 },
      { to: '/audit', label: 'Audit log', icon: ScrollText, hint: 'Write-once, hash-chained record' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { to: '/ontology', label: 'Ontology', icon: BookOpenText, hint: 'Industrial Asset Ontology, code lists, governance' },
      { to: '/skills', label: 'Skill library', icon: Library, hint: 'How agents do the work: steps, checks, known traps' },
      { to: '/memory', label: 'Mapping memory', icon: BrainCircuit, hint: 'Precedents and privacy model' },
      { to: '/agents', label: 'Agents & evals', icon: Bot, hint: '14 agents, guardrails, golden datasets' },
    ],
  },
];

export const allNav = navGroups.flatMap((g) => g.items);
