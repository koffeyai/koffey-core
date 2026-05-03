import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { enhancedPerformanceMonitor } from '@/lib/performanceMonitor.enhanced';
import { alertingSystem } from '@/lib/alertingSystem';

interface PerformanceState {
  // Metrics
  webVitals: Record<string, {
    current: number;
    average: number;
    rating: 'good' | 'needs-improvement' | 'poor';
  }>;
  
  // Alerts
  alerts: any[];
  
  // Monitoring
  isMonitoring: boolean;
  
  // Actions
  actions: {
    startMonitoring: () => void;
    stopMonitoring: () => void;
    updateWebVitals: (vitals: any) => void;
    addAlert: (alert: any) => void;
    dismissAlert: (id: string) => void;
    exportMetrics: () => any;
  };
}

export const usePerformanceStore = create<PerformanceState>()(
  devtools(
    (set, get) => ({
      webVitals: {},
      alerts: [],
      isMonitoring: false,
      
      actions: {
        startMonitoring: () => {
          // Enhanced monitoring is already initialized
          set({ isMonitoring: true });
          
          // Setup real-time updates
          const handleWebVital = () => {
            get().actions.updateWebVitals(enhancedPerformanceMonitor.getWebVitals());
          };
          
          window.addEventListener('webVitalCaptured', handleWebVital);
          
          // Initial load
          get().actions.updateWebVitals(enhancedPerformanceMonitor.getWebVitals());
        },
        
        stopMonitoring: () => {
          enhancedPerformanceMonitor.cleanup();
          set({ isMonitoring: false });
        },
        
        updateWebVitals: (vitals) => {
          set({ webVitals: vitals });
        },
        
        addAlert: (alert) => {
          set(state => ({
            alerts: [...state.alerts, { ...alert, id: Date.now().toString() }]
          }));
        },
        
        dismissAlert: (id) => {
          set(state => ({
            alerts: state.alerts.filter(a => a.id !== id)
          }));
        },
        
        exportMetrics: () => {
          return {
            webVitals: get().webVitals,
            alerts: get().alerts,
            timestamp: new Date().toISOString()
          };
        }
      }
    })
  )
);