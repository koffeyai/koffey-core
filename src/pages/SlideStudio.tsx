import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Presentation, 
  Sparkles, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Copy, 
  Star,
  FileUp,
  LayoutTemplate,
  Settings,
  BarChart2,
  ChevronDown,
  Library
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { TemplateUploader } from '@/components/slides/TemplateUploader';
import { AICreativeFlow } from '@/components/slides/AICreativeFlow';
import { TemplateGenerationFlow } from '@/components/slides/TemplateGenerationFlow';
import { SlideStudioAnalytics } from '@/components/slides/SlideStudioAnalytics';
import { PresentationLibrary, LibraryPresentation } from '@/components/slides/PresentationLibrary';
import { PresentationViewer } from '@/components/slides/PresentationViewer';
import { GoogleIntegrationsCard } from '@/components/settings/GoogleIntegrationsCard';
import { useNavigate } from 'react-router-dom';
import { 
  SlideTemplate, 
  TEMPLATE_TYPE_LABELS,
  SlideTemplateType
} from '@/types/slides';

const TEMPLATE_TYPE_COLORS: Record<SlideTemplateType, string> = {
  discovery: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  proposal: 'bg-green-500/10 text-green-600 dark:text-green-400',
  qbr: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  case_study: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  executive_summary: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  custom: 'bg-muted text-muted-foreground',
};

export const SlideStudio: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { organizationId, isAdmin: orgIsAdmin, isManager, loading: orgLoading } = useOrganizationAccess();
  
  const isAdmin = orgIsAdmin || isManager;
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [aiFlowOpen, setAiFlowOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SlideTemplate | null>(null);
  const [generatingTemplate, setGeneratingTemplate] = useState<SlideTemplate | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'library'>('templates');
  const [viewingPresentation, setViewingPresentation] = useState<{
    id: string;
    contentPath: string;
    title?: string;
  } | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [mappingTarget, setMappingTarget] = useState<SlideTemplate | null>(null);
  const [mappings, setMappings] = useState<any[]>([]);
  
  // State for deal-centric entry point
  const [initialAccountId, setInitialAccountId] = useState<string | undefined>();
  const [initialDealId, setInitialDealId] = useState<string | undefined>();
  
  // Get current user
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Listen for deal-centric slide studio opens
  React.useEffect(() => {
    const handleOpenSlideStudio = (event: CustomEvent<{ accountId?: string; dealId?: string }>) => {
      const { accountId, dealId } = event.detail || {};
      setInitialAccountId(accountId);
      setInitialDealId(dealId);
      setAiFlowOpen(true);
    };

    window.addEventListener('open-slide-studio', handleOpenSlideStudio as EventListener);
    return () => {
      window.removeEventListener('open-slide-studio', handleOpenSlideStudio as EventListener);
    };
  }, []);

  

  // Fetch templates
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['slide-templates', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from('slide_templates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as SlideTemplate[];
    },
    enabled: !!organizationId,
  });

  const handleUploadComplete = (template: SlideTemplate) => {
    queryClient.invalidateQueries({ queryKey: ['slide-templates', organizationId] });
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTarget || !organizationId) return;

    try {
      // Soft delete - just mark as inactive
      const { error } = await supabase
        .from('slide_templates')
        .update({ is_active: false })
        .eq('id', deleteTarget.id)
        .eq('organization_id', organizationId);

      if (error) throw error;

      // Also remove from storage if exists
      if (deleteTarget.storage_path) {
        await supabase.storage
          .from('slide-templates')
          .remove([deleteTarget.storage_path]);
      }

      toast({
        title: 'Template deleted',
        description: `${deleteTarget.name} has been removed.`,
      });

      queryClient.invalidateQueries({ queryKey: ['slide-templates', organizationId] });
    } catch (err) {
      console.error('Delete error:', err);
      toast({
        title: 'Delete failed',
        description: 'Could not delete the template. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSetDefault = async (template: SlideTemplate) => {
    if (!organizationId) return;

    try {
      // Clear existing defaults of same type
      await supabase
        .from('slide_templates')
        .update({ is_default: false })
        .eq('organization_id', organizationId)
        .eq('template_type', template.template_type);

      // Set this one as default
      const { error } = await supabase
        .from('slide_templates')
        .update({ is_default: true })
        .eq('id', template.id);

      if (error) throw error;

      toast({
        title: 'Default updated',
        description: `${template.name} is now the default ${TEMPLATE_TYPE_LABELS[template.template_type]} template.`,
      });

      queryClient.invalidateQueries({ queryKey: ['slide-templates', organizationId] });
    } catch (err) {
      console.error('Set default error:', err);
      toast({
        title: 'Update failed',
        variant: 'destructive',
      });
    }
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select an organization.</p>
      </div>
    );
  }

  // Handler for opening a presentation
  const handleOpenPresentation = (presentation: LibraryPresentation) => {
    if (presentation.content_path) {
      setViewingPresentation({
        id: presentation.id,
        contentPath: presentation.content_path,
        title: presentation.title || undefined
      });
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Presentation className="h-8 w-8 text-primary" />
            Slide Studio
          </h1>
          <p className="text-muted-foreground mt-1">
            Create personalized sales presentations from templates
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAiFlowOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Create with AI
          </Button>
          <Button variant="outline" onClick={() => setAnalyticsOpen(!analyticsOpen)}>
            <BarChart2 className="mr-2 h-4 w-4" />
            Analytics
            <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${analyticsOpen ? 'rotate-180' : ''}`} />
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" size="icon" onClick={() => navigate('/slides/settings')}>
                <Settings className="h-4 w-4" />
              </Button>
              <Button onClick={() => setUploaderOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Upload Template
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Analytics Panel */}
      <Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen} className="mb-6">
        <CollapsibleContent className="pt-2">
          <SlideStudioAnalytics />
        </CollapsibleContent>
      </Collapsible>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'templates' | 'library')} className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates" className="gap-2">
            <LayoutTemplate className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-2">
            <Library className="h-4 w-4" />
            My Presentations
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-0">
          {/* Loading State */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-32 w-full rounded-md" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-destructive/50">
              <CardContent className="pt-6">
                <p className="text-destructive">Failed to load templates. Please refresh the page.</p>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!isLoading && !error && templates?.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <LayoutTemplate className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  Upload your company's slide templates to generate personalized decks, 
                  or let AI create slides from scratch.
                </p>
                <div className="flex items-center justify-center gap-3">
                  {isAdmin && (
                    <Button onClick={() => setUploaderOpen(true)}>
                      <FileUp className="mr-2 h-4 w-4" />
                      Upload Template
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setAiFlowOpen(true)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Create with AI
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Template Grid */}
          {!isLoading && templates && templates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((template) => (
                <Card key={template.id} className="group overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Thumbnail Placeholder */}
                  <div className="relative aspect-video bg-muted flex items-center justify-center">
                    <Presentation className="h-12 w-12 text-muted-foreground/50" />
                    {template.is_default && (
                      <Badge className="absolute top-2 right-2 bg-amber-500/90 text-amber-50 hover:bg-amber-500">
                        <Star className="h-3 w-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg line-clamp-1">{template.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="secondary" 
                            className={TEMPLATE_TYPE_COLORS[template.template_type]}
                          >
                            {TEMPLATE_TYPE_LABELS[template.template_type]}
                          </Badge>
                          {template.slide_count && (
                            <span className="text-xs text-muted-foreground">
                              {template.slide_count} slides
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover z-50">
                            <DropdownMenuItem onClick={() => handleSetDefault(template)}>
                              <Star className="mr-2 h-4 w-4" />
                              Set as Default
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                              setMappingTarget(template);
                              const { data } = await supabase
                                .from('template_slot_mappings')
                                .select('*')
                                .eq('template_id', template.id)
                                .order('slide_index', { ascending: true });
                              setMappings(data || []);
                            }}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit Mappings
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                              try {
                                const { data: original } = await supabase
                                  .from('slide_templates')
                                  .select('*')
                                  .eq('id', template.id)
                                  .single();
                                if (!original) return;
                                const { id, created_at, updated_at, ...rest } = original;
                                await supabase.from('slide_templates').insert({
                                  ...rest,
                                  name: `${rest.name} (Copy)`,
                                  is_default: false,
                                });
                                queryClient.invalidateQueries({ queryKey: ['slide-templates', organizationId] });
                                toast({ title: 'Template duplicated', description: `Created "${rest.name} (Copy)"` });
                              } catch (err: any) {
                                toast({ title: 'Duplicate failed', description: err.message, variant: 'destructive' });
                              }
                            }}>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(template)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {template.description}
                      </p>
                    )}
                    
                    {template.stage_alignment && template.stage_alignment.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {template.stage_alignment.slice(0, 3).map((stage) => (
                          <Badge key={stage} variant="outline" className="text-xs">
                            {stage.replace('_', ' ')}
                          </Badge>
                        ))}
                        {template.stage_alignment.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{template.stage_alignment.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    <Button 
                      className="w-full" 
                      onClick={() => setGeneratingTemplate(template)}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Library Tab */}
        <TabsContent value="library" className="mt-0 space-y-6">
          <GoogleIntegrationsCard />
          <PresentationLibrary 
            onOpenPresentation={handleOpenPresentation}
            onCreateNew={() => {
              setActiveTab('templates');
              setAiFlowOpen(true);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <TemplateUploader
        open={uploaderOpen}
        onOpenChange={setUploaderOpen}
        organizationId={organizationId}
        onUploadComplete={handleUploadComplete}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Slot Mapping Editor */}
      <Dialog open={!!mappingTarget} onOpenChange={(o) => !o && setMappingTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Field Mappings — {mappingTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Map CRM fields to template placeholders. Each mapping defines which data fills a slide element.
            </p>
            {mappings.length === 0 && (
              <p className="text-sm text-muted-foreground italic py-4 text-center">No mappings configured yet.</p>
            )}
            {mappings.map((m, i) => (
              <div key={m.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center p-2 border rounded">
                <div>
                  <div className="text-xs text-muted-foreground">Slide {m.slide_index + 1} · {m.element_type}</div>
                  <input
                    className="w-full text-sm border rounded px-2 py-1 mt-1"
                    value={m.element_id || ''}
                    onChange={(e) => {
                      const updated = [...mappings];
                      updated[i] = { ...updated[i], element_id: e.target.value };
                      setMappings(updated);
                    }}
                    placeholder="Element ID"
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Source field</div>
                  <select
                    className="w-full text-sm border rounded px-2 py-1 mt-1"
                    value={m.source_field || ''}
                    onChange={(e) => {
                      const updated = [...mappings];
                      updated[i] = { ...updated[i], source_field: e.target.value };
                      setMappings(updated);
                    }}
                  >
                    <option value="">Select field</option>
                    <option value="deal.name">Deal Name</option>
                    <option value="deal.amount">Deal Amount</option>
                    <option value="deal.stage">Deal Stage</option>
                    <option value="deal.probability">Probability</option>
                    <option value="account.name">Account Name</option>
                    <option value="account.industry">Industry</option>
                    <option value="contact.full_name">Contact Name</option>
                    <option value="contact.title">Contact Title</option>
                    <option value="contact.email">Contact Email</option>
                    <option value="org.name">Organization</option>
                    <option value="custom">Custom Text</option>
                  </select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await supabase.from('template_slot_mappings').delete().eq('id', m.id);
                    setMappings(mappings.filter((_, j) => j !== i));
                    toast({ title: 'Mapping removed' });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={async () => {
                if (!mappingTarget) return;
                const { data } = await supabase.from('template_slot_mappings').insert({
                  template_id: mappingTarget.id,
                  slide_index: 0,
                  element_id: '',
                  element_type: 'text',
                  mapping_type: 'direct',
                  source_field: '',
                }).select().single();
                if (data) setMappings([...mappings, data]);
              }}>
                <Plus className="h-4 w-4 mr-1" /> Add Mapping
              </Button>
              <Button size="sm" onClick={async () => {
                for (const m of mappings) {
                  await supabase.from('template_slot_mappings')
                    .update({ element_id: m.element_id, source_field: m.source_field })
                    .eq('id', m.id);
                }
                toast({ title: 'Mappings saved' });
                setMappingTarget(null);
              }}>
                Save Mappings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Generation Flow */}
      <Dialog open={!!generatingTemplate} onOpenChange={(o) => !o && setGeneratingTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Presentation</DialogTitle>
          </DialogHeader>
          {generatingTemplate && organizationId && currentUserId && (
            <TemplateGenerationFlow
              template={generatingTemplate}
              organizationId={organizationId}
              userId={currentUserId}
              onClose={() => setGeneratingTemplate(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* AI Creative Flow Dialog */}
      <AICreativeFlow
        open={aiFlowOpen}
        onOpenChange={(open) => {
          setAiFlowOpen(open);
          if (!open) {
            // Reset initial values when dialog closes
            setInitialAccountId(undefined);
            setInitialDealId(undefined);
          }
        }}
        initialAccountId={initialAccountId}
        initialDealId={initialDealId}
      />

      {/* Presentation Viewer Overlay */}
      {viewingPresentation && (
        <PresentationViewer
          presentationId={viewingPresentation.id}
          contentPath={viewingPresentation.contentPath}
          title={viewingPresentation.title}
          onClose={() => setViewingPresentation(null)}
        />
      )}
    </div>
  );
};

export default SlideStudio;
