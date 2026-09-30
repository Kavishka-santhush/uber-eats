import 'react-native-url-polyfill/auto';

/**
 * Central runtime config read from EXPO_PUBLIC_* env vars (inlined by Expo at
 * build time). On dev builds the default points at the local API server —
 * replace localhost with your machine LAN IP when testing on a real device.
 */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000',
  graphqlUrl: process.env.EXPO_PUBLIC_GRAPHQL_URL || 'http://localhost:5000/graphql',
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:5000',
  uploadsUrl: process.env.EXPO_PUBLIC_UPLOADS_URL || 'http://localhost:5000/uploads',
  googleMapsKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  appName: process.env.EXPO_PUBLIC_APP_NAME || 'QuickBite',
  currency: process.env.EXPO_PUBLIC_CURRENCY || 'USD',
};

/** Resolve a stored upload path (e.g. /uploads/menu/x.png) to an absolute URL. */
export function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  const base = config.apiUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const TOKEN_STORAGE_KEY = 'qb_auth';
