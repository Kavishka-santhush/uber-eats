'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { AlertTriangle, ArrowRight, Store, Car, LifeBuoy } from 'lucide-react';
import { AdminShell, MiniBars, StatTile } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ADMIN_DASHBOARD } from '@/lib/graphql/dashboards';
import { getSocket } from '@/lib/socket';
import { formatMoney } from '@/lib/utils';
import { timeAgo } from '@/lib/date';

function Overview() {
  const { data, loading, refetch } = useQuery(ADMIN_DASHBOARD, { fetchPolicy: 'cache-and-network' });

  // nudge the dashboard whenever the platform sees an order change
  useEffect(() => {
    const socket = getSocket();
    const onUpd = () => refetch();
    socket?.on('admin:order_update', onUpd);
    return () => {
      socket?.off('admin:order_update', onUpd);
    };
  }, [refetch]);

  const d = data?.adminDashboard;
  const s = d?.stats;

  if (loading && !d) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(d?.pendingRestaurantApps > 0 || d?.pendingDriverApps > 0 || d?.openTickets > 0) && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span className="font-medium">Needs your attention:</span>
            {d.pendingRestaurantApps > 0 && (
              <Link href="/admin/restaurants" className="flex items-center gap-1 underline">
                <Store className="h-4 w-4" /> {d.pendingRestaurantApps} restaurant apps
              </Link>
            )}
            {d.pendingDriverApps > 0 && (
              <Link href="/admin/drivers" className="flex items-center gap-1 underline">
                <Car className="h-4 w-4" /> {d.pendingDriverApps} driver apps
              </Link>
            )}
            {d.openTickets > 0 && (
              <Link href="/support/queue" className="flex items-center gap-1 underline">
                <LifeBuoy className="h-4 w-4" /> {d.openTickets} open tickets
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Revenue today" value={formatMoney(s?.revenueToday ?? 0)} hint={`Total ${formatMoney(s?.revenueTotal ?? 0)}`} />
        <StatTile label="Orders today" value={s?.ordersToday ?? 0} hint={`${s?.activeOrders ?? 0} active now`} />
        <StatTile label="Online drivers" value={s?.onlineDrivers ?? 0} hint={`${s?.activeRestaurants ?? 0} open restaurants`} />
        <StatTile label="New signups today" value={s?.newSignupsToday ?? 0} hint={`Payouts pending ${formatMoney(s?.payoutsPendingAmount ?? 0)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue (last 14 days)</CardTitle></CardHeader>
          <CardContent><MiniBars points={d?.revenueSeries ?? []} money /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Orders (last 14 days)</CardTitle></CardHeader>
          <CardContent><MiniBars points={d?.ordersSeries ?? []} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top restaurants</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(d?.topRestaurants ?? []).slice(0, 6).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="shrink-0 text-muted-foreground">{r.totalOrders ?? 0} orders · ★ {Number(r.avgRating ?? 0).toFixed(1)}</span>
                </li>
              ))}
              {(d?.topRestaurants ?? []).length === 0 && <li className="p-4 text-sm text-muted-foreground">No data yet.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top drivers</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(d?.topDrivers ?? []).slice(0, 6).map((dr: any) => (
                <li key={dr.userId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="truncate font-medium">{dr.user?.fullName}</span>
                  <span className="shrink-0 text-muted-foreground">{dr.totalDeliveries ?? 0} drops · ★ {Number(dr.avgRating ?? 0).toFixed(1)}</span>
                </li>
              ))}
              {(d?.topDrivers ?? []).length === 0 && <li className="p-4 text-sm text-muted-foreground">No data yet.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent orders</CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href="/ops">Live ops <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Restaurant</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Total</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(d?.recentOrders ?? []).slice(0, 10).map((o: any) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2 font-medium">#{o.orderNumber}</td>
                    <td className="px-4 py-2">{o.branch?.restaurant?.name ?? o.branch?.name}</td>
                    <td className="px-4 py-2">{o.customer?.fullName}</td>
                    <td className="px-4 py-2">{formatMoney(o.total)}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{o.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-2 text-muted-foreground">{timeAgo(o.createdAt)}</td>
                  </tr>
                ))}
                {(d?.recentOrders ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <AdminShell title="Platform overview" subtitle="Live health of the marketplace">
      <Overview />
    </AdminShell>
  );
}
