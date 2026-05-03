
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu, Bell, Building2, ChevronDown, Settings, LogOut } from 'lucide-react';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { getUserDisplayName, getUserInitials } from '@/lib/userDisplayName';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { currentOrganization, hasMultipleOrganizations, openSelector } = useOrganizationAccess();
  const displayName = getUserDisplayName(user, profile, 'User');

  return (
    <header className="bg-background border-b border-border px-4 py-3 flex items-center justify-between relative z-30">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="mr-4"
        >
          <Menu size={20} />
        </Button>
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-foreground">CRM Assistant</h1>
          {currentOrganization && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-px bg-border" />
              {hasMultipleOrganizations ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      <span className="font-medium">{currentOrganization.organization?.name}</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onClick={openSelector}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Switch Organization
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{currentOrganization.organization?.name}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm">
          <Bell size={20} />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center gap-2 p-1.5">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback>
                  {getUserInitials(user, profile)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground hidden sm:inline">
                {displayName}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4 mr-2" />
              My Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
