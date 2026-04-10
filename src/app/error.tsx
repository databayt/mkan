'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
    
    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to Sentry or similar service
      // window.Sentry?.captureException(error);
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-red-100 p-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">
            Oops! Something went wrong
          </h1>
          <p className="text-gray-600">
            We encountered an unexpected error. Our team has been notified and is working on a fix.
          </p>
          
          {process.env.NODE_ENV === 'development' && error.message && (
            <details className="mt-4 text-start">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Error details (development only)
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs font-mono bg-gray-100 p-2 rounded overflow-auto">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="text-xs text-gray-500">
                    Error ID: {error.digest}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button
            onClick={reset}
            size="lg"
          >
            Try again
          </Button>
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            size="lg"
          >
            Go home
          </Button>
        </div>

        <p className="text-xs text-gray-500">
          If this problem persists, please contact support
        </p>
      </div>
    </div>
  );
}