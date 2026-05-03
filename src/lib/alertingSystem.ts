interface Alert {
  id: string;
  type: 'performance' | 'security' | 'business' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

class AlertingSystem {
  private alerts: Alert[] = [];
  private listeners: Set<(alerts: Alert[]) => void> = new Set();

  createAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'resolved'>) {
    const newAlert: Alert = {
      ...alert,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.push(newAlert);
    this.notifyListeners();
    return newAlert;
  }

  resolveAlert(id: string) {
    const alert = this.alerts.find(a => a.id === id);
    if (alert) {
      alert.resolved = true;
      this.notifyListeners();
    }
  }

  getActiveAlerts() {
    return this.alerts.filter(a => !a.resolved);
  }

  getAllAlerts() {
    return [...this.alerts];
  }

  subscribe(callback: (alerts: Alert[]) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getActiveAlerts()));
  }
}

export const alertingSystem = new AlertingSystem();