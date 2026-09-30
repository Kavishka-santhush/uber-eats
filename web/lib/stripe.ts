import { config } from '@/lib/config';

/**
 * Thin wrapper around @stripe/stripe-js. Elements are created imperatively
 * only when a card payment is being confirmed, keeping the Stripe bundle off
 * the critical path.
 */

let stripePromise: Promise<import('@stripe/stripe-js').Stripe | null> | null = null;

export function getStripe(): Promise<import('@stripe/stripe-js').Stripe | null> {
  if (!config.stripePublishableKey) return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = import('@stripe/stripe-js')
      .then(({ loadStripe }) => loadStripe(config.stripePublishableKey))
      .catch(() => null);
  }
  return stripePromise;
}

export interface CardCollect {
  clientSecret: string;
  holderName?: string;
}

/**
 * Renders a single card Element in `mountEl` and confirms the PaymentIntent.
 * Resolves with the resulting status; throws only on setup errors.
 */
export async function collectAndConfirmCard(
  mountEl: HTMLElement,
  { clientSecret, holderName }: CardCollect,
): Promise<'succeeded' | 'requires_action' | 'failed'> {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe is not configured (missing publishable key)');
  const elements = stripe.elements();
  const card = elements.create('card', {
    style: {
      base: { fontSize: '16px', color: '#111827', '::placeholder': { color: '#9ca3af' } },
      invalid: { color: '#dc2626' },
    },
  });
  card.mount(mountEl);
  const { error: mountErr } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: { card, billing_details: holderName ? { name: holderName } : undefined },
  });
  card.destroy();
  if (mountErr) {
    // eslint-disable-next-line no-console
    console.warn('confirmCardPayment:', mountErr.message);
    return 'failed';
  }
  return 'succeeded';
}
