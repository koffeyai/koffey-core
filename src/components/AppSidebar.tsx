
// Hello world
import React from 'react';
import {
  MessageSquare,
  BarChart3,
  Settings,
  Building2,
  Target,
  Calendar,
  CheckSquare,
  TrendingUp,
  Users,
  UserPlus,
  LayoutDashboard,
  DollarSign,
  ClipboardList,
  Presentation,
  Shield,
  Zap,
  Megaphone,
  Flame,
  Brain,
  Copy,
  Upload,
  FileText,
  Plug,
  Bell,
} from 'lucide-react';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useActiveViewRoleStore } from '@/stores/activeViewRoleStore';
import { getAccessibleViews, ROLE_SHORT_LABELS } from '@/config/roleConfig';

interface AppSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: string) => void;
  currentView?: string;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
  setCurrentView,
  currentView = 'chat'
}) => {
  const { currentOrganization } = useOrganizationAccess();
  const isAdmin = currentOrganization?.role === 'owner' || currentOrganization?.role === 'admin';
  const showAdminSection = isAdmin || currentOrganization?.sales_role === 'revops';
  const { activeViewRole, isOverride } = useActiveViewRoleStore();
  const allowedItems = getAccessibleViews(activeViewRole, currentOrganization?.role);

  // Dashboard is always first
  const dashboardItem = { id: 'command-center', label: 'Dashboard', icon: LayoutDashboard };

  // Middle items in a fixed, consistent order (filtered by role)
  const middleMenuItems = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'revops', label: 'RevOps', icon: TrendingUp },
    { id: 'slides', label: 'Slide Studio', icon: Presentation },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'accounts', label: 'Accounts', icon: Building2 },
    { id: 'leads', label: 'Leads', icon: UserPlus },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'deals', label: 'Opportunities', icon: DollarSign },
    { id: 'activities', label: 'Activities', icon: Target },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'activity-goals', label: 'Activity Goals', icon: Flame },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
    { id: 'company-profile', label: 'Company Profile', icon: Building2 },
    { id: 'report-builder', label: 'Reports', icon: FileText },
    { id: 'audit-log', label: 'Audit Log', icon: ClipboardList },
    { id: 'prompt-manager', label: 'Prompts', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  // Admin-only items always at the bottom
  const adminMenuItems = [
    { id: 'admin-dashboard', label: 'Admin', icon: Shield },
    { id: 'pipeline-config', label: 'Pipeline Config', icon: Settings },
    { id: 'integration-health', label: 'Integrations', icon: Plug },
    { id: 'duplicates', label: 'Duplicates', icon: Copy },
    { id: 'ai-audit', label: 'AI Decisions', icon: Brain },
    { id: 'bulk-import', label: 'Import', icon: Upload },
    { id: 'workflows', label: 'Workflows', icon: Zap },
  ];

  const filteredMiddleItems = middleMenuItems.filter(item => allowedItems.includes(item.id));

  const renderNavItem = (item: { id: string; label: string; icon: React.ElementType }) => {
    const IconComponent = item.icon;
    const isActive = currentView === item.id;
    return (
      <li key={item.id}>
        <button
          onClick={() => setCurrentView(item.id)}
          className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
            isActive
              ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <IconComponent size={20} />
            <span className="ml-3">{item.label}</span>
        </button>
      </li>
    );
  };

  return (
    <aside className="h-full w-64 bg-white border-r border-gray-200 transition-all duration-300 flex-shrink-0 z-50 relative">
      <div className="flex flex-col h-full">
        {/* Logo/Brand */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
              <span className="ml-3 text-lg font-semibold text-gray-900">Koffey CRM</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              isOverride ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {ROLE_SHORT_LABELS[activeViewRole]} View
            </span>
            {isOverride && (
              <span className="text-xs text-gray-400">overridden</span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 pb-20 overflow-y-auto">
          <ul className="space-y-2">
            {/* Dashboard — always first */}
            {renderNavItem(dashboardItem)}

            {/* Role-filtered items in consistent order */}
            {filteredMiddleItems.map(renderNavItem)}

            {/* Admin section — always at the bottom, separated */}
            {showAdminSection && (
              <>
                <li className="pt-3 pb-1">
                  <div className="border-t border-gray-200 pt-3 px-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</span>
                  </div>
                </li>
                {adminMenuItems.map(renderNavItem)}
              </>
            )}
          </ul>
        </nav>

        {/* Collapse Toggle */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center px-3 py-2 text-gray-500 hover:text-gray-700"
          >
            <span className="text-sm">← Close</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
