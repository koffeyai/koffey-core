
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { Search, Command, Settings, LogOut, User, Palette } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getUserDisplayName, getUserInitials } from '@/lib/userDisplayName';

export const EnhancedHeader = () => {
  const { user, profile } = useAuth();
  const { hasOrganization, loading: orgLoading } = useOrganizationAccess();
  const navigate = useNavigate();
  
  // Always call the hook but pass enabled state as parameter
  const collaborationEnabled = hasOrganization && !orgLoading;
  const { isConnected, activeUsers } = useRealtimeCollaboration('crm_workspace', collaborationEnabled);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: 'Logged out successfully' });
    } catch (error) {
      toast({ 
        title: 'Error logging out', 
        description: 'Please try again',
        variant: 'destructive' 
      });
    }
  };

  const handleQuickSearch = () => {
    toast({ 
      title: 'Quick Search', 
      description: 'Global search feature coming soon!' 
    });
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  const userName = getUserDisplayName(user, profile, 'User');

  return (
    <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 h-full">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          <SidebarTrigger className="hover-scale" />
          
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleQuickSearch}
              className="relative w-64 justify-start text-muted-foreground hover-scale"
            >
              <Search className="mr-2 h-4 w-4" />
              <span>Search everything...</span>
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium opacity-100 sm:flex">
                <Command className="h-3 w-3" />
                K
              </kbd>
            </Button>
          </div>
        </div>

        {/* Center Section - Connection Status */}
        <div className="flex items-center gap-2">
          {collaborationEnabled && isConnected && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>
                {activeUsers.length > 0 
                  ? `${activeUsers.length + 1} users online`
                  : 'You are online'
                }
              </span>
            </div>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Quick Actions */}
          <Button variant="ghost" size="sm" className="hidden md:flex hover-scale">
            <Palette className="h-4 w-4" />
          </Button>

          {/* Notifications */}
          <NotificationCenter />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full hover-scale">
                <Avatar className="h-8 w-8">
                  <AvatarImage 
                    src={user?.user_metadata?.avatar_url} 
                    alt={userName} 
                  />
                  <AvatarFallback>
                    {getUserInitials(user, profile)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{userName}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem className="cursor-pointer" onClick={handleSettings}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                className="cursor-pointer text-red-600 focus:text-red-600"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
