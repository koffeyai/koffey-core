import React from 'react';
import { logInfo, logError } from '@/lib/logger';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
}

interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
}

interface PerformanceAlert {
  id: string;
  metric: string;
  level: 'warning' | 'critical';
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private thresholds: Map<string, PerformanceThreshold> = new Map();
  private alerts: PerformanceAlert[] = [];
  private observers: PerformanceObserver[] = [];

  constructor() {
    this.setupThresholds();
    this.initializeObservers();
    this.startPeriodicCollection();
  }

  private setupThresholds(): void {
    const defaultThresholds: PerformanceThreshold[] = [
      { metric: 'LCP', warning: 2500, critical: 4000, unit: 'ms' },
      { metric: 'FID', warning: 100, critical: 300, unit: 'ms' },
      { metric: 'CLS', warning: 0.1, critical: 0.25, unit: 'score' },
      { metric: 'TTFB', warning: 600, critical: 1000, unit: 'ms' },
      { metric: 'bundle_size', warning: 2000, critical: 3000, unit: 'KB' },
      { metric: 'memory_usage', warning: 50, critical: 80, unit: 'MB' },
      { metric: 'api_response_time', warning: 500, critical: 1000, unit: 'ms' },
      { metric: 'error_rate', warning: 1, critical: 5, unit: '%' }
    ];

    defaultThresholds.forEach(threshold => {
      this.thresholds.set(threshold.metric, threshold);
    });
  }

  private initializeObservers(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.recordMetric('LCP', lastEntry.startTime, 'ms', { type: 'web_vital' });
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          this.recordMetric('FID', entry.processingStart - entry.startTime, 'ms', { type: 'web_vital' });
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
      this.observers.push(fidObserver);

      // Cumulative Layout Shift
      const clsObserver = new PerformanceObserver((list) => {
        let cls = 0;
        list.getEntries().forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            cls += entry.value;
          }
        });
        this.recordMetric('CLS', cls, 'score', { type: 'web_vital' });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);

      // Navigation Timing
      const navigationObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          this.recordMetric('TTFB', entry.responseStart - entry.requestStart, 'ms', { type: 'navigation' });
          this.recordMetric('DOM_load', entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart, 'ms', { type: 'navigation' });
        });
      });
      navigationObserver.observe({ entryTypes: ['navigation'] });
      this.observers.push(navigationObserver);

      // Resource Timing
      const resourceObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          if (entry.name.includes('bundle') || entry.name.includes('.js')) {
            this.recordMetric('bundle_size', entry.transferSize / 1024, 'KB', { 
              type: 'resource',
              resource: entry.name 
            });
          }
          
          this.recordMetric('resource_load_time', entry.duration, 'ms', {
            type: 'resource',
            resource: entry.name,
            resource_type: this.getResourceType(entry.name)
          });
        });
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.push(resourceObserver);
    } catch (error) {
      logError('Failed to initialize performance observers', { error });
    }
  }

  private startPeriodicCollection(): void {
    // Collect memory usage
    setInterval(() => {
      if (typeof window !== 'undefined' && 'memory' in performance) {
        const memory = (performance as any).memory;
        this.recordMetric('memory_usage', memory.usedJSHeapSize / (1024 * 1024), 'MB', { type: 'memory' });
        this.recordMetric('memory_total', memory.totalJSHeapSize / (1024 * 1024), 'MB', { type: 'memory' });
      }
    }, 30000);

    // Collect error rates
    setInterval(() => {
      const recentErrors = this.metrics.filter(m => 
        m.name === 'error' && 
        Date.now() - m.timestamp.getTime() < 60000
      ).length;
      
      const recentRequests = this.metrics.filter(m => 
        m.name === 'api_request' && 
        Date.now() - m.timestamp.getTime() < 60000
      ).length;

      if (recentRequests > 0) {
        const errorRate = (recentErrors / recentRequests) * 100;
        this.recordMetric('error_rate', errorRate, '%', { type: 'calculated' });
      }
    }, 60000);
  }

  recordMetric(name: string, value: number, unit: string, tags: Record<string, string> = {}): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags
    };

    this.metrics.push(metric);

    // Keep only recent metrics (last hour)
    const hourAgo = Date.now() - 60 * 60 * 1000;
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > hourAgo);

    // Check thresholds
    this.checkThresholds(metric);

    // Log significant metrics
    if (this.isSignificantMetric(name)) {
      logInfo('Performance metric recorded', { metric: name, value, unit, tags });
    }
  }

  recordAPICall(endpoint: string, duration: number, success: boolean): void {
    this.recordMetric('api_response_time', duration, 'ms', {
      type: 'api',
      endpoint,
      success: success.toString()
    });

    this.recordMetric('api_request', 1, 'count', {
      type: 'api',
      endpoint,
      success: success.toString()
    });

    if (!success) {
      this.recordMetric('error', 1, 'count', {
        type: 'api',
        endpoint
      });
    }
  }

  recordError(error: Error, context: Record<string, any> = {}): void {
    this.recordMetric('error', 1, 'count', {
      type: 'error',
      message: error.message.substring(0, 100),
      ...context
    });

    logError('Performance error recorded', {
      error: error.message,
      stack: error.stack,
      context
    });
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.thresholds.get(metric.name);
    if (!threshold) return;

    let alertLevel: 'warning' | 'critical' | null = null;
    let thresholdValue = 0;

    if (metric.value >= threshold.critical) {
      alertLevel = 'critical';
      thresholdValue = threshold.critical;
    } else if (metric.value >= threshold.warning) {
      alertLevel = 'warning';
      thresholdValue = threshold.warning;
    }

    if (alertLevel) {
      this.createAlert(metric, alertLevel, thresholdValue);
    }
  }

  private createAlert(metric: PerformanceMetric, level: 'warning' | 'critical', threshold: number): void {
    const alertId = `${metric.name}_${Date.now()}`;
    const alert: PerformanceAlert = {
      id: alertId,
      metric: metric.name,
      level,
      value: metric.value,
      threshold,
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.push(alert);

    // Emit alert event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('performanceAlert', {
        detail: alert
      }));
    }

    logError('Performance threshold exceeded', {
      metric: metric.name,
      value: metric.value,
      threshold,
      level,
      unit: metric.unit
    });

    // Auto-resolve after 5 minutes if metric improves
    setTimeout(() => {
      this.checkAlertResolution(alertId);
    }, 5 * 60 * 1000);
  }

  private checkAlertResolution(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId && !a.resolved);
    if (!alert) return;

    // Check if recent metrics are below threshold
    const recentMetrics = this.metrics
      .filter(m => 
        m.name === alert.metric && 
        m.timestamp.getTime() > Date.now() - 2 * 60 * 1000
      )
      .slice(-5);

    if (recentMetrics.length > 0) {
      const avgValue = recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;
      
      if (avgValue < alert.threshold) {
        alert.resolved = true;
        
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('performanceAlertResolved', {
            detail: alert
          }));
        }

        logInfo('Performance alert resolved', {
          alertId,
          metric: alert.metric,
          previousValue: alert.value,
          currentAverage: avgValue
        });
      }
    }
  }

  private isSignificantMetric(name: string): boolean {
    const significantMetrics = ['LCP', 'FID', 'CLS', 'api_response_time', 'error_rate'];
    return significantMetrics.includes(name);
  }

  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'style';
    if (url.includes('.png') || url.includes('.jpg') || url.includes('.svg')) return 'image';
    if (url.includes('.woff') || url.includes('.ttf')) return 'font';
    return 'other';
  }

  getMetricSummary(metricName: string, timeRange: number = 60 * 60 * 1000): {
    average: number;
    min: number;
    max: number;
    count: number;
    trend: 'improving' | 'degrading' | 'stable';
  } | null {
    const cutoff = Date.now() - timeRange;
    const metrics = this.metrics.filter(m =>
      m.name === metricName && m.timestamp.getTime() > cutoff
    );

    if (metrics.length === 0) return null;

    const values = metrics.map(m => m.value);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate trend
    const firstHalf = metrics.slice(0, Math.floor(metrics.length / 2));
    const secondHalf = metrics.slice(Math.floor(metrics.length / 2));

    const firstAvg = firstHalf.reduce((sum, m) => sum + m.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, m) => sum + m.value, 0) / secondHalf.length;

    const trendThreshold = average * 0.1;
    let trend: 'improving' | 'degrading' | 'stable' = 'stable';

    if (secondAvg < firstAvg - trendThreshold) {
      trend = 'improving';
    } else if (secondAvg > firstAvg + trendThreshold) {
      trend = 'degrading';
    }

    return {
      average: Math.round(average * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      count: metrics.length,
      trend
    };
  }

  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  getAllMetrics(timeRange: number = 60 * 60 * 1000): PerformanceMetric[] {
    const cutoff = Date.now() - timeRange;
    return this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  exportMetrics(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      alerts: this.alerts,
      thresholds: Array.from(this.thresholds.entries())
    };
    return JSON.stringify(exportData, null, 2);
  }

  cleanup(): void {
    this.observers.forEach(observer => {
      observer.disconnect();
    });
    this.observers = [];
    this.metrics = [];
    this.alerts = [];
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// React hook for performance monitoring
export const usePerformanceMonitoring = () => {
  const [alerts, setAlerts] = React.useState<PerformanceAlert[]>([]);
  const [metrics, setMetrics] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    const handleAlert = (event: CustomEvent) => {
      setAlerts(prev => [...prev, event.detail]);
    };

    const handleAlertResolved = (event: CustomEvent) => {
      setAlerts(prev => prev.filter(a => a.id !== event.detail.id));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('performanceAlert', handleAlert as EventListener);
      window.addEventListener('performanceAlertResolved', handleAlertResolved as EventListener);
    }

    // Update metrics every 30 seconds
    const interval = setInterval(() => {
      const webVitals = {
        LCP: performanceMonitor.getMetricSummary('LCP'),
        FID: performanceMonitor.getMetricSummary('FID'),
        CLS: performanceMonitor.getMetricSummary('CLS'),
        memoryUsage: performanceMonitor.getMetricSummary('memory_usage'),
        errorRate: performanceMonitor.getMetricSummary('error_rate')
      };

      setMetrics(webVitals);
    }, 30000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('performanceAlert', handleAlert as EventListener);
        window.removeEventListener('performanceAlertResolved', handleAlertResolved as EventListener);
      }
      clearInterval(interval);
    };
  }, []);

  return {
    alerts,
    metrics,
    recordMetric: performanceMonitor.recordMetric.bind(performanceMonitor),
    recordAPICall: performanceMonitor.recordAPICall.bind(performanceMonitor),
    recordError: performanceMonitor.recordError.bind(performanceMonitor)
  };
};
