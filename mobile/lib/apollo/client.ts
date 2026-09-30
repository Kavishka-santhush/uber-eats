import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  Observable,
  from,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { config } from '@/lib/config';
import { useAuth } from '@/lib/auth/store';

/**
 * Singleton Apollo client for React Native.
 *  - authLink attaches the current Bearer access token;
 *  - errorLink transparently refreshes on UNAUTHENTICATED (deduped so a burst
 *    of parallel queries triggers a single refresh) and retries the operation.
 * Tokens themselves are persisted by the zustand auth store, so a relaunch
 * re-authenticates without persisting the GraphQL cache.
 */

let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const rt = useAuth.getState().refreshToken;
      if (!rt) return null;
      try {
        const res = await fetch(`${config.apiUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          useAuth.getState().clear();
          return null;
        }
        const data = await res.json();
        useAuth.getState().setSession({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        });
        return data.accessToken as string;
      } catch {
        return null;
      }
    })().finally(() => {
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    });
  }
  return refreshPromise;
}

const httpLink = new HttpLink({ uri: config.graphqlUrl });

const authLink = setContext((_, { headers }) => {
  const token = useAuth.getState().accessToken;
  return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
});

const errorLink = onError(({ graphQLErrors, operation, forward }) => {
  if (!graphQLErrors) return;
  const unauthenticated = graphQLErrors.some((e) => e.extensions?.code === 'UNAUTHENTICATED');
  if (!unauthenticated) return;
  return new Observable((observer) => {
    refreshAccessToken().then((token) => {
      if (!token) {
        observer.error(graphQLErrors![0]);
        return;
      }
      operation.setContext(({ headers = {} }) => ({
        headers: { ...headers, authorization: `Bearer ${token}` },
      }));
      forward(operation).subscribe(observer);
    });
  });
});

export const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        restaurants: {
          keyArgs: false,
          merge(existing = { items: [] }, incoming, { args }) {
            const page = args?.filters?.page ?? 1;
            if (page <= 1) return incoming;
            return { ...incoming, items: [...(existing.items || []), ...(incoming.items || [])] };
          },
        },
      },
    },
  },
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  },
});
