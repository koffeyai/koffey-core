import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';

export interface ExtractionRecord {
  id: string;
  source_document_id: string;
  organization_id: string;
  extraction_json: any;
  extraction_version: string;
  entities_created: {
    accounts?: string[];
    deals?: string[];
    contacts?: string[];
    tasks?: string[];
  };
  confidence_overall: number | null;
  model_used: string | null;
  processing_time_ms: number | null;
  review_status: 'pending_review' | 'auto_saved' | 'user_confirmed' | 'user_modified' | 'rejected';
  user_modifications: any | null;
  created_at: string;
}

export function useExtractionRecords(sourceDocumentId: string | null) {
  const [records, setRecords] = useState<ExtractionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const fetchRecords = useCallback(async () => {
    if (!sourceDocumentId || !organizationId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('extraction_records')
        .select('*')
        .eq('source_document_id', sourceDocumentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecords((data || []) as ExtractionRecord[]);
    } catch (error: any) {
      console.error('Error fetching extraction records:', error);
    } finally {
      setLoading(false);
    }
  }, [sourceDocumentId, organizationId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const createRecord = useCallback(async (params: {
    extractionJson: any;
    entitiesCreated?: any;
    confidenceOverall?: number;
    modelUsed?: string;
    processingTimeMs?: number;
    reviewStatus?: ExtractionRecord['review_status'];
  }) => {
    if (!sourceDocumentId || !organizationId) return null;

    try {
      const { data, error } = await supabase
        .from('extraction_records')
        .insert({
          source_document_id: sourceDocumentId,
          organization_id: organizationId,
          extraction_json: params.extractionJson,
          entities_created: params.entitiesCreated || {},
          confidence_overall: params.confidenceOverall || null,
          model_used: params.modelUsed || null,
          processing_time_ms: params.processingTimeMs || null,
          review_status: params.reviewStatus || 'pending_review',
        })
        .select()
        .single();

      if (error) throw error;
      setRecords(prev => [data as ExtractionRecord, ...prev]);
      return data as ExtractionRecord;
    } catch (error: any) {
      console.error('Error creating extraction record:', error);
      return null;
    }
  }, [sourceDocumentId, organizationId]);

  const updateReviewStatus = useCallback(async (
    recordId: string,
    status: ExtractionRecord['review_status'],
    modifications?: any
  ) => {
    try {
      const updatePayload: any = { review_status: status };
      if (modifications) {
        updatePayload.user_modifications = modifications;
      }

      const { error } = await supabase
        .from('extraction_records')
        .update(updatePayload)
        .eq('id', recordId);

      if (error) throw error;
      
      setRecords(prev => prev.map(r => 
        r.id === recordId ? { ...r, review_status: status, user_modifications: modifications } : r
      ));
      
      toast.success(`Status updated to ${status.replace('_', ' ')}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  }, []);

  return {
    records,
    loading,
    createRecord,
    updateReviewStatus,
    refresh: fetchRecords,
  };
}
