'use client';

import { useEffect } from 'react';
import { clearSessionCookie } from '@/lib/actions/user.actions';

interface AuthErrorHandlerProps {
  hasAuthError: boolean;
}

export default function AuthErrorHandler({ hasAuthError }: AuthErrorHandlerProps) {
  useEffect(() => {
    if (hasAuthError) {
      // Clear the invalid session cookie
      clearSessionCookie().then(() => {
        console.log('Invalid session cookie cleared');
        // Redirect to sign-in page
        window.location.href = '/sign-in';
      }).catch((error) => {
        console.error('Failed to clear session cookie:', error);
        // Still redirect even if cookie clearing fails
        window.location.href = '/sign-in';
      });
    }
  }, [hasAuthError]);

  // This component doesn't render anything
  return null;
}
