'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { BadgeDollarSign, Receipt, Percent, Wallet2, CalendarRange } from 'lucide-react';
import { RestaurantPage } from '@/components/restaurant-context';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MY_RESTAURANT_EARNINGS } from '@/lib/graphql/dashboards';
import { formatMoney } from '@/lib/utils';

type Period = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

function rangeFor(period: Period): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString();
  const d = new Date(now);
  switch (period) {
    case 'TODAY':
      d.setHours(0, 0, 0, 0);
      return { from: d.toISOString(), to };
    case 'WEEK':
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString(), to };
    case 'MONTH':
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString(), to };
    default:
      return {};
  }
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'WEEK', label: 'Last 7 days' },
  { key: 'MONTH', label: 'Last 30 days' },
  { key: 'ALL', label: 'All time' },
];

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4 text-brand" /> {label}
        </div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EarningsBody({ restaurant, loading }: { restaurant: any; loading: boolean }) {
  const [period, setPeriod] = useState<Period>('MONTH');
  const range = useMemo(() => rangeFor(period), [period]);
  const { data, loading: qLoading } = useQuery(MY_RESTAURANT_EARNINGS, {
    variables: { restaurantId: restaurant?.id, ...range },
    skip: !restaurant?.id,
    fetchPolicy: 'cache-and-network',
  });
  const e = data?.restaurantEarnings;

  if ((loading && !restaurant) || !restaurant) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  const gross = Number(e?.gross ?? 0);
  const commission = Number(e?.commission ?? 0);
  const net = Number(e?.net ?? 0);
  const commissionPct = gross > 0 ? (commission / gross) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={
              'rounded-full px-3 py-1 text-sm font-medium transition-colors ' +
              (period === p.key ? 'bg-brand text-white' : 'border text-muted-foreground hover:text-foreground')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {qLoading && !e ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Receipt} label="Gross sales" value={formatMoney(gross)} hint={`${e?.count ?? 0} delivered orders`} />
          <StatCard icon={Percent} label="Platform commission" value={`− ${formatMoney(commission)}`} hint={commissionPct ? `${commissionPct.toFixed(1)}% of gross` : undefined} />
          <StatCard icon={BadgeDollarSign} label="Net earnings" value={formatMoney(net)} hint="Before payout" />
          <StatCard icon={Wallet2} label="Payout" value="Scheduled" hint="Paid out by the platform on its payout cycle" />
        </div>
      )}

      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How earnings are calculated</p>
          <p className="mt-1">
            Net earnings equal the delivered order total for {restaurant.name} minus the platform commission
            (currently {restaurant.commissionRate ? `${(Number(restaurant.commissionRate) * 100).toFixed(0)}%` : 'the agreed rate'}{' '}
            per order). Refunded or cancelled orders are excluded. Only <span className="font-medium">delivered</span> orders count
            toward this figure.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RestaurantEarningsPage() {
  return (
    <RestaurantPage>{(ctx) => <EarningsBody restaurant={ctx.restaurant} loading={ctx.loading} />}</RestaurantPage>
  );
}
