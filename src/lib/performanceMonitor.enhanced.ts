import { performanceMonitor } from './performanceMonitor';

interface WebVitalData {
  current: number;
  average: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

interface MemoryMetrics {
  current: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    usagePercent: number;
  };
  trend: 'improving' | 'stable' | 'degrading';
}

class EnhancedPerformanceMonitor {
  private webVitalsData: Record<string, WebVitalData> = {};

  getWebVitals() {
    const vitals = ['LCP', 'FID', 'CLS', 'TTFB'];
    const webVitals: Record<string, WebVitalData> = {};

    vitals.forEach(vital => {
      const summary = performanceMonitor.getMetricSummary(vital);
      webVitals[vital] = {
        current: summary?.average || 0, // Use average as current since there's no current field
        average: summary?.average || 0,
        rating: this.getRating(vital, summary?.average || 0)
      };
    });

    return webVitals;
  }

  getMemoryMetrics(): MemoryMetrics | null {
    if (typeof window === 'undefined' || !('performance' in window) || !('memory' in (window.performance as any))) {
      return null;
    }

    const memory = (window.performance as any).memory;
    const usagePercent = (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100;

    return {
      current: {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        usagePercent
      },
      trend: usagePercent > 80 ? 'degrading' : usagePercent < 50 ? 'improving' : 'stable'
    };
  }

  private getRating(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const thresholds = {
      LCP: { good: 2500, poor: 4000 },
      FID: { good: 100, poor: 300 },
      CLS: { good: 0.1, poor: 0.25 },
      TTFB: { good: 600, poor: 1500 }
    };

    const threshold = thresholds[metric as keyof typeof thresholds];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  }

  cleanup() {
    // Cleanup logic if needed
  }
}

export const enhancedPerformanceMonitor = new EnhancedPerformanceMonitor();