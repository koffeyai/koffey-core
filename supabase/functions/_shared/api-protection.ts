/**
 * Comprehensive API overload protection system
 * Prevents 500 errors during high load periods
 */

interface RequestMetrics {
  requestCount: number;
  errorCount: number;
  lastReset: number;
  blockedUntil?: number;
}

interface ConnectionPool {
  active: number;
  queued: number;
  maxActive: number;
  maxQueued: number;
}

class APIProtectionManager {
  private metrics = new Map<string, RequestMetrics>();
  private globalMetrics: RequestMetrics = {
    requestCount: 0,
    errorCount: 0,
    lastReset: Date.now()
  };
  
  private connectionPool: ConnectionPool = {
    active: 0,
    queued: 0,
    maxActive: 50,
    maxQueued: 100
  };

  // Rate limiting configuration
  private readonly WINDOW_MS = 60000; // 1 minute window
  private readonly MAX_REQUESTS_PER_IP = 60;
  private readonly MAX_GLOBAL_REQUESTS = 1000;
  private readonly ERROR_THRESHOLD = 0.5; // 50% error rate triggers protection
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds

  /**
   * Check if request should be allowed based on rate limits and system health
   */
  async checkRequest(clientIP: string): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    const now = Date.now();
    
    // Reset metrics if window expired
    this.resetExpiredMetrics(now);
    
    // Check global system overload
    if (this.isSystemOverloaded()) {
      return { 
        allowed: false, 
        reason: 'System temporarily overloaded', 
        retryAfter: 30 
      };
    }
    
    // Check connection pool limits
    if (this.connectionPool.active >= this.connectionPool.maxActive) {
      if (this.connectionPool.queued >= this.connectionPool.maxQueued) {
        return { 
          allowed: false, 
          reason: 'Too many concurrent requests', 
          retryAfter: 10 
        };
      }
      // Queue the request
      this.connectionPool.queued++;
    }
    
    // Check per-IP rate limits
    const ipMetrics = this.getOrCreateMetrics(clientIP);
    if (ipMetrics.blockedUntil && now < ipMetrics.blockedUntil) {
      return { 
        allowed: false, 
        reason: 'Rate limit exceeded', 
        retryAfter: Math.ceil((ipMetrics.blockedUntil - now) / 1000) 
      };
    }
    
    if (ipMetrics.requestCount >= this.MAX_REQUESTS_PER_IP) {
      // Block IP for circuit breaker timeout
      ipMetrics.blockedUntil = now + this.CIRCUIT_BREAKER_TIMEOUT;
      return { 
        allowed: false, 
        reason: 'Rate limit exceeded', 
        retryAfter: 30 
      };
    }
    
    // Allow request and increment counters
    ipMetrics.requestCount++;
    this.globalMetrics.requestCount++;
    this.connectionPool.active++;
    
    return { allowed: true };
  }

  /**
   * Record request completion (success or error)
   */
  recordRequestComplete(clientIP: string, isError: boolean): void {
    this.connectionPool.active = Math.max(0, this.connectionPool.active - 1);
    this.connectionPool.queued = Math.max(0, this.connectionPool.queued - 1);
    
    if (isError) {
      const ipMetrics = this.getOrCreateMetrics(clientIP);
      ipMetrics.errorCount++;
      this.globalMetrics.errorCount++;
    }
  }

  /**
   * Check if system is overloaded based on error rates
   */
  private isSystemOverloaded(): boolean {
    if (this.globalMetrics.requestCount === 0) return false;
    
    const errorRate = this.globalMetrics.errorCount / this.globalMetrics.requestCount;
    return errorRate > this.ERROR_THRESHOLD && this.globalMetrics.requestCount > 10;
  }

  /**
   * Get or create metrics for IP address
   */
  private getOrCreateMetrics(ip: string): RequestMetrics {
    if (!this.metrics.has(ip)) {
      this.metrics.set(ip, {
        requestCount: 0,
        errorCount: 0,
        lastReset: Date.now()
      });
    }
    return this.metrics.get(ip)!;
  }

  /**
   * Reset metrics for expired windows
   */
  private resetExpiredMetrics(now: number): void {
    // Reset global metrics
    if (now - this.globalMetrics.lastReset > this.WINDOW_MS) {
      this.globalMetrics = {
        requestCount: 0,
        errorCount: 0,
        lastReset: now
      };
    }
    
    // Reset IP metrics
    for (const [ip, metrics] of this.metrics.entries()) {
      if (now - metrics.lastReset > this.WINDOW_MS) {
        this.metrics.set(ip, {
          requestCount: 0,
          errorCount: 0,
          lastReset: now
        });
      }
    }
  }

  /**
   * Get current system status for monitoring
   */
  getSystemStatus() {
    const now = Date.now();
    const errorRate = this.globalMetrics.requestCount > 0 
      ? this.globalMetrics.errorCount / this.globalMetrics.requestCount 
      : 0;
    
    return {
      requestsPerMinute: this.globalMetrics.requestCount,
      errorRate: Math.round(errorRate * 100),
      activeConnections: this.connectionPool.active,
      queuedConnections: this.connectionPool.queued,
      systemOverloaded: this.isSystemOverloaded(),
      timestamp: now
    };
  }
}

// Global singleton instance
const apiProtection = new APIProtectionManager();

/**
 * Middleware function to wrap API handlers with protection
 */
export function withAPIProtection(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const clientIP = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    // Check if request should be allowed
    const { allowed, reason, retryAfter } = await apiProtection.checkRequest(clientIP);
    
    if (!allowed) {
      const response = new Response(
        JSON.stringify({
          error: reason || 'Request blocked',
          code: 'TOO_MANY_REQUESTS',
          retryAfter
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter?.toString() || '30',
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '0'
          }
        }
      );
      
      apiProtection.recordRequestComplete(clientIP, false);
      return response;
    }

    // Execute the handler with timeout protection
    try {
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 30000); // 30s timeout
      });
      
      const handlerPromise = handler(req);
      const response = await Promise.race([handlerPromise, timeoutPromise]);
      
      // Record successful completion
      apiProtection.recordRequestComplete(clientIP, false);
      
      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', '60');
      response.headers.set('X-RateLimit-Window', '60');
      
      return response;
      
    } catch (error) {
      // Record error and return graceful degradation response
      apiProtection.recordRequestComplete(clientIP, true);
      
      console.error('API handler error:', error);
      
      return new Response(
        JSON.stringify({
          error: 'Service temporarily unavailable',
          code: 'SERVICE_OVERLOADED',
          message: 'Please try again in a few moments',
          retryAfter: 10
        }),
        {
          status: 503, // Service Unavailable instead of 500
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '10'
          }
        }
      );
    }
  };
}

/**
 * Get system status for health checks
 */
export function getAPIProtectionStatus() {
  return apiProtection.getSystemStatus();
}

export { APIProtectionManager };