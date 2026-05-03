import { logError, logInfo } from './logger';

// Circuit breaker for fault tolerance

interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAttempt: number;
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;
  private name: string;

  constructor(
    name: string, 
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.name = name;
    this.config = {
      failureThreshold: 5,
      timeout: 60000, // 1 minute
      resetTimeout: 30000, // 30 seconds
      monitoringPeriod: 60000, // 1 minute
      ...config
    };

    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      nextAttempt: 0
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (Date.now() < this.state.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      } else {
        this.state.state = 'HALF_OPEN';
        logInfo('Circuit breaker transitioning to HALF_OPEN', { name: this.name });
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.state.failures = 0;
    
    if (this.state.state === 'HALF_OPEN') {
      this.state.state = 'CLOSED';
      logInfo('Circuit breaker reset to CLOSED', { name: this.name });
    }
  }

  private onFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    logError('Circuit breaker failure recorded', {
      name: this.name,
      failures: this.state.failures,
      threshold: this.config.failureThreshold
    });

    if (this.state.failures >= this.config.failureThreshold) {
      this.state.state = 'OPEN';
      this.state.nextAttempt = Date.now() + this.config.resetTimeout;
      
      logError('Circuit breaker opened', {
        name: this.name,
        failures: this.state.failures,
        nextAttempt: new Date(this.state.nextAttempt).toISOString()
      });
    }
  }

  getState(): { state: string; failures: number; isAvailable: boolean } {
    return {
      state: this.state.state,
      failures: this.state.failures,
      isAvailable: this.state.state !== 'OPEN' || Date.now() >= this.state.nextAttempt
    };
  }

  reset(): void {
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      nextAttempt: 0
    };
    
    logInfo('Circuit breaker manually reset', { name: this.name });
  }
}

// Circuit breaker instances for different services
export const circuitBreakers = {
  database: new CircuitBreaker('database', {
    failureThreshold: 3,
    timeout: 30000,
    resetTimeout: 60000
  }),
  
  api: new CircuitBreaker('api', {
    failureThreshold: 5,
    timeout: 60000,
    resetTimeout: 30000
  }),
  
  ai: new CircuitBreaker('ai', {
    failureThreshold: 2,
    timeout: 120000,
    resetTimeout: 60000
  })
};

// Enhanced error boundary wrapper with circuit breaker integration
export const withCircuitBreaker = <T extends any[]>(
  fn: (...args: T) => Promise<any>,
  circuitBreaker: CircuitBreaker
) => {
  return async (...args: T) => {
    return circuitBreaker.execute(() => fn(...args));
  };
};