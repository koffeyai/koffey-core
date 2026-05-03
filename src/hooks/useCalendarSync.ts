/**
 * useCalendarSync Hook
 *
 * Syncs Google Calendar events to CRM, creating contacts, accounts, and activities.
 * Used during onboarding to provide the "magic moment" of instant CRM population.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SyncResult {
  success: boolean;
  eventsProcessed: number;
  contactsCreated: number;
  contactsMatched: number;
  accountsCreated: number;
  accountsMatched: number;
  activitiesCreated: number;
  enrichmentQueued?: number;
  errors: string[];
  contacts: Array<{ id: string; email: string; name: string; isNew: boolean }>;
  accounts: Array<{ id: string; name: string; domain: string; isNew: boolean }>;
}

export interface SyncOptions {
  daysBack?: number;
  completeOnboarding?: boolean;
  triggerEnrichment?: boolean;
}

export interface CalendarSyncState {
  isLoading: boolean;
  isComplete: boolean;
  error: string | null;
  result: SyncResult | null;
  progress: {
    stage: 'idle' | 'connecting' | 'fetching' | 'processing' | 'complete' | 'error';
    message: string;
  };
}

export function useCalendarSync() {
  const [state, setState] = useState<CalendarSyncState>({
    isLoading: false,
    isComplete: false,
    error: null,
    result: null,
    progress: { stage: 'idle', message: '' }
  });

  const setProgress = (stage: CalendarSyncState['progress']['stage'], message: string) => {
    setState(prev => ({
      ...prev,
      progress: { stage, message }
    }));
  };

  const syncCalendar = useCallback(async (options: SyncOptions = {}): Promise<SyncResult | null> => {
    const {
      daysBack = 30,
      completeOnboarding = false,
      triggerEnrichment = true
    } = options;

    setState({
      isLoading: true,
      isComplete: false,
      error: null,
      result: null,
      progress: { stage: 'connecting', message: 'Connecting to Google Calendar...' }
    });

    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      setProgress('fetching', 'Fetching your calendar events...');

      // Call the sync function
      const { data, error } = await supabase.functions.invoke('sync-calendar-to-crm', {
        body: { daysBack, completeOnboarding, triggerEnrichment }
      });

      if (error) {
        throw new Error(error.message || 'Sync failed');
      }

      const result = data as SyncResult;

      if (!result.success && result.errors.length > 0) {
        throw new Error(result.errors[0]);
      }

      setProgress('complete', 'Sync complete!');

      setState(prev => ({
        ...prev,
        isLoading: false,
        isComplete: true,
        result
      }));

      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync calendar';

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message,
        progress: { stage: 'error', message }
      }));

      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      isComplete: false,
      error: null,
      result: null,
      progress: { stage: 'idle', message: '' }
    });
  }, []);

  return {
    ...state,
    syncCalendar,
    reset
  };
}
