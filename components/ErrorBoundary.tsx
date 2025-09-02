'use client';

import { useEffect } from 'react';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  // Check if it's an authentication error
  const isAuthError = error.message?.includes('401') || 
                     error.message?.includes('unauthorized') ||
                     error.message?.includes('session');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {isAuthError ? 'Authentication Required' : 'Something went wrong'}
          </h2>
          
          <p className="text-gray-600 mb-6">
            {isAuthError 
              ? 'Your session has expired. Please sign in again.'
              : 'An unexpected error occurred. Please try again.'
            }
          </p>
          
          <div className="space-y-3">
            {isAuthError ? (
              <a
                href="/sign-in"
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors inline-block"
              >
                Sign In
              </a>
            ) : (
              <button
                onClick={reset}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            )}
            
            <a
              href="/"
              className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors inline-block"
            >
              Go Home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
