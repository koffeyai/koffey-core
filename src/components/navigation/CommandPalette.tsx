import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  BarChart3,
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
  Settings,
  Megaphone,
  Flame,
  Bell,
  FileText,
  UserPlus as AddContact,
  Plus,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useActiveViewRoleStore } from '@/stores/activeViewRoleStore';
import { getAccessibleViews } from '@/config/roleConfig';
import { useDialogStore } from '@/stores/dialogStore';
import { toast } from 'sonner';

interface CommandPaletteProps {
  setCurrentView: (view: string) => void;
}

const pageItems = [
  { id: 'command-center', label: 'Dashboard', icon: LayoutDashboard },
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
  { id: 'report-builder', label: 'Report Builder', icon: FileText },
  { id: 'company-profile', label: 'Company Profile', icon: Building2 },
  { id: 'audit-log', label: 'Audit Log', icon: ClipboardList },
  { id: 'prompt-manager', label: 'Prompts', icon: Settings },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ setCurrentView }) => {
  const [open, setOpen] = useState(false);
  const { currentOrganization } = useOrganizationAccess();
  const { activeViewRole } = useActiveViewRoleStore();
  const { openContactDialog, openDealDialog, openAccountDialog } = useDialogStore();
  const isAdmin = currentOrganization?.role === 'admin';
  const showAdminSection = isAdmin || currentOrganization?.sales_role === 'revops';
  const allowedItems = getAccessibleViews(activeViewRole, currentOrganization?.role);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for custom event from chat input (/pages command)
  useEffect(() => {
    const handleOpenEvent = () => setOpen(true);
    window.addEventListener('open-command-palette', handleOpenEvent);
    return () => window.removeEventListener('open-command-palette', handleOpenEvent);
  }, []);

  // One-time onboarding hint
  useEffect(() => {
    const shown = localStorage.getItem('crm_nav_onboarding_shown');
    if (!shown) {
      const timer = setTimeout(() => {
        toast('Navigation updated!', {
          description: 'Press ⌘K or type /pages to navigate between views.',
          duration: 6000,
        });
        window.dispatchEvent(new Event('pulse-cmdk-hint'));
        localStorage.setItem('crm_nav_onboarding_shown', 'true');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handlePageSelect = (viewId: string) => {
    setCurrentView(viewId);
    setOpen(false);
  };

  const handleQuickAction = (action: () => void) => {
    action();
    setOpen(false);
  };

  const roleFilteredPages = isAdmin
    ? pageItems
    : pageItems.filter(item => allowedItems.includes(item.id));
  const allPages = showAdminSection
    ? [...roleFilteredPages, { id: 'admin-dashboard', label: 'Admin', icon: Shield }]
    : roleFilteredPages;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, actions, or type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {allPages.map((item) => (
            <CommandItem
              key={item.id}
              value={item.label}
              onSelect={() => handlePageSelect(item.id)}
            >
              <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem
            value="Add Contact"
            onSelect={() => handleQuickAction(openContactDialog)}
          >
            <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Add Contact</span>
          </CommandItem>
          <CommandItem
            value="Add Deal"
            onSelect={() => handleQuickAction(openDealDialog)}
          >
            <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Add Deal</span>
          </CommandItem>
          <CommandItem
            value="Add Account"
            onSelect={() => handleQuickAction(openAccountDialog)}
          >
            <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Add Account</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
