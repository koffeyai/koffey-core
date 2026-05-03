/**
 * Behavioral Tracking System for UX Optimization
 * Tracks user patterns to optimize rate limiting and batch operations
 */

interface UserBehaviorMetrics {
  consecutiveActions: number;
  timeBetweenActions: number[];
  batchSizePreference: number[];
  contextSwitchPoints: string[];
  frustrationSignals: number;
  lastActionTime: number;
  actionVelocity: number;
}

interface OperationContext {
  inCall?: boolean;
  isDemoMode?: boolean;
  isEndOfQuarter?: boolean;
  module: string;
  action: string;
}

class CircularBuffer<T> {
  private buffer: T[] = [];
  private maxSize: number;
  private pointer = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    if (this.buffer.length < this.maxSize) {
      this.buffer.push(item);
    } else {
      this.buffer[this.pointer] = item;
      this.pointer = (this.pointer + 1) % this.maxSize;
    }
  }

  getAll(): T[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
    this.pointer = 0;
  }

  size(): number {
    return this.buffer.length;
  }
}

class BehaviorTracker {
  private userMetrics = new Map<string, UserBehaviorMetrics>();
  private actionBuffer = new CircularBuffer<{ timestamp: number; action: string; context: OperationContext }>(100);
  private contextSwitchThreshold = 5000; // 5 seconds

  public trackAction(userId: string, action: string, context: OperationContext): void {
    const now = Date.now();
    this.actionBuffer.push({ timestamp: now, action, context });

    let metrics = this.userMetrics.get(userId);
    if (!metrics) {
      metrics = {
        consecutiveActions: 0,
        timeBetweenActions: [],
        batchSizePreference: [],
        contextSwitchPoints: [],
        frustrationSignals: 0,
        lastActionTime: now,
        actionVelocity: 0
      };
      this.userMetrics.set(userId, metrics);
    }

    // Track time between actions
    if (metrics.lastActionTime > 0) {
      const timeDiff = now - metrics.lastActionTime;
      metrics.timeBetweenActions.push(timeDiff);
      
      // Keep only last 20 measurements
      if (metrics.timeBetweenActions.length > 20) {
        metrics.timeBetweenActions.shift();
      }

      // Calculate velocity (actions per minute)
      const recentActions = this.actionBuffer.getAll().filter(a => now - a.timestamp < 60000);
      metrics.actionVelocity = recentActions.length;

      // Detect context switches
      if (timeDiff > this.contextSwitchThreshold) {
        metrics.contextSwitchPoints.push(context.module);
      }

      // Detect frustration signals (rapid retries)
      if (timeDiff < 500) {
        metrics.frustrationSignals++;
      } else if (timeDiff > 10000) {
        // Reset frustration if user takes a break
        metrics.frustrationSignals = Math.max(0, metrics.frustrationSignals - 1);
      }
    }

    metrics.consecutiveActions++;
    metrics.lastActionTime = now;

    // Auto-reset consecutive actions after break
    if (now - metrics.lastActionTime > 30000) {
      metrics.consecutiveActions = 1;
    }
  }

  public trackBatchOperation(userId: string, batchSize: number): void {
    const metrics = this.userMetrics.get(userId);
    if (metrics) {
      metrics.batchSizePreference.push(batchSize);
      
      // Keep only last 10 batch sizes
      if (metrics.batchSizePreference.length > 10) {
        metrics.batchSizePreference.shift();
      }
    }
  }

  public getBatchThreshold(userId: string, userRole: string, context: OperationContext): number {
    const metrics = this.userMetrics.get(userId);
    
    // Role-aware thresholds
    if (userRole === 'sdr' && context.inCall) return 50;
    if (userRole === 'operations') return 10;
    if (context.isDemoMode) return 100;
    
    // Adaptive threshold based on user behavior
    if (metrics?.batchSizePreference.length > 0) {
      const avgBatchSize = metrics.batchSizePreference.reduce((a, b) => a + b, 0) / metrics.batchSizePreference.length;
      return Math.max(10, Math.min(avgBatchSize, 50));
    }

    return 20; // default
  }

  public getActionVelocity(userId: string): number {
    return this.userMetrics.get(userId)?.actionVelocity || 0;
  }

  public getFrustrationLevel(userId: string): 'low' | 'medium' | 'high' {
    const metrics = this.userMetrics.get(userId);
    if (!metrics) return 'low';

    if (metrics.frustrationSignals > 5) return 'high';
    if (metrics.frustrationSignals > 2) return 'medium';
    return 'low';
  }

  public getSuggestion(userId: string): string | null {
    const metrics = this.userMetrics.get(userId);
    if (!metrics) return null;

    if (metrics.actionVelocity > 10) {
      return "Pro tip: Select all items and use bulk operations";
    }

    if (metrics.frustrationSignals > 3) {
      return "Try Cmd+Click to select multiple items at once";
    }

    if (metrics.consecutiveActions > 15) {
      return "Consider using batch mode for faster processing";
    }

    return null;
  }

  public predictCollision(userId: string, maxActionsPerMinute: number): { willHit: boolean; inSeconds: number } {
    const velocity = this.getActionVelocity(userId);
    
    if (velocity === 0) return { willHit: false, inSeconds: Infinity };
    
    const remaining = maxActionsPerMinute - velocity;
    const secondsToLimit = (remaining / velocity) * 60;
    
    return {
      willHit: secondsToLimit < 60,
      inSeconds: Math.max(0, secondsToLimit)
    };
  }

  public clearUserData(userId: string): void {
    this.userMetrics.delete(userId);
  }

  public getMetrics(userId: string): UserBehaviorMetrics | undefined {
    return this.userMetrics.get(userId);
  }
}

export const behaviorTracker = new BehaviorTracker();
export type { UserBehaviorMetrics, OperationContext };
