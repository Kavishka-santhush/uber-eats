import { useColorScheme } from 'react-native';
import { useAppearance } from '@/lib/appearance';

/**
 * Design tokens mirroring the web brand (QuickBite). Kept as plain constants
 * so components can import them without a context; useTheme() resolves the
 * palette from the in-app appearance override, falling back to the OS scheme.
 */
export const palette = {
  brand: '#059669',
  brandDark: '#047857',
  brandSoft: '#D1FAE5',
  danger: '#DC2626',
  warning: '#D97706',
  info: '#2563EB',
  star: '#F59E0B',
  ink: '#0F172A',
  muted: '#64748B',
};

export const light = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: palette.ink,
  subtext: palette.muted,
  border: '#E2E8F0',
  inputBg: '#F1F5F9',
};

export const dark = {
  bg: '#0B1220',
  card: '#111A2E',
  text: '#E2E8F0',
  subtext: '#94A3B8',
  border: '#1E2A44',
  inputBg: '#16213A',
};

export type Theme = typeof light & { dark: boolean };

export function useTheme(): Theme {
  const systemDark = useColorScheme() === 'dark';
  const mode = useAppearance((s) => s.mode);
  const isDark = mode === 'dark' || (mode === 'system' && systemDark);
  return { ...(isDark ? dark : light), dark: isDark };
}

export const radius = { card: 16, input: 12, pill: 999 };
export const gap = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
