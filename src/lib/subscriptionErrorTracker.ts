class SubscriptionErrorTracker {
  private static instance: SubscriptionErrorTracker;
  private errors: Array<{
    timestamp: number;
    error: string;
    stack?: string;
    component?: string;
  }> = [];

  static getInstance(): SubscriptionErrorTracker {
    if (!SubscriptionErrorTracker.instance) {
      SubscriptionErrorTracker.instance = new SubscriptionErrorTracker();
    }
    return SubscriptionErrorTracker.instance;
  }

  trackError(error: Error | string, component?: string) {
    const errorEntry = {
      timestamp: Date.now(),
      error: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      component
    };

    this.errors.push(errorEntry);

    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }

    // If subscription error, flag for cache clearing
    if (errorEntry.error.includes('subscribe multiple times')) {
      sessionStorage.setItem('subscription_errors', 'true');
      console.error('🚨 Subscription error detected:', errorEntry);
    }

    console.error('📝 Error tracked:', errorEntry);
  }

  getErrors() {
    return [...this.errors];
  }

  clearErrors() {
    this.errors = [];
    sessionStorage.removeItem('subscription_errors');
  }

  hasSubscriptionErrors() {
    return this.errors.some(error => 
      error.error.includes('subscribe multiple times') ||
      error.error.includes('subscription') ||
      error.error.includes('channel')
    );
  }
}

export const subscriptionErrorTracker = SubscriptionErrorTracker.getInstance();

// Global error handler for subscription issues
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    subscriptionErrorTracker.trackError(event.error, 'global');
  });

  window.addEventListener('unhandledrejection', (event) => {
    subscriptionErrorTracker.trackError(
      new Error(event.reason), 
      'unhandledPromise'
    );
  });
}
