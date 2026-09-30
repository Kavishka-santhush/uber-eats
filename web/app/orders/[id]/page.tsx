'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import { Phone, MapPin, Store, Home, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ORDER_DETAIL } from '@/lib/graphql/queries';
import { CANCEL_ORDER } from '@/lib/graphql/mutations';
import { OrderProgress, statusLabel } from '@/components/order-status';
import { MapView, type MapMarker } from '@/components/map-view';
import { ChatPanel } from '@/components/chat-panel';
import { ReviewDialog } from '@/components/review-dialog';
import { getSocket, joinOrder, leaveOrder } from '@/lib/socket';
import { formatMoney } from '@/lib/utils';
import { formatDateTime } from '@/lib/date';

const ACTIVE = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE_TO_RESTAURANT', 'PICKED_UP', 'OUT_FOR_DELIVERY'];

function OrderDetailInner() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, refetch } = useQuery(ORDER_DETAIL, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
  });
  const order: any = data?.order ?? null;

  // live driver position pushed over socket.io (delivery:location)
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    joinOrder(id);
    const socket = getSocket();
    const onLocation = (payload: any) => {
      if (!payload) return;
      setDriverPos({ lat: Number(payload.lat), lng: Number(payload.lng) });
    };
    const onStatus = (payload: any) => {
      if (payload?.orderId === id) refetch();
    };
    socket?.on('delivery:location', onLocation);
    socket?.on('order:status', onStatus);
    return () => {
      socket?.off('delivery:location', onLocation);
      socket?.off('order:status', onStatus);
      leaveOrder(id);
    };
  }, [id, refetch]);

  // seed driver position from the last REST poll if socket data hasn't arrived
  useEffect(() => {
    const last = order?.delivery?.liveLocations?.[order.delivery.liveLocations.length - 1];
    if (last && !driverPos) setDriverPos({ lat: Number(last.lat), lng: Number(last.lng) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const [cancelOrder] = useMutation(CANCEL_ORDER);
  const [reviewOpen, setReviewOpen] = useState(false);

  const isActive = order && ACTIVE.includes(order.status);

  const markers = useMemo<MapMarker[]>(() => {
    if (!order) return [];
    const out: MapMarker[] = [];
    if (order.branch) out.push({ id: 'pickup', lat: Number(order.branch.lat), lng: Number(order.branch.lng), label: 'Restaurant', kind: 'pickup' });
    if (order.address) out.push({ id: 'dropoff', lat: Number(order.address.lat), lng: Number(order.address.lng), label: 'Your address', kind: 'dropoff' });
    if (driverPos) out.push({ id: 'driver', lat: driverPos.lat, lng: driverPos.lng, label: 'Driver', kind: 'driver' });
    return out;
  }, [order, driverPos]);

  const center = useMemo(() => {
    if (driverPos) return driverPos;
    if (order?.address) return { lat: Number(order.address.lat), lng: Number(order.address.lng) };
    return { lat: 0, lng: 0 };
  }, [driverPos, order]);

  if (loading) {
    return (
      <div className="container max-w-4xl space-y-4 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !order) {
    return <div className="container py-20 text-center text-muted-foreground">Order not found.</div>;
  }

  const cancel = async () => {
    try {
      await cancelOrder({ variables: { id: order.id, reason: 'Cancelled by customer' } });
      toast.success('Order cancelled');
      refetch();
    } catch (e: any) {
      toast.error(e?.message?.replace('GraphQL error: ', '') || 'Could not cancel');
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Order #{order.orderNumber}</h1>
        <Badge variant="outline">{statusLabel(order.status)}</Badge>
        {order.estimatedDeliveryAt && (
          <span className="text-sm text-muted-foreground">
            ETA: {formatDateTime(order.estimatedDeliveryAt)}
          </span>
        )}
      </div>

      {isActive && <div className="mb-6"><OrderProgress status={order.status} /></div>}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          {(isActive || order.delivery) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-brand" /> Live tracking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <MapView center={center} markers={markers} polyline={order.delivery?.routePolyline} className="h-64 w-full rounded-xl border" />
                {order.delivery?.driver && (
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {order.delivery.driver.user?.avatarUrl && (
                      <img src={order.delivery.driver.user.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{order.delivery.driver.user?.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.delivery.driver.vehicleType} · {order.delivery.driver.vehiclePlate} · ★ {Number(order.delivery.driver.avgRating ?? 5).toFixed(1)}
                      </p>
                    </div>
                    {order.delivery.driver.user?.phone && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={`tel:${order.delivery.driver.user.phone}`} aria-label="Call driver">
                          <Phone className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Delivery details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                {order.branch?.name} {order.branch?.addressLine1 ? `— ${order.branch.addressLine1}` : ''}
              </p>
              <p className="flex items-start gap-2">
                <Home className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{order.address?.line1}{order.address?.line2 ? `, ${order.address.line2}` : ''}{order.address?.city ? `, ${order.address.city}` : ''}</span>
              </p>
              {order.specialInstructions && (
                <p className="rounded-lg bg-muted p-2 text-xs italic">“{order.specialInstructions}”</p>
              )}
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{formatMoney(order.itemsTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span>{formatMoney(order.deliveryFee)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Service fee</span><span>{formatMoney(order.serviceFee)}</span></div>
              {Number(order.discountTotal) > 0 && (
                <div className="flex justify-between text-brand"><span>Discount</span><span>−{formatMoney(order.discountTotal)}</span></div>
              )}
              <div className="flex justify-between font-bold"><span>Total</span><span>{formatMoney(order.total)}</span></div>
              <p className="text-xs text-muted-foreground">
                Paid with {order.paymentMethod?.toLowerCase()} · {order.paymentStatus}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(order.items ?? []).map((i: any) => (
                <div key={i.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{i.quantity}× {i.nameSnapshot}</span>
                  <span className="shrink-0">{formatMoney(i.lineTotal)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-brand" /> Chat about this order
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChatPanel orderId={order.id} />
            </CardContent>
          </Card>

          {(order.statusLogs ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  {order.statusLogs.map((log: any) => (
                    <li key={log.id} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                      <div>
                        <p className="font-medium">{statusLabel(log.status)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(log.createdAt)}{log.note ? ` · ${log.note}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {isActive && (
              <Button variant="outline" className="text-destructive" onClick={cancel}>Cancel order</Button>
            )}
            {order.status === 'DELIVERED' && (
              <Button className="bg-brand hover:bg-brand-dark" onClick={() => setReviewOpen(true)}>
                Rate this order
              </Button>
            )}
          </div>
        </div>
      </div>

      <ReviewDialog order={order} onClose={() => setReviewOpen(false)} onDone={refetch} />
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <AuthGuard>
      <OrderDetailInner />
    </AuthGuard>
  );
}
