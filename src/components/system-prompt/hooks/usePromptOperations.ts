import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SECTION_TYPES } from '../constants';

export const usePromptOperations = (
  profile: any,
  adminCount: number,
  loadData: () => Promise<void>
) => {
  const calculateRequiredApprovals = (totalAdmins: number) => {
    if (totalAdmins <= 1) return 0;
    if (totalAdmins === 2) return 2;
    return Math.max(3, Math.ceil(totalAdmins * 0.6));
  };

  const submitSectionRequest = async (
    sectionType: string,
    content: string,
    currentContent: string,
    justification: string,
    setLoading: (loading: boolean) => void
  ) => {
    if (!content.trim() || !justification.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide both content and justification",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const requiredApprovals = calculateRequiredApprovals(adminCount);

      const { error } = await supabase
        .from('prompt_change_requests')
        .insert({
          proposed_content: content,
          current_content: currentContent,
          requested_by: profile?.id,
          required_approvals: requiredApprovals,
          section_type: sectionType,
          justification
        });

      if (error) throw error;

      toast({
        title: "Change Request Submitted",
        description: `Request submitted for ${SECTION_TYPES.find(t => t.value === sectionType)?.label}. Needs ${requiredApprovals} approval(s).`,
      });

      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const approveRequest = async (
    requestId: string,
    decision: 'approved' | 'rejected',
    setLoading: (loading: boolean) => void
  ) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('prompt_approvals')
        .insert({
          request_id: requestId,
          approved_by: profile?.id,
          decision
        });

      if (error) throw error;

      toast({
        title: decision === 'approved' ? "Request Approved" : "Request Rejected",
        description: `You have ${decision} this prompt change request.`,
      });

      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    submitSectionRequest,
    approveRequest
  };
};