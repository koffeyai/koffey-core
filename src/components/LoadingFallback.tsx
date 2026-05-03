import React from 'react';
import { AlertCircle, RefreshCw, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface LoadingFallbackProps {
  error?: string | null;
  onRetry?: () => void;
}

const LoadingFallback = ({ error, onRetry }: LoadingFallbackProps) => {
  const isNetworkError = error?.includes('Network') || error?.includes('fetch');
  const isTimeoutError = error?.includes('timeout') || error?.includes('taking longer');

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {isNetworkError ? (
              <Wifi className="h-12 w-12 text-orange-500" />
            ) : (
              <AlertCircle className="h-12 w-12 text-blue-500" />
            )}
          </div>
          <CardTitle className="text-xl">
            {isNetworkError ? 'Connection Issue' : isTimeoutError ? 'Loading Timeout' : 'Loading...'}
          </CardTitle>
          <CardDescription>
            {isNetworkError 
              ? 'Please check your internet connection and try again.'
              : isTimeoutError 
              ? 'The application is taking longer than expected to load.'
              : 'Setting up your workspace...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700 font-medium">Status:</p>
              <p className="text-sm text-blue-600 mt-1">{error}</p>
            </div>
          )}
          
          <Button 
            onClick={handleRetry} 
            className="w-full"
            variant="default"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>

          <div className="text-center">
            <p className="text-xs text-slate-500">
              If this continues, please contact support.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoadingFallback;
