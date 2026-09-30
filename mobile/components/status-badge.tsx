import { Badge, type BadgeTone } from '@/components/ui/badge';

/**
 * Shared status → tone mapping. Keys are the server enums verbatim
 * (OrderStatus, DeliveryStatus reuses the same ladder, TicketStatus).
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  // OrderStatus
  PLACED: 'warning',
  CONFIRMED: 'info',
  PREPARING: 'info',
  READY_FOR_PICKUP: 'warning',
  DRIVER_ASSIGNED: 'info',
  DRIVER_EN_ROUTE_TO_RESTAURANT: 'info',
  PICKED_UP: 'brand',
  OUT_FOR_DELIVERY: 'brand',
  DELIVERED: 'neutral',
  CANCELLED: 'danger',
  // PaymentStatus
  PENDING: 'warning',
  PROCESSING: 'info',
  SUCCEEDED: 'brand',
  FAILED: 'danger',
  REFUNDED: 'danger',
  PARTIALLY_REFUNDED: 'warning',
  // TicketStatus
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'brand',
  CLOSED: 'neutral',
  ESCALATED: 'danger',
  // Driver approval / availability
  ONLINE: 'brand',
  OFFLINE: 'neutral',
  ON_DELIVERY: 'info',
  APPROVED: 'brand',
  PENDING_APPROVAL: 'warning',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  PLACED: 'Placed',
  READY_FOR_PICKUP: 'Ready for pickup',
  DRIVER_ASSIGNED: 'Driver assigned',
  DRIVER_EN_ROUTE_TO_RESTAURANT: 'Driver to restaurant',
  OUT_FOR_DELIVERY: 'On the way',
  PARTIALLY_REFUNDED: 'Partially refunded',
  IN_PROGRESS: 'In progress',
  PENDING_APPROVAL: 'Pending approval',
  ON_DELIVERY: 'On a delivery',
};

/** "READY_FOR_PICKUP" → "Ready for pickup" (with a few hand-tuned labels). */
export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function statusTone(status: string): BadgeTone {
  return STATUS_TONE[status] ?? 'neutral';
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge label={statusLabel(status)} tone={statusTone(status)} />;
}

/** The forward order lifecycle used by the tracking timeline (no CANCELLED). */
export const ORDER_LADDER: string[] = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE_TO_RESTAURANT',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export const ACTIVE_ORDER_STATUSES = ORDER_LADDER.slice(0, -1);
