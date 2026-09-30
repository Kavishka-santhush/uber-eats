import { QueryClient, useQuery } from '@tanstack/react-query';
import { config } from '@/lib/config';
import { getAccessToken } from '@/lib/auth/store';

/**
 * React Query is reserved for REST concerns (API reachability, ad-hoc file
 * uploads); all GraphQL data flows through Apollo. Keeping the split explicit
 * avoids two caches fighting over the same server state.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

export interface HealthInfo {
  ok: boolean;
  version?: string;
  uptimeSec?: number;
}

/** Polls GET /health so screens can show an offline banner early. */
export function useServerHealth(refetchMs = 30_000) {
  return useQuery<HealthInfo>({
    queryKey: ['server-health'],
    refetchInterval: refetchMs,
    queryFn: async () => {
      const res = await fetch(`${config.apiUrl}/health`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: true, version: data.version, uptimeSec: data.uptimeSec ?? data.uptime };
    },
  });
}

/**
 * Multipart upload against POST /upload/:scope (Multer route, field "files").
 * RN fetch accepts { uri, name, type } file objects, so no polyfill is needed.
 */
export async function uploadFile(scope: 'avatars' | 'restaurants' | 'menu' | 'licenses' | 'reviews' | 'reports' | 'delivery' | 'misc', uri: string, fileName: string, mimeType: string): Promise<string> {
  const token = getAccessToken();
  const fd = new FormData();
  fd.append('files', { uri, name: fileName, type: mimeType } as unknown as Blob);
  const res = await fetch(`${config.apiUrl}/upload/${scope}`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'multipart/form-data',
    },
    body: fd,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Upload failed');
  const urls: string[] = json?.urls ?? [];
  if (!urls.length) throw new Error('Upload returned no URL');
  return urls[0];
}
