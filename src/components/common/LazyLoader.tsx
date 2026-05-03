import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/logger';

interface LazyLoaderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
  retryable?: boolean;
  componentName?: string;
}

interface LoadingSkeletonProps {
  type: 'dashboard' | 'table' | 'form' | 'chart';
}

// INTELLIGENT LOADING SKELETONS
const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ type }) => {
  switch (type) {
    case 'dashboard':
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      );
      
    case 'table':
      return (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
      
    case 'form':
      return (
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      );
      
    case 'chart':
      return (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end space-x-2 h-64">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton 
                  key={i} 
                  className="flex-1"
                  style={{ height: `${Math.random() * 200 + 50}px` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      );
      
    default:
      return <Skeleton className="h-64 w-full" />;
  }
};

// ERROR BOUNDARY FOR LAZY COMPONENTS
class LazyComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; onRetry?: () => void; componentName?: string },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logError('Lazy component failed to load', {
      componentName: this.props.componentName,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// NETWORK-AWARE LOADER
const NetworkAwareLoader: React.FC<LazyLoaderProps> = ({
  children,
  fallback,
  errorFallback,
  retryable = true,
  componentName = 'Component'
}) => {
  const [retryCount, setRetryCount] = React.useState(0);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    // Force re-render to retry loading
    window.location.reload();
  };

  const defaultErrorFallback = (
    <Card className="max-w-md mx-auto">
      <CardContent className="p-6 text-center">
        <div className="flex justify-center mb-4">
          {isOnline ? (
            <AlertCircle className="h-12 w-12 text-destructive" />
          ) : (
            <WifiOff className="h-12 w-12 text-muted-foreground" />
          )}
        </div>
        
        <h3 className="font-semibold mb-2">
          {isOnline ? 'Failed to Load Component' : 'You\'re Offline'}
        </h3>
        
        <p className="text-sm text-muted-foreground mb-4">
          {isOnline 
            ? `The ${componentName} component couldn't be loaded. This might be due to a network issue.`
            : 'Some features are unavailable while offline. Please check your connection.'
          }
        </p>

        {retryable && (
          <Button onClick={handleRetry} variant="outline" size="sm">
            {isOnline ? 'Try Again' : 'Retry When Online'}
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <LazyComponentErrorBoundary 
      fallback={errorFallback || defaultErrorFallback}
      componentName={componentName}
    >
      <Suspense fallback={fallback || <LoadingSkeleton type="dashboard" />}>
        {children}
      </Suspense>
    </LazyComponentErrorBoundary>
  );
};

export { NetworkAwareLoader as LazyLoader, LoadingSkeleton };