import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from '@/hooks/use-toast';

export interface CustomSkillParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface CustomSkill {
  id: string;
  organization_id: string;
  skill_name: string;
  display_name: string;
  description: string;
  instructions: string;
  parameters: CustomSkillParam[];
  trigger_examples: string[];
  is_active: boolean;
  created_by: string | null;
  cache_version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomSkillInput {
  skill_name: string;
  display_name: string;
  description: string;
  instructions: string;
  parameters?: CustomSkillParam[];
  trigger_examples?: string[];
  is_active?: boolean;
}

export interface UpdateCustomSkillInput {
  skill_name?: string;
  display_name?: string;
  description?: string;
  instructions?: string;
  parameters?: CustomSkillParam[];
  trigger_examples?: string[];
  is_active?: boolean;
}

export function useCustomSkills() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSkills = useCallback(async () => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('organization_custom_skills')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSkills((data || []).map((row: any) => ({
        ...row,
        parameters: row.parameters || [],
        trigger_examples: row.trigger_examples || [],
      })) as CustomSkill[]);
    } catch (error: any) {
      console.error('Error fetching custom skills:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load custom skills.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const create = useCallback(async (input: CreateCustomSkillInput): Promise<CustomSkill | null> => {
    if (!organizationId || !user) return null;

    setIsSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from('organization_custom_skills')
        .insert({
          organization_id: organizationId,
          created_by: user.id,
          skill_name: input.skill_name,
          display_name: input.display_name,
          description: input.description,
          instructions: input.instructions,
          parameters: input.parameters || [],
          trigger_examples: input.trigger_examples || [],
          is_active: input.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      const skill = {
        ...data,
        parameters: data.parameters || [],
        trigger_examples: data.trigger_examples || [],
      } as CustomSkill;

      setSkills(prev => [skill, ...prev]);
      toast({
        title: 'Skill created',
        description: `"${skill.display_name}" is now available.`,
      });
      return skill;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create skill.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [organizationId, user]);

  const update = useCallback(async (id: string, updates: UpdateCustomSkillInput): Promise<CustomSkill | null> => {
    if (!organizationId) return null;

    setIsSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from('organization_custom_skills')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;

      const skill = {
        ...data,
        parameters: data.parameters || [],
        trigger_examples: data.trigger_examples || [],
      } as CustomSkill;

      setSkills(prev => prev.map(s => s.id === id ? skill : s));
      toast({
        title: 'Skill updated',
        description: `"${skill.display_name}" has been updated.`,
      });
      return skill;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update skill.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [organizationId]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!organizationId) return false;

    try {
      const { error } = await (supabase as any)
        .from('organization_custom_skills')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) throw error;

      setSkills(prev => prev.filter(s => s.id !== id));
      toast({
        title: 'Skill deleted',
        description: 'The custom skill has been removed.',
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete skill.',
        variant: 'destructive',
      });
      return false;
    }
  }, [organizationId]);

  return {
    skills,
    isLoading,
    isSaving,
    create,
    update,
    remove,
    refetch: fetchSkills,
  };
}
