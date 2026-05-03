import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, Search, Edit, Trash2, RefreshCw, Filter,
  ChevronDown, Mail, Phone, DollarSign, Calendar
} from 'lucide-react';
import { useCRM, CRMEntity as CRMEntityType, CRMFilters } from '@/hooks/useCRM';
import { EntityDialog } from './EntityDialog';
import { EntityFilters } from './EntityFilters';
import { BulkOperations } from '@/components/crm/BulkOperations';
import { Link } from 'react-router-dom';

interface CRMEntityManagerProps {
  entityType: CRMEntityType;
  title?: string;
  description?: string;
  defaultFilters?: CRMFilters;
  hideActions?: boolean;
  embedded?: boolean;
}

export const CRMEntityManager: React.FC<CRMEntityManagerProps> = ({
  entityType,
  title,
  description,
  defaultFilters = {},
  hideActions = false,
  embedded = false
}) => {
  // STATE MANAGEMENT
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<CRMFilters>(defaultFilters);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  // DEBOUNCED SEARCH
  const debouncedFilters = useMemo(() => {
    return { ...filters, search: searchTerm };
  }, [filters, searchTerm]);

  // CRM ENTITY HOOK
  const {
    entities,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    createEntity,
    updateEntity,
    deleteEntity,
    bulkOperations,
    selection,
    config,
    totalCount
  } = useCRM(entityType, debouncedFilters);

  // HANDLERS
  const handleCreate = async (entityData: any) => {
    await createEntity(entityData);
    setIsDialogOpen(false);
  };

  const handleUpdate = async (entityId: string, updates: any) => {
    await updateEntity(entityId, updates);
    setEditingEntity(null);
    setIsDialogOpen(false);
  };

  const handleDelete = async (entityId: string) => {
    if (window.confirm(`Are you sure you want to delete this ${config.displayName.toLowerCase()}?`)) {
      await deleteEntity(entityId);
    }
  };

  // FIELD RENDERERS
  const renderFieldValue = (entity: any, field: any) => {
    const value = entity[field.field];
    if (!value && value !== 0) return '—';

    switch (field.type) {
      case 'email':
        return (
          <div className="flex items-center gap-2">
            <Mail className="h-3 w-3 text-muted-foreground" />
            <a href={`mailto:${value}`} className="text-blue-600 hover:underline">
              {value}
            </a>
          </div>
        );
      case 'phone':
        return (
          <div className="flex items-center gap-2">
            <Phone className="h-3 w-3 text-muted-foreground" />
            <a href={`tel:${value}`} className="text-blue-600 hover:underline">
              {value}
            </a>
          </div>
        );
      case 'currency':
        return (
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            {new Intl.NumberFormat('en-US', { 
              style: 'currency', 
              currency: 'USD',
              minimumFractionDigits: 0
            }).format(value)}
          </div>
        );
      case 'date':
        return (
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            {new Date(value).toLocaleDateString()}
          </div>
        );
      case 'badge':
      case 'status':
        const statusColor = config.statusOptions?.find(opt => opt.value === value)?.color || 'blue';
        return (
          <Badge variant={value === 'completed' || value === 'closed_won' ? 'default' : 'secondary'}>
            {config.statusOptions?.find(opt => opt.value === value)?.label || value}
          </Badge>
        );
      default:
        return <span className="truncate">{value}</span>;
    }
  };

  // LOADING STATE
  if (loading && entities.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card><CardContent className="p-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4 mb-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${embedded ? 'space-y-4' : ''}`}>
      {/* HEADER */}
      {!embedded && (
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{title || config.displayNamePlural}</h1>
            <p className="text-muted-foreground">
              {description || `Manage your ${config.displayNamePlural.toLowerCase()}`}
              {totalCount > 0 && ` • ${totalCount} total`}
            </p>
          </div>
          
          {!hideActions && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refresh()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={() => { setEditingEntity(null); setIsDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add {config.displayName}
              </Button>
              {entityType === 'contacts' && (
                <Button variant="outline" asChild>
                  <Link to="/app/contacts/new">Open full page</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* SEARCH & FILTERS */}
      <Card><CardContent className="p-4">
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder={`Search ${config.displayNamePlural.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>
        
        {showFilters && (
          <div className="mt-4 pt-4 border-t">
            <EntityFilters
              entityType={entityType}
              config={config}
              filters={filters}
              onChange={setFilters}
            />
          </div>
        )}
      </CardContent></Card>

      {/* BULK OPERATIONS */}
      {selection.selectedCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {selection.selectedCount} {config.displayNamePlural.toLowerCase()} selected
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => bulkOperations.delete(selection.getSelected().map(e => e.id))}
              >
                Delete Selected
              </Button>
              <Button variant="outline" size="sm" onClick={selection.clearSelection}>
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ENTITY TABLE */}
      <Card><CardContent className="p-0">
        {entities.length === 0 && !loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No {config.displayNamePlural.toLowerCase()} found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input type="checkbox" className="rounded border-gray-300" />
                </TableHead>
                {config.listFields.map((field) => (
                  <TableHead key={field.field}>{field.label}</TableHead>
                ))}
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((entity) => (
                <TableRow key={entity.id}>
                  <TableCell>
                    <input type="checkbox" className="rounded border-gray-300" />
                  </TableCell>
                  {config.listFields.map((field) => (
                    <TableCell key={field.field}>
                      {renderFieldValue(entity, field)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingEntity(entity); setIsDialogOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(entity.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        
        {hasMore && (
          <div className="p-4 text-center border-t">
            <Button variant="outline" onClick={() => loadMore()} disabled={loadingMore}>
              <ChevronDown className="h-4 w-4 mr-2" />
              {loadingMore ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </CardContent></Card>

      {/* ENTITY DIALOG */}
      <EntityDialog
        entityType={entityType}
        config={config}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        entity={editingEntity}
        onSave={editingEntity ? 
          (updates) => handleUpdate(editingEntity.id, updates) :
          handleCreate
        }
      />
    </div>
  );
};