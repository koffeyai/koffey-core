import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import type { 
  ArtifactPayload, 
  GenerateArtifactRequest, 
  GenerateArtifactResponse 
} from '@/types/analytics';
import { toast } from 'sonner';

// Re-export ArtifactPayload for use in other components
export type { ArtifactPayload } from '@/types/analytics';

interface UseArtifactGenerationOptions {
  onSuccess?: (artifact: ArtifactPayload) => void;
  onError?: (error: string) => void;
}

export function useArtifactGeneration(options?: UseArtifactGenerationOptions) {
  const { currentOrganization } = useOrganizationAccess();
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentArtifact, setCurrentArtifact] = useState<ArtifactPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const organizationId = currentOrganization?.organization_id ?? null;

  const generateArtifact = useCallback(async (
    prompt: string,
    sessionId?: string,
    requestedOrganizationId?: string
  ): Promise<ArtifactPayload | null> => {
    if (!prompt.trim()) {
      const errorMsg = 'Prompt is required';
      setError(errorMsg);
      options?.onError?.(errorMsg);
      return null;
    }

    setIsGenerating(true);
    setError(null);

    try {
      console.log('[useArtifactGeneration] Generating artifact for:', prompt);
      const effectiveOrganizationId = requestedOrganizationId || organizationId || undefined;
      if (!effectiveOrganizationId) {
        const errorMsg = 'Select an organization before generating analytics';
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      const { data, error: fnError } = await supabase.functions.invoke<GenerateArtifactResponse>(
        'generate-analytics-artifact',
        {
          body: {
            prompt,
            sessionId,
            organizationId: effectiveOrganizationId,
          } as GenerateArtifactRequest,
        }
      );

      if (fnError) {
        console.error('[useArtifactGeneration] Function error:', fnError);
        throw new Error(fnError.message || 'Failed to generate artifact');
      }

      if (!data?.success || !data?.artifact) {
        const errorMsg = data?.error || 'No artifact returned';
        console.error('[useArtifactGeneration] Generation failed:', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('[useArtifactGeneration] Success:', data.artifact.title);
      setCurrentArtifact(data.artifact);
      options?.onSuccess?.(data.artifact);
      return data.artifact;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useArtifactGeneration] Error:', errorMsg);
      setError(errorMsg);
      options?.onError?.(errorMsg);
      toast.error('Failed to generate visualization', {
        description: errorMsg,
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [options, organizationId]);

  const refreshArtifact = useCallback(async () => {
    if (!currentArtifact?.originalPrompt) {
      toast.error('No artifact to refresh');
      return null;
    }
    return generateArtifact(currentArtifact.originalPrompt, undefined, organizationId || undefined);
  }, [currentArtifact, generateArtifact, organizationId]);

  const saveArtifact = useCallback(async (artifact: ArtifactPayload): Promise<boolean> => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Must be logged in to save artifacts');
        return false;
      }
      if (!organizationId) {
        toast.error('Select an organization before saving analytics');
        return false;
      }

      const { error: saveError } = await supabase
        .from('saved_artifacts')
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          title: artifact.title,
          original_prompt: artifact.originalPrompt,
          query_config: JSON.parse(JSON.stringify(artifact.config)),
          chart_config: JSON.parse(JSON.stringify(artifact.chartConfig || {})),
          last_result: JSON.parse(JSON.stringify({
            data: artifact.data,
            rowCount: artifact.rowCount,
            summary: artifact.summary,
            executionTimeMs: artifact.executionTimeMs,
            provider: artifact.provider,
            model: artifact.model,
          })),
          last_refreshed_at: new Date().toISOString(),
        });

      if (saveError) throw saveError;
      
      toast.success('Artifact saved successfully');
      return true;
    } catch (err) {
      console.error('[useArtifactGeneration] Save error:', err);
      toast.error('Failed to save artifact');
      return false;
    }
  }, [organizationId]);

  const exportArtifact = useCallback((artifact: ArtifactPayload, format: 'csv' | 'json' = 'csv') => {
    try {
      let content: string;
      let mimeType: string;
      let filename: string;

      if (format === 'json') {
        content = JSON.stringify(artifact.data, null, 2);
        mimeType = 'application/json';
        filename = `${artifact.title.replace(/\s+/g, '_')}.json`;
      } else {
        // CSV format
        if (!artifact.data.length) {
          toast.error('No data to export');
          return;
        }
        const headers = Object.keys(artifact.data[0]).join(',');
        const rows = artifact.data.map(row => 
          Object.values(row).map(v => `"${v}"`).join(',')
        );
        content = [headers, ...rows].join('\n');
        mimeType = 'text/csv';
        filename = `${artifact.title.replace(/\s+/g, '_')}.csv`;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err) {
      console.error('[useArtifactGeneration] Export error:', err);
      toast.error('Failed to export artifact');
    }
  }, []);

  const clearArtifact = useCallback(() => {
    setCurrentArtifact(null);
    setError(null);
  }, []);

  return {
    isGenerating,
    currentArtifact,
    error,
    generateArtifact,
    refreshArtifact,
    saveArtifact,
    exportArtifact,
    clearArtifact,
  };
}
