import React, { useState } from 'react';
import { EnhancedCRMManager } from '@/components/crm/EnhancedCRMManager';
import { RecentlyPromotedBanner } from '@/components/crm/RecentlyPromotedBanner';

interface ContactsManagerProps {
  embedded?: boolean;
  hideActions?: boolean;
}

/**
 * ContactsManager - Displays all people records.
 * Leads remains the focused qualification view for lead, MQL, and SQL statuses.
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
      />
    </div>
  );
};
