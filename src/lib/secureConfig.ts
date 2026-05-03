// Frontend-only secure configuration management
// Backend secrets (API keys, service role key) are stored in Supabase Edge Function secrets
export class SecureConfig {
  private static instance: SecureConfig;
  private config: Map<string, string> = new Map();
  // Only frontend-safe keys - backend secrets should never be referenced here
  private sensitiveKeys = new Set([
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ]);

  private constructor() {
    this.loadConfig();
  }

  static getInstance(): SecureConfig {
    if (!SecureConfig.instance) {
      SecureConfig.instance = new SecureConfig();
    }
    return SecureConfig.instance;
  }

  private loadConfig(): void {
    // Load from environment variables
    const config = {
      SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
      SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    };

    // Store configuration
    Object.entries(config).forEach(([key, value]) => {
      this.config.set(key, value);
    });

    // Validate required config
    this.validateRequiredConfig();
  }

  private validateRequiredConfig(): void {
    const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
    const missing = required.filter(key => !this.config.has(key));
    
    if (missing.length > 0) {
      console.warn('Missing required configuration:', missing);
      // Don't throw - allow app to start with warnings
    }
  }

  // Get configuration value safely
  get(key: string): string | undefined {
    return this.config.get(key);
  }

  // Get configuration with fallback
  getOrDefault(key: string, defaultValue: string): string {
    return this.config.get(key) || defaultValue;
  }

  // Check if key exists
  has(key: string): boolean {
    return this.config.has(key);
  }

  // Get all non-sensitive config for debugging
  getPublicConfig(): Record<string, string> {
    const publicConfig: Record<string, string> = {};
    
    this.config.forEach((value, key) => {
      if (!this.sensitiveKeys.has(key)) {
        publicConfig[key] = value;
      } else {
        // Show only first/last characters for sensitive data
        publicConfig[key] = this.maskSensitiveValue(value);
      }
    });

    return publicConfig;
  }

  private maskSensitiveValue(value: string): string {
    if (value.length <= 8) {
      return '***';
    }
    return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
  }

  // Environment checks
  isDevelopment(): boolean {
    return import.meta.env.DEV;
  }

  isProduction(): boolean {
    return import.meta.env.PROD;
  }

  // Security headers configuration
  getSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
      ...(this.isProduction() && {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
      })
    };
  }

  // Content Security Policy
  getCSP(): string {
    const baseCSP = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Needed for Vite dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${this.get('SUPABASE_URL') || '*'} wss://${this.get('SUPABASE_URL')?.replace('https://', '') || '*'}`,
      "frame-ancestors 'none'",
      "base-uri 'self'"
    ];

    if (this.isProduction()) {
      // Stricter CSP for production
      return baseCSP
        .map(directive => directive.replace("'unsafe-inline' 'unsafe-eval'", "'nonce-{nonce}'"))
        .join('; ');
    }

    return baseCSP.join('; ');
  }
}

// Export singleton instance
export const secureConfig = SecureConfig.getInstance();

// Helper functions for common configuration access
export const getSupabaseConfig = () => ({
  url: secureConfig.get('SUPABASE_URL')!,
  anonKey: secureConfig.get('SUPABASE_ANON_KEY')!
});

export const isDevelopment = () => secureConfig.isDevelopment();
export const isProduction = () => secureConfig.isProduction();