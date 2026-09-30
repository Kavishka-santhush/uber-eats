/** Central runtime config read from NEXT_PUBLIC_* env vars. */
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  graphqlUrl: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:5000/graphql',
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000',
  uploadsUrl: process.env.NEXT_PUBLIC_UPLOADS_URL || 'http://localhost:5000/uploads',
  googleMapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'QuickBite',
  currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD',
};

/** Resolve a stored upload path (e.g. /uploads/menu/x.png) to an absolute URL. */
export function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  const base = config.apiUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const TOKEN_STORAGE_KEY = 'qb_auth';
