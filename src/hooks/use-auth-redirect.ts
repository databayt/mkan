import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession, getSession } from 'next-auth/react';
import type { Session } from 'next-auth';

const isDevelopment = process.env.NODE_ENV === 'development';

export const useAuthRedirect = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  // Session resolved via a direct fetch when the provider cache is stale.
  const [resolvedSession, setResolvedSession] = useState<Session | null>(null);
  // True while we're confirming a "no session" reading before acting on it.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (status === 'loading') return; // Still loading

    if (session) {
      setResolvedSession(session);
      setConfirming(false);
      return;
    }

    // useSession() reports no session — but its cache is STALE for a moment
    // right after a fresh login: the credentials sign-in redirects via a soft
    // navigation, which does not refetch the SessionProvider, so it keeps the
    // logged-out value from the /login page. Acting on that stale reading
    // bounced the user back to /login (and the proxy then sent them to
    // DEFAULT_LOGIN_REDIRECT instead of their callbackUrl). Confirm with a
    // direct /api/auth/session fetch before redirecting.
    let cancelled = false;
    setConfirming(true);
    getSession().then((fresh) => {
      if (cancelled) return;
      if (fresh) {
        if (isDevelopment) {
          console.log('🔒 Session confirmed via refetch (provider cache was stale)');
        }
        setResolvedSession(fresh);
        setConfirming(false);
        return;
      }

      if (isDevelopment) {
        console.log('🔒 No session found, redirecting to login');
      }
      // Extract locale from current path
      const currentLocale = pathname.startsWith('/ar') ? 'ar' : 'en';
      // Capture current URL as callback
      const currentUrl = window.location.pathname + window.location.search;
      const encodedCallbackUrl = encodeURIComponent(currentUrl);
      router.push(`/${currentLocale}/login?callbackUrl=${encodedCallbackUrl}`);
    });

    return () => {
      cancelled = true;
    };
  }, [session, status, router, pathname]);

  // Prefer the live provider session; fall back to the freshly-fetched one so
  // the page renders instead of flashing blank during the stale window.
  const effectiveSession = session ?? resolvedSession;
  const effectiveStatus: 'loading' | 'authenticated' | 'unauthenticated' =
    status === 'loading' || confirming
      ? 'loading'
      : effectiveSession
        ? 'authenticated'
        : 'unauthenticated';

  return { session: effectiveSession, status: effectiveStatus };
};
