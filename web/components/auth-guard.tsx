'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth, type Role } from '@/lib/auth/store';

/**
 * Client-side route guard. Redirects anonymous visitors to /login and users
 * whose role is not in `roles` to their role home. For authenticated-only
 * routes omit `roles`.
 */
export function AuthGuard({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.accessToken);

  useEffect(() => {
    if (!token || !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
      return;
    }
    if (roles && roles.length && !roles.includes(user.role)) {
      router.replace('/');
    }
  }, [token, user, roles, router, pathname]);

  if (!token || !user) return null;
  if (roles && roles.length && !roles.includes(user.role)) return null;
  return <>{children}</>;
}
