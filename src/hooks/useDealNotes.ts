import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';

export interface DealNote {
  id: string;
  deal_id: string;
  user_id: string;
  organization_id?: string;
  content: string;
  note_type: string;
  source_document_id?: string | null;
  created_at: string;
  updated_at: string;
}

export function useDealNotes(dealId: string | null) {
  const [notes, setNotes] = useState<DealNote[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const fetchNotes = useCallback(async () => {
    if (!dealId || !organizationId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_notes')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error: any) {
      console.error('Error fetching deal notes:', error);
    } finally {
      setLoading(false);
    }
  }, [dealId, organizationId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createNote = async (content: string, noteType: string = 'general') => {
    if (!user?.id || !dealId || !organizationId) return null;

    try {
      const { data, error } = await supabase
        .from('deal_notes')
        .insert({
          deal_id: dealId,
          user_id: user.id,
          organization_id: organizationId,
          content,
          note_type: noteType,
        })
        .select()
        .single();

      if (error) throw error;
      setNotes(prev => [data, ...prev]);
      toast.success('Note added');
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Failed to add note');
      return null;
    }
  };

  const updateNote = async (noteId: string, content: string) => {
    try {
      const { data, error } = await supabase
        .from('deal_notes')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      setNotes(prev => prev.map(n => n.id === noteId ? data : n));
      toast.success('Note updated');
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Failed to update note');
      return null;
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('deal_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast.success('Note deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete note');
    }
  };

  return {
    notes,
    loading,
    createNote,
    updateNote,
    deleteNote,
    refresh: fetchNotes,
  };
}
