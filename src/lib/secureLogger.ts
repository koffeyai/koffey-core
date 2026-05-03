import { LogLevel } from './typeDefinitions';

// Secure logging utility with production safety
export class SecureLogger {
  private static instance: SecureLogger | null = null;
  private isDevelopment: boolean;
  private sensitiveKeys: Set<string>;
  private maxDataLength: number;

  private constructor() {
    this.isDevelopment = import.meta.env.DEV;
    this.sensitiveKeys = new Set([
      'password', 'token', 'secret', 'key', 'auth', 'credential', 
      'api_key', 'access_token', 'refresh_token', 'session_id',
      'email', 'phone', 'ssn', 'credit_card'
    ]);
    this.maxDataLength = 1000;
  }

  static getInstance(): SecureLogger {
    if (!this.instance) {
      this.instance = new SecureLogger();
    }
    return this.instance;
  }

  private sanitizeData(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    
    if (typeof data === 'string') {
      return data.length > this.maxDataLength 
        ? `${data.substring(0, this.maxDataLength)}...`
        : data;
    }

    if (Array.isArray(data)) {
      return data.slice(0, 10).map(item => this.sanitizeData(item));
    }

    if (typeof data === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (this.sensitiveKeys.has(lowerKey)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeData(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const sanitizedData = data ? this.sanitizeData(data) : '';
    
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${
      sanitizedData ? ` | Data: ${JSON.stringify(sanitizedData)}` : ''
    }`;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.isDevelopment && level === 'debug') return false;
    return true;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      // Only log in development
      if (this.isDevelopment) {
        console.debug(this.formatMessage('debug', message, data));
      }
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data));
    }
  }

  // Specialized logging methods
  logApiResponse(endpoint: string, response: unknown, level: LogLevel = 'info'): void {
    const safeResponse = {
      status: (response as { status?: number })?.status,
      success: (response as { success?: boolean })?.success,
      dataSize: Array.isArray((response as { data?: unknown[] })?.data) 
        ? (response as { data: unknown[] }).data.length 
        : 'N/A'
    };
    
    this[level](`API Response: ${endpoint}`, safeResponse);
  }

  logUserAction(action: string, userId?: string, metadata?: Record<string, unknown>): void {
    const sanitizedMetadata = metadata ? this.sanitizeData(metadata) as Record<string, unknown> : {};
    this.info(`User Action: ${action}`, {
      userId: userId ? `user_${userId.slice(-8)}` : 'anonymous',
      ...(typeof sanitizedMetadata === 'object' && sanitizedMetadata !== null ? sanitizedMetadata : {})
    });
  }

  logSecurity(event: string, details?: Record<string, unknown>): void {
    this.warn(`Security Event: ${event}`, this.sanitizeData(details));
  }

  logPerformance(operation: string, duration: number, metadata?: Record<string, unknown>): void {
    const sanitizedMetadata = metadata ? this.sanitizeData(metadata) as Record<string, unknown> : {};
    this.info(`Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...(typeof sanitizedMetadata === 'object' && sanitizedMetadata !== null ? sanitizedMetadata : {})
    });
  }
}

// Export singleton instance
export const logger = SecureLogger.getInstance();

// Convenience exports
export const logAuth = (message: string, data?: unknown) => logger.info(`Auth: ${message}`, data);
export const logApi = (message: string, data?: unknown) => logger.info(`API: ${message}`, data);
export const logError = (message: string, error?: unknown) => logger.error(message, error);
export const logDebug = (message: string, data?: unknown) => logger.debug(message, data);
export const logSecurity = (message: string, data?: Record<string, unknown>) => 
  logger.logSecurity(message, data || {});
export const logPerformance = (operation: string, duration: number, metadata?: Record<string, unknown>) => 
  logger.logPerformance(operation, duration, metadata || {});

export default logger;