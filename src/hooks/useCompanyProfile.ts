import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from '@/hooks/use-toast';
import type { CompanyProfile, ProductService, TargetPersona, ProofPoint } from '@/types/company-profile';
import { useAuth } from '@/components/auth/AuthProvider';
import type { Json } from '@/integrations/supabase/types';

export function useCompanyProfile() {
  const { currentOrganization } = useOrganizationAccess();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.organization?.id;

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['company-profile', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      
      const { data, error } = await supabase
        .from('company_profiles')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        // Transform JSONB fields to proper arrays with type casting
        return {
          ...data,
          products_services: (Array.isArray(data.products_services) ? data.products_services : []) as unknown as ProductService[],
          differentiators: Array.isArray(data.differentiators) ? data.differentiators : [],
          target_personas: (Array.isArray(data.target_personas) ? data.target_personas : []) as unknown as TargetPersona[],
          proof_points: (Array.isArray(data.proof_points) ? data.proof_points : []) as unknown as ProofPoint[],
        } as CompanyProfile;
      }
      
      return null;
    },
    enabled: !!orgId
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<CompanyProfile>) => {
      if (!orgId) throw new Error('No organization selected');
      if (!user?.id) throw new Error('Not authenticated');
      
      // Convert arrays to JSON-compatible format
      const payload = {
        company_name: updates.company_name,
        tagline: updates.tagline,
        industry: updates.industry,
        website_url: updates.website_url,
        value_proposition: updates.value_proposition,
        elevator_pitch: updates.elevator_pitch,
        boilerplate_about: updates.boilerplate_about,
        products_services: updates.products_services as unknown as Json[],
        differentiators: updates.differentiators,
        target_personas: updates.target_personas as unknown as Json[],
        proof_points: updates.proof_points as unknown as Json[],
        organization_id: orgId,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      };

      if (profile?.id) {
        // Update existing
        const { error } = await supabase
          .from('company_profiles')
          .update(payload)
          .eq('id', profile.id);
        if (error) throw error;
      } else {
        // Insert new - company_name is required
        if (!updates.company_name) throw new Error('Company name is required');
        const { error } = await supabase
          .from('company_profiles')
          .insert([{
            ...payload,
            company_name: updates.company_name,
            created_by: user.id
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile', orgId] });
      toast({ title: 'Company profile saved', description: 'Your changes have been saved.' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error saving profile', 
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  return {
    profile,
    isLoading,
    error,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending
  };
}
