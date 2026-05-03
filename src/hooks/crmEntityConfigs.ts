import { Tables } from '@/integrations/supabase/types';
import { z } from 'zod';

// Types (previously imported from useEnhancedCRM)
type CRMTableName = 'contacts' | 'deals' | 'activities' | 'tasks' | 'accounts';

export interface CRMEntityConfig<T> {
  table: CRMTableName;
  defaultFields: string;
  transform?: (data: any) => T;
  validate?: (data: Partial<T>) => string | null;
}

// Entity Types
export type Contact = Tables<'contacts'>;
export type Deal = Tables<'deals'>;
export type Activity = Tables<'activities'>;
export type Task = Tables<'tasks'>;
export type Account = Tables<'accounts'>;

// Zod Schemas for validation
export const contactSchema = z.object({
  id: z.string().uuid().optional(),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  organization_id: z.string().uuid()
});

export const dealSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Deal name is required'),
  amount: z.number().min(0, 'Amount must be positive'),
  stage: z.enum(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']),
  close_date: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  organization_id: z.string().uuid()
});

export const activitySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: z.enum(['call', 'email', 'meeting', 'task', 'note']),
  activity_date: z.string(),
  contact_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
  organization_id: z.string().uuid()
});

export const taskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  assigned_to: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  organization_id: z.string().uuid()
});

export const accountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Account name is required'),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  size: z.enum(['small', 'medium', 'large', 'enterprise']).optional(),
  description: z.string().optional(),
  organization_id: z.string().uuid()
});

// Validation functions
const validateContact = (data: Partial<Contact>): string | null => {
  if (!data.first_name && !data.last_name && !data.email) {
    return 'Contact must have at least a first name, last name, or email';
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return 'Please enter a valid email address';
  }
  return null;
};

const validateDeal = (data: Partial<Deal>): string | null => {
  if (!data.name?.trim()) {
    return 'Deal name is required';
  }
  if (data.amount && data.amount < 0) {
    return 'Deal amount cannot be negative';
  }
  if (data.probability && (data.probability < 0 || data.probability > 100)) {
    return 'Probability must be between 0 and 100';
  }
  return null;
};

const validateActivity = (data: Partial<Activity>): string | null => {
  if (!data.title?.trim()) {
    return 'Activity title is required';
  }
  if (!data.type?.trim()) {
    return 'Activity type is required';
  }
  return null;
};

const validateTask = (data: Partial<Task>): string | null => {
  if (!data.title?.trim()) {
    return 'Task title is required';
  }
  return null;
};

const validateAccount = (data: Partial<Account>): string | null => {
  if (!data.name?.trim()) {
    return 'Account name is required';
  }
  return null;
};

// Transform functions for consistent data structure
const transformContact = (data: any): Contact => ({
  ...data,
  full_name: data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || null
});

const transformDeal = (data: any): Deal => ({
  ...data,
  amount: data.amount ? Number(data.amount) : null,
  probability: data.probability ? Number(data.probability) : null
});

const transformActivity = (data: any): Activity => ({
  ...data,
  scheduled_at: data.scheduled_at ? new Date(data.scheduled_at).toISOString() : null,
  activity_date: data.activity_date ? new Date(data.activity_date).toISOString() : null
});

const transformTask = (data: any): Task => ({
  ...data,
  due_date: data.due_date ? new Date(data.due_date).toISOString().split('T')[0] : null
});

const transformAccount = (data: any): Account => ({
  ...data
});

// Entity Configurations
export const entityConfigs = {
  contacts: {
    table: 'contacts' as const,
    defaultFields: `
      id, user_id, organization_id, assigned_to, account_id,
      first_name, last_name, full_name, title, email, phone,
      company, position, address, notes, linkedin_url, created_at, updated_at
    `,
    transform: transformContact,
    validate: validateContact
  } as CRMEntityConfig<Contact>,

  deals: {
    table: 'deals' as const,
    defaultFields: `
      id, user_id, organization_id, assigned_to, contact_id, account_id,
      name, stage, amount, currency, probability, close_date, expected_close_date,
      description, created_at, updated_at
    `,
    transform: transformDeal,
    validate: validateDeal
  } as CRMEntityConfig<Deal>,

  activities: {
    table: 'activities' as const,
    defaultFields: `
      id, user_id, organization_id, assigned_to, contact_id, account_id, deal_id,
      title, type, description, subject, scheduled_at, activity_date, completed,
      created_at, updated_at
    `,
    transform: transformActivity,
    validate: validateActivity
  } as CRMEntityConfig<Activity>,

  tasks: {
    table: 'tasks' as const,
    defaultFields: `
      id, user_id, organization_id, assigned_to, contact_id, account_id, deal_id,
      title, description, status, priority, due_date, completed,
      created_at, updated_at
    `,
    transform: transformTask,
    validate: validateTask
  } as CRMEntityConfig<Task>,

  accounts: {
    table: 'accounts' as const,
    defaultFields: `
      id, user_id, organization_id, assigned_to,
      name, industry, website, phone, address, description,
      scraped_data, enriched_at, data_sources, confidence_scores,
      created_at, updated_at
    `,
    transform: transformAccount,
    validate: validateAccount
  } as CRMEntityConfig<Account>
};

// Helper function to get entity config by name
export const getEntityConfig = (entityName: keyof typeof entityConfigs) => {
  return entityConfigs[entityName];
};

// Common field sets for different use cases
export const fieldSets = {
  // Minimal fields for lists/cards
  minimal: {
    contacts: 'id, first_name, last_name, full_name, email, phone, company, title, linkedin_url, created_at',
    deals: 'id, name, stage, amount, currency, created_at',
    activities: 'id, title, type, scheduled_at, completed, created_at',
    tasks: 'id, title, status, priority, due_date, completed, created_at',
    accounts: 'id, name, industry, created_at'
  },
  
  // Extended fields for detailed views
  extended: {
    contacts: `
      id, user_id, organization_id, assigned_to, account_id,
      first_name, last_name, full_name, title, email, phone,
      company, position, address, notes, linkedin_url, created_at, updated_at,
      accounts(id, name)
    `,
    deals: `
      id, user_id, organization_id, assigned_to, contact_id, account_id,
      name, stage, amount, currency, probability, close_date, expected_close_date,
      description, created_at, updated_at,
      contacts(id, first_name, last_name, email),
      accounts(id, name)
    `,
    activities: `
      id, user_id, organization_id, assigned_to, contact_id, account_id, deal_id,
      title, type, description, subject, scheduled_at, activity_date, completed,
      created_at, updated_at,
      contacts(id, first_name, last_name),
      deals(id, name),
      accounts(id, name)
    `,
    tasks: `
      id, user_id, organization_id, assigned_to, contact_id, account_id, deal_id,
      title, description, status, priority, due_date, completed,
      created_at, updated_at,
      contacts(id, first_name, last_name),
      deals(id, name),
      accounts(id, name)
    `,
    accounts: `
      id, user_id, organization_id, assigned_to,
      name, industry, website, phone, address, description,
      created_at, updated_at
    `
  }
};

// Create specialized configs for different use cases
export const createEntityConfig = <T>(
  entityName: keyof typeof entityConfigs,
  overrides?: Partial<CRMEntityConfig<T>>
): CRMEntityConfig<T> => {
  const baseConfig = entityConfigs[entityName];
  return {
    ...baseConfig,
    ...overrides
  } as CRMEntityConfig<T>;
};

// ============= LEGACY USCRM SUPPORT =============
// Import EntityConfig interface for useCRM.ts compatibility
import type { EntityConfig } from './useCRM';

// Legacy config adapter for useCRM.ts
export const legacyEntityConfigs: Record<string, EntityConfig> = {
  contacts: {
    table: 'contacts',
    displayName: 'Contact',
    displayNamePlural: 'Contacts',
    primaryKey: 'id',
    listFields: [
      { field: 'full_name', label: 'Name', type: 'text', width: '200px' },
      { field: 'email', label: 'Email', type: 'email', width: '250px' },
      { field: 'phone', label: 'Phone', type: 'phone', width: '150px' },
      { field: 'company', label: 'Company', type: 'text', width: '180px' },
      { field: 'status', label: 'Status', type: 'badge', width: '120px' },
      { field: 'linkedin_url', label: 'LinkedIn', type: 'text', width: '200px' }
    ],
    formFields: [
      { field: 'full_name', label: 'Full Name', type: 'text', required: true, placeholder: 'Enter full name' },
      { field: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'Enter email address' },
      { field: 'phone', label: 'Phone Number', type: 'phone', placeholder: 'Enter phone number' },
      { field: 'company', label: 'Company', type: 'text', placeholder: 'Enter company name' },
      { field: 'title', label: 'Job Title', type: 'text', placeholder: 'Enter job title' },
      { field: 'linkedin_url', label: 'LinkedIn URL', type: 'text', placeholder: 'https://linkedin.com/in/...' },
      { 
        field: 'status', 
        label: 'Status', 
        type: 'select', 
        options: [
          { value: 'active', label: 'Active', color: 'green' },
          { value: 'inactive', label: 'Inactive', color: 'gray' },
          { value: 'prospect', label: 'Prospect', color: 'blue' }
        ]
      },
      { field: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes' }
    ],
    requiredFields: ['full_name', 'email'],
    statusOptions: [
      { value: 'active', label: 'Active', color: 'green' },
      { value: 'inactive', label: 'Inactive', color: 'gray' },
      { value: 'prospect', label: 'Prospect', color: 'blue' }
    ],
    permissions: {
      create: true,
      read: true,
      update: true,
      delete: true,
      bulk: true
    },
    queryConfig: {
      pageSize: 25,
      searchFields: [
        'full_name',
        'first_name',
        'last_name',
        'email',
        'phone',
        'company',
        'title',
        'status',
        'linkedin_url',
        'notes'
      ],
      defaultSort: 'created_at'
    },
    validation: {
      full_name: { required: true, min: 2, max: 100 },
      email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
    }
  },
  
  deals: {
    table: 'deals',
    displayName: 'Deal',
    displayNamePlural: 'Deals',
    primaryKey: 'id',
    listFields: [],
    formFields: [],
    requiredFields: [],
    permissions: {
      create: true,
      read: true,
      update: true,
      delete: true,
      bulk: true
    },
    queryConfig: {
      pageSize: 25,
      searchFields: ['name'],
      defaultSort: 'created_at'
    },
    validation: {}
  },
  
  accounts: {
    table: 'accounts',
    displayName: 'Account',
    displayNamePlural: 'Accounts',
    primaryKey: 'id',
    listFields: [],
    formFields: [],
    requiredFields: [],
    permissions: {
      create: true,
      read: true,
      update: true,
      delete: true,
      bulk: true
    },
    queryConfig: {
      pageSize: 25,
      searchFields: ['name'],
      defaultSort: 'created_at'
    },
    validation: {}
  },
  
  tasks: {
    table: 'tasks',
    displayName: 'Task',
    displayNamePlural: 'Tasks',
    primaryKey: 'id',
    listFields: [],
    formFields: [],
    requiredFields: [],
    permissions: {
      create: true,
      read: true,
      update: true,
      delete: true,
      bulk: true
    },
    queryConfig: {
      pageSize: 25,
      searchFields: ['title'],
      defaultSort: 'created_at'
    },
    validation: {}
  },
  
  activities: {
    table: 'activities',
    displayName: 'Activity',
    displayNamePlural: 'Activities',
    primaryKey: 'id',
    listFields: [],
    formFields: [],
    requiredFields: [],
    permissions: {
      create: true,
      read: true,
      update: true,
      delete: true,
      bulk: true
    },
    queryConfig: {
      pageSize: 25,
      searchFields: ['title'],
      defaultSort: 'created_at'
    },
    validation: {}
  }
};

// Export legacy config getter for useCRM.ts
export const getLegacyEntityConfig = (entityType: string): EntityConfig => {
  const config = legacyEntityConfigs[entityType];
  if (!config) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }
  return config;
};
