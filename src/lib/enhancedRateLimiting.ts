/**
 * Enhanced Rate Limiting with UX Optimization
 * Provides intelligent rate limiting with predictive warnings and bypass mechanisms
 */

import { supabase } from '@/integrations/supabase/client';
import { behaviorTracker, type OperationContext } from './behaviorTracker';
import { useAuth } from '@/components/auth/AuthProvider';

interface RateLimitStatus {
  allowed: boolean;
  current: number;
  max: number;
  percentage: number;
  retryAfter?: number;
  suggestion?: string;
  willHitLimit?: boolean;
  timeToLimit?: number;
}

interface BypassRequest {
  userId: string;
  reason: string;
  context: OperationContext;
  duration: number;
}

class EnhancedRateLimitManager {
  private limits = new Map<string, { count: number; resetTime: number; bypassUntil?: number }>();
  private readonly windowMs = 60 * 1000; // 1 minute window
  private readonly defaultLimit = 60; // 60 actions per minute

  public async checkRateLimit(
    userId: string, 
    operation: string, 
    context: OperationContext
  ): Promise<RateLimitStatus> {
    const key = `${userId}:${operation}`;
    const now = Date.now();
    
    // Check for active bypass
    const limitData = this.limits.get(key);
    if (limitData?.bypassUntil && now < limitData.bypassUntil) {
      return {
        allowed: true,
        current: 0,
        max: 999,
        percentage: 0,
        suggestion: "Bypass active - you're all set!"
      };
    }

    // Initialize or reset if window expired
    if (!limitData || now > limitData.resetTime) {
      this.limits.set(key, {
        count: 0,
        resetTime: now + this.windowMs
      });
    }

    const current = this.limits.get(key)!;
    const limit = this.getLimit(userId, operation, context);
    
    // Check if limit exceeded
    if (current.count >= limit) {
      const retryAfter = current.resetTime - now;
      return {
        allowed: false,
        current: current.count,
        max: limit,
        percentage: 100,
        retryAfter,
        suggestion: "You're moving fast! Let's optimize this workflow."
      };
    }

    // Increment counter
    current.count++;
    
    const percentage = (current.count / limit) * 100;
    const prediction = behaviorTracker.predictCollision(userId, limit);
    
    return {
      allowed: true,
      current: current.count,
      max: limit,
      percentage,
      suggestion: behaviorTracker.getSuggestion(userId),
      willHitLimit: prediction.willHit,
      timeToLimit: prediction.inSeconds
    };
  }

  public async requestBypass(
    userId: string,
    reason: string,
    context: OperationContext
  ): Promise<{ approved: boolean; duration?: number; message: string }> {
    // Auto-approval logic
    const shouldAutoApprove = this.shouldAutoApprove({ userId, reason, context, duration: 0 });
    
    if (shouldAutoApprove) {
      const duration = this.getBypassDuration(context);
      await this.grantBypass(userId, duration);
      
      return {
        approved: true,
        duration,
        message: "Bypass approved automatically. You're all set!"
      };
    }

    // Store bypass request for admin review
    await this.storeBypassRequest({ userId, reason, context, duration: 0 });
    
    return {
      approved: false,
      message: "Bypass request submitted for review. You'll be notified when approved."
    };
  }

  private async grantBypass(userId: string, durationMs: number): Promise<void> {
    const now = Date.now();
    const bypassUntil = now + durationMs;
    
    // Grant bypass for all operations
    for (const [key, limit] of this.limits.entries()) {
      if (key.startsWith(`${userId}:`)) {
        limit.bypassUntil = bypassUntil;
      }
    }
  }

  private shouldAutoApprove(request: BypassRequest): boolean {
    // During business hours + demo accounts
    if (request.context.isDemoMode && this.isBusinessHours()) return true;
    
    // Operations during end-of-quarter
    if (request.context.isEndOfQuarter) return true;
    
    // Users with low bypass history (good citizens)
    // This would check a database in real implementation
    return false;
  }

  private getBypassDuration(context: OperationContext): number {
    if (context.isDemoMode) return 2 * 60 * 60 * 1000; // 2 hours
    if (context.isEndOfQuarter) return 30 * 60 * 1000; // 30 minutes
    return 15 * 60 * 1000; // 15 minutes default
  }

  private async storeBypassRequest(request: BypassRequest): Promise<void> {
    // In a real implementation, this would store in the database
    console.log('Bypass request stored:', request);
  }

  private getLimit(userId: string, operation: string, context: OperationContext): number {
    // Higher limits for batch operations
    if (operation === 'batch') return 10;
    
    // Demo mode gets higher limits
    if (context.isDemoMode) return 120;
    
    return this.defaultLimit;
  }

  private isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // 9 AM to 6 PM, Monday to Friday
    return day >= 1 && day <= 5 && hour >= 9 && hour <= 18;
  }

  public getRemainingActions(userId: string, operation: string): number {
    const key = `${userId}:${operation}`;
    const limitData = this.limits.get(key);
    
    if (!limitData) return this.defaultLimit;
    
    const limit = this.defaultLimit; // Simplified for demo
    return Math.max(0, limit - limitData.count);
  }
}

export const rateLimitManager = new EnhancedRateLimitManager();
export type { RateLimitStatus, OperationContext };