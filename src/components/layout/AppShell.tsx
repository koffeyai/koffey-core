import React from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { MinimalHeader } from './MinimalHeader';

interface AppShellProps {
  children: React.ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: string) => void;
  currentView: string;
  showHeader?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  sidebarOpen,
  setSidebarOpen,
  setCurrentView,
  currentView,
  showHeader = true,
}) => {
  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <AppSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          setCurrentView={setCurrentView}
          currentView={currentView}
        />
      )}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {showHeader && (
          <MinimalHeader
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            setCurrentView={setCurrentView}
          />
        )}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};
