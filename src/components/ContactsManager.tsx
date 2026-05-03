import React, { useState } from 'react';
import { EnhancedCRMManager } from '@/components/crm/EnhancedCRMManager';
import { RecentlyPromotedBanner } from '@/components/crm/RecentlyPromotedBanner';
import { LEAD_STATUSES } from '@/constants/contactStatus';

interface ContactsManagerProps {
  embedded?: boolean;
  hideActions?: boolean;
}

/**
 * ContactsManager - Displays contacts excluding lead statuses
 * Shows established contacts (prospects, customers, partners, etc.)
 */
export const ContactsManager: React.FC<ContactsManagerProps> = ({ 
  embedded = false, 
  hideActions = false 
}) => {
  const [showBanner, setShowBanner] = useState(true);

  return (
    <div className="space-y-4">
      {showBanner && (
        <div className="px-6 pt-6 pb-0">
          <RecentlyPromotedBanner onDismiss={() => setShowBanner(false)} />
        </div>
      )}
      <EnhancedCRMManager
        entityType="contacts"
        title="Contacts"
        description="Manage your customer and partner relationships"
        defaultFilters={{
          status_not_in: [...LEAD_STATUSES] // Exclude lead, mql, sql statuses
        }}
      />
    </div>
  );
};
