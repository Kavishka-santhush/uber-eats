'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { AdminShell, MiniBars } from '@/components/admin-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ANALYTICS } from '@/lib/graphql/dashboards';

type Period = 'WEEK' | 'MONTH' | 'QUARTER';

function rangeFor(p: Period) {
  const to = new Date().toISOString();
  const from = new Date();
  if (p === 'WEEK') from.setDate(from.getDate() - 7);
  else if (p === 'MONTH') from.setDate(from.getDate() - 30);
  else from.setDate(from.getDate() - 90);
  return { from: from.toISOString(), to };
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'WEEK', label: 'Last 7 days' },
  { key: 'MONTH', label: 'Last 30 days' },
  { key: 'QUARTER', label: 'Last 90 days' },
];

function ChartCard({ title, points, money }: { title: string; points: any[]; money?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <MiniBars points={points ?? []} money={money} emptyLabel="Not enough data for this range" />
      </CardContent>
    </Card>
  );
}

function AnalyticsView() {
  const [period, setPeriod] = useState<Period>('MONTH');
  const range = useMemo(() => rangeFor(period), [period]);
  const { data, loading } = useQuery(ANALYTICS, { variables: range, fetchPolicy: 'cache-and-network' });
  const a = data?.analytics;

  if (loading && !a) {
    return <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <Button key={p.key} size="sm" variant={period === p.key ? 'default' : 'outline'}
            className={period === p.key ? 'bg-brand hover:bg-brand-dark' : ''} onClick={() => setPeriod(p.key)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue by day" points={a?.revenue} money />
        <ChartCard title="Orders by status" points={a?.ordersByStatus} />
        <ChartCard title="Orders by hour of day" points={a?.ordersByHour} />
        <ChartCard title="Top cuisines" points={a?.topCuisines} />
        <ChartCard title="Restaurant revenue" points={a?.restaurantRevenue} money />
        <ChartCard title="Driver throughput" points={a?.driverThroughput} />
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  return (
    <AdminShell title="Analytics" subtitle="Marketplace trends across revenue, orders, restaurants and drivers">
      <AnalyticsView />
    </AdminShell>
  );
}
