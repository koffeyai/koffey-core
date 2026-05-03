import React, { useState, useEffect } from 'react';
import { Menu, Settings, LogOut, ChevronDown, Building2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { unifiedCacheManager } from '@/lib/cache';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface MinimalHeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: string) => void;
}

export const MinimalHeader: React.FC<MinimalHeaderProps> = ({
  sidebarOpen,
  setSidebarOpen,
  setCurrentView,
}) => {
  const { user, signOut } = useAuth();
  const { currentOrganization, hasMultipleOrganizations, openSelector } = useOrganizationAccess();
  const { toast } = useToast();
  const [pulsing, setPulsing] = useState(false);
  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');

  // Listen for pulse event from onboarding hint
  useEffect(() => {
    const handlePulse = () => {
      setPulsing(true);
      setTimeout(() => setPulsing(false), 3000);
    };
    window.addEventListener('pulse-cmdk-hint', handlePulse);
    return () => window.removeEventListener('pulse-cmdk-hint', handlePulse);
  }, []);

  // Get user initials for avatar
  const getUserInitials = () => {
    if (user?.user_metadata?.full_name) {
      const names = user.user_metadata.full_name.split(' ');
      return names.map((n: string) => n.charAt(0).toUpperCase()).slice(0, 2).join('');
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return 'U';
  };

  const handleSignOut = async () => {
    try {
      // 1. Clear all cached data (prevents stale data on re-login)
      unifiedCacheManager.clearAllCache();
      
      // 2. Sign out from Supabase
      await signOut();
      
      // 3. Navigate to home with full page reload to clear all React state
      window.location.href = '/';
    } catch (error) {
      toast({
        title: 'Sign out failed',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleSettingsClick = () => {
    setCurrentView('settings');
  };

  return (
    <header className="h-12 border-b border-border bg-background flex items-center justify-between px-4 flex-shrink-0">
      {/* Left section: Sidebar toggle + Org name */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Cmd+K shortcut hint */}
        <button
          onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
          className={cn(
            "hidden sm:flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-muted/50 text-muted-foreground text-xs font-mono hover:bg-muted transition-colors cursor-pointer",
            pulsing && "animate-pulse ring-2 ring-primary/50"
          )}
          title="Open command palette"
        >
          <span>{isMac ? '⌘' : 'Ctrl+'}</span>
          <span>K</span>
        </button>

        {/* Organization display */}
        {hasMultipleOrganizations ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 px-2 gap-1 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="max-w-[150px] truncate">
                  {currentOrganization?.organization?.name}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={openSelector}>
                Switch Organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : currentOrganization ? (
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
            {currentOrganization.organization?.name}
          </span>
        ) : null}
      </div>

      {/* Right section: User avatar dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleSettingsClick}>
            <Settings className="h-4 w-4 mr-2" />
            My Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={handleSignOut}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};
