'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const ORDER_STATUSES = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE_TO_RESTAURANT',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

const LABELS: Record<string, string> = {
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready',
  DRIVER_ASSIGNED: 'Driver assigned',
  DRIVER_EN_ROUTE_TO_RESTAURANT: 'To restaurant',
  PICKED_UP: 'Picked up',
  OUT_FOR_DELIVERY: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function statusLabel(status?: string | null) {
  return (status && LABELS[status]) || status || '—';
}

export function OrderStatusBadge({ status }: { status?: string | null }) {
  const tone =
    status === 'DELIVERED' ? 'bg-brand text-white'
      : status === 'CANCELLED' ? 'bg-destructive text-white'
        : status === 'OUT_FOR_DELIVERY' || status === 'PICKED_UP' ? 'bg-blue-600 text-white'
          : 'bg-yellow-500 text-white';
  return <Badge className={cn('border-0', tone)}>{statusLabel(status)}</Badge>;
}

/** Horizontal progress tracker for active orders. */
export function OrderProgress({ status }: { status?: string | null }) {
  if (status === 'CANCELLED') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        This order was cancelled.
      </div>
    );
  }
  const idx = ORDER_STATUSES.indexOf(status as (typeof ORDER_STATUSES)[number]);
  const done = status === 'DELIVERED';
  return (
    <div className="w-full">
      <div className="flex items-center">
        {ORDER_STATUSES.map((s, i) => (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                done || i <= idx ? 'bg-brand text-white' : 'bg-muted text-muted-foreground',
              )}
              title={statusLabel(s)}
            >
              {i + 1}
            </div>
            {i < ORDER_STATUSES.length - 1 && (
              <div className={cn('h-0.5 flex-1', done || i < idx ? 'bg-brand' : 'bg-muted')} />
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-sm font-medium">{statusLabel(status)}</p>
    </div>
  );
}
