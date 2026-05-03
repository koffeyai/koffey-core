import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Types matching the database schema
export interface FieldOption {
  value: string;
  label: string;
  color?: string;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  required?: boolean;
}

export interface EntityField {
  field: string;
  label: string;
  type: string;
  width?: string;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[];
  validation?: FieldValidation;
  displayOrder: number;
}

export interface EntityConfig {
  entityName: string;
  tableName: string;
  displayName: string;
  displayNamePlural: string;
  primaryKey: string;
  description?: string;
  icon?: string;
  queryConfig: {
    defaultSort: string;
    defaultSortDirection: 'asc' | 'desc';
    pageSize: number;
    searchFields: string[];
  };
  listFields: EntityField[];
  formFields: EntityField[];
  requiredFields: string[];
  permissions?: {
    canView: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canExport: boolean;
    canBulkEdit: boolean;
  };
}

// Safe JSON type helper
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// Parse query config from JSON
function parseQueryConfig(json: unknown): EntityConfig['queryConfig'] {
  const config = json as Record<string, unknown> | null;
  return {
    defaultSort: (config?.defaultSort as string) || 'created_at',
    defaultSortDirection: (config?.defaultSortDirection as 'asc' | 'desc') || 'desc',
    pageSize: (config?.pageSize as number) || 25,
    searchFields: (config?.searchFields as string[]) || [],
  };
}

// Parse field options from JSON
function parseOptions(json: unknown): FieldOption[] | undefined {
  if (!json || !Array.isArray(json)) return undefined;
  return json as FieldOption[];
}

// Parse validation from JSON  
function parseValidation(json: unknown): FieldValidation | undefined {
  if (!json || typeof json !== 'object') return undefined;
  return json as FieldValidation;
}

// Transform database rows to EntityConfig
function transformToEntityConfig(
  definition: {
    entity_name: string;
    table_name: string;
    display_name: string;
    display_name_plural: string;
    primary_key: string;
    description: string | null;
    icon: string | null;
    query_config: unknown;
  },
  fields: Array<{
    field_name: string;
    field_label: string;
    field_type: string;
    display_order: number;
    is_list_field: boolean;
    is_form_field: boolean;
    is_required: boolean;
    width: string | null;
    placeholder: string | null;
    options: unknown;
    validation: unknown;
  }>,
  permissions?: {
    can_view: boolean;
    can_create: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_export: boolean;
    can_bulk_edit: boolean;
  }
): EntityConfig {
  const listFields = fields
    .filter(f => f.is_list_field)
    .sort((a, b) => a.display_order - b.display_order)
    .map(f => ({
      field: f.field_name,
      label: f.field_label,
      type: f.field_type,
      width: f.width || undefined,
      placeholder: f.placeholder || undefined,
      required: f.is_required,
      options: parseOptions(f.options),
      validation: parseValidation(f.validation),
      displayOrder: f.display_order,
    }));

  const formFields = fields
    .filter(f => f.is_form_field)
    .sort((a, b) => a.display_order - b.display_order)
    .map(f => ({
      field: f.field_name,
      label: f.field_label,
      type: f.field_type,
      width: f.width || undefined,
      placeholder: f.placeholder || undefined,
      required: f.is_required,
      options: parseOptions(f.options),
      validation: parseValidation(f.validation),
      displayOrder: f.display_order,
    }));

  const requiredFields = fields
    .filter(f => f.is_required)
    .map(f => f.field_name);

  return {
    entityName: definition.entity_name,
    tableName: definition.table_name,
    displayName: definition.display_name,
    displayNamePlural: definition.display_name_plural,
    primaryKey: definition.primary_key,
    description: definition.description || undefined,
    icon: definition.icon || undefined,
    queryConfig: parseQueryConfig(definition.query_config),
    listFields,
    formFields,
    requiredFields,
    permissions: permissions ? {
      canView: permissions.can_view,
      canCreate: permissions.can_create,
      canUpdate: permissions.can_update,
      canDelete: permissions.can_delete,
      canExport: permissions.can_export,
      canBulkEdit: permissions.can_bulk_edit,
    } : undefined,
  };
}

// Fetch entity config from database
async function fetchEntityConfig(entityName: string, userRole?: string): Promise<EntityConfig | null> {
  // Fetch definition
  const { data: definition, error: defError } = await supabase
    .from('entity_definitions')
    .select('*')
    .eq('entity_name', entityName)
    .eq('is_active', true)
    .single();

  if (defError || !definition) {
    console.error(`Failed to fetch entity definition for ${entityName}:`, defError);
    return null;
  }

  // Fetch fields
  const { data: fields, error: fieldsError } = await supabase
    .from('entity_fields')
    .select('*')
    .eq('entity_definition_id', definition.id)
    .order('display_order', { ascending: true });

  if (fieldsError) {
    console.error(`Failed to fetch entity fields for ${entityName}:`, fieldsError);
    return null;
  }

  // Fetch permissions for user's role
  let permissions: Parameters<typeof transformToEntityConfig>[2];
  if (userRole) {
    const { data: permData } = await supabase
      .from('entity_permissions')
      .select('*')
      .eq('entity_definition_id', definition.id)
      .eq('role', userRole)
      .single();
    
    if (permData) {
      permissions = permData;
    }
  }

  return transformToEntityConfig(definition, fields || [], permissions);
}

// Fetch all entity configs at once
async function fetchAllEntityConfigs(): Promise<Record<string, EntityConfig>> {
  const { data: definitions, error: defError } = await supabase
    .from('entity_definitions')
    .select('*')
    .eq('is_active', true);

  if (defError || !definitions) {
    console.error('Failed to fetch entity definitions:', defError);
    return {};
  }

  const { data: allFields, error: fieldsError } = await supabase
    .from('entity_fields')
    .select('*')
    .order('display_order', { ascending: true });

  if (fieldsError) {
    console.error('Failed to fetch entity fields:', fieldsError);
    return {};
  }

  const configs: Record<string, EntityConfig> = {};
  
  for (const def of definitions) {
    const defFields = (allFields || []).filter(f => f.entity_definition_id === def.id);
    configs[def.entity_name] = transformToEntityConfig(def, defFields);
  }

  return configs;
}

// Hook for single entity config
export function useEntityConfig(entityName: string, userRole?: string) {
  return useQuery({
    queryKey: ['entityConfig', entityName, userRole],
    queryFn: () => fetchEntityConfig(entityName, userRole),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
  });
}

// Hook for all entity configs (useful for initial app load)
export function useAllEntityConfigs() {
  return useQuery({
    queryKey: ['allEntityConfigs'],
    queryFn: fetchAllEntityConfigs,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

// Helper to get default config while loading (prevents UI flicker)
export function getDefaultEntityConfig(entityName: string): EntityConfig {
  return {
    entityName,
    tableName: entityName,
    displayName: entityName.charAt(0).toUpperCase() + entityName.slice(1, -1),
    displayNamePlural: entityName.charAt(0).toUpperCase() + entityName.slice(1),
    primaryKey: 'id',
    queryConfig: {
      defaultSort: 'created_at',
      defaultSortDirection: 'desc',
      pageSize: 25,
      searchFields: [],
    },
    listFields: [],
    formFields: [],
    requiredFields: [],
  };
}
