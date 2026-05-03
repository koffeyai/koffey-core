import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Trash2, RefreshCw, CheckCircle2, ExternalLink, Phone, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useEntityConfig, EntityConfig, EntityField, getDefaultEntityConfig } from '@/hooks/useEntityConfig';
import { format } from 'date-fns';

type CRMEntityType = 'contacts' | 'deals' | 'accounts' | 'tasks' | 'activities';

interface DynamicCRMTableProps {
  entityType: CRMEntityType;
  title?: string;
  description?: string;
}

const fallbackFormFields: Record<CRMEntityType, EntityField[]> = {
  contacts: [
    { field: 'full_name', label: 'Full Name', type: 'text', required: true, displayOrder: 1 },
    { field: 'email', label: 'Email', type: 'email', displayOrder: 2 },
    { field: 'phone', label: 'Phone', type: 'phone', displayOrder: 3 },
    { field: 'company', label: 'Company', type: 'text', displayOrder: 4 },
  ],
  deals: [
    { field: 'name', label: 'Deal Name', type: 'text', required: true, displayOrder: 1 },
    { field: 'amount', label: 'Amount', type: 'currency', displayOrder: 2 },
    { field: 'stage', label: 'Stage', type: 'select', displayOrder: 3, options: [
      { value: 'prospecting', label: 'Prospecting' },
      { value: 'qualified', label: 'Qualified' },
      { value: 'proposal', label: 'Proposal' },
      { value: 'negotiation', label: 'Negotiation' },
    ] },
    { field: 'close_date', label: 'Close Date', type: 'date', displayOrder: 4 },
  ],
  accounts: [
    { field: 'name', label: 'Account Name', type: 'text', required: true, displayOrder: 1 },
    { field: 'website', label: 'Website', type: 'url', displayOrder: 2 },
    { field: 'industry', label: 'Industry', type: 'text', displayOrder: 3 },
    { field: 'phone', label: 'Phone', type: 'phone', displayOrder: 4 },
  ],
  tasks: [
    { field: 'title', label: 'Title', type: 'text', required: true, displayOrder: 1 },
    { field: 'status', label: 'Status', type: 'select', displayOrder: 2, options: [
      { value: 'pending', label: 'Pending' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
    ] },
    { field: 'due_date', label: 'Due Date', type: 'date', displayOrder: 3 },
  ],
  activities: [
    { field: 'title', label: 'Title', type: 'text', required: true, displayOrder: 1 },
    { field: 'type', label: 'Type', type: 'text', displayOrder: 2 },
    { field: 'activity_date', label: 'Activity Date', type: 'date', displayOrder: 3 },
    { field: 'description', label: 'Description', type: 'textarea', displayOrder: 4 },
  ],
};

// Badge color mapping
const getBadgeVariant = (color?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (color) {
    case 'green': return 'default';
    case 'red': return 'destructive';
    case 'gray': 
    case 'blue':
    case 'purple':
    case 'orange':
    default: return 'secondary';
  }
};

// Render cell value based on field type
const renderCellValue = (value: unknown, field: EntityField): React.ReactNode => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }

  switch (field.type) {
    case 'email':
      return (
        <a href={`mailto:${value}`} className="text-primary hover:underline flex items-center gap-1">
          <Mail className="h-3 w-3" />
          {String(value)}
        </a>
      );

    case 'phone':
      return (
        <a href={`tel:${value}`} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Phone className="h-3 w-3" />
          {String(value)}
        </a>
      );

    case 'url':
      const url = String(value).startsWith('http') ? String(value) : `https://${value}`;
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          {String(value).replace(/^https?:\/\//, '')}
        </a>
      );

    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Number(value));

    case 'percentage':
      return (
        <div className="flex items-center gap-2">
          <div className="w-12 bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full"
              style={{ width: `${Math.min(100, Number(value))}%` }}
            />
          </div>
          <span className="text-sm">{String(value)}%</span>
        </div>
      );

    case 'date':
      try {
        return format(new Date(String(value)), 'MMM d, yyyy');
      } catch {
        return String(value);
      }

    case 'datetime':
      try {
        return format(new Date(String(value)), 'MMM d, yyyy h:mm a');
      } catch {
        return String(value);
      }

    case 'checkbox':
      return value ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <div className="h-4 w-4 rounded border border-muted-foreground/30" />
      );

    case 'badge':
    case 'select':
      const option = field.options?.find(o => o.value === value);
      if (option) {
        return (
          <Badge variant={getBadgeVariant(option.color)}>
            {option.label}
          </Badge>
        );
      }
      return <Badge variant="secondary">{String(value)}</Badge>;

    default:
      return String(value);
  }
};

export const DynamicCRMTable: React.FC<DynamicCRMTableProps> = ({
  entityType,
  title: propTitle,
  description: propDescription
}) => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const { toast } = useToast();
  
  // Fetch entity config from database
  const { data: config, isLoading: configLoading } = useEntityConfig(entityType);
  const entityConfig = config || getDefaultEntityConfig(entityType);
  
  // State
  const [entities, setEntities] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // Derived values
  const title = propTitle || entityConfig.displayNamePlural;
  const description = propDescription || entityConfig.description;
  const editableFields = (
    entityConfig.formFields.length > 0
      ? entityConfig.formFields
      : entityConfig.listFields.length > 0
        ? entityConfig.listFields
        : fallbackFormFields[entityType]
  )
    .filter((field) => !['id', 'created_at', 'updated_at', 'organization_id', 'user_id'].includes(field.field));

  // Fetch entities
  const fetchEntities = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    
    try {
      const query = supabase
        .from(entityType)
        .select('*')
        .order(entityConfig.queryConfig.defaultSort, { 
          ascending: entityConfig.queryConfig.defaultSortDirection === 'asc' 
        })
        .limit(entityConfig.queryConfig.pageSize);

      const { data, error } = await query;
      if (error) throw error;
      setEntities(data || []);
    } catch (error) {
      console.error(`Error fetching ${entityType}:`, error);
      toast({
        title: 'Error',
        description: `Failed to load ${entityType}. Please try again.`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!configLoading) {
      fetchEntities();
    }
  }, [entityType, configLoading]);

  // Filtered entities based on search
  const filteredEntities = useMemo(() => {
    if (!searchTerm.trim()) return entities;
    
    const searchLower = searchTerm.toLowerCase();
    const searchFields = entityConfig.queryConfig.searchFields;
    
    return entities.filter(entity => 
      searchFields.some(field => {
        const value = entity[field];
        return value && String(value).toLowerCase().includes(searchLower);
      })
    );
  }, [entities, searchTerm, entityConfig.queryConfig.searchFields]);

  const openCreateDialog = () => {
    const initialData = editableFields.reduce<Record<string, unknown>>((data, field) => {
      data[field.field] = '';
      return data;
    }, {});
    setEditingEntity(null);
    setFormData(initialData);
    setDialogOpen(true);
  };

  const openEditDialog = (entity: Record<string, unknown>) => {
    const initialData = editableFields.reduce<Record<string, unknown>>((data, field) => {
      data[field.field] = entity[field.field] ?? '';
      return data;
    }, {});
    setEditingEntity(entity);
    setFormData(initialData);
    setDialogOpen(true);
  };

  const normalizeFormValue = (field: EntityField, value: unknown) => {
    if (value === '') return null;
    if (['number', 'currency', 'percentage'].includes(field.type)) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (field.type === 'checkbox') return Boolean(value);
    return value;
  };

  const handleSave = async () => {
    if (!user || !currentOrganization?.organization_id) {
      toast({
        title: 'Missing context',
        description: 'Sign in and select an organization before saving records.',
        variant: 'destructive'
      });
      return;
    }

    const payload = editableFields.reduce<Record<string, unknown>>((data, field) => {
      data[field.field] = normalizeFormValue(field, formData[field.field]);
      return data;
    }, {});

    try {
      if (editingEntity?.id) {
        const { data, error } = await supabase
          .from(entityType)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingEntity.id as string)
          .eq('organization_id', currentOrganization.organization_id)
          .select()
          .single();
        if (error) throw error;
        setEntities((prev) => prev.map((entity) => entity.id === editingEntity.id ? data : entity));
        toast({ title: 'Updated', description: `${entityConfig.displayName} updated successfully.` });
      } else {
        const { data, error } = await supabase
          .from(entityType)
          .insert({
            ...payload,
            organization_id: currentOrganization.organization_id,
            user_id: user.id,
          })
          .select()
          .single();
        if (error) throw error;
        setEntities((prev) => [data, ...prev]);
        toast({ title: 'Created', description: `${entityConfig.displayName} created successfully.` });
      }
      setDialogOpen(false);
      setEditingEntity(null);
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: 'Save failed',
        description: error.message || `Failed to save ${entityConfig.displayName.toLowerCase()}.`,
        variant: 'destructive'
      });
    }
  };

  const renderFormField = (field: EntityField) => {
    const value = formData[field.field] ?? '';
    const setValue = (nextValue: unknown) => setFormData((prev) => ({ ...prev, [field.field]: nextValue }));

    if (field.options?.length) {
      return (
        <Select value={String(value || '')} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field.type === 'textarea') {
      return (
        <Textarea
          value={String(value || '')}
          onChange={(event) => setValue(event.target.value)}
          placeholder={field.placeholder}
        />
      );
    }

    return (
      <Input
        type={field.type === 'date' ? 'date' : ['number', 'currency', 'percentage'].includes(field.type) ? 'number' : 'text'}
        value={String(value || '')}
        onChange={(event) => setValue(event.target.value)}
        placeholder={field.placeholder}
        required={field.required}
      />
    );
  };

  // Handle delete
  const handleDelete = async (entity: Record<string, unknown>) => {
    const id = entity.id as string;
    try {
      const { error } = await supabase.from(entityType).delete().eq('id', id);
      if (error) throw error;
      
      setEntities(prev => prev.filter(e => e.id !== id));
      toast({
        title: 'Deleted',
        description: `${entityConfig.displayName} deleted successfully.`
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete. Please try again.',
        variant: 'destructive'
      });
    }
  };

  if (loading || configLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-10 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {title}
              <Badge variant="secondary" className="ml-2">
                {filteredEntities.length}
              </Badge>
            </CardTitle>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => fetchEntities(false)}
              variant="outline"
              size="sm"
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={openCreateDialog} disabled={editableFields.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Add {entityConfig.displayName}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${entityConfig.displayNamePlural.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Dynamic Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {entityConfig.listFields.map(field => (
                  <TableHead 
                    key={field.field}
                    style={{ width: field.width }}
                  >
                    {field.label}
                  </TableHead>
                ))}
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntities.length > 0 ? (
                filteredEntities.map(entity => (
                  <TableRow key={entity.id as string} className="hover:bg-muted/50">
                    {entityConfig.listFields.map(field => (
                      <TableCell key={field.field}>
                        {renderCellValue(entity[field.field], field)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(entity)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(entity)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell 
                    colSpan={entityConfig.listFields.length + 1} 
                    className="text-center py-8 text-muted-foreground"
                  >
                    {searchTerm ? (
                      `No ${entityConfig.displayNamePlural.toLowerCase()} found matching "${searchTerm}"`
                    ) : (
                      `No ${entityConfig.displayNamePlural.toLowerCase()} yet. Create your first ${entityConfig.displayName.toLowerCase()}!`
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEntity ? 'Edit' : 'Add'} {entityConfig.displayName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {editableFields.map((field) => (
              <div key={field.field} className="space-y-2">
                <Label>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {renderFormField(field)}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingEntity ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
