import type { SalesRole } from '@/stores/activeViewRoleStore';

export const ROLE_MENU_MAP: Record<SalesRole, string[]> = {
  sdr: [
    'command-center', 'chat', 'leads', 'contacts', 'activities',
    'tasks', 'activity-goals', 'calendar', 'notifications',
  ],
  ae: [
    'command-center', 'chat', 'contacts', 'accounts', 'deals',
    'activities', 'tasks', 'calendar', 'analytics', 'slides', 'notifications',
  ],
  manager: [
    'command-center', 'chat', 'contacts', 'accounts', 'deals',
    'activities', 'tasks', 'activity-goals', 'calendar', 'analytics',
    'revops', 'report-builder', 'audit-log', 'notifications',
  ],
  revops: [
    'command-center', 'chat', 'leads', 'contacts', 'accounts',
    'deals', 'analytics', 'revops', 'report-builder', 'audit-log', 'company-profile', 'notifications',
  ],
  marketing: [
    'command-center', 'chat', 'leads', 'slides', 'campaigns', 'company-profile', 'notifications',
  ],
  admin: [
    'command-center', 'chat', 'analytics', 'revops', 'slides',
    'calendar', 'accounts', 'leads', 'contacts', 'deals',
    'activities', 'tasks', 'activity-goals', 'campaigns',
    'report-builder', 'audit-log', 'prompt-manager', 'company-profile', 'settings', 'notifications',
  ],
  product: [
    'command-center', 'chat', 'analytics', 'deals', 'accounts',
    'report-builder', 'notifications',
  ],
};

const ALWAYS_ALLOWED_VIEWS = ['command-center', 'dashboard', 'chat', 'settings', 'notifications'];

const REVOPS_OPERATION_VIEWS = [
  'admin-dashboard',
  'pipeline-config',
  'integration-health',
  'duplicates',
  'ai-audit',
  'bulk-import',
  'workflows',
];

// Role hierarchy: each role can switch to itself and roles below it
// SDR → AE → Manager & Marketing & Product (same tier) → RevOps → Admin
const ROLE_LEVEL: Record<SalesRole, number> = {
  sdr: 1,
  ae: 2,
  manager: 3,
  marketing: 3,
  product: 3,
  revops: 4,
  admin: 5,
};

/** Returns true if a user with `assignedRole` is allowed to switch to `targetRole`.
 *  `orgRole` is the organization permission level (admin/manager/member) — org admins bypass the hierarchy. */
export function canSwitchToRole(assignedRole: SalesRole, targetRole: SalesRole, orgRole?: string | null): boolean {
  // Org-level admins always have full access regardless of sales_role
  if (orgRole === 'admin') return true;
  return ROLE_LEVEL[targetRole] <= ROLE_LEVEL[assignedRole];
}

export function getAccessibleViews(activeRole: SalesRole, orgRole?: string | null): string[] {
  if (orgRole === 'admin') {
    return Array.from(new Set([
      ...ALWAYS_ALLOWED_VIEWS,
      ...Object.values(ROLE_MENU_MAP).flat(),
      ...REVOPS_OPERATION_VIEWS,
    ]));
  }

  const roleViews = ROLE_MENU_MAP[activeRole] || ROLE_MENU_MAP.ae;
  const operationalViews = activeRole === 'revops' ? REVOPS_OPERATION_VIEWS : [];

  return Array.from(new Set([
    ...ALWAYS_ALLOWED_VIEWS,
    ...roleViews,
    ...operationalViews,
  ]));
}

export function canAccessView(view: string, activeRole: SalesRole, orgRole?: string | null): boolean {
  return getAccessibleViews(activeRole, orgRole).includes(view);
}

export const ROLE_LABELS: Record<SalesRole, string> = {
  sdr: 'SDR',
  ae: 'Account Executive',
  manager: 'Sales Manager',
  revops: 'Revenue Operations',
  marketing: 'Marketing',
  admin: 'Admin (All Views)',
  product: 'Product Team',
};

export const ROLE_SHORT_LABELS: Record<SalesRole, string> = {
  sdr: 'SDR',
  ae: 'AE',
  manager: 'Manager',
  revops: 'RevOps',
  marketing: 'Marketing',
  admin: 'Admin',
  product: 'Product',
};
