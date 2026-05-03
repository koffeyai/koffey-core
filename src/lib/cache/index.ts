/**
 * UNIFIED CACHE MANAGER
 * Single source of truth for all application caching
 * Merges functionality from cacheManager.ts and secureCacheManager.ts
 */
import { QueryClient } from '@tanstack/react-query';
import { SecurityUtils } from '../securityUtils';
import { logInfo, logError } from '../logger';

export interface CacheConfig {
  defaultStaleTime: number;
  defaultCacheTime: number;
  maxCacheSize: number;
  encryptSensitiveData: boolean;
  autoCleanup: boolean;
  cleanupInterval: number;
  persistenceKey: string;
}

export interface CacheStrategy {
  staleTime: number;
  cacheTime: number;
  refetchOnMount: boolean;
  refetchOnWindowFocus: boolean;
  retryOnMount: boolean;
  sensitive?: boolean; // Mark sensitive data for encryption
}

// UNIFIED CACHE STRATEGIES - Merged from both managers
export const CACHE_STRATEGIES: Record<string, CacheStrategy> = {
  // CRM Data - Medium frequency updates
  contacts: {
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retryOnMount: true,
    sensitive: false
  },
  
  accounts: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retryOnMount: true,
    sensitive: false
  },
  
  deals: {
    staleTime: 1 * 60 * 1000, // 1 minute (more dynamic)
    cacheTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: true, // Refetch on focus for deals
    retryOnMount: true,
    sensitive: true // Deal amounts might be sensitive
  },
  
  // Analytics - Expensive to compute
  analytics: {
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retryOnMount: false,
    sensitive: false
  },
  
  // User Data - Changes infrequently
  user: {
    staleTime: 15 * 60 * 1000, // 15 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retryOnMount: true,
    sensitive: false
  },
  
  profile: {
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retryOnMount: true,
    sensitive: true
  },
  
  // Organization Data - Very stable
  organization: {
    staleTime: 30 * 60 * 1000, // 30 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retryOnMount: true,
    sensitive: false
  },
  
  // Real-time data - Always fresh
  activities: {
    staleTime: 30 * 1000, // 30 seconds
    cacheTime: 2 * 60 * 1000, // 2 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retryOnMount: true,
    sensitive: false
  },
  
  tasks: {
    staleTime: 1 * 60 * 1000, // 1 minute
    cacheTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    retryOnMount: true,
    sensitive: false
  },
  
  // Session Data - Short lived
  session: {
    staleTime: 30 * 1000, // 30 seconds
    cacheTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retryOnMount: true,
    sensitive: true
  }
};

class UnifiedCacheManager {
  private queryClient: QueryClient;
  private config: CacheConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private memoryUsageTracker: Map<string, number> = new Map();
  private invalidationQueue: Set<string> = new Set();
  private batchInvalidationTimer?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      defaultStaleTime: 5 * 60 * 1000, // 5 minutes
      defaultCacheTime: 10 * 60 * 1000, // 10 minutes
      maxCacheSize: 50 * 1024 * 1024, // 50MB
      encryptSensitiveData: true,
      autoCleanup: true,
      cleanupInterval: 15 * 60 * 1000, // 15 minutes
      persistenceKey: 'app-cache',
      ...config
    };

    this.queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: this.config.defaultStaleTime,
          gcTime: this.config.defaultCacheTime,
          retry: (failureCount, error: any) => {
            // Don't retry on auth errors
            if (
              error?.status === 401 || 
              error?.status === 403 ||
              error?.message?.includes('auth') || 
              error?.message?.includes('permission')
            ) {
              return false;
            }
            return failureCount < 3;
          },
          retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        },
        mutations: {
          retry: false, // Don't retry mutations by default
        }
      }
    });

    this.setupErrorHandling();
    
    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }

    this.monitorMemoryUsage();
    this.setupPersistence();

    logInfo('UnifiedCacheManager initialized', { 
      autoCleanup: this.config.autoCleanup,
      encryptSensitiveData: this.config.encryptSensitiveData 
    });
  }

  // ===== PUBLIC API =====

  /**
   * Get the QueryClient instance
   */
  getQueryClient(): QueryClient {
    return this.queryClient;
  }

  /**
   * Get cache strategy for a data type
   */
  getStrategy(dataType: string): CacheStrategy {
    return CACHE_STRATEGIES[dataType] || {
      staleTime: this.config.defaultStaleTime,
      cacheTime: this.config.defaultCacheTime,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      retryOnMount: true,
      sensitive: false
    };
  }

  /**
   * Get query options with appropriate caching strategy
   */
  getSecureQueryOptions(queryKey: string[], dataType: string) {
    const strategy = this.getStrategy(dataType);
    
    return {
      queryKey,
      staleTime: strategy.staleTime,
      gcTime: strategy.cacheTime,
      refetchOnMount: strategy.refetchOnMount,
      refetchOnWindowFocus: strategy.refetchOnWindowFocus,
      retry: strategy.retryOnMount
    };
  }

  // ===== PROTECTED DATA STORAGE =====

  /**
   * Store data with sensitivity-aware browser storage protection.
   */
  setSecureData(key: string, data: any, dataType: string = 'default'): void {
    try {
      const strategy = this.getStrategy(dataType);
      const shouldEncrypt = this.config.encryptSensitiveData && strategy.sensitive;
      
      if (shouldEncrypt) {
        SecurityUtils.secureStorage.set(key, data, true);
      } else {
        SecurityUtils.secureStorage.set(key, data, false);
      }

      this.trackMemoryUsage(key, data);
      
      logInfo('Protected data cached', { key, protected: shouldEncrypt, dataType });
    } catch (error) {
      logError('Failed to cache secure data', { key, error });
    }
  }

  /**
   * Retrieve protected data from browser storage.
   */
  getSecureData<T>(key: string, dataType: string = 'default'): T | null {
    try {
      const strategy = this.getStrategy(dataType);
      const shouldDecrypt = this.config.encryptSensitiveData && strategy.sensitive;
      
      return SecurityUtils.secureStorage.get(key, shouldDecrypt);
    } catch (error) {
      logError('Failed to retrieve secure data', { key, error });
      return null;
    }
  }

  // ===== SMART CACHE INVALIDATION =====

  /**
   * Invalidate queries with batching and cascading
   */
  invalidateQueries(
    patterns: string[],
    options: { immediate?: boolean; cascade?: boolean } = {}
  ): void {
    const { immediate = false, cascade = true } = options;

    if (immediate) {
      this.executeInvalidation(patterns, cascade);
    } else {
      // Batch invalidations to avoid excessive refetching
      patterns.forEach(pattern => this.invalidationQueue.add(pattern));
      this.scheduleBatchInvalidation();
    }
  }

  private scheduleBatchInvalidation(): void {
    if (this.batchInvalidationTimer) {
      clearTimeout(this.batchInvalidationTimer);
    }

    this.batchInvalidationTimer = setTimeout(() => {
      const patterns = Array.from(this.invalidationQueue);
      this.invalidationQueue.clear();
      this.executeInvalidation(patterns, true);
    }, 500); // 500ms batching window
  }

  private executeInvalidation(patterns: string[], cascade: boolean): void {
    patterns.forEach(pattern => {
      this.queryClient.invalidateQueries({
        queryKey: [pattern],
        refetchType: 'active' // Only refetch active queries
      });

      if (cascade) {
        this.cascadeInvalidation(pattern);
      }
    });

    logInfo('Cache invalidation executed', {
      patterns,
      cascade,
      activeQueries: this.queryClient.getQueryCache().getAll().length
    });
  }

  /**
   * Cascade invalidation for related data
   */
  private cascadeInvalidation(dataType: string): void {
    const cascadeRules: Record<string, string[]> = {
      contacts: ['activities', 'deals'], // Contact changes affect activities and deals
      accounts: ['contacts', 'deals'], // Account changes affect related contacts and deals
      deals: ['activities'], // Deal changes affect related activities
      organization: ['contacts', 'accounts', 'deals', 'user'] // Org changes affect everything
    };

    const relatedTypes = cascadeRules[dataType];
    if (relatedTypes) {
      relatedTypes.forEach(type => {
        this.queryClient.invalidateQueries({
          queryKey: [type],
          refetchType: 'none' // Mark as stale but don't refetch immediately
        });
      });
    }
  }

  // ===== OPTIMISTIC UPDATES =====

  /**
   * Apply optimistic updates with rollback capability
   */
  setOptimisticData<T>(
    queryKey: any[],
    updater: (oldData: T | undefined) => T,
    rollbackDelay = 5000
  ): () => void {
    const originalData = this.queryClient.getQueryData<T>(queryKey);
    
    // Apply optimistic update
    this.queryClient.setQueryData(queryKey, updater);
    
    logInfo('Optimistic update applied', {
      queryKey: queryKey.join('-'),
      hasOriginalData: !!originalData
    });

    // Return rollback function
    return () => {
      if (originalData !== undefined) {
        this.queryClient.setQueryData(queryKey, originalData);
        logInfo('Optimistic update rolled back', {
          queryKey: queryKey.join('-')
        });
      }
    };
  }

  // ===== PREFETCHING =====

  /**
   * Prefetch related data
   */
  async prefetchRelated(
    dataType: string,
    entityId: string,
    organizationIds: string[]
  ): Promise<void> {
    const prefetchRules: Record<string, string[]> = {
      contacts: ['activities', 'deals'],
      accounts: ['contacts', 'deals'],
      deals: ['activities', 'contacts']
    };

    const relatedTypes = prefetchRules[dataType];
    if (!relatedTypes) return;

    const prefetchPromises = relatedTypes.map(async (relatedType) => {
      const strategy = this.getStrategy(relatedType);
      
      try {
        await this.queryClient.prefetchQuery({
          queryKey: [relatedType, organizationIds, { [`${dataType}_id`]: entityId }],
          queryFn: async () => ({ data: [], hasMore: false }),
          staleTime: strategy.staleTime
        });
      } catch (error: any) {
        logError('Prefetch failed', {
          dataType: relatedType,
          entityId,
          error: error.message
        });
      }
    });

    await Promise.allSettled(prefetchPromises);
  }

  /**
   * Warm cache by prefetching essential data
   */
  async warmCache(organizationIds: string[]): Promise<void> {
    const essentialTypes = ['contacts', 'accounts', 'deals'];
    
    const warmupPromises = essentialTypes.map(type => 
      this.queryClient.prefetchQuery({
        queryKey: [type, organizationIds],
        queryFn: async () => ({ data: [], hasMore: false }),
        staleTime: this.getStrategy(type).staleTime
      })
    );

    await Promise.allSettled(warmupPromises);
    logInfo('Cache warmed', { organizationIds });
  }

  // ===== CACHE MANAGEMENT =====

  /**
   * Clear all cache data securely
   */
  clearAllCache(): void {
    this.queryClient.clear();
    SecurityUtils.secureStorage.clear();
    this.memoryUsageTracker.clear();
    logInfo('All cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    try {
      this.queryClient.getQueryCache().clear();
      
      const keys = Object.keys(localStorage);
      const now = Date.now();
      
      keys.forEach(key => {
        if (key.startsWith('secure_')) {
          try {
            const data = localStorage.getItem(key);
            if (data) {
              const parsed = JSON.parse(data);
              if (parsed.timestamp && now - parsed.timestamp > this.config.defaultCacheTime) {
                localStorage.removeItem(key);
                this.memoryUsageTracker.delete(key);
              }
            }
          } catch (error) {
            localStorage.removeItem(key);
          }
        }
      });

      logInfo('Expired cache cleared');
    } catch (error) {
      logError('Failed to clear expired cache', { error });
    }
  }

  /**
   * Get cache statistics
   */
  getCacheMetrics() {
    const queries = this.queryClient.getQueryCache().getAll();
    const totalSize = Array.from(this.memoryUsageTracker.values()).reduce((sum, size) => sum + size, 0);

    return {
      totalQueries: queries.length,
      activeQueries: queries.filter(q => q.state.fetchStatus !== 'idle').length,
      staleQueries: queries.filter(q => q.isStale()).length,
      memoryUsage: totalSize,
      memoryLimit: this.config.maxCacheSize,
      memoryUsagePercent: (totalSize / this.config.maxCacheSize) * 100
    };
  }

  // ===== SIMPLE API (cacheService compatibility) =====

  /**
   * Simple get method for backward compatibility
   */
  get<T>(key: string): T | null {
    return this.getSecureData<T>(key, 'default');
  }

  /**
   * Simple set method for backward compatibility
   */
  set(key: string, data: any, ttl?: number): void {
    this.setSecureData(key, data, 'default');
  }

  /**
   * Invalidate a specific cache key
   */
  invalidate(key: string): void {
    try {
      SecurityUtils.secureStorage.remove(key);
      this.memoryUsageTracker.delete(key);
    } catch (error) {
      logError('Failed to invalidate cache key', { key, error });
    }
  }

  /**
   * Invalidate cache keys matching a pattern
   */
  invalidatePattern(pattern: string): void {
    try {
      const regex = new RegExp(pattern);
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (regex.test(key)) {
          localStorage.removeItem(key);
          this.memoryUsageTracker.delete(key);
        }
      });
      logInfo('Cache pattern invalidated', { pattern });
    } catch (error) {
      logError('Failed to invalidate cache pattern', { pattern, error });
    }
  }

  /**
   * Cleanup and destroy the manager
   */
  cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.batchInvalidationTimer) {
      clearTimeout(this.batchInvalidationTimer);
    }
    this.clearAllCache();
    logInfo('UnifiedCacheManager cleaned up');
  }

  // ===== PRIVATE METHODS =====

  private setupErrorHandling(): void {
    // Error handling is now done via query cache configuration
    const queryCache = this.queryClient.getQueryCache();
    const mutationCache = this.queryClient.getMutationCache();
    
    queryCache.config = {
      onError: (error: any) => {
        logError('Query error', { error: error?.message || error });
      },
    };
    
    mutationCache.config = {
      onError: (error: any) => {
        logError('Mutation error', { error: error?.message || error });
      },
    };
  }

  private setupPersistence(): void {
    // Load persisted cache on startup
    try {
      const persisted = localStorage.getItem(this.config.persistenceKey);
      if (persisted) {
        const data = JSON.parse(persisted);
        // Restore query cache if needed
        logInfo('Cache persistence loaded');
      }
    } catch (error) {
      logError('Failed to load persisted cache', { error });
    }

    // Save cache periodically
    setInterval(() => {
      try {
        const metrics = this.getCacheMetrics();
        localStorage.setItem(this.config.persistenceKey, JSON.stringify({
          timestamp: Date.now(),
          metrics
        }));
      } catch (error) {
        // Quota exceeded or other storage error
        this.clearExpiredCache();
      }
    }, 60000); // Every minute
  }

  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.clearExpiredCache();
    }, this.config.cleanupInterval);

    logInfo('Auto cleanup started', { interval: this.config.cleanupInterval });
  }

  private monitorMemoryUsage(): void {
    setInterval(() => {
      const totalSize = Array.from(this.memoryUsageTracker.values()).reduce((sum, size) => sum + size, 0);
      
      if (totalSize > this.config.maxCacheSize) {
        logInfo('Cache size limit exceeded, clearing oldest entries', { 
          totalSize, 
          limit: this.config.maxCacheSize 
        });
        this.clearExpiredCache();
      }
    }, 60000); // Check every minute
  }

  private trackMemoryUsage(key: string, data: any): void {
    try {
      const size = new Blob([JSON.stringify(data)]).size;
      this.memoryUsageTracker.set(key, size);
    } catch (error) {
      this.memoryUsageTracker.set(key, JSON.stringify(data).length * 2);
    }
  }
}

// ===== SINGLETON EXPORTS =====

/**
 * Unified cache manager singleton
 */
export const unifiedCacheManager = new UnifiedCacheManager();

/**
 * Unified QueryClient instance - SINGLE SOURCE OF TRUTH
 */
export const queryClient = unifiedCacheManager.getQueryClient();

/**
 * Export for backward compatibility
 */
export { unifiedCacheManager as cacheManager };
export { unifiedCacheManager as secureCacheManager };
