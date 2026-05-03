import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import type { Database } from '@/integrations/supabase/types';

export interface AdminJobExecution {
  id: string;
  organization_id: string;
  triggered_by_user_id?: string;
  job_type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  priority: number;
  progress_percentage: number;
  current_stage?: string;
  queue_position?: number;
  started_at?: string;
  completed_at?: string;
  timeout_at?: string;
  estimated_completion?: string;
  results: Record<string, any>;
  error_details: Record<string, any>;
  retry_count: number;
  max_retries: number;
  resource_usage: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AdminJobProgress {
  id: string;
  job_id: string;
  stage: string;
  progress_percentage: number;
  message?: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface AdminNotification {
  id: string;
  organization_id: string;
  user_id?: string;
  job_id?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  action_label?: string;
  action_data: Record<string, any>;
  is_read: boolean;
  is_persistent: boolean;
  created_at: string;
  expires_at?: string;
}

export const useAdminJobs = () => {
  const { user } = useAuth();
  const { organizationId } = useOrganizationAccess();
  const [activeJobs, setActiveJobs] = useState<AdminJobExecution[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch active jobs
  const fetchActiveJobs = useCallback(async () => {
    if (!organizationId) return;

    try {
      const { data, error } = await supabase
        .from('admin_job_executions')
        .select('*')
        .eq('organization_id', organizationId)
        .in('status', ['queued', 'running'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setActiveJobs((data || []) as AdminJobExecution[]);
    } catch (error) {
      console.error('Error fetching active jobs:', error);
    }
  }, [organizationId]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!organizationId || !user?.id) return;

    try {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .eq('is_read', false)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setNotifications((data || []) as AdminNotification[]);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [organizationId, user?.id]);

  // Create a new job
  const createJob = useCallback(async (
    jobType: string,
    priority: number = 1,
    timeoutMinutes: number = 30
  ): Promise<string | null> => {
    if (!organizationId || !user?.id) return null;

    try {
      setLoading(true);
      const timeoutAt = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('admin_job_executions')
        .insert([{
          organization_id: organizationId,
          triggered_by_user_id: user.id,
          job_type: jobType,
          priority,
          timeout_at: timeoutAt,
          status: 'queued'
        }])
        .select()
        .single();

      if (error) throw error;
      
      await fetchActiveJobs();
      return data.id;
    } catch (error) {
      console.error('Error creating job:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId, user?.id, fetchActiveJobs]);

  // Update job progress
  const updateJobProgress = useCallback(async (
    jobId: string,
    stage: string,
    progress?: number,
    message?: string,
    metadata: Record<string, any> = {}
  ) => {
    try {
      const { error } = await supabase.rpc('update_job_progress', {
        p_job_id: jobId,
        p_stage: stage,
        p_progress: progress,
        p_message: message,
        p_metadata: metadata
      });

      if (error) throw error;
      await fetchActiveJobs();
    } catch (error) {
      console.error('Error updating job progress:', error);
    }
  }, [fetchActiveJobs]);

  // Complete job
  const completeJob = useCallback(async (
    jobId: string,
    status: 'completed' | 'failed' | 'timeout' | 'cancelled',
    results: Record<string, any> = {},
    errorDetails: Record<string, any> = {}
  ) => {
    try {
      const { error } = await supabase.rpc('complete_job_execution', {
        p_job_id: jobId,
        p_status: status,
        p_results: results,
        p_error_details: errorDetails
      });

      if (error) throw error;
      await fetchActiveJobs();
    } catch (error) {
      console.error('Error completing job:', error);
    }
  }, [fetchActiveJobs]);

  // Create notification
  const createNotification = useCallback(async (
    type: AdminNotification['type'],
    title: string,
    message: string,
    options: {
      jobId?: string;
      actionLabel?: string;
      actionData?: Record<string, any>;
      isPersistent?: boolean;
      expiresMinutes?: number;
    } = {}
  ) => {
    if (!organizationId || !user?.id) return;

    try {
      const { error } = await supabase.rpc('create_admin_notification', {
        p_organization_id: organizationId,
        p_user_id: user.id,
        p_type: type,
        p_title: title,
        p_message: message,
        p_job_id: options.jobId,
        p_action_label: options.actionLabel,
        p_action_data: options.actionData || {},
        p_is_persistent: options.isPersistent || false,
        p_expires_minutes: options.expiresMinutes || 60
      });

      if (error) throw error;
      await fetchNotifications();
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }, [organizationId, user?.id, fetchNotifications]);

  // Mark notification as read
  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
      await fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, [fetchNotifications]);

  // Cancel job
  const cancelJob = useCallback(async (jobId: string) => {
    await completeJob(jobId, 'cancelled');
  }, [completeJob]);

  // Retry job
  const retryJob = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('admin_job_executions')
        .update({
          status: 'queued',
          // Increment retry count through RPC or raw update
          // retry_count will be incremented by database trigger
          started_at: null,
          completed_at: null,
          progress_percentage: 0,
          current_stage: null,
          error_details: {}
        })
        .eq('id', jobId);

      if (error) throw error;
      await fetchActiveJobs();
    } catch (error) {
      console.error('Error retrying job:', error);
    }
  }, [fetchActiveJobs]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!organizationId) return;

    // Subscribe to job executions
    const jobsChannel = supabase
      .channel('admin-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_job_executions',
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          fetchActiveJobs();
        }
      )
      .subscribe();

    // Subscribe to notifications
    const notificationsChannel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_notifications',
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobsChannel);
      supabase.removeChannel(notificationsChannel);
    };
  }, [organizationId, fetchActiveJobs, fetchNotifications]);

  // Initial fetch
  useEffect(() => {
    fetchActiveJobs();
    fetchNotifications();
  }, [fetchActiveJobs, fetchNotifications]);

  return {
    activeJobs,
    notifications,
    loading,
    createJob,
    updateJobProgress,
    completeJob,
    cancelJob,
    retryJob,
    createNotification,
    markNotificationRead,
    refreshJobs: fetchActiveJobs,
    refreshNotifications: fetchNotifications
  };
};