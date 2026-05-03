import React from 'react';
import { EnhancedCRMManager } from '@/components/crm/EnhancedCRMManager';
import { LEAD_STATUSES } from '@/constants/contactStatus';

interface LeadsManagerProps {
  embedded?: boolean;
  hideActions?: boolean;
}

/**
 * LeadsManager - Displays contacts with lead statuses (lead, mql, sql)
 * Uses the shared contacts table but filters to only show leads
 */
export const LeadsManager: React.FC<LeadsManagerProps> = ({ 
  embedded = false, 
  hideActions = false 
}) => {
  return (
    <EnhancedCRMManager
      entityType="contacts"
      title="Leads"
      description="Manage and qualify your sales leads"
      defaultFilters={{
        status_in: [...LEAD_STATUSES] // Filter to only show lead, mql, sql statuses
      }}
    />
  );
};
