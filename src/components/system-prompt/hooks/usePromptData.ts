import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SystemPromptSection, PromptChangeRequest, PromptApproval } from '../types';

export const usePromptData = (isOpen: boolean, isSystemAdmin: boolean) => {
  const [sections, setSections] = useState<SystemPromptSection[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PromptChangeRequest[]>([]);
  const [approvals, setApprovals] = useState<PromptApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [adminCount, setAdminCount] = useState(0);

  const loadSections = async () => {
    const { data, error } = await supabase
      .from('system_prompt_config')
      .select('*')
      .eq('is_active', true)
      .neq('section_type', 'full_prompt')
      .order('section_order', { ascending: true });

    if (error) {
      console.error('Error loading sections:', error);
      return;
    }

    setSections(data || []);
  };

  const loadPendingRequests = async () => {
    const { data, error } = await supabase
      .from('prompt_change_requests')
      .select(`
        *,
        requester_profile:profiles!prompt_change_requests_requested_by_fkey(full_name, email)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading pending requests:', error);
      return;
    }

    setPendingRequests(data || []);

    // Load approvals for pending requests
    if (data && data.length > 0) {
      const requestIds = data.map((req: any) => req.id);
      const { data: approvalsData, error: approvalsError } = await supabase
        .from('prompt_approvals')
        .select(`
          *,
          approver_profile:profiles!prompt_approvals_approved_by_fkey(full_name, email)
        `)
        .in('request_id', requestIds);

      if (!approvalsError) {
        setApprovals(approvalsData || []);
      }
    }
  };

  const loadAdminCount = async () => {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .in('role', ['admin', 'system_admin']);

    if (!error && count !== null) {
      setAdminCount(count);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSections(),
        loadPendingRequests(),
        loadAdminCount()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load system prompt data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && isSystemAdmin) {
      loadData();
    }
  }, [isOpen, isSystemAdmin]);

  return {
    sections,
    setSections,
    pendingRequests,
    approvals,
    loading,
    setLoading,
    adminCount,
    loadData
  };
};