'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { CalendarDollar, LayoutGrid, Store, UtensilsCrossed } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ME_FULL } from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth/store';

const LS_KEY = 'qb_restaurant_id';

export interface OwnedBranch {
  id: string;
  name: string;
  status?: string;
  addressLine1?: string;
  city?: string;
  minOrderAmount?: string | number;
  isOpenNow?: boolean;
}

/** Nav shown inside every restaurant back-office page. */
const NAV = [
  { href: '/restaurant', label: 'Restaurants', icon: Store },
  { href: '/restaurant/orders', label: 'Orders', icon: LayoutGrid },
  { href: '/restaurant/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/restaurant/earnings', label: 'Earnings', icon: CalendarDollar },
];

function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b">
      {NAV.map((n) => {
        const active = pathname === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={
              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ' +
              (active ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            <n.icon className="h-4 w-4" /> {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Guarded shell for every /restaurant/* page: loads the owner's restaurants
 * (ME_FULL.ownedRestaurants), keeps the selected one in the ?r= query param
 * (localStorage fallback) and renders the shared header + branch selector.
 */
function RestaurantShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const user = useAuth((s) => s.user);
  const { data, loading } = useQuery(ME_FULL, { fetchPolicy: 'cache-and-network' });
  const owned: any[] = useMemo(() => data?.me?.ownedRestaurants ?? [], [data]);
  const [selected, setSelected] = useState<string>('');

  // resolve selection: ?r= > localStorage > first restaurant
  useEffect(() => {
    if (loading) return;
    const fromUrl = params.get('r');
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LS_KEY);
    } catch {
      /* private mode */
    }
    const valid = (id: string | null | undefined) => id && owned.some((r) => r.id === id);
    const next = valid(fromUrl) ? fromUrl! : valid(stored) ? stored! : owned[0]?.id ?? '';
    setSelected(next ?? '');
    if (next) {
      try {
        window.localStorage.setItem(LS_KEY, next);
      } catch {
        /* ignore */
      }
    }
    if (fromUrl !== next && next) {
      const p = new URLSearchParams(params.toString());
      p.set('r', next);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owned, loading]);

  const restaurant = owned.find((r) => r.id === selected) ?? null;
  const branches: OwnedBranch[] = restaurant?.branches ?? [];

  // staff accounts don't appear in ownedRestaurants
  const isStaff = user?.role === 'RESTAURANT_STAFF';

  return (
    <AuthGuard roles={['RESTAURANT_OWNER', 'RESTAURANT_STAFF']}>
      <div className="container max-w-6xl space-y-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Restaurant partner
            </p>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-56" />
            ) : (
              <h1 className="truncate text-2xl font-bold">
                {restaurant?.name ?? (isStaff ? 'Back office' : 'Your restaurants')}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!loading && owned.length > 1 && (
              <Select
                value={selected}
                onValueChange={(v) => {
                  setSelected(v);
                  try {
                    window.localStorage.setItem(LS_KEY, v);
                  } catch {
                    /* ignore */
                  }
                  const p = new URLSearchParams(params.toString());
                  p.set('r', v);
                  router.replace(`${pathname}?${p.toString()}`, { scroll: false });
                }}
              >
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Choose restaurant" />
                </SelectTrigger>
                <SelectContent>
                  {owned.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {restaurant && restaurant.status !== 'APPROVED' && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700">
                {restaurant.status.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </div>

        <NavTabs />

        {children}
      </div>
    </AuthGuard>
  );
}

/** Wrap a back-office page body with the guard + shell + Suspense for search params. */
export function RestaurantPage({ children }: { children: (ctx: { restaurant: any; branches: OwnedBranch[]; loading: boolean }) => ReactNode }) {
  return (
    <Suspense fallback={<div className="container py-8" />}>
      <RestaurantShell>
        <ShellBody>{children}</ShellBody>
      </RestaurantShell>
    </Suspense>
  );
}

/** Re-read the resolved selection inside the shell via the shared localStorage key + ME_FULL. */
function ShellBody({ children }: { children: (ctx: { restaurant: any; branches: OwnedBranch[]; loading: boolean }) => ReactNode }) {
  const params = useSearchParams();
  const { data, loading } = useQuery(ME_FULL);
  const owned: any[] = data?.me?.ownedRestaurants ?? [];
  const id = params.get('r');
  const restaurant = owned.find((r) => r.id === id) ?? owned[0] ?? null;
  return <>{children({ restaurant, branches: restaurant?.branches ?? [], loading })}</>;
}
