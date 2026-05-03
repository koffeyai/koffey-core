import type { SalesRole } from '@/stores/activeViewRoleStore';
import {
  Phone, Briefcase, Users, BarChart3, Megaphone, Home, List, Shield, Package,
  LayoutDashboard, MessageSquare, TrendingUp, Presentation, Calendar,
  Building2, UserPlus, DollarSign, Target, CheckSquare, ClipboardList,
  Settings, FileText, Flame,
  type LucideIcon,
} from 'lucide-react';

export interface SlashCommand {
  command: string;
  aliases: string[];
  targetRole: SalesRole | null;
  description: string;
  confirmation: string;
  icon: LucideIcon;
  /** For page navigation commands — the view ID to navigate to */
  targetView?: string;
  /** Special action: 'open-palette' opens the command palette popup */
  action?: 'open-palette';
  /** Grouping label shown in the slash menu dropdown */
  group?: 'roles' | 'pages' | 'utility';
}

// ── Role-switching commands ──────────────────────────────────────────────────

const ROLE_COMMANDS: SlashCommand[] = [
  {
    command: '/sdr',
    aliases: ['/bdr'],
    targetRole: 'sdr',
    description: 'Switch to SDR view - prospecting, leads, activity tracking',
    confirmation: 'Switched to **SDR view**. I\'ll focus on prospecting, lead qualification, and activity tracking.',
    icon: Phone,
    group: 'roles',
  },
  {
    command: '/ae',
    aliases: ['/closer', '/sales'],
    targetRole: 'ae',
    description: 'Switch to AE view - deals, accounts, closing strategy',
    confirmation: 'Switched to **AE view**. I\'ll focus on deal management, account relationships, and closing strategy.',
    icon: Briefcase,
    group: 'roles',
  },
  {
    command: '/manager',
    aliases: ['/mgr'],
    targetRole: 'manager',
    description: 'Switch to Manager view - team performance, forecasting, coaching',
    confirmation: 'Switched to **Manager view**. I\'ll focus on team performance, pipeline health, and coaching insights.',
    icon: Users,
    group: 'roles',
  },
  {
    command: '/revops',
    aliases: ['/ops'],
    targetRole: 'revops',
    description: 'Switch to RevOps view - analytics, process, data quality',
    confirmation: 'Switched to **RevOps view**. I\'ll focus on pipeline analytics, process optimization, and data integrity.',
    icon: BarChart3,
    group: 'roles',
  },
  {
    command: '/marketing',
    aliases: ['/mktg'],
    targetRole: 'marketing',
    description: 'Switch to Marketing view - campaign performance, lead generation, content strategy',
    confirmation: 'Switched to **Marketing view**. I\'ll focus on campaign performance, lead generation, and content strategy.',
    icon: Megaphone,
    group: 'roles',
  },
  {
    command: '/admin',
    aliases: ['/all'],
    targetRole: 'admin',
    description: 'Switch to Admin view - see all pages and settings',
    confirmation: 'Switched to **Admin view**. Showing all pages and settings.',
    icon: Shield,
    group: 'roles',
  },
  {
    command: '/product',
    aliases: ['/pm', '/productteam'],
    targetRole: 'product',
    description: 'Switch to Product view - product intelligence, feature demand, competitive landscape',
    confirmation: 'Switched to **Product view**. I\'ll focus on product-market signals, feature requests, revenue attribution, and competitive intelligence from sales conversations.',
    icon: Package,
    group: 'roles',
  },
];

// ── Page navigation commands ─────────────────────────────────────────────────

const PAGE_COMMANDS: SlashCommand[] = [
  {
    command: '/pages',
    aliases: ['/tabs', '/page'],
    targetRole: null,
    description: 'Open page navigator',
    confirmation: '',
    icon: List,
    action: 'open-palette',
    group: 'pages',
  },
  {
    command: '/dashboard',
    aliases: ['/home-page', '/cmd'],
    targetRole: null,
    description: 'Go to Dashboard',
    confirmation: '',
    icon: LayoutDashboard,
    targetView: 'command-center',
    group: 'pages',
  },
  {
    command: '/chat',
    aliases: [],
    targetRole: null,
    description: 'Go to Chat',
    confirmation: '',
    icon: MessageSquare,
    targetView: 'chat',
    group: 'pages',
  },
  {
    command: '/accounts',
    aliases: ['/accts'],
    targetRole: null,
    description: 'Go to Accounts',
    confirmation: '',
    icon: Building2,
    targetView: 'accounts',
    group: 'pages',
  },
  {
    command: '/leads',
    aliases: [],
    targetRole: null,
    description: 'Go to Leads',
    confirmation: '',
    icon: UserPlus,
    targetView: 'leads',
    group: 'pages',
  },
  {
    command: '/contacts',
    aliases: [],
    targetRole: null,
    description: 'Go to Contacts',
    confirmation: '',
    icon: Users,
    targetView: 'contacts',
    group: 'pages',
  },
  {
    command: '/deals',
    aliases: ['/opportunities', '/opps'],
    targetRole: null,
    description: 'Go to Deals / Opportunities',
    confirmation: '',
    icon: DollarSign,
    targetView: 'deals',
    group: 'pages',
  },
  {
    command: '/tasks',
    aliases: [],
    targetRole: null,
    description: 'Go to Tasks',
    confirmation: '',
    icon: CheckSquare,
    targetView: 'tasks',
    group: 'pages',
  },
  {
    command: '/activities',
    aliases: [],
    targetRole: null,
    description: 'Go to Activities',
    confirmation: '',
    icon: Target,
    targetView: 'activities',
    group: 'pages',
  },
  {
    command: '/calendar',
    aliases: ['/cal'],
    targetRole: null,
    description: 'Go to Calendar',
    confirmation: '',
    icon: Calendar,
    targetView: 'calendar',
    group: 'pages',
  },
  {
    command: '/analytics',
    aliases: ['/stats'],
    targetRole: null,
    description: 'Go to Analytics',
    confirmation: '',
    icon: BarChart3,
    targetView: 'analytics',
    group: 'pages',
  },
  {
    command: '/slides',
    aliases: ['/deck'],
    targetRole: null,
    description: 'Go to Slide Studio',
    confirmation: '',
    icon: Presentation,
    targetView: 'slides',
    group: 'pages',
  },
  {
    command: '/campaigns',
    aliases: ['/marketing-app', '/mktg-app'],
    targetRole: null,
    description: 'Go to Marketing Dashboard',
    confirmation: '',
    icon: Megaphone,
    targetView: 'campaigns',
    group: 'pages',
  },
  {
    command: '/reports',
    aliases: [],
    targetRole: null,
    description: 'Go to Report Builder',
    confirmation: '',
    icon: FileText,
    targetView: 'report-builder',
    group: 'pages',
  },
  {
    command: '/goals',
    aliases: ['/activity-goals'],
    targetRole: null,
    description: 'Go to Activity Goals',
    confirmation: '',
    icon: Flame,
    targetView: 'activity-goals',
    group: 'pages',
  },
  {
    command: '/company',
    aliases: ['/company-profile', '/profile'],
    targetRole: null,
    description: 'Go to Company Profile',
    confirmation: '',
    icon: Building2,
    targetView: 'company-profile',
    group: 'pages',
  },
  {
    command: '/audit',
    aliases: ['/audit-log'],
    targetRole: null,
    description: 'Go to Audit Log',
    confirmation: '',
    icon: ClipboardList,
    targetView: 'audit-log',
    group: 'pages',
  },
  {
    command: '/settings',
    aliases: ['/prefs'],
    targetRole: null,
    description: 'Go to Settings',
    confirmation: '',
    icon: Settings,
    targetView: 'settings',
    group: 'pages',
  },
];

// ── Utility commands ─────────────────────────────────────────────────────────

const UTILITY_COMMANDS: SlashCommand[] = [
  {
    command: '/home',
    aliases: ['/reset', '/default'],
    targetRole: null,
    description: 'Reset to your assigned default view',
    confirmation: 'Reset to your default view.',
    icon: Home,
    group: 'utility',
  },
  {
    command: '/options',
    aliases: ['/help', '/commands'],
    targetRole: null,
    description: 'Show all available slash commands',
    confirmation: '',
    icon: List,
    group: 'utility',
  },
];

// ── Combined registry ────────────────────────────────────────────────────────

export const SLASH_COMMANDS: SlashCommand[] = [
  ...PAGE_COMMANDS,
  ...ROLE_COMMANDS,
  ...UTILITY_COMMANDS,
];

export function findSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim().toLowerCase();
  return SLASH_COMMANDS.find(
    cmd => cmd.command === trimmed || cmd.aliases.includes(trimmed)
  ) ?? null;
}

export function filterSlashCommands(input: string): SlashCommand[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return [];
  if (trimmed === '/') return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    cmd =>
      cmd.command.startsWith(trimmed) ||
      cmd.aliases.some(alias => alias.startsWith(trimmed))
  );
}
