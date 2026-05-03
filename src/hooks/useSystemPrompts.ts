import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface SystemPrompt {
  id: string;
  content: string;
  version: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  section_type?: string;
  section_title?: string;
  section_order?: number;
}

export const useSystemPrompts = () => {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [activePrompt, setActivePrompt] = useState<SystemPrompt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrompts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('system_prompt_config')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPrompts(data || []);
      
      // Find the active prompt
      const active = data?.find(p => p.is_active);
      setActivePrompt(active || null);

    } catch (err: any) {
      console.error('Error loading system prompts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const savePrompt = useCallback(async (content: string, sectionType?: string) => {
    if (!user) throw new Error('User must be logged in');

    try {
      setLoading(true);
      setError(null);

      // First, deactivate all existing prompts of the same section type (or all if no section type)
      if (sectionType) {
        await supabase
          .from('system_prompt_config')
          .update({ is_active: false })
          .eq('section_type', sectionType)
          .eq('is_active', true);
      } else {
        await supabase
          .from('system_prompt_config')
          .update({ is_active: false })
          .eq('is_active', true);
      }

      // Get the next version number
      const { data: versionData } = await supabase
        .from('system_prompt_config')
        .select('version')
        .eq('section_type', sectionType || null)
        .order('version', { ascending: false })
        .limit(1);

      const nextVersion = (versionData?.[0]?.version || 0) + 1;

      // Create new active prompt
      const { data, error } = await supabase
        .from('system_prompt_config')
        .insert({
          content,
          version: nextVersion,
          is_active: true,
          created_by: user.id,
          section_type: sectionType || null,
          section_title: sectionType ? `Section ${sectionType}` : 'Full Prompt',
          section_order: 1
        })
        .select()
        .single();

      if (error) throw error;

      // Reload prompts
      await loadPrompts();

      return data;
    } catch (err: any) {
      console.error('Error saving system prompt:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, loadPrompts]);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  return {
    prompts,
    activePrompt,
    loading,
    error,
    loadPrompts,
    savePrompt
  };
};