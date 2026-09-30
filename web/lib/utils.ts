import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Money formatting using the configured platform currency. */
export function formatMoney(amount: number | string | null | undefined, currency = process.env.NEXT_PUBLIC_CURRENCY || 'USD') {
  const n = typeof amount === 'string' ? Number(amount) : amount ?? 0;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number.isFinite(n) ? n : 0);
}

export const cx = clsx;
