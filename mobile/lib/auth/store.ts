import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  hasHydrated: boolean;
  setSession: (p: { user: SessionUser; accessToken: string; refreshToken: string }) => void;
  patchUser: (patch: Partial<SessionUser>) => void;
  clear: () => void;
  setHasHydrated: (v: boolean) => void;
}

/**
 * Auth session store. Tokens live in AsyncStorage via zustand persist so the
 * Apollo link and the socket handshake can read them outside React render.
 * The access token is short-lived (15m) and silently refreshed against the
 * REST endpoint (see lib/auth/api.ts refreshAccessToken).
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hasHydrated: false,
      setSession: ({ user, accessToken, refreshToken }) => set({ user, accessToken, refreshToken }),
      patchUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: TOKEN_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);

// Non-hook accessors (used by the Apollo link + socket factory).
export const getAccessToken = () => useAuth.getState().accessToken;
export const getRefreshToken = () => useAuth.getState().refreshToken;

/**
 * Landing route per role, used by login/register/index redirects. These are
 * real URL paths — expo-router group segments like "(driver)" never appear in
 * the href, so each group uses globally unique screen file names
 * (driver/home, owner/dashboard, customer/profile, customer/tabs).
 */
export function homePathForRole(role?: Role | null): string {
  switch (role) {
    case 'DRIVER':
      return '/home';
    case 'RESTAURANT_OWNER':
    case 'RESTAURANT_STAFF':
      return '/dashboard';
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'OPS_MANAGER':
    case 'SUPPORT_AGENT':
      // Staff administer from the web back-office; on mobile they land on the
      // account screen (inside the customer shell) with a pointer to the web.
      return '/tabs/profile';
    default:
      return '/tabs';
  }
}
