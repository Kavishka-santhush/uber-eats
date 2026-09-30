'use client';

import { ApolloProvider } from '@apollo/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { useEffect, useState, type ReactNode } from 'react';
import { apolloClient } from '@/lib/apollo/client';
import { fetchMe } from '@/lib/auth/api';
import { useAuth } from '@/lib/auth/store';

/**
 * Top-level client providers: theme, Apollo (GraphQL) and React Query (REST /
 * imperative data). Also bootstraps the persisted auth session on first load
 * (validates the stored access token against `me`).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  const hasToken = useAuth((s) => s.accessToken);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (hasToken) await fetchMe();
      if (active) setBooted(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem suppressHydrationWarning>
      <ApolloProvider client={apolloClient}>
        <QueryClientProvider client={queryClient}>
          {booted ? children : null}
          <Toaster position="top-right" richColors closeButton />
        </QueryClientProvider>
      </ApolloProvider>
    </ThemeProvider>
  );
}
