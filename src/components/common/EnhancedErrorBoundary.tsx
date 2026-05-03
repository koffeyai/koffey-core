import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, AlertTriangle, Home, Bug } from 'lucide-react';
import { logError } from '@/lib/logger';
import {
  classifyRecoverableLoadError,
  isRecoverableLoadError,
} from '@/lib/recoverableLoadErrors';
import { getSessionFreshnessSnapshot } from '@/lib/appSessionFreshness';

const IDLE_ERROR_RELOAD_KEY = 'koffey:idle-error-reload-attempted';
const ERROR_RELOAD_COOLDOWN_MS = 2 * 60 * 1000;
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@example.com';

function readSessionNumber(key: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number(window.sessionStorage.getItem(key) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function hasRecentReloadAttempt(key: string, cooldownMs = ERROR_RELOAD_COOLDOWN_MS): boolean {
  const lastAttempt = readSessionNumber(key);
  return lastAttempt > 0 && Date.now() - lastAttempt < cooldownMs;
}

function recordReloadAttempt(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // Storage can fail in private/locked-down contexts; the caller can still
    // present a manual reload action.
  }
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'component' | 'widget';
  retryable?: boolean;
  isolate?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  errorId: string;
  isRecovering: boolean;
}

export class EnhancedErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;
  private maxRetries = 3;
  private retryDelay = 1000;
  private moduleReloadKey = 'koffey:module-load-reload-attempted';
  private moduleReloadCooldownMs = ERROR_RELOAD_COOLDOWN_MS;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      errorId: '',
      isRecovering: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, level = 'component', isolate = false } = this.props;
    const { retryCount, errorId } = this.state;

    // Enhanced error logging
    logError('Error boundary caught error', {
      errorId,
      level,
      isolate,
      retryCount,
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href
    });

    this.setState({ errorInfo });

    // Call custom error handler
    if (onError) {
      onError(error, errorInfo);
    }

    // Report to error tracking service
    this.reportError(error, errorInfo, errorId);

    // Attempt one-time hard recovery for stale chunk/module errors.
    if (this.tryModuleLoadRecovery(error, errorId)) {
      return;
    }

    if (this.tryIdleRecovery(error, errorId)) {
      return;
    }

    // Auto-retry for certain types of errors
    this.scheduleAutoRetry(error);
  }

  private isModuleLoadError = (error: Error): boolean => {
    return classifyRecoverableLoadError(error) === 'module_load';
  };

  private tryModuleLoadRecovery = (error: Error, errorId: string): boolean => {
    if (typeof window === 'undefined' || !this.isModuleLoadError(error)) {
      return false;
    }

    if (hasRecentReloadAttempt(this.moduleReloadKey, this.moduleReloadCooldownMs)) {
      return false;
    }

    recordReloadAttempt(this.moduleReloadKey);
    logError('Module load error detected. Forcing one-time page reload.', {
      errorId,
      errorMessage: error.message,
      url: window.location.href
    });
    window.location.reload();
    return true;
  };

  private tryIdleRecovery = (error: Error, errorId: string): boolean => {
    if (typeof window === 'undefined' || isRecoverableLoadError(error)) {
      return false;
    }

    const freshness = getSessionFreshnessSnapshot();
    if (!freshness.isLikelyStaleTab || hasRecentReloadAttempt(IDLE_ERROR_RELOAD_KEY)) {
      return false;
    }

    recordReloadAttempt(IDLE_ERROR_RELOAD_KEY);
    logError('Error after stale tab resume. Forcing one-time page reload.', {
      errorId,
      errorMessage: error.message,
      inactiveForMs: freshness.inactiveForMs,
      resumeIdleMs: freshness.resumeIdleMs,
      url: window.location.href
    });
    window.location.reload();
    return true;
  };

  private reportError = async (error: Error, errorInfo: ErrorInfo, errorId: string) => {
    try {
      // Send to error tracking service (would be Sentry, LogRocket, etc.)
      console.error('Error Report:', {
        errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        level: this.props.level,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      });
    } catch (reportingError) {
      logError('Failed to report error', { 
        originalError: error.message,
        reportingError: (reportingError as Error).message 
      });
    }
  };

  private scheduleAutoRetry = (error: Error) => {
    const { retryable = true } = this.props;
    const { retryCount } = this.state;

    // Only retry for certain error types and within retry limit
    if (!retryable || retryCount >= this.maxRetries) {
      return;
    }

    // Check if error is retryable
    const isRetryableError = this.isRetryableError(error);
    if (!isRetryableError) {
      return;
    }

    // Schedule retry with exponential backoff
    const delay = this.retryDelay * Math.pow(2, retryCount);
    
    this.retryTimeoutId = setTimeout(() => {
      this.handleRetry();
    }, delay);
  };

  private isRetryableError = (error: Error): boolean => {
    return isRecoverableLoadError(error);
  };

  private handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
      isRecovering: true
    }));

    // Clear recovery state after a delay
    setTimeout(() => {
      this.setState({ isRecovering: false });
    }, 1000);

    logError('Error boundary retry attempt', {
      retryCount: this.state.retryCount + 1,
      errorId: this.state.errorId
    });
  };

  private handleManualRetry = () => {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
    this.handleRetry();
  };

  private handleReportBug = () => {
    const { error, errorInfo, errorId } = this.state;
    const bugReportUrl = `mailto:${SUPPORT_EMAIL}?subject=Error Report - ${errorId}&body=${encodeURIComponent(
      `Error ID: ${errorId}\n` +
      `Error: ${error?.message}\n` +
      `URL: ${window.location.href}\n` +
      `Timestamp: ${new Date().toISOString()}\n\n` +
      `Please describe what you were doing when this error occurred:\n\n`
    )}`;
    
    window.open(bugReportUrl);
  };

  private handleReload = () => {
    window.location.reload();
  };

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  render() {
    const { hasError, error, isRecovering } = this.state;
    const { children, fallback, level = 'component' } = this.props;

    if (isRecovering) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-muted-foreground">Recovering...</p>
          </div>
        </div>
      );
    }

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <ErrorFallback
          error={error}
          level={level}
          onRetry={this.handleManualRetry}
          onReload={this.handleReload}
          onReportBug={this.handleReportBug}
          canRetry={this.state.retryCount < this.maxRetries}
        />
      );
    }

    return children;
  }
}

// Error Fallback Component
interface ErrorFallbackProps {
  error: Error | null;
  level: 'page' | 'component' | 'widget';
  onRetry: () => void;
  onReload: () => void;
  onReportBug: () => void;
  canRetry: boolean;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  level,
  onRetry,
  onReload,
  onReportBug,
  canRetry
}) => {
  const recoverableKind = classifyRecoverableLoadError(error);
  const isRecoverable = recoverableKind !== 'unknown';
  const idleRecovery = !isRecoverable &&
    getSessionFreshnessSnapshot().isLikelyStaleTab &&
    !hasRecentReloadAttempt(IDLE_ERROR_RELOAD_KEY);

  const getErrorMessage = () => {
    if (isRecoverable) {
      if (recoverableKind === 'module_load') {
        return {
          title: 'App Update Needed',
          description: 'This tab was idle while the app bundle changed or the network dropped during loading. Reload the app to reconnect safely.',
          icon: <RefreshCw className="h-8 w-8 text-primary" />
        };
      }

      return {
        title: recoverableKind === 'timeout' ? 'Loading Timed Out' : 'Connection Interrupted',
        description: 'The app could not finish loading after the tab was idle. Your data is safe; retry or reload the app.',
        icon: <RefreshCw className="h-8 w-8 text-primary" />
      };
    }

    if (idleRecovery) {
      return {
        title: 'Workspace Refresh Needed',
        description: 'This tab was idle long enough that the workspace may have stale session or bundle state. Reload to reconnect safely.',
        icon: <RefreshCw className="h-8 w-8 text-primary" />
      };
    }

    switch (level) {
      case 'page':
        return {
          title: 'Page Error',
          description: 'This page encountered an error and couldn\'t load properly.',
          icon: <AlertTriangle className="h-12 w-12 text-destructive" />
        };
      case 'component':
        return {
          title: 'Component Error',
          description: 'A component on this page failed to load.',
          icon: <AlertTriangle className="h-8 w-8 text-destructive" />
        };
      case 'widget':
        return {
          title: 'Widget Error',
          description: 'This widget couldn\'t load.',
          icon: <AlertTriangle className="h-6 w-6 text-destructive" />
        };
    }
  };

  const { title, description, icon } = getErrorMessage();
  const isPageLevel = level === 'page' || isRecoverable || idleRecovery;
  const primaryAction = recoverableKind === 'module_load' || idleRecovery ? onReload : onRetry;
  const primaryLabel = recoverableKind === 'module_load'
    ? 'Reload App'
    : idleRecovery
      ? 'Reload Workspace'
      : 'Try Again';

  return (
    <Card className={`${isPageLevel ? 'max-w-lg mx-auto mt-8' : 'max-w-md mx-auto'}`}>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          {icon}
        </div>
        <CardTitle className={isPageLevel ? 'text-xl' : 'text-lg'}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-center text-muted-foreground">
          {description}
        </p>

        {process.env.NODE_ENV === 'development' && error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="font-mono text-xs">
              {error.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          {(canRetry || recoverableKind === 'module_load' || idleRecovery) && (
            <Button onClick={primaryAction} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              {primaryLabel}
            </Button>
          )}

          {isRecoverable && recoverableKind !== 'module_load' && !idleRecovery && (
            <Button variant="outline" onClick={onReload} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload App
            </Button>
          )}

          <div className="flex gap-2">
            {isPageLevel && !isRecoverable && !idleRecovery && (
              <Button 
                variant="outline" 
                onClick={() => window.location.href = '/'}
                className="flex-1"
              >
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            )}

            {!isRecoverable && !idleRecovery && (
              <Button
                variant="outline"
                onClick={onReportBug}
                className="flex-1"
              >
                <Bug className="h-4 w-4 mr-2" />
                Report Bug
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
