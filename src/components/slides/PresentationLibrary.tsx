import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useAuth } from '@/components/auth/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  MoreVertical, 
  Download, 
  Copy, 
  Trash2, 
  Eye,
  Clock, 
  Building2,
  Briefcase,
  RefreshCw,
  Presentation,
  AlertCircle,
  CheckCircle,
  Loader2,
  XCircle,
  Plus,
  FileDown,
  ExternalLink,
  CheckSquare
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SlideExportDialog } from './SlideExportDialog';
import { useSlideExport } from '@/hooks/useSlideExport';

// Google Drive icon as inline SVG component
function GoogleDriveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.71 3.5L1.15 15l4.58 7.5h13.54l4.58-7.5L17.29 3.5H7.71zM14.7 5.5l4.5 7.5h-9l-4.5-7.5h9zm-9.3 9h8.4l-2.1 3.5H3.3l2.1-3.5zm11.4 0h3.9l-2.1 3.5h-3.9l2.1-3.5z"/>
    </svg>
  );
}

// Helper to check if presentation can be exported
function canExport(presentation: LibraryPresentation): boolean {
  return Boolean(
    presentation.content_path && 
    presentation.status !== 'generating' && 
    presentation.status !== 'failed'
  );
}

export interface LibraryPresentation {
  id: string;
  title: string | null;
  status: 'generating' | 'draft' | 'ready' | 'failed' | 'archived';
  created_at: string;
  updated_at: string;
  generation_config: {
    presentationType?: string;
    customInstructions?: string;
  } | null;
  generation_time_ms: number | null;
  content_path: string | null;
  error_message: string | null;
  account: { id: string; name: string } | null;
  deal: { id: string; name: string } | null;
}

interface PresentationLibraryProps {
  onOpenPresentation?: (presentation: LibraryPresentation) => void;
  onCreateNew?: () => void;
}

const STATUS_CONFIG = {
  generating: { 
    icon: Loader2, 
    color: 'text-blue-600', 
    bgColor: 'bg-blue-500/10', 
    label: 'Generating',
    iconClass: 'animate-spin'
  },
  draft: { 
    icon: CheckCircle, 
    color: 'text-amber-600', 
    bgColor: 'bg-amber-500/10', 
    label: 'Draft',
    iconClass: ''
  },
  ready: { 
    icon: CheckCircle, 
    color: 'text-green-600', 
    bgColor: 'bg-green-500/10', 
    label: 'Ready',
    iconClass: ''
  },
  failed: { 
    icon: XCircle, 
    color: 'text-red-600', 
    bgColor: 'bg-red-500/10', 
    label: 'Failed',
    iconClass: ''
  },
  archived: { 
    icon: AlertCircle, 
    color: 'text-muted-foreground', 
    bgColor: 'bg-muted', 
    label: 'Archived',
    iconClass: ''
  }
} as const;

const PRESENTATION_TYPE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  qbr: 'QBR',
  executive_summary: 'Executive Summary',
  case_study: 'Case Study',
  custom: 'Custom'
};

export const PresentationLibrary: React.FC<PresentationLibraryProps> = ({
  onOpenPresentation,
  onCreateNew
}) => {
  const { organizationId } = useOrganizationAccess();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LibraryPresentation['status'] | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [presentationToDelete, setPresentationToDelete] = useState<LibraryPresentation | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [presentationToExport, setPresentationToExport] = useState<LibraryPresentation | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  // Slide export hook for direct actions
  const {
    downloadAsPptx,
    uploadToGoogleDrive,
    isExporting,
    isGoogleDriveReady,
    connectGoogleDrive,
  } = useSlideExport();

  // Direct PowerPoint export handler
  const handleExportPowerPoint = async (presentation: LibraryPresentation) => {
    if (!canExport(presentation)) return;
    await downloadAsPptx(presentation.id, presentation.title || undefined);
  };

  // Direct Google Slides export handler
  const handleOpenInGoogleSlides = async (presentation: LibraryPresentation) => {
    if (!isGoogleDriveReady) {
      connectGoogleDrive();
      return;
    }
    if (!canExport(presentation)) return;
    await uploadToGoogleDrive(presentation.id, { openAfterUpload: true });
  };

  // Fetch presentations
  const { data: presentations, isLoading, error, refetch } = useQuery({
    queryKey: ['presentations', organizationId, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('generated_presentations')
        .select(`
          id,
          title,
          status,
          created_at,
          updated_at,
          generation_config,
          generation_time_ms,
          content_path,
          error_message,
          accounts:account_id(id, name),
          deals:deal_id(id, name)
        `)
        .eq('organization_id', organizationId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data?.map(p => ({
        ...p,
        account: Array.isArray(p.accounts) ? (p.accounts[0] as { id: string; name: string } | undefined) || null : (p.accounts as { id: string; name: string } | null),
        deal: Array.isArray(p.deals) ? (p.deals[0] as { id: string; name: string } | undefined) || null : (p.deals as { id: string; name: string } | null),
      })) as LibraryPresentation[];
    },
    enabled: !!organizationId,
    refetchInterval: 10000 // Poll for status updates
  });

  // Filter by search
  const filteredPresentations = useMemo(() => {
    if (!presentations) return [];
    if (!search) return presentations;
    
    const lower = search.toLowerCase();
    return presentations.filter(p => 
      p.title?.toLowerCase().includes(lower) ||
      p.account?.name.toLowerCase().includes(lower) ||
      p.deal?.name.toLowerCase().includes(lower)
    );
  }, [presentations, search]);

  const toggleSelectAll = useCallback(() => {
    const allFilteredIds = filteredPresentations.map(p => p.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allFilteredIds));
    }
  }, [filteredPresentations, selectedIds]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (presentationId: string) => {
      const { error } = await supabase
        .from('generated_presentations')
        .update({ status: 'archived' })
        .eq('id', presentationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presentations'] });
      toast({
        title: 'Presentation deleted',
        description: 'The presentation has been moved to archive.'
      });
      setDeleteDialogOpen(false);
      setPresentationToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Batch delete mutation
  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('generated_presentations')
        .update({ status: 'archived' })
        .in('id', ids);

      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      exitSelectMode();
      setBatchDeleteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['presentations'] });
      toast({
        title: `${count} presentation${count === 1 ? '' : 's'} deleted`,
        description: `${count} presentation${count === 1 ? ' has' : 's have'} been moved to archive.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Batch delete failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: async (presentation: LibraryPresentation) => {
      if (!presentation.content_path || !organizationId || !user?.id) {
        throw new Error('Cannot duplicate - missing data');
      }

      const { data: contentData, error: fetchError } = await supabase.storage
        .from('generated-slides')
        .download(presentation.content_path);
      
      if (fetchError) throw fetchError;
      
      const content = JSON.parse(await contentData.text());
      
      const { data: newPresentation, error: createError } = await supabase
        .from('generated_presentations')
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          account_id: presentation.account?.id || null,
          deal_id: presentation.deal?.id || null,
          status: 'draft',
          title: `Copy of ${presentation.title || 'Untitled'}`,
          storage_path: '',
          file_name: `copy-${Date.now()}`,
          generation_mode: 'ai_creative',
          generation_config: presentation.generation_config
        })
        .select('id')
        .single();
      
      if (createError) throw createError;

      const newContentPath = `${organizationId}/${newPresentation.id}/content.json`;
      const { error: uploadError } = await supabase.storage
        .from('generated-slides')
        .upload(newContentPath, JSON.stringify(content), {
          contentType: 'application/json'
        });
      
      if (uploadError) throw uploadError;

      await supabase
        .from('generated_presentations')
        .update({ 
          content_path: newContentPath,
          storage_path: newContentPath 
        })
        .eq('id', newPresentation.id);

      return newPresentation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presentations'] });
      toast({
        title: 'Presentation duplicated',
        description: 'A copy has been created.'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Duplicate failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Download content as JSON
  const handleDownloadJSON = async (presentation: LibraryPresentation) => {
    if (!presentation.content_path) {
      toast({
        title: 'Download unavailable',
        description: 'No content file found for this presentation.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('generated-slides')
        .download(presentation.content_path);
      
      if (error) throw error;

      const blob = new Blob([await data.text()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${presentation.title || 'presentation'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Download started',
        description: 'Your presentation content is downloading.'
      });
    } catch (err: any) {
      toast({
        title: 'Download failed',
        description: err.message,
        variant: 'destructive'
      });
    }
  };

  const handleDeleteClick = (presentation: LibraryPresentation) => {
    setPresentationToDelete(presentation);
    setDeleteDialogOpen(true);
  };

  const handleExportClick = (presentation: LibraryPresentation) => {
    setPresentationToExport(presentation);
    setExportDialogOpen(true);
  };

  const confirmDelete = () => {
    if (presentationToDelete) {
      deleteMutation.mutate(presentationToDelete.id);
    }
  };

  // Escape key exits select mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectMode) {
        exitSelectMode();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectMode, exitSelectMode]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-32 w-full mb-3" />
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load presentations</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search presentations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={statusFilter === null ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter(null)}
          >
            All
          </Button>
          {(['draft', 'ready', 'generating', 'failed'] as const).map(status => (
            <Button
              key={status}
              variant={statusFilter === status ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={cn(
                statusFilter === status && STATUS_CONFIG[status].bgColor,
                statusFilter === status && STATUS_CONFIG[status].color
              )}
            >
              {STATUS_CONFIG[status].label}
            </Button>
          ))}
        </div>

        <Button variant="ghost" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        <Button
          variant={selectMode ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => {
            if (selectMode) {
              exitSelectMode();
            } else {
              setSelectMode(true);
            }
          }}
        >
          <CheckSquare className="h-4 w-4" />
        </Button>
      </div>

      {/* Floating action bar when items selected */}
      {selectMode && selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
          >
            {filteredPresentations.length > 0 && filteredPresentations.every(p => selectedIds.has(p.id))
              ? 'Deselect All'
              : 'Select All'}
          </Button>
          <div className="flex-1" />
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBatchDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected
          </Button>
        </div>
      )}

      {/* Empty state */}
      {filteredPresentations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 border rounded-lg border-dashed">
          <Presentation className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">No presentations found</p>
            <p className="text-sm text-muted-foreground">
              {search ? 'Try a different search term' : 'Create your first AI presentation'}
            </p>
          </div>
          {onCreateNew && !search && (
            <Button onClick={onCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              Create Presentation
            </Button>
          )}
        </div>
      )}

      {/* Presentation grid */}
      {filteredPresentations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPresentations.map(presentation => {
            const statusConfig = STATUS_CONFIG[presentation.status];
            const StatusIcon = statusConfig.icon;
            const presentationType = presentation.generation_config?.presentationType;
            
            const isSelected = selectedIds.has(presentation.id);

            return (
              <Card
                key={presentation.id}
                className={cn(
                  "group overflow-hidden hover:shadow-lg transition-shadow cursor-pointer",
                  selectMode && isSelected && "ring-2 ring-primary"
                )}
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(presentation.id);
                  } else {
                    onOpenPresentation?.(presentation);
                  }
                }}
              >
                <CardContent className="p-0">
                  {/* Thumbnail placeholder */}
                  <div className="relative aspect-video bg-muted flex items-center justify-center">
                    {selectMode && (
                      <div
                        className="absolute top-2 left-2 z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(presentation.id)}
                        />
                      </div>
                    )}
                    <Presentation className="h-10 w-10 text-muted-foreground/40" />
                    <Badge 
                      className={cn(
                        'absolute top-2 right-2',
                        statusConfig.bgColor,
                        statusConfig.color
                      )}
                    >
                      <StatusIcon className={cn('h-3 w-3 mr-1', statusConfig.iconClass)} />
                      {statusConfig.label}
                    </Badge>
                  </div>
                  
                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium line-clamp-1 flex-1">
                        {presentation.title || 'Untitled Presentation'}
                      </h3>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover z-50" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => onOpenPresentation?.(presentation)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => duplicateMutation.mutate(presentation)}
                            disabled={!presentation.content_path || duplicateMutation.isPending}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDownloadJSON(presentation)}
                            disabled={!presentation.content_path}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download JSON
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <DropdownMenuItem 
                                  onClick={() => handleExportPowerPoint(presentation)}
                                  disabled={!canExport(presentation) || isExporting}
                                >
                                  <FileDown className="mr-2 h-4 w-4" />
                                  Export as PowerPoint
                                  {isExporting && <Loader2 className="ml-2 h-3 w-3 animate-spin" />}
                                </DropdownMenuItem>
                              </div>
                            </TooltipTrigger>
                            {!canExport(presentation) && (
                              <TooltipContent>
                                {presentation.status === 'generating' ? 'Wait for generation to complete' : 
                                 presentation.status === 'failed' ? 'Cannot export failed presentation' :
                                 'No content available'}
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <DropdownMenuItem 
                                  onClick={() => handleOpenInGoogleSlides(presentation)}
                                  disabled={!canExport(presentation) || isExporting}
                                >
                                  <GoogleDriveIcon className="mr-2 h-4 w-4" />
                                  {isGoogleDriveReady ? 'Open in Google Slides' : 'Connect Google Drive'}
                                  {!isGoogleDriveReady && <ExternalLink className="ml-2 h-3 w-3" />}
                                </DropdownMenuItem>
                              </div>
                            </TooltipTrigger>
                            {!isGoogleDriveReady && (
                              <TooltipContent>
                                Connect Google Drive to export directly to Google Slides
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteClick(presentation)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    {/* Metadata row */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {presentation.account && (
                        <span className="flex items-center gap-1 truncate">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {presentation.account.name}
                        </span>
                      )}
                      {presentation.deal && (
                        <span className="flex items-center gap-1 truncate">
                          <Briefcase className="h-3 w-3 shrink-0" />
                          {presentation.deal.name}
                        </span>
                      )}
                    </div>

                    {/* Error message for failed */}
                    {presentation.status === 'failed' && presentation.error_message && (
                      <p className="text-xs text-destructive line-clamp-2">
                        {presentation.error_message}
                      </p>
                    )}
                    
                    {/* Tags row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {presentationType && (
                        <Badge variant="outline" className="text-xs">
                          {PRESENTATION_TYPE_LABELS[presentationType] || presentationType}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(presentation.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete presentation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive "{presentationToDelete?.title || 'Untitled'}". 
              You can contact support to recover archived presentations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch delete confirmation dialog */}
      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} presentation{selectedIds.size === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive {selectedIds.size} selected presentation{selectedIds.size === 1 ? '' : 's'}.
              You can contact support to recover archived presentations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => batchDeleteMutation.mutate([...selectedIds])}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={batchDeleteMutation.isPending}
            >
              {batchDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Delete ${selectedIds.size}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export dialog */}
      {presentationToExport && (
        <SlideExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          presentationId={presentationToExport.id}
          presentationTitle={presentationToExport.title || undefined}
        />
      )}
    </div>
  );
};
