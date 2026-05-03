import { supabase } from '@/integrations/supabase/client';

export interface CreateTextSourceParams {
  rawContent: string;
  title?: string;
  sourceType?: string;
  chatSessionId?: string;
  dealId?: string;
  accountId?: string;
  organizationId: string;
  userId: string;
}

export interface CreateFileSourceParams {
  file: File;
  title?: string;
  sourceType?: string;
  dealId?: string;
  accountId?: string;
  organizationId: string;
  userId: string;
}

function detectSourceType(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'text/csv' || mimeType.includes('spreadsheet')) return 'csv';
  if (mimeType.includes('audio') || mimeType.includes('video')) return 'meeting_recording';
  return 'document';
}

export async function createTextSourceDocument(params: CreateTextSourceParams) {
  const { data, error } = await supabase
    .from('source_documents')
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      source_type: params.sourceType || 'chat_note',
      raw_content: params.rawContent,
      title: params.title || `Notes - ${new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      })}`,
      chat_session_id: params.chatSessionId || null,
      deal_id: params.dealId || null,
      account_id: params.accountId || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[sourceDocService] Text source creation failed:', error);
    return null;
  }
  return data;
}

export async function createFileSourceDocument(params: CreateFileSourceParams) {
  const sourceType = params.sourceType || detectSourceType(params.file.type);
  
  // Create the record first to get an ID for the storage path
  const tempId = crypto.randomUUID();
  const storagePath = `${params.organizationId}/${tempId}/${params.file.name}`;
  
  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('source-documents')
    .upload(storagePath, params.file, {
      contentType: params.file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('[sourceDocService] File upload failed:', uploadError);
    return null;
  }

  // Create the database record
  const { data, error } = await supabase
    .from('source_documents')
    .insert({
      id: tempId,
      organization_id: params.organizationId,
      user_id: params.userId,
      source_type: sourceType,
      storage_path: storagePath,
      storage_bucket: 'source-documents',
      file_name: params.file.name,
      file_type: params.file.type,
      file_size: params.file.size,
      title: params.title || params.file.name,
      deal_id: params.dealId || null,
      account_id: params.accountId || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[sourceDocService] File source record creation failed:', error);
    // Clean up the uploaded file
    await supabase.storage.from('source-documents').remove([storagePath]);
    return null;
  }

  return data;
}
