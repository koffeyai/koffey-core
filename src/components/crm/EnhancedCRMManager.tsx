import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useIntelligentErrorGuidance } from '@/hooks/useIntelligentErrorGuidance';
import {
  Plus, Search, Edit, Trash2, RefreshCw, ChevronDown, ChevronRight, Linkedin,
  Users, Handshake, Building2, SearchX
} from 'lucide-react';
import { ContactDialog } from '@/components/contacts/ContactDialog';
import { DealDialog } from '@/components/deals/DealDialog';
import { AccountDialog } from '@/components/accounts/AccountDialog';
import { DeleteConfirmationDialog } from '@/components/common/DeleteConfirmationDialog';
import { FileUploadButton } from '@/components/crm/FileUploadButton';
import { BulkOperationsEnhanced } from '@/components/crm/BulkOperationsEnhanced';
import { LeadQualificationCard } from '@/components/leads/LeadQualificationCard';
import { ClientMemoryPanel } from '@/components/contacts/ClientMemoryPanel';
import { SuggestedActionsPanel } from '@/components/suggestions/SuggestedActionsPanel';
import { useCRM, CRMEntity } from '@/hooks/useCRM';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { usePageContextSync } from '@/hooks/usePageContextSync';
import { LEAD_STATUSES } from '@/constants/contactStatus';
import { supabase } from '@/integrations/supabase/client';

interface EntityBase {
  id: string;
  created_at?: string;
  updated_at?: string;
}

interface Contact extends EntityBase {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  address?: string;
  notes?: string;
  status?: 'active' | 'inactive' | 'prospect' | 'customer';
  linkedin_url?: string;
}

interface Deal extends EntityBase {
  name?: string;
  amount?: number;
  currency?: string;
  stage?: string;
  probability?: number;
  close_date?: string;
  expected_close_date?: string;
  description?: string;
  stakeholders?: string;
  notes?: string;
}

interface Account extends EntityBase {
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  address?: string;
  description?: string;
}

type EntityType = 'contacts' | 'deals' | 'accounts';
type Entity = Contact | Deal | Account;

interface EnhancedCRMManagerProps {
  entityType: EntityType;
  title: string;
  description?: string;
  defaultFilters?: Record<string, any>;
}

export const EnhancedCRMManager: React.FC<EnhancedCRMManagerProps> = ({
  entityType,
  title,
  description,
  defaultFilters = {}
}) => {
  const { toast } = useToast();
  const { showGuidance, showSuccess } = useIntelligentErrorGuidance();
  const { organizationId } = useOrganizationAccess();

  // Debounced search: display value updates instantly, server query debounced
  const [searchInput, setSearchInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchFilter(value);
    }, 300);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Combine default filters with debounced search
  const combinedFilters = useMemo(() => ({
    ...defaultFilters,
    search: searchFilter
  }), [defaultFilters, searchFilter]);

  const crm = useCRM(entityType as CRMEntity, combinedFilters);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<Entity | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Determine if we're showing leads (for row expansion feature)
  const isLeadsView = useMemo(() => {
    if (entityType !== 'contacts') return false;
    const statusIn = defaultFilters?.status_in as string[] | undefined;
    return statusIn?.some((s: string) => (LEAD_STATUSES as readonly string[]).includes(s)) ?? false;
  }, [entityType, defaultFilters]);

  // Contacts view (non-leads) also supports row expansion for AI memory
  const isContactsView = entityType === 'contacts' && !isLeadsView;
  const isExpandable = isLeadsView || isContactsView;

  const toggleRowExpansion = useCallback((id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Server already filters by search term via useCRM, so just use entities directly
  const filteredData = crm.entities || [];

  // Helper to get display name
  const getDisplayName = useCallback((entity: Entity): string => {
    if ('full_name' in entity && entity.full_name) return entity.full_name;
    if ('name' in entity && entity.name) return entity.name;
    if ('first_name' in entity || 'last_name' in entity) {
      return `${(entity as Contact).first_name || ''} ${(entity as Contact).last_name || ''}`.trim();
    }
    return 'Unknown';
  }, []);

  // Page context sync for AI awareness
  usePageContextSync({
    entityType,
    entities: filteredData as (Entity & { id: string })[],
    getEntityName: getDisplayName,
    searchTerm: searchFilter,
  });

  const handleCreate = () => {
    setEditingEntity(null);
    setDialogOpen(true);
  };

  const handleEdit = (entity: Entity) => {
    setEditingEntity(entity);
    setDialogOpen(true);
  };

  const handleDeleteClick = (entity: Entity) => {
    setEntityToDelete(entity);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!entityToDelete) return;
    
    try {
      await crm.deleteEntity(entityToDelete.id);
      showSuccess('delete', title.slice(0, -1).toLowerCase());
      setDeleteDialogOpen(false);
      setEntityToDelete(null);
    } catch (error: any) {
      showGuidance({ operation: 'delete', entityType: title.slice(0, -1).toLowerCase(), error });
    }
  };

  const handleSave = async (data: Partial<Entity>) => {
    try {
      if (editingEntity) {
        await crm.updateEntity(editingEntity.id, data);
        showSuccess('update', title.slice(0, -1).toLowerCase());
      } else {
        await crm.createEntity(data);
        showSuccess('create', title.slice(0, -1).toLowerCase());
        // Clear search so the newly created entity is visible in the list
        if (searchInput) {
          if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
          setSearchInput('');
          setSearchFilter('');
        }
      }
      setDialogOpen(false);
      setEditingEntity(null);
    } catch (error: any) {
      showGuidance({ operation: editingEntity ? 'update' : 'create', entityType: title.slice(0, -1).toLowerCase(), error, formData: data });
      throw error;
    }
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all(selectedItems.map(id => crm.deleteEntity(id)));
      showSuccess('delete', `${selectedItems.length} ${title.toLowerCase()}`);
      setSelectedItems([]);
      setShowBulkActions(false);
    } catch (error: any) {
      showGuidance({ operation: 'delete', entityType: title.toLowerCase(), error });
    }
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const toggleAllSelection = () => {
    if (selectedItems.length === filteredData.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredData.map((e: any) => e.id));
    }
  };

  useEffect(() => {
    setShowBulkActions(selectedItems.length > 0);
  }, [selectedItems]);

  const renderEntityDialog = () => {
    switch (entityType) {
      case 'contacts':
        return (
          <ContactDialog
            contact={editingEntity as Contact | null}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSave={handleSave}
            defaultStatus={isLeadsView ? 'lead' : 'prospect'}
          />
        );
      case 'deals':
        return (
          <DealDialog
            deal={editingEntity as Deal | null}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSave={handleSave}
          />
        );
      case 'accounts':
        return (
          <AccountDialog
            account={editingEntity as Account | null}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSave={handleSave}
          />
        );
      default:
        return null;
    }
  };

  const getSecondaryInfo = (entity: Entity): string => {
    switch (entityType) {
      case 'contacts':
        return (entity as Contact).email || (entity as Contact).company || (entity as any).accounts?.name || '';
      case 'deals':
        const deal = entity as Deal;
        return deal.amount ? `$${deal.amount.toLocaleString()}` : '';
      case 'accounts':
        return (entity as Account).industry || '';
      default:
        return '';
    }
  };

  const getStatusBadge = (entity: Entity) => {
    switch (entityType) {
      case 'contacts':
        const status = (entity as Contact).status || 'prospect';
        return <Badge variant="outline">{status}</Badge>;
      case 'deals':
        const stage = (entity as Deal).stage || 'prospecting';
        const stageColors: Record<string, string> = {
          'prospecting': 'bg-gray-100 text-gray-800',
          'qualified': 'bg-blue-100 text-blue-800',
          'proposal': 'bg-yellow-100 text-yellow-800',
          'negotiation': 'bg-orange-100 text-orange-800',
          'closed-won': 'bg-green-100 text-green-800',
          'closed-lost': 'bg-red-100 text-red-800'
        };
        return <Badge className={stageColors[stage] || 'bg-gray-100'}>{stage}</Badge>;
      case 'accounts':
        return null;
      default:
        return null;
    }
  };

  if (crm.loading && !crm.entities?.length) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${title.toLowerCase()}...`}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          
          <Button variant="outline" size="icon" onClick={() => crm.refresh()}>
            <RefreshCw className={`h-4 w-4 ${crm.loading ? 'animate-spin' : ''}`} />
          </Button>
          
          <FileUploadButton entityType={entityType} onFileSelect={async (file) => {
            try {
              const text = await file.text();
              const lines = text.split('\n').filter(l => l.trim());
              if (lines.length < 2) { toast({ title: 'Invalid CSV', description: 'File must have a header row and at least one data row', variant: 'destructive' }); return; }
              const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
              const rows = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
                const row: Record<string, string> = {};
                headers.forEach((h, i) => { if (values[i]) row[h] = values[i]; });
                return row;
              }).filter(r => Object.keys(r).length > 0);

              toast({ title: `Importing ${rows.length} ${entityType}...` });
              let imported = 0;
              const orgId = organizationId;
              if (!orgId) {
                throw new Error('No organization selected');
              }
              const { data: { session } } = await supabase.auth.getSession();
              const userId = session?.user?.id;
              if (!userId) {
                throw new Error('You must be signed in to import data');
              }

              for (const row of rows) {
                try {
                  if (entityType === 'contacts') {
                    await supabase.from('contacts').insert({
                      organization_id: orgId, user_id: userId,
                      full_name: row['name'] || row['full_name'] || `${row['first_name'] || ''} ${row['last_name'] || ''}`.trim(),
                      first_name: row['first_name'] || '', last_name: row['last_name'] || '',
                      email: row['email'] || null, phone: row['phone'] || null,
                      company: row['company'] || null, title: row['title'] || null,
                      status: 'lead', assigned_to: userId,
                    });
                  } else if (entityType === 'accounts') {
                    await supabase.from('accounts').insert({
                      organization_id: orgId, user_id: userId,
                      name: row['name'] || row['company'] || 'Unknown',
                      industry: row['industry'] || null, website: row['website'] || null,
                      domain: row['domain'] || null, assigned_to: userId,
                    });
                  }
                  imported++;
                } catch { /* skip duplicates */ }
              }
              toast({ title: 'Import complete', description: `${imported} of ${rows.length} ${entityType} imported successfully` });
              crm.refresh();
            } catch (err: any) {
              toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
            }
          }} />
          
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add {title.slice(0, -1)}
          </Button>
        </div>
      </div>

      {showBulkActions && (
        <BulkOperationsEnhanced
          selectedItems={selectedItems}
          entityType={entityType}
          onBulkDelete={async (ids) => { await Promise.all(ids.map(id => crm.deleteEntity(id))); }}
          onClearSelection={() => setSelectedItems([])}
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>{filteredData.length} {title}</span>
            {searchFilter && (
              <span className="text-sm font-normal text-muted-foreground">
                matching "{searchFilter}"
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === filteredData.length && filteredData.length > 0}
                    onChange={toggleAllSelection}
                    className="rounded border-gray-300"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                {entityType === 'contacts' ? (
                  <>
                    <TableHead>Company</TableHead>
                    <TableHead className="hidden lg:table-cell">Title</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden xl:table-cell">Phone</TableHead>
                  </>
                ) : (
                  <TableHead>{entityType === 'deals' ? 'Amount' : 'Details'}</TableHead>
                )}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((entity: Entity) => {
                const isExpanded = expandedRows.has(entity.id);
                const colCount = entityType === 'contacts' ? 8 : 5;

                return (
                  <React.Fragment key={entity.id}>
                    <TableRow className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isExpandable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => toggleRowExpansion(entity.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(entity.id)}
                            onChange={() => toggleItemSelection(entity.id)}
                            className="rounded border-border"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {getDisplayName(entity)}
                          {entityType === 'contacts' && (entity as Contact).linkedin_url && (
                            <a
                              href={(entity as Contact).linkedin_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-blue-600 transition-colors shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Linkedin className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      {entityType === 'contacts' ? (
                        <>
                          <TableCell className="text-muted-foreground truncate max-w-[180px]">
                            {(entity as Contact).company || (entity as any).accounts?.name || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground truncate max-w-[160px] hidden lg:table-cell">
                            {(entity as Contact).title || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden md:table-cell">
                            {(entity as Contact).email ? (
                              <a href={`mailto:${(entity as Contact).email}`} className="text-primary hover:underline truncate block max-w-[200px]">
                                {(entity as Contact).email}
                              </a>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden xl:table-cell">
                            {(entity as Contact).phone || '—'}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell className="text-muted-foreground">{getSecondaryInfo(entity)}</TableCell>
                      )}
                      <TableCell>{getStatusBadge(entity)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(entity)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(entity)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded row: Lead Qualification (leads) or AI Memory (contacts) */}
                    {isLeadsView && isExpanded && (
                      <TableRow>
                        <TableCell colSpan={colCount} className="bg-muted/30 p-4">
                          <LeadQualificationCard
                            contact={entity as unknown as Record<string, unknown>}
                            showEnrichButton={true}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                    {isContactsView && isExpanded && (
                      <TableRow>
                        <TableCell colSpan={colCount} className="bg-muted/30 p-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <ClientMemoryPanel contactId={entity.id} />
                            <SuggestedActionsPanel contactId={entity.id} compact />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={entityType === 'contacts' ? 8 : 5} className="py-12">
                    {searchFilter ? (
                      <div className="flex flex-col items-center gap-3 text-center">
                        <SearchX className="h-10 w-10 text-muted-foreground/50" />
                        <div>
                          <p className="font-medium text-foreground">No {title.toLowerCase()} match "{searchFilter}"</p>
                          <p className="text-sm text-muted-foreground mt-1">Try a different search term or clear the filter</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleSearchChange('')}>
                          Clear search
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-center">
                        {entityType === 'contacts' ? (
                          <Users className="h-10 w-10 text-muted-foreground/50" />
                        ) : entityType === 'deals' ? (
                          <Handshake className="h-10 w-10 text-muted-foreground/50" />
                        ) : (
                          <Building2 className="h-10 w-10 text-muted-foreground/50" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">No {title.toLowerCase()} yet</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {entityType === 'contacts'
                              ? 'Add contacts manually or paste meeting notes into chat to auto-extract them'
                              : entityType === 'deals'
                              ? 'Create a deal or paste meeting notes into chat to auto-extract opportunities'
                              : 'Accounts are created automatically when you add contacts or deals'}
                          </p>
                        </div>
                        <Button size="sm" onClick={handleCreate}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add {title.slice(0, -1)}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {renderEntityDialog()}
      
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title={`Delete ${title.slice(0, -1)}`}
        description={`Are you sure you want to delete this ${title.slice(0, -1).toLowerCase()}? This action cannot be undone.`}
        entityName={entityToDelete ? getDisplayName(entityToDelete) : ''}
        entityType={title.slice(0, -1).toLowerCase() as 'contact' | 'deal' | 'account' | 'activity' | 'task'}
      />
    </div>
  );
};
