import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
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
  ArrowLeft, 
  Download, 
  RefreshCw, 
  Trash2, 
  MoreHorizontal,
  FileText,
  Sparkles,
  Calendar,
  Building2,
  User,
  Link2
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

interface GeneratedPresentation {
  id: string;
  organization_id: string;
  user_id: string;
  template_id: string | null;
  generation_mode: 'template_based' | 'ai_creative';
  personalization_level: 'account' | 'deal' | 'contact';
  account_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  storage_path: string;
  file_name: string;
  slot_values_used: Record<string, unknown>;
  ai_calls_made: unknown[];
  generation_time_ms: number | null;
  version: number;
  created_at: string;
  // Joined fields
  account_name?: string;
  deal_name?: string;
  contact_name?: string;
  template_name?: string;
}

export default function GeneratedPresentations() {
  const navigate = useNavigate();
  const { organizationId } = useOrganizationAccess();
  const [presentations, setPresentations] = useState<GeneratedPresentation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId) {
      loadPresentations();
    }
  }, [organizationId]);

  async function loadPresentations() {
    if (!organizationId) return;
    
    setIsLoading(true);
    try {
      // Fetch presentations with related data
      const { data, error } = await supabase
        .from('generated_presentations')
        .select(`
          *,
          accounts:account_id (name),
          deals:deal_id (name),
          contacts:contact_id (full_name),
          slide_templates:template_id (name)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched: GeneratedPresentation[] = (data || []).map((p: any) => ({
        ...p,
        account_name: p.accounts?.name,
        deal_name: p.deals?.name,
        contact_name: p.contacts?.full_name,
        template_name: p.slide_templates?.name
      }));

      setPresentations(enriched);
    } catch (error) {
      console.error('Error loading presentations:', error);
      toast.error('Failed to load presentations');
    } finally {
      setIsLoading(false);
    }
  }

  async function downloadPresentation(presentation: GeneratedPresentation) {
    try {
      const { data } = supabase.storage
        .from('generated-slides')
        .getPublicUrl(presentation.storage_path);

      const link = document.createElement('a');
      link.href = data.publicUrl;
      link.download = presentation.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Download started');
    } catch (error) {
      toast.error('Failed to download');
    }
  }

  function copyLink(presentation: GeneratedPresentation) {
    const { data } = supabase.storage
      .from('generated-slides')
      .getPublicUrl(presentation.storage_path);
    
    navigator.clipboard.writeText(data.publicUrl);
    toast.success('Link copied to clipboard');
  }

  async function regeneratePresentation(presentation: GeneratedPresentation) {
    if (!organizationId) return;

    try {
      toast.info('Regenerating presentation...');
      
      const { data, error } = await supabase.functions.invoke('generate-from-template', {
        body: {
          templateId: presentation.template_id,
          organizationId: organizationId,
          userId: presentation.user_id,
          personalizationLevel: presentation.personalization_level,
          accountId: presentation.account_id,
          dealId: presentation.deal_id,
          contactId: presentation.contact_id
        }
      });

      if (error) throw error;

      toast.success('Presentation regenerated!');
      loadPresentations();
    } catch (error) {
      console.error('Regeneration error:', error);
      toast.error('Failed to regenerate');
    }
  }

  async function deletePresentation(id: string) {
    try {
      const presentation = presentations.find(p => p.id === id);
      if (!presentation) return;

      // Delete from storage
      await supabase.storage
        .from('generated-slides')
        .remove([presentation.storage_path]);

      // Delete record
      const { error } = await supabase
        .from('generated_presentations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPresentations(prev => prev.filter(p => p.id !== id));
      toast.success('Presentation deleted');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete');
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/slides')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Generated Presentations</h1>
            <p className="text-muted-foreground">
              {presentations.length} presentation{presentations.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button onClick={() => navigate('/slides')}>
          Create New
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : presentations.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No presentations yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate your first presentation from a template or using AI.
              </p>
              <Button onClick={() => navigate('/slides')}>
                Go to Slide Studio
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Presentation</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presentations.map(presentation => (
                  <TableRow key={presentation.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium line-clamp-1">
                            {presentation.file_name}
                          </div>
                          {presentation.template_name && (
                            <div className="text-xs text-muted-foreground">
                              Template: {presentation.template_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {presentation.account_name && (
                          <div className="flex items-center gap-1 text-sm">
                            <Building2 className="h-3 w-3" />
                            {presentation.account_name}
                          </div>
                        )}
                        {presentation.deal_name && (
                          <div className="text-xs text-muted-foreground">
                            Deal: {presentation.deal_name}
                          </div>
                        )}
                        {presentation.contact_name && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {presentation.contact_name}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={presentation.generation_mode === 'ai_creative' ? 'secondary' : 'outline'}>
                        {presentation.generation_mode === 'ai_creative' ? (
                          <>
                            <Sparkles className="h-3 w-3 mr-1" />
                            AI Creative
                          </>
                        ) : (
                          'Template'
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(presentation.created_at), { addSuffix: true })}
                      </div>
                      {presentation.generation_time_ms && (
                        <div className="text-xs text-muted-foreground">
                          {(presentation.generation_time_ms / 1000).toFixed(1)}s
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => downloadPresentation(presentation)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyLink(presentation)}>
                            <Link2 className="h-4 w-4 mr-2" />
                            Copy Link
                          </DropdownMenuItem>
                          {presentation.template_id && (
                            <DropdownMenuItem onClick={() => regeneratePresentation(presentation)}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Regenerate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => setDeleteId(presentation.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete presentation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this generated presentation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteId && deletePresentation(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
