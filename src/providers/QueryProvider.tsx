import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient, unifiedCacheManager } from '@/lib/cache';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useRealtimeCacheBridge } from '@/hooks/useRealtimeCacheBridge';

interface QueryProviderProps {
  children: React.ReactNode;
}

// Global Data Synchronizer - Keeps cache in sync with database changes
const GlobalDataSynchronizer = () => {
  const { isActive, bridgedTables } = useRealtimeCacheBridge();
  
  React.useEffect(() => {
    if (isActive) {
      console.log('🌉 Global Data Synchronizer active for tables:', bridgedTables);
    }
  }, [isActive, bridgedTables]);
  
  return null; // Renders nothing, just handles logic
};

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();

  // SECURE CACHE WARM-UP WHEN USER AND ORGANIZATION ARE AVAILABLE
  React.useEffect(() => {
    if (user && currentOrganization) {
      // Cache user profile securely
      unifiedCacheManager.setSecureData(
        `profile_${user.id}`, 
        { userId: user.id, orgId: currentOrganization.organization_id },
        'profile'
      );
    }
  }, [user?.id, currentOrganization?.organization_id]);

  // SECURE CLEANUP ON UNMOUNT
  React.useEffect(() => {
    return () => {
      unifiedCacheManager.clearExpiredCache();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalDataSynchronizer />
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          buttonPosition="bottom-right"
        />
      )}
    </QueryClientProvider>
  );
};