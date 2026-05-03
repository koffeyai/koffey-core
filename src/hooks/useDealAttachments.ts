import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';
import { createFileSourceDocument } from '@/services/sourceDocumentService';

export interface DealAttachment {
  id: string;
  deal_id: string;
  user_id: string;
  organization_id?: string;
  file_name: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  source_document_id?: string | null;
  created_at: string;
}

export function useDealAttachments(dealId: string | null) {
  const [attachments, setAttachments] = useState<DealAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const fetchAttachments = useCallback(async () => {
    if (!dealId || !organizationId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_attachments')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttachments(data || []);
    } catch (error: any) {
      console.error('Error fetching deal attachments:', error);
    } finally {
      setLoading(false);
    }
  }, [dealId, organizationId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const uploadAttachment = async (file: File) => {
    if (!user?.id || !dealId || !organizationId) return null;

    setUploading(true);
    try {
      const filePath = `${user.id}/${dealId}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('deal-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('deal_attachments')
        .insert({
          deal_id: dealId,
          user_id: user.id,
          organization_id: organizationId,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Also create a source document for provenance (non-blocking)
      try {
        const sourceDoc = await createFileSourceDocument({
          file,
          organizationId,
          userId: user.id,
          dealId: dealId,
        });
        
        if (sourceDoc) {
          // Link the deal_attachment to the source document
          await supabase
            .from('deal_attachments')
            .update({ source_document_id: sourceDoc.id })
            .eq('id', data.id);
          
          // Update local state with source_document_id
          data.source_document_id = sourceDoc.id;
        }
      } catch (sourceErr) {
        console.error('Source document creation failed (non-blocking):', sourceErr);
        // Non-blocking — attachment was already saved successfully
      }
      
      setAttachments(prev => [data, ...prev]);
      toast.success('File uploaded');
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (attachmentId: string, filePath: string) => {
    try {
      await supabase.storage
        .from('deal-attachments')
        .remove([filePath]);

      const { error } = await supabase
        .from('deal_attachments')
        .delete()
        .eq('id', attachmentId);

      if (error) throw error;
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      toast.success('Attachment deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete attachment');
    }
  };

  const getDownloadUrl = async (filePath: string) => {
    const { data } = await supabase.storage
      .from('deal-attachments')
      .createSignedUrl(filePath, 3600);
    return data?.signedUrl;
  };

  return {
    attachments,
    loading,
    uploading,
    uploadAttachment,
    deleteAttachment,
    getDownloadUrl,
    refresh: fetchAttachments,
  };
}
