import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const isDevelopment = process.env.NODE_ENV === 'development';

export const useAuthRedirect = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return; // Still loading

    if (!session) {
      if (isDevelopment) {
        console.log('🔒 No session found, redirecting to login');
      }
      // Extract locale from current path
      const currentLocale = pathname.startsWith('/ar') ? 'ar' : 'en';
      // Capture current URL as callback
      const currentUrl = window.location.pathname + window.location.search;
      const encodedCallbackUrl = encodeURIComponent(currentUrl);
      router.push(`/${currentLocale}/login?callbackUrl=${encodedCallbackUrl}`);
      return;
    }

    if (isDevelopment) {
      console.log('🔒 Session found');
    }
  }, [session, status, router, pathname]);

  return { session, status };
}; 