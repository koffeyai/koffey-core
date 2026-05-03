import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';

export interface SourceDocument {
  id: string;
  organization_id: string;
  user_id: string;
  source_type: 'chat_note' | 'pdf' | 'email' | 'voice_transcript' | 'csv' | 'image' | 'document' | 'meeting_recording';
  raw_content: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  title: string | null;
  chat_session_id: string | null;
  deal_id: string | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

interface UseSourceDocumentsOptions {
  dealId?: string | null;
  accountId?: string | null;
  includeArchived?: boolean;
}

function detectSourceType(mimeType: string): SourceDocument['source_type'] {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'text/csv' || mimeType.includes('spreadsheet')) return 'csv';
  if (mimeType.includes('audio') || mimeType.includes('video')) return 'meeting_recording';
  return 'document';
}

export function useSourceDocuments(options: UseSourceDocumentsOptions = {}) {
  const { dealId, accountId, includeArchived = false } = options;
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const fetchDocuments = useCallback(async () => {
    if (!organizationId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('source_documents')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (dealId) {
        query = query.eq('deal_id', dealId);
      } else if (accountId) {
        query = query.eq('account_id', accountId);
      }

      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      const { data, error } = await query;

      if (error) throw error;
      let allDocs = (data || []) as SourceDocument[];

      // Also find source documents linked via extraction_records that created this deal
      // This catches source docs that haven't had their deal_id set yet (pre-confirmation)
      if (dealId) {
        const { data: extractionLinked } = await supabase
          .from('extraction_records')
          .select('source_document_id')
          .contains('entities_created', { deals: [dealId] });

        if (extractionLinked?.length) {
          const linkedDocIds = extractionLinked
            .map(r => r.source_document_id)
            .filter((id): id is string => !!id);
          const existingIds = new Set(allDocs.map(d => d.id));
          const missingIds = linkedDocIds.filter(id => !existingIds.has(id));

          if (missingIds.length > 0) {
            const { data: extraDocs } = await supabase
              .from('source_documents')
              .select('*')
              .in('id', missingIds)
              .eq('is_archived', false);

            if (extraDocs?.length) {
              allDocs = [...allDocs, ...(extraDocs as SourceDocument[])];
              allDocs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            }
          }
        }
      }

      setDocuments(allDocs);
    } catch (error: any) {
      console.error('Error fetching source documents:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, dealId, accountId, includeArchived]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const createTextDocument = useCallback(async (params: {
    rawContent: string;
    title?: string;
    sourceType?: SourceDocument['source_type'];
    chatSessionId?: string;
    dealId?: string;
    accountId?: string;
  }) => {
    if (!user?.id || !organizationId) return null;

    try {
      const autoTitle = params.title || `Notes - ${new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      })}`;

      const { data, error } = await supabase
        .from('source_documents')
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          source_type: params.sourceType || 'chat_note',
          raw_content: params.rawContent,
          title: autoTitle,
          chat_session_id: params.chatSessionId || null,
          deal_id: params.dealId || dealId || null,
          account_id: params.accountId || accountId || null,
        })
        .select()
        .single();

      if (error) throw error;
      setDocuments(prev => [data as SourceDocument, ...prev]);
      toast.success('Source document created');
      return data as SourceDocument;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create source document');
      return null;
    }
  }, [user?.id, organizationId, dealId, accountId]);

  const uploadFileDocument = useCallback(async (params: {
    file: File;
    title?: string;
    sourceType?: SourceDocument['source_type'];
    dealId?: string;
    accountId?: string;
  }) => {
    if (!user?.id || !organizationId) return null;

    setUploading(true);
    try {
      const sourceType = params.sourceType || detectSourceType(params.file.type);
      const tempId = crypto.randomUUID();
      const storagePath = `${organizationId}/${tempId}/${params.file.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('source-documents')
        .upload(storagePath, params.file, {
          contentType: params.file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Create the database record
      const { data, error } = await supabase
        .from('source_documents')
        .insert({
          id: tempId,
          organization_id: organizationId,
          user_id: user.id,
          source_type: sourceType,
          storage_path: storagePath,
          storage_bucket: 'source-documents',
          file_name: params.file.name,
          file_type: params.file.type,
          file_size: params.file.size,
          title: params.title || params.file.name,
          deal_id: params.dealId || dealId || null,
          account_id: params.accountId || accountId || null,
        })
        .select()
        .single();

      if (error) {
        // Clean up the uploaded file
        await supabase.storage.from('source-documents').remove([storagePath]);
        throw error;
      }

      setDocuments(prev => [data as SourceDocument, ...prev]);
      toast.success('File uploaded');
      return data as SourceDocument;
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file');
      return null;
    } finally {
      setUploading(false);
    }
  }, [user?.id, organizationId, dealId, accountId]);

  const archiveDocument = useCallback(async (documentId: string) => {
    try {
      const { error } = await supabase
        .from('source_documents')
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq('id', documentId);

      if (error) throw error;
      setDocuments(prev => prev.filter(d => d.id !== documentId));
      toast.success('Document archived');
    } catch (error: any) {
      toast.error(error.message || 'Failed to archive document');
    }
  }, []);

  const unarchiveDocument = useCallback(async (documentId: string) => {
    try {
      const { error } = await supabase
        .from('source_documents')
        .update({ is_archived: false, updated_at: new Date().toISOString() })
        .eq('id', documentId);

      if (error) throw error;
      await fetchDocuments();
      toast.success('Document restored');
    } catch (error: any) {
      toast.error(error.message || 'Failed to restore document');
    }
  }, [fetchDocuments]);

  const getDownloadUrl = useCallback(async (storagePath: string) => {
    const { data } = await supabase.storage
      .from('source-documents')
      .createSignedUrl(storagePath, 3600);
    return data?.signedUrl || null;
  }, []);

  const searchDocuments = useCallback(async (query: string) => {
    if (!organizationId) return [];

    try {
      const { data, error } = await supabase
        .from('source_documents')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_archived', false)
        .textSearch('search_vector', query, { type: 'websearch' })
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as SourceDocument[];
    } catch (error: any) {
      console.error('Search error:', error);
      return [];
    }
  }, [organizationId]);

  return {
    documents,
    loading,
    uploading,
    createTextDocument,
    uploadFileDocument,
    archiveDocument,
    unarchiveDocument,
    getDownloadUrl,
    searchDocuments,
    refresh: fetchDocuments,
  };
}
