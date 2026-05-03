
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from './useOrganizationAccess';
import { config } from '@/config';
import { logInfo, logError } from '@/lib/logger';

interface SubscriptionConfig {
  table: string;
  organizationId: string;
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
}

interface Subscriber {
  subscriberId: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
}

interface ActiveSubscription {
  id: string;
  channel: any;
  config: SubscriptionConfig;
  subscribers: Map<string, Subscriber>;
  createdAt: number;
  status: 'connecting' | 'connected' | 'error' | 'degraded' | 'disconnected';
  isSubscribing: boolean;
  channelName: string;
}

// CRITICAL: Singleton pattern to prevent multiple instances
class GlobalRealtimeManager {
  private static instance: GlobalRealtimeManager;
  private subscriptions = new Map<string, ActiveSubscription>();
  private pendingCleanup = new Map<string, NodeJS.Timeout>();
  private connectionRetries = new Map<string, number>();
  private pendingRetryTimers = new Map<string, NodeJS.Timeout>();
  private degradedKeys = new Set<string>();
  private cleanupDelay = 2000; // 2 seconds
  private maxRetries = 5;
  private maxBackoffMs = 10000; // 10 second cap
  private isDestroyed = false;
  private onDegradedChangeCallbacks: Array<() => void> = [];

  private authListenerCleanup: (() => void) | null = null;
  private authPromise: Promise<void> | null = null;

  static getInstance(): GlobalRealtimeManager {
    if (!GlobalRealtimeManager.instance) {
      GlobalRealtimeManager.instance = new GlobalRealtimeManager();
      GlobalRealtimeManager.instance.setupAuthListener();
      logInfo('GlobalRealtimeManager: Created new singleton instance');
    }
    return GlobalRealtimeManager.instance;
  }

  // Keep the realtime WebSocket token in sync with the auth session.
  // When the JWT is refreshed (TOKEN_REFRESHED) or a new sign-in occurs,
  // we push the fresh token to the realtime connection so RLS evaluates
  // against the authenticated role rather than anon.
  private setupAuthListener(): void {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
          logInfo('GlobalRealtimeManager: Realtime token updated on auth event', {
            event,
            userId: session.user?.id?.substring(0, 8)
          });
        }
      } else if (event === 'SIGNED_OUT') {
        logInfo('GlobalRealtimeManager: User signed out, realtime will revert to anon');
      }
    });
    this.authListenerCleanup = () => subscription.unsubscribe();
  }

  // CRITICAL: Reset instance for testing/development
  static reset(): void {
    if (GlobalRealtimeManager.instance) {
      GlobalRealtimeManager.instance.cleanup();
      GlobalRealtimeManager.instance = null as any;
    }
  }

  onDegradedChange(callback: () => void): () => void {
    this.onDegradedChangeCallbacks.push(callback);
    return () => {
      this.onDegradedChangeCallbacks = this.onDegradedChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyDegradedChange() {
    this.onDegradedChangeCallbacks.forEach(cb => {
      try { cb(); } catch (_) { /* ignore */ }
    });
  }

  getDegradedSubscriptions(): string[] {
    return Array.from(this.degradedKeys);
  }

  private generateSubscriptionKey(table: string, organizationId: string): string {
    return `${table}:${organizationId}`;
  }

  private generateChannelName(table: string, organizationId: string): string {
    // CRITICAL: Use deterministic channel names to prevent duplicates
    return `realtime_${table}_${organizationId}`;
  }

  subscribe(subscriberId: string, config: SubscriptionConfig): () => void {
    if (this.isDestroyed) {
      logError('GlobalRealtimeManager: Cannot subscribe - manager is destroyed', { subscriberId });
      return () => {};
    }

    const key = this.generateSubscriptionKey(config.table, config.organizationId);
    const channelName = this.generateChannelName(config.table, config.organizationId);

    logInfo('GlobalRealtimeManager: Subscribe request', {
      subscriberId,
      key,
      channelName,
      currentSubscriptions: this.subscriptions.size
    });

    // Cancel any pending cleanup for this subscription
    this.cancelCleanup(key);

    let subscription = this.subscriptions.get(key);

    // CRITICAL FIX: If subscription exists in error/degraded state, do NOT recreate.
    // Just add the subscriber to the existing subscription. The retry mechanism
    // or manual forceReconnect() will handle recovery.
    if (!subscription) {
      logInfo('GlobalRealtimeManager: Creating new subscription for key', { key });
      // createSubscription is async (awaits auth token), but we store a placeholder
      // immediately so concurrent subscribe() calls see it and don't double-create.
      const placeholder: ActiveSubscription = {
        id: key,
        channel: null as any,
        config,
        subscribers: new Map(),
        createdAt: Date.now(),
        status: 'connecting',
        isSubscribing: true,
        channelName
      };
      this.subscriptions.set(key, placeholder);
      subscription = placeholder;

      // Kick off the async channel creation — it will update the placeholder in-place
      this.createSubscription(key, config, channelName).then(created => {
        // Transfer any subscribers that were added while we were awaiting auth
        placeholder.subscribers.forEach((sub, id) => {
          created.subscribers.set(id, sub);
        });
        this.subscriptions.set(key, created);
      }).catch(error => {
        logError('GlobalRealtimeManager: createSubscription failed', { key, error });
      });
    } else if (subscription.status === 'error' || subscription.status === 'degraded') {
      logInfo('GlobalRealtimeManager: Subscription in degraded/error state, adding subscriber without recreating', {
        key,
        status: subscription.status,
        isDegraded: this.degradedKeys.has(key)
      });
      // Don't recreate — just add subscriber below
    }

    // CRITICAL: Check for duplicate subscriber
    if (subscription.subscribers.has(subscriberId)) {
      logError('GlobalRealtimeManager: Duplicate subscriber detected', { subscriberId, key });
      return () => this.unsubscribe(subscriberId, key);
    }

    // Add subscriber with their specific callbacks
    subscription.subscribers.set(subscriberId, {
      subscriberId,
      onInsert: config.onInsert,
      onUpdate: config.onUpdate,
      onDelete: config.onDelete
    });

    logInfo('GlobalRealtimeManager: Subscription active', {
      key,
      channelName,
      subscriberCount: subscription.subscribers.size,
      subscribers: Array.from(subscription.subscribers.keys()),
      status: subscription.status
    });

    // Return unsubscribe function
    return () => this.unsubscribe(subscriberId, key);
  }

  private async ensureRealtimeAuth(): Promise<void> {
    // Deduplicate: if an auth check is already in flight, reuse it
    if (this.authPromise) return this.authPromise;

    this.authPromise = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
          logInfo('GlobalRealtimeManager: Realtime auth token set', {
            role: 'authenticated',
            userId: session.user?.id?.substring(0, 8)
          });
        } else {
          logError('GlobalRealtimeManager: No active session for realtime auth — subscriptions will use anon role');
        }
      } catch (error) {
        logError('GlobalRealtimeManager: Failed to set realtime auth', { error });
      } finally {
        // Clear after a short window so concurrent calls share the same result,
        // but future calls (e.g. after token refresh) get a fresh check
        setTimeout(() => { this.authPromise = null; }, 5000);
      }
    })();

    return this.authPromise;
  }

  private async createSubscription(key: string, config: SubscriptionConfig, channelName: string): Promise<ActiveSubscription> {
    logInfo('GlobalRealtimeManager: Creating subscription', { key, channelName });

    // CRITICAL: Ensure the realtime connection has the authenticated token BEFORE
    // creating the channel. This fixes a race condition where the WebSocket connects
    // with the anon key before the auth session is restored on page load.
    await this.ensureRealtimeAuth();

    // CRITICAL: Check if channel already exists
    const existingChannels = supabase.getChannels();
    const existingChannel = existingChannels.find(ch => ch.topic === channelName);

    if (existingChannel) {
      logError('GlobalRealtimeManager: Channel already exists, removing it first', { channelName });
      try {
        supabase.removeChannel(existingChannel);
      } catch (error) {
        logError('Error removing existing channel', { error });
      }
    }

    // Create new channel
    const channel = supabase.channel(channelName);

    const subscription: ActiveSubscription = {
      id: key,
      channel,
      config,
      subscribers: new Map(),
      createdAt: Date.now(),
      status: 'connecting',
      isSubscribing: true,
      channelName
    };

    // Set up consolidated event handlers BEFORE subscribing
    this.setupEventHandlers(subscription);

    // CRITICAL: Subscribe with error handling and timeout
    const subscribePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscription timeout'));
      }, 3000); // 3 second timeout

      channel.subscribe((status) => {
        clearTimeout(timeout);
        logInfo('GlobalRealtimeManager: Channel status changed', {
          key,
          channelName,
          status,
          subscriberCount: subscription.subscribers.size
        });

        subscription.isSubscribing = false;

        if (status === 'SUBSCRIBED') {
          subscription.status = 'connected';
          // Clear retries and degraded state on successful connection
          this.connectionRetries.delete(key);
          if (this.degradedKeys.delete(key)) {
            this.notifyDegradedChange();
          }
          resolve(status);
        } else if (status === 'CHANNEL_ERROR') {
          subscription.status = 'error';
          logError('GlobalRealtimeManager: CHANNEL_ERROR', {
            key,
            channelName,
            table: config.table,
            hint: 'Check that this table is added to the supabase_realtime publication and has REPLICA IDENTITY FULL'
          });
          console.warn(
            `[Realtime] Connection failed for "${config.table}" table. ` +
            `Verify it is in the supabase_realtime publication (Database > Publications in Supabase dashboard).`
          );
          this.handleConnectionError(key, subscription);
          reject(new Error(`Channel error for ${config.table}: ${status}`));
        }
      });
    });

    // Handle subscription errors
    subscribePromise.catch(error => {
      logError('Subscription failed', { key, channelName, error });
      subscription.status = 'error';
      subscription.isSubscribing = false;
    });

    return subscription;
  }

  private setupEventHandlers(subscription: ActiveSubscription) {
    const { channel, config } = subscription;

    // CRITICAL: Single event handler per event type to prevent duplicates
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: config.table,
        filter: config.filter || `organization_id=eq.${config.organizationId}`
      },
      (payload) => {
        logInfo('INSERT event received', { table: config.table });
        subscription.subscribers.forEach((subscriber) => {
          try {
            subscriber.onInsert?.(payload);
          } catch (error) {
            logError('Error in subscriber INSERT handler', {
              subscriberId: subscriber.subscriberId,
              error
            });
          }
        });
      }
    );

    // Consolidated UPDATE handler
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: config.table,
        filter: config.filter || `organization_id=eq.${config.organizationId}`
      },
      (payload: any) => {
        logInfo('UPDATE event received', { table: config.table });
        subscription.subscribers.forEach((subscriber) => {
          try {
            subscriber.onUpdate?.(payload);
          } catch (error) {
            logError('Error in subscriber UPDATE handler', {
              subscriberId: subscriber.subscriberId,
              error
            });
          }
        });
      }
    );

    // Consolidated DELETE handler
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: config.table,
        filter: config.filter || `organization_id=eq.${config.organizationId}`
      },
      (payload: any) => {
        logInfo('DELETE event received', { table: config.table });
        subscription.subscribers.forEach((subscriber) => {
          try {
            subscriber.onDelete?.(payload);
          } catch (error) {
            logError('Error in subscriber DELETE handler', {
              subscriberId: subscriber.subscriberId,
              error
            });
          }
        });
      }
    );
  }

  private handleConnectionError(key: string, subscription: ActiveSubscription) {
    const retryCount = this.connectionRetries.get(key) || 0;

    if (retryCount >= this.maxRetries) {
      // CRITICAL FIX: Enter degraded mode — stop retrying entirely
      const table = subscription.config.table;
      logError('GlobalRealtimeManager: Max retries exceeded, entering degraded mode', {
        key,
        table,
        retryCount,
        maxRetries: this.maxRetries
      });
      console.error(
        `[Realtime] DEGRADED: "${table}" realtime subscription failed after ${this.maxRetries} retries. ` +
        `The "Live updates paused" banner is now visible. To fix:\n` +
        `  1. Check Supabase dashboard > Database > Publications — ensure "${table}" is in supabase_realtime\n` +
        `  2. Run: ALTER TABLE public.${table} REPLICA IDENTITY FULL;\n` +
        `  3. Run: ALTER PUBLICATION supabase_realtime ADD TABLE public.${table};\n` +
        `  4. Click "Reconnect" in the app or reload the page.`
      );
      subscription.status = 'degraded';
      this.degradedKeys.add(key);
      this.notifyDegradedChange();
      return;
    }

    if (subscription.isSubscribing) {
      // Already in the process of subscribing, don't retry yet
      return;
    }

    this.connectionRetries.set(key, retryCount + 1);

    // Exponential backoff with jitter: base * 2^n + random jitter, capped at maxBackoffMs
    const baseDelay = Math.min(Math.pow(2, retryCount) * 1000, this.maxBackoffMs);
    const jitter = Math.random() * baseDelay * 0.3; // 0-30% jitter
    const delay = Math.round(baseDelay + jitter);

    logInfo('GlobalRealtimeManager: Scheduling retry with backoff', {
      key,
      retryCount: retryCount + 1,
      maxRetries: this.maxRetries,
      delayMs: delay
    });

    // Clear any existing retry timer for this key
    const existingTimer = this.pendingRetryTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timerId = setTimeout(() => {
      this.pendingRetryTimers.delete(key);
      if (this.subscriptions.has(key) && subscription.subscribers.size > 0 && !subscription.isSubscribing) {
        this.recreateSubscription(key);
      }
    }, delay);

    this.pendingRetryTimers.set(key, timerId);
  }

  private async recreateSubscription(key: string) {
    const subscription = this.subscriptions.get(key);
    if (!subscription || subscription.isSubscribing) return;

    logInfo('Recreating subscription', { key });

    // Mark as subscribing to prevent concurrent recreations
    subscription.isSubscribing = true;

    // Remove the old channel properly
    try {
      if (subscription.channel) {
        await supabase.removeChannel(subscription.channel);
      }
      // Wait a bit to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      logError('Error removing old channel', { error });
    }

    // Create new subscription with existing config and subscribers
    const newSubscription = await this.createSubscription(key, subscription.config, subscription.channelName);

    // Transfer subscribers from old to new
    subscription.subscribers.forEach((subscriber, subscriberId) => {
      newSubscription.subscribers.set(subscriberId, subscriber);
    });

    // Update the store
    this.subscriptions.set(key, newSubscription);
  }

  unsubscribe(subscriberId: string, key: string) {
    logInfo('GlobalRealtimeManager: Unsubscribe request', { subscriberId, key });

    const subscription = this.subscriptions.get(key);
    if (!subscription) {
      logError('No subscription found for key', { key });
      return;
    }

    // Remove this subscriber
    subscription.subscribers.delete(subscriberId);

    logInfo('GlobalRealtimeManager: After unsubscribe', {
      key,
      remainingSubscribers: subscription.subscribers.size
    });

    // If no more subscribers, schedule cleanup
    if (subscription.subscribers.size === 0) {
      this.scheduleCleanup(key);
    }
  }

  private scheduleCleanup(key: string) {
    logInfo('Scheduling cleanup for subscription', { key, delay: this.cleanupDelay });

    // Cancel any existing cleanup timer
    this.cancelCleanup(key);

    // Schedule new cleanup
    const timeoutId = setTimeout(() => {
      const subscription = this.subscriptions.get(key);

      // Only cleanup if still no subscribers
      if (subscription && subscription.subscribers.size === 0) {
        logInfo('Cleaning up inactive subscription', { key });

        try {
          supabase.removeChannel(subscription.channel);
        } catch (error) {
          logError('Error removing channel', { error });
        }

        this.subscriptions.delete(key);
        this.connectionRetries.delete(key);
        if (this.degradedKeys.delete(key)) {
          this.notifyDegradedChange();
        }
      }

      // Clean up any pending retry timer
      const retryTimer = this.pendingRetryTimers.get(key);
      if (retryTimer) {
        clearTimeout(retryTimer);
        this.pendingRetryTimers.delete(key);
      }

      this.pendingCleanup.delete(key);
    }, this.cleanupDelay);

    this.pendingCleanup.set(key, timeoutId);
  }

  private cancelCleanup(key: string) {
    const timeoutId = this.pendingCleanup.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pendingCleanup.delete(key);
      logInfo('Cancelled cleanup', { key });
    }
  }

  getStats() {
    return {
      activeSubscriptions: this.subscriptions.size,
      pendingCleanups: this.pendingCleanup.size,
      degradedCount: this.degradedKeys.size,
      subscriptions: Array.from(this.subscriptions.entries()).map(([key, sub]) => ({
        key,
        table: sub.config.table,
        organizationId: sub.config.organizationId,
        subscriberCount: sub.subscribers.size,
        status: sub.status,
        age: Date.now() - sub.createdAt,
        subscribers: Array.from(sub.subscribers.keys()),
        isSubscribing: sub.isSubscribing
      }))
    };
  }

  // Debug method - exposes sync health to DevTools console
  getSyncHealth() {
    const stats = this.getStats();
    const health = {
      timestamp: new Date().toISOString(),
      overallStatus: this.degradedKeys.size > 0 ? 'degraded' : (stats.activeSubscriptions > 0 ? 'active' : 'inactive'),
      subscriptionCount: stats.activeSubscriptions,
      pendingCleanups: stats.pendingCleanups,
      degradedCount: stats.degradedCount,
      degradedKeys: Array.from(this.degradedKeys),
      subscriptions: stats.subscriptions.map(sub => ({
        table: sub.table,
        status: sub.status,
        isHealthy: sub.status === 'connected',
        subscriberCount: sub.subscriberCount,
        ageSeconds: Math.round(sub.age / 1000)
      }))
    };

    console.log('[Sync] GlobalRealtimeManager Health:', health);
    return health;
  }

  // Method to check subscription health
  getSubscriptionHealth(table: string, organizationId: string) {
    const key = this.generateSubscriptionKey(table, organizationId);
    const subscription = this.subscriptions.get(key);

    if (!subscription) {
      return { isHealthy: false, status: 'not_found', subscriberCount: 0 };
    }

    return {
      isHealthy: subscription.status === 'connected',
      status: subscription.status,
      subscriberCount: subscription.subscribers.size
    };
  }

  async forceReconnect(table: string, organizationId: string) {
    const key = this.generateSubscriptionKey(table, organizationId);
    const subscription = this.subscriptions.get(key);

    if (subscription) {
      logInfo('Force reconnecting subscription', { key });
      // Refresh auth token and reset retry counter so reconnect has fresh attempts
      await this.ensureRealtimeAuth();
      this.connectionRetries.delete(key);
      if (this.degradedKeys.delete(key)) {
        this.notifyDegradedChange();
      }
      this.recreateSubscription(key);
    }
  }

  async forceReconnectAll() {
    logInfo('GlobalRealtimeManager: Force reconnecting all subscriptions');
    // Refresh the auth token before reconnecting
    await this.ensureRealtimeAuth();
    for (const [key] of this.subscriptions) {
      this.connectionRetries.delete(key);
    }
    this.degradedKeys.clear();
    this.notifyDegradedChange();
    for (const [key] of this.subscriptions) {
      this.recreateSubscription(key);
    }
  }

  cleanup() {
    logInfo('GlobalRealtimeManager: Complete cleanup initiated');
    this.isDestroyed = true;

    // Unsubscribe auth listener
    this.authListenerCleanup?.();
    this.authListenerCleanup = null;

    // Cancel all pending cleanups
    for (const timeoutId of this.pendingCleanup.values()) {
      clearTimeout(timeoutId);
    }
    this.pendingCleanup.clear();

    // Cancel all pending retry timers
    for (const timerId of this.pendingRetryTimers.values()) {
      clearTimeout(timerId);
    }
    this.pendingRetryTimers.clear();

    // Remove all channels
    for (const [key, subscription] of this.subscriptions.entries()) {
      try {
        supabase.removeChannel(subscription.channel);
      } catch (error) {
        logError('GlobalRealtimeManager: Error during cleanup', { error });
      }
    }

    this.subscriptions.clear();
    this.connectionRetries.clear();
    this.degradedKeys.clear();
  }
}

// CRITICAL: Ensure cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    GlobalRealtimeManager.reset();
  });

  // Development mode: reset on hot reload
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      GlobalRealtimeManager.reset();
    });
  }

  // Expose to DevTools for debugging
  (window as any).__KOFFEY_SYNC_DEBUG__ = {
    getHealth: () => GlobalRealtimeManager.getInstance().getSyncHealth(),
    getStats: () => GlobalRealtimeManager.getInstance().getStats(),
    forceReconnect: (table: string, orgId: string) =>
      GlobalRealtimeManager.getInstance().forceReconnect(table, orgId),
    forceReconnectAll: () => GlobalRealtimeManager.getInstance().forceReconnectAll(),
    listTables: () => GlobalRealtimeManager.getInstance().getStats().subscriptions.map(s => s.table),
    getDegraded: () => GlobalRealtimeManager.getInstance().getDegradedSubscriptions()
  };
  console.log('[Sync] Debug tools available: window.__KOFFEY_SYNC_DEBUG__');
}

// Export the class for development tools
export { GlobalRealtimeManager };

export const useGlobalRealtimeManager = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const managerRef = useRef<GlobalRealtimeManager>();
  const subscriberIdRef = useRef<string>();
  const [degradedKeys, setDegradedKeys] = useState<string[]>([]);

  useEffect(() => {
    managerRef.current = GlobalRealtimeManager.getInstance();
    subscriberIdRef.current = `subscriber-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Listen for degraded state changes
    const unsubDegraded = managerRef.current.onDegradedChange(() => {
      setDegradedKeys(managerRef.current?.getDegradedSubscriptions() || []);
    });

    return () => {
      logInfo('useGlobalRealtimeManager: Cleanup on unmount');
      unsubDegraded();
    };
  }, []);

  const subscribe = useCallback((config: SubscriptionConfig) => {
    if (!managerRef.current || !subscriberIdRef.current) {
      logError('useGlobalRealtimeManager: Manager not ready for subscription', {});
      return () => {};
    }
    return managerRef.current.subscribe(subscriberIdRef.current, config);
  }, []);

  const getStats = useCallback(() => {
    return managerRef.current?.getStats() || {
      activeSubscriptions: 0,
      pendingCleanups: 0,
      degradedCount: 0,
      subscriptions: []
    };
  }, []);

  const getHealth = useCallback((table: string, organizationId: string) => {
    return managerRef.current?.getSubscriptionHealth(table, organizationId) || {
      isHealthy: false,
      status: 'not_available',
      subscriberCount: 0
    };
  }, []);

  const forceReconnect = useCallback((table: string, organizationId: string) => {
    managerRef.current?.forceReconnect(table, organizationId);
  }, []);

  const forceReconnectAll = useCallback(() => {
    managerRef.current?.forceReconnectAll();
  }, []);

  return {
    subscribe,
    getStats,
    getHealth,
    forceReconnect,
    forceReconnectAll,
    isDegraded: degradedKeys.length > 0,
    degradedKeys,
    isReady: !!user && !!currentOrganization && config.features.realTimeUpdates
  };
};
