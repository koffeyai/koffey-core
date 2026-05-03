
import React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
//deleted instances of enhanced sidebar because we dont use it
import { EnhancedSidebar } from './EnhancedSidebar';
import { EnhancedHeader } from './EnhancedHeader';
import { CollaborationPanel } from '@/components/collaboration/CollaborationPanel';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { config } from '@/config';

interface EnhancedLayoutProps {
  children: React.ReactNode;
  showCollaboration?: boolean;
  showEnhancedFeatures?: boolean;
}

export const EnhancedLayout: React.FC<EnhancedLayoutProps> = ({ 
  children, 
  showCollaboration = true,
  showEnhancedFeatures = true 
}) => {
  const { user } = useAuth();
  const { hasOrganization, loading: orgLoading } = useOrganizationAccess();

  // If enhanced features are disabled, use simple layout
  if (!showEnhancedFeatures || !config.features.analyticsPanel) {
    return (
      <div className="min-h-screen bg-background">
        {children}
        <Toaster />
      </div>
    );
  }

  // Determine if collaboration should be shown
  const shouldShowCollaboration = showCollaboration && 
                                  user && 
                                  !orgLoading && 
                                  hasOrganization && 
                                  config.features.realTimeUpdates;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        
        <div className="flex-1 flex flex-col">
          <EnhancedHeader />
          
          <div className="flex flex-1">
            {/* Main Content */}
            <main className="flex-1 overflow-auto">
              <div className="animate-fade-in">
                {children}
              </div>
            </main>
            
            {/* Collaboration Panel - Only show when conditions are met */}
            {shouldShowCollaboration && (
              <aside className="w-80 border-l bg-muted/30 overflow-auto animate-slide-in-right">
                <div className="p-4 sticky top-0">
                  <CollaborationPanel />
                </div>
              </aside>
            )}
          </div>
        </div>
        
        <Toaster />
      </div>
    </SidebarProvider>
  );
};
