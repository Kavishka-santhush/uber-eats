import { Text, type TextProps } from 'react-native';
import { config } from '@/lib/config';

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

/** Format a Decimal scalar (string or number from the API) as money. */
export function formatPrice(value: number | string | null | undefined, fractionDigits = 2): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return `${CURRENCY_SYMBOL[config.currency] ?? config.currency + ' '}0.00`;
  const sym = CURRENCY_SYMBOL[config.currency] ?? `${config.currency} `;
  return sym + n.toFixed(fractionDigits);
}

/** Money text with tabular figures; pass `strike` for compare-at prices. */
export function Price({ value, size = 14, muted, strike, style, ...rest }: TextProps & { value: number | string | null | undefined; size?: number; muted?: boolean; strike?: boolean }) {
  return (
    <Text
      style={[
        {
          fontSize: size,
          fontWeight: strike ? '400' : '700',
          color: muted ? '#64748B' : '#0F172A',
          textDecorationLine: strike ? 'line-through' : 'none',
        },
        style,
      ]}
      {...rest}
    >
      {formatPrice(value)}
    </Text>
  );
}
