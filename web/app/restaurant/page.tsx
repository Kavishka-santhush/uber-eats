'use client';

import Link from 'next/link';
import { useMutation } from '@apollo/client';
import { ArrowRight, Star, Store, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { RestaurantPage } from '@/components/restaurant-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SET_BRANCH_STATUS } from '@/lib/graphql/mutations';
import { useAuth } from '@/lib/auth/store';
import { formatMoney } from '@/lib/utils';

function StatusPill({ status }: { status?: string }) {
  const tone =
    status === 'OPEN' ? 'bg-brand text-white' : status === 'BUSY' ? 'bg-yellow-500 text-white' : 'bg-gray-400 text-white';
  return (
    <span className={'rounded-full px-2 py-0.5 text-xs font-semibold ' + tone}>
      {status ? status.replace(/_/g, ' ') : 'CLOSED'}
    </span>
  );
}

function BranchStatusToggle({ branch }: { branch: any }) {
  const [mutate, { loading }] = useMutation(SET_BRANCH_STATUS, {
    onCompleted: () => toast.success('Branch status updated'),
    onError: (e: any) => toast.error(e?.message?.replace('GraphQL error: ', '') || 'Could not update status'),
  });
  const current: string = branch.status ?? 'CLOSED';
  return (
    <div className="flex gap-1.5">
      {['OPEN', 'CLOSED', 'BUSY'].map((s) => (
        <Button
          key={s}
          size="sm"
          variant={current === s ? 'default' : 'outline'}
          className={current === s ? 'bg-brand hover:bg-brand-dark' : ''}
          disabled={loading}
          onClick={() => mutate({ variables: { id: branch.id, status: s } })}
        >
          {s.charAt(0) + s.slice(1).toLowerCase()}
        </Button>
      ))}
    </div>
  );
}

function RestaurantsBody({ restaurant, loading }: { restaurant: any; loading: boolean }) {
  const user = useAuth((s) => s.user);
  const owned: any[] = (restaurant ? [restaurant] : []).concat([]);

  if (loading && !restaurant) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  if (!restaurant) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No restaurant linked to this account yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {user?.role === 'RESTAURANT_STAFF'
              ? 'You are signed in as staff — ask the owner to link your account, then sign in again.'
              : 'Submit your restaurant for approval from your profile, and once approved its branches will appear here.'}
          </p>
          <Button asChild variant="outline" className="mt-1">
            <Link href="/profile?tab=business">Go to restaurant setup</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {owned.map((r) => (
        <Card key={r.id}>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Store className="h-5 w-5 text-brand" />
                  <h2 className="text-lg font-bold">{r.name}</h2>
                  <Badge variant="outline" className="text-xs">
                    {r.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    {Number(r.avgRating ?? 0).toFixed(1)}
                  </span>
                  <span>{r.totalOrders ?? 0} orders</span>
                  <span>{r.branches?.length ?? 0} branches</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/restaurant/menu">Manage menu</Link>
                </Button>
                <Button asChild size="sm" className="bg-brand hover:bg-brand-dark">
                  <Link href="/restaurant/orders">
                    Open orders <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {(r.branches ?? []).map((b: any) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {b.name} <StatusPill status={b.status} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[b.addressLine1, b.city].filter(Boolean).join(', ') || 'Address not set'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {b.minOrderAmount != null && (
                      <span className="text-xs text-muted-foreground">
                        Min order {formatMoney(b.minOrderAmount)}
                      </span>
                    )}
                    <BranchStatusToggle branch={b} />
                  </div>
                </div>
              ))}
              {(r.branches ?? []).length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No branches yet — add one from Profile → Business.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function RestaurantHomePage() {
  return (
    <RestaurantPage>{(ctx) => <RestaurantsBody {...ctx} />}</RestaurantPage>
  );
}
