
import React from 'react';
import { AlertCircle, RefreshCw, ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logError } from '@/lib/logger';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorType: 'critical' | 'subscription' | 'network' | 'unknown';
  retryCount: number;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

class EnhancedErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeouts: NodeJS.Timeout[] = [];
  private maxRetries = 3;
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorType: 'unknown',
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Categorize the error type
    let errorType: 'critical' | 'subscription' | 'unknown' = 'unknown';
    
    if (error.message?.includes('subscribe multiple times') || 
        error.message?.includes('subscription') ||
        error.message?.includes('realtime') ||
        error.message?.includes('websocket')) {
      errorType = 'subscription';
    } else if (error.message?.includes('auth') || 
               error.message?.includes('organization') ||
               error.message?.includes('permission')) {
      errorType = 'critical';
    }

    return {
      hasError: true,
      error,
      errorType
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Use secure logging
    logError('React Error Boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: Math.random().toString(36).substr(2, 9),
      errorType: this.state.errorType
    });
    
    this.setState({
      error,
      errorInfo
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorType: 'unknown'
    });
  };

  handleGoBack = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props;
      
      if (Fallback) {
        return <Fallback error={this.state.error!} retry={this.handleRetry} />;
      }

      // Handle subscription errors more gracefully
      if (this.state.errorType === 'subscription') {
        return (
          <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <AlertCircle className="h-12 w-12 text-orange-500" />
                </div>
                <CardTitle className="text-xl">Connection Issue</CardTitle>
                <CardDescription>
                  There was a temporary issue with real-time features.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-sm text-orange-700 font-medium">Issue Details:</p>
                  <p className="text-sm text-orange-600 mt-1">
                    Real-time collaboration features encountered a connection problem. This doesn't affect your core CRM functionality.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Button 
                    onClick={this.handleRetry} 
                    className="w-full"
                    variant="default"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Connection
                  </Button>
                  
                  <Button 
                    onClick={this.handleGoBack} 
                    className="w-full"
                    variant="outline"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Go Back
                  </Button>
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-500">
                    Your data is safe and CRM features remain fully functional.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }

      // Handle critical errors with more severity
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
              </div>
              <CardTitle className="text-xl">Application Error</CardTitle>
              <CardDescription>
                Something went wrong and the application couldn't continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700 font-medium">Error Details:</p>
                <p className="text-sm text-red-600 mt-1">
                  {this.state.error?.message || 'An unexpected error occurred'}
                </p>
              </div>
              
              <div className="space-y-2">
                <Button 
                  onClick={this.handleRetry} 
                  className="w-full"
                  variant="default"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                
                <Button 
                  onClick={() => window.location.reload()} 
                  className="w-full"
                  variant="outline"
                >
                  Reload Page
                </Button>
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-500">
                  If this problem persists, please contact support.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default EnhancedErrorBoundary;
