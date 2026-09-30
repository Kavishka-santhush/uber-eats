'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { config } from '@/lib/config';
import { loadScriptOnce } from '@/lib/utils-dom';
import { loginWithGoogle } from '@/lib/auth/api';
import { homePathForRole } from '@/lib/auth/store';

declare global {
  interface Window {
    google?: any;
  }
}

/**
 * Google Identity Services button. Renders nothing when no client id is
 * configured; the returned idToken is exchanged server-side via loginWithGoogle.
 */
export function GoogleButton({ next }: { next?: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!config.googleClientId || !mountRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        await loadScriptOnce('https://accounts.google.com/gsi/client', 'qb-gsi');
        if (cancelled || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async (resp: { credential?: string }) => {
            if (!resp.credential) return;
            try {
              const user = await loginWithGoogle(resp.credential);
              router.replace(next || homePathForRole(user.role));
            } catch (e: any) {
              toast.error(e?.message || 'Google sign-in failed');
            }
          },
        });
        window.google.accounts.id.renderButton(mountRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
        });
      } catch {
        /* GIS unavailable — button stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  if (!config.googleClientId) return null;
  return <div ref={mountRef} className="flex justify-center" />;
}
