import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutDashboard, 
  Users, 
  Building, 
  Calendar, 
  CheckSquare, 
  BarChart3, 
  Settings,
  DollarSign,
  TrendingUp,
  MessageSquare,
  Zap,
  Presentation
} from 'lucide-react';
import { config } from '@/config';

const mainMenuItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Contacts', url: '/contacts', icon: Users },
  { title: 'Accounts', url: '/accounts', icon: Building },
  { title: 'Deals', url: '/deals', icon: DollarSign },
  { title: 'Activities', url: '/activities', icon: Calendar },
  { title: 'Tasks', url: '/tasks', icon: CheckSquare },
];

const enhancedMenuItems = [
  { title: 'Analytics', url: '/analytics', icon: BarChart3, badge: 'New' },
  { title: 'Insights', url: '/insights', icon: TrendingUp, badge: 'Beta' },
  { title: 'Slide Studio', url: '/slides', icon: Presentation },
  { title: 'Collaboration', url: '/collaboration', icon: MessageSquare },
];

const systemMenuItems = [
  { title: 'Settings', url: '/settings', icon: Settings },
];

export const EnhancedSidebar = () => {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === '/') {
      return currentPath === '/';
    }
    return currentPath.startsWith(path);
  };

  const getNavClassName = (path: string) => {
    return isActive(path)
      ? 'bg-primary text-primary-foreground font-medium'
      : 'hover:bg-muted/50 transition-colors';
  };

  const collapsed = state === 'collapsed';

  return (
    <Sidebar
      className={`${collapsed ? 'w-14' : 'w-64'} transition-all duration-300 border-r`}
      collapsible="icon"
    >
      <SidebarContent className="py-4">
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? 'sr-only' : ''}>
            CRM
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={getNavClassName(item.url)}>
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Enhanced Features */}
        {config.features.analyticsPanel && (
          <SidebarGroup>
            <SidebarGroupLabel className={collapsed ? 'sr-only' : ''}>
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3" />
                {!collapsed && 'Enhanced Features'}
              </div>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {enhancedMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className={getNavClassName(item.url)}>
                        <item.icon className="mr-2 h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <div className="flex items-center justify-between w-full">
                            <span>{item.title}</span>
                            {item.badge && (
                              <Badge variant="secondary" className="text-xs ml-2">
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* System */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel className={collapsed ? 'sr-only' : ''}>
            System
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={getNavClassName(item.url)}>
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};