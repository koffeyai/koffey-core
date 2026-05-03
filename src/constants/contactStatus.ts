/**
 * Contact Status Constants
 * Defines the lifecycle stages for leads and contacts
 */

// Lead statuses (prospecting phase)
export const LEAD_STATUSES = ['lead', 'mql', 'sql'] as const;

// Contact statuses (established relationships)
export const CONTACT_STATUSES = ['prospect', 'customer', 'partner', 'inactive', 'churned'] as const;

// All valid statuses
export const ALL_CONTACT_STATUSES = [...LEAD_STATUSES, ...CONTACT_STATUSES] as const;

export type LeadStatus = typeof LEAD_STATUSES[number];
export type ContactStatus = typeof CONTACT_STATUSES[number];
export type AllContactStatus = typeof ALL_CONTACT_STATUSES[number];

/**
 * Status configuration with display labels and colors
 */
export const STATUS_CONFIG: Record<AllContactStatus, { label: string; color: string; description: string }> = {
  // Lead statuses
  lead: {
    label: 'Lead',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'New lead, not yet qualified'
  },
  mql: {
    label: 'MQL',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Marketing Qualified Lead'
  },
  sql: {
    label: 'SQL',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    description: 'Sales Qualified Lead'
  },
  // Contact statuses
  prospect: {
    label: 'Prospect',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Active prospect in sales cycle'
  },
  customer: {
    label: 'Customer',
    color: 'bg-green-100 text-green-800 border-green-200',
    description: 'Active paying customer'
  },
  partner: {
    label: 'Partner',
    color: 'bg-teal-100 text-teal-800 border-teal-200',
    description: 'Strategic partner or reseller'
  },
  inactive: {
    label: 'Inactive',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    description: 'No longer active'
  },
  churned: {
    label: 'Churned',
    color: 'bg-red-100 text-red-800 border-red-200',
    description: 'Former customer who left'
  }
};

/**
 * Check if a status is a lead status
 */
export function isLeadStatus(status: string | null | undefined): boolean {
  return LEAD_STATUSES.includes(status as LeadStatus);
}

/**
 * Check if a status is a contact status (not a lead)
 */
export function isContactStatus(status: string | null | undefined): boolean {
  return CONTACT_STATUSES.includes(status as ContactStatus);
}

/**
 * Get the status configuration for a given status
 */
export function getStatusConfig(status: string | null | undefined) {
  if (!status || !(status in STATUS_CONFIG)) {
    return STATUS_CONFIG.lead; // Default to lead
  }
  return STATUS_CONFIG[status as AllContactStatus];
}
