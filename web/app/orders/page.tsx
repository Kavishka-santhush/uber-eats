'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { Receipt, RefreshCcw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MY_ORDERS } from '@/lib/graphql/queries';
import { CANCEL_ORDER, REORDER } from '@/lib/graphql/mutations';
import { OrderStatusBadge } from '@/components/order-status';
import { ReviewDialog } from '@/components/review-dialog';
import { formatMoney } from '@/lib/utils';
import { formatDateTime } from '@/lib/date';

const ACTIVE = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE_TO_RESTAURANT', 'PICKED_UP', 'OUT_FOR_DELIVERY'];

function OrdersList() {
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useQuery(MY_ORDERS, { variables: { page, limit: 10 } });
  const [cancelOrder] = useMutation(CANCEL_ORDER);
  const [reorder] = useMutation(REORDER);
  const [reviewOrder, setReviewOrder] = useState<any | null>(null);

  const orders: any[] = data?.myOrders?.items ?? [];
  const pages = data?.myOrders?.pages ?? 1;

  const cancel = async (id: string) => {
    try {
      await cancelOrder({ variables: { id, reason: 'Cancelled by customer' } });
      toast.success('Order cancelled');
      refetch();
    } catch (e: any) {
      toast.error(e?.message?.replace('GraphQL error: ', '') || 'Could not cancel');
    }
  };

  const doReorder = async (orderId: string) => {
    try {
      const res = await reorder({ variables: { orderId } });
      toast.success('Items added to cart');
      if (res.data?.reorder?.id) window.location.href = '/cart';
    } catch (e: any) {
      toast.error(e?.message?.replace('GraphQL error: ', '') || 'Could not reorder');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
        <Receipt className="h-10 w-10" />
        <p className="font-medium">No orders yet</p>
        <Button asChild className="bg-brand hover:bg-brand-dark">
          <Link href="/restaurants">Find something tasty</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((o) => {
        const isActive = ACTIVE.includes(o.status);
        return (
          <Card key={o.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <p className="font-semibold">{o.branch?.restaurant?.name ?? o.branch?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    #{o.orderNumber} · {formatDateTime(o.createdAt)}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <OrderStatusBadge status={o.status} />
                  <span className="font-semibold">{formatMoney(o.total)}</span>
                </div>
              </div>
              <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                {o.items.map((i: any) => `${i.quantity}× ${i.nameSnapshot}`).join(', ')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {isActive ? (
                  <>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/orders/${o.id}`}>Track order</Link>
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => cancel(o.id)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/orders/${o.id}`}>Details</Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => doReorder(o.id)}>
                      <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Reorder
                    </Button>
                    {o.status === 'DELIVERED' && (
                      <Button size="sm" className="bg-brand hover:bg-brand-dark" onClick={() => setReviewOrder(o)}>
                        <Star className="mr-1 h-3.5 w-3.5" /> Rate
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Badge variant="outline" className="px-3 py-1">Page {page} / {pages}</Badge>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      <ReviewDialog order={reviewOrder} onClose={() => setReviewOrder(null)} onDone={refetch} />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <AuthGuard>
      <div className="container max-w-3xl py-8">
        <h1 className="mb-6 text-2xl font-bold">My orders</h1>
        <OrdersList />
      </div>
    </AuthGuard>
  );
}
