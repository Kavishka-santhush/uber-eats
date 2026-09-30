import React, { type ReactNode } from 'react';
import { ApolloProvider } from '@apollo/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { apolloClient } from '@/lib/apollo/client';
import { queryClient } from '@/lib/react-query';
import { config } from '@/lib/config';

/**
 * Single composition root for data providers (UI-agnostic on purpose).
 * The Stripe provider is always mounted: without a publishable key the card
 * payment modal shows an explanatory state instead of crashing the checkout.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApolloProvider client={apolloClient}>
      <QueryClientProvider client={queryClient}>
        <StripeProvider publishableKey={config.stripePublishableKey} urlScheme="quickbite" merchantIdentifier="">
          {children}
        </StripeProvider>
      </QueryClientProvider>
    </ApolloProvider>
  );
}
