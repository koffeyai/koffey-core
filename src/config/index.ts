export const config = {
  // Database Configuration
  database: {
    batchSize: 50,
    queryTimeout: 10000,
    retryAttempts: 3,
    connectionPoolSize: 10
  },

  // Cache Configuration
  cache: {
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 100,
    cleanupInterval: 2 * 60 * 1000, // 2 minutes
    prefetch: {
      contacts: true,
      deals: true,
      activities: false,
      tasks: false
    }
  },

  // Chat Configuration
  chat: {
    maxMessages: 100,
    persistToDatabase: true,
    autoSave: true,
    autoSaveInterval: 30000, // 30 seconds
    sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
  },

  // CRM Configuration
  crm: {
    pagination: {
      defaultLimit: 25,
      maxLimit: 100
    },
    realtime: {
      enabled: true,
      events: ['INSERT', 'UPDATE', 'DELETE']
    },
    validation: {
      requireOrganization: true,
      strictUserAccess: true
    }
  },

  // Performance Configuration
  performance: {
    debounceMs: 300,
    throttleMs: 1000,
    virtualScrollThreshold: 50,
    lazyLoadImages: true
  },

  // Feature Flags
  features: {
    analyticsPanel: true,
    realTimeUpdates: false,
    advancedFiltering: true,
    bulkOperations: true,
    exportFunctionality: true
  },

  // API Configuration
  api: {
    baseURL: import.meta.env.VITE_SUPABASE_URL || '',
    timeout: 30000,
    retries: 3,
    rateLimiting: {
      requests: 100,
      windowMs: 60000
    }
  },

  // UI Configuration
  ui: {
    theme: {
      animation: {
        duration: 200,
        easing: 'ease-in-out'
      },
      layout: {
        sidebarWidth: 280,
        headerHeight: 64,
        footerHeight: 48
      }
    },
    notifications: {
      position: 'top-right',
      duration: 5000,
      maxVisible: 5
    }
  }
} as const;

export type Config = typeof config;

// Environment-specific overrides
export const getConfig = (environment: 'development' | 'production' | 'test' = 'production') => {
  const baseConfig = { ...config };

  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        cache: {
          ...baseConfig.cache,
          defaultTTL: 1 * 60 * 1000 // 1 minute in dev
        },
        performance: {
          ...baseConfig.performance,
          debounceMs: 100 // Faster feedback in dev
        }
      };

    case 'test':
      return {
        ...baseConfig,
        cache: {
          ...baseConfig.cache,
          defaultTTL: 100 // Very short in tests
        },
        chat: {
          ...baseConfig.chat,
          persistToDatabase: false // Don't persist in tests
        }
      };

    default:
      return baseConfig;
  }
};