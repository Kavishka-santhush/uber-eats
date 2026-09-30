import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TOKEN_STORAGE_KEY } from '@/lib/config';

export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'OPS_MANAGER'
  | 'SUPPORT_AGENT'
  | 'RESTAURANT_OWNER'
  | 'RESTAURANT_STAFF'
  | 'DRIVER'
  | 'CUSTOMER';

export interface SessionUser {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role: Role;
  avatarUrl?: string | null;
  status?: string;
}

interface AuthState {
  user: SessionUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (p: { user: SessionUser; accessToken: string; refreshToken: string }) => void;
  patchUser: (patch: Partial<SessionUser>) => void;
  clear: () => void;
}

/**
 * Auth session store. Tokens are persisted to localStorage so the Apollo link
 * and the socket handshake can read them outside React render. The access
 * token is short-lived (15m) and silently refreshed against the REST endpoint.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: ({ user, accessToken, refreshToken }) => set({ user, accessToken, refreshToken }),
      patchUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: TOKEN_STORAGE_KEY,
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : (undefined as any))),
    },
  ),
);

// Non-hook accessors (used by the Apollo link + socket factory).
export const getAccessToken = () => useAuth.getState().accessToken;
export const getRefreshToken = () => useAuth.getState().refreshToken;

export const STAFF_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SUPPORT_AGENT'];
export const BACKOFFICE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF'];

/** Where a role should land after login. */
export function homePathForRole(role?: Role | null): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return '/admin';
    case 'OPS_MANAGER':
      return '/ops';
    case 'SUPPORT_AGENT':
      return '/support/queue';
    case 'RESTAURANT_OWNER':
    case 'RESTAURANT_STAFF':
      return '/restaurant';
    case 'DRIVER':
      return '/driver';
    default:
      return '/';
  }
}
