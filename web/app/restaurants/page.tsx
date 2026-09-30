'use client';

import { useCallback, useMemo, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { Search, Star, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RestaurantCard } from '@/components/restaurant-card';
import { formatMoney } from '@/lib/utils';
import { RESTAURANTS, CUISINES, SEARCH_FOOD } from '@/lib/graphql/queries';

type SortKey = 'relevance' | 'rating' | 'delivery_time' | 'distance' | 'popularity';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'rating', label: 'Top rated' },
  { key: 'delivery_time', label: 'Fastest' },
  { key: 'popularity', label: 'Popular' },
];

export default function RestaurantsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search') ?? '';
  const cuisineId = params.get('cuisine') ?? undefined;
  const sort = (params.get('sort') ?? 'relevance') as SortKey;
  const openNow = params.get('open') === '1';
  const page = Math.max(1, Number(params.get('page') ?? 1));

  const setParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === '') next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/restaurants?${next.toString()}`);
    },
    [params, router],
  );

  const filters = useMemo(
    () => ({
      search: search || undefined,
      cuisineId,
      sort,
      openNow: openNow || undefined,
      page,
      limit: 20,
    }),
    [search, cuisineId, sort, openNow, page],
  );

  const { data: cuisinesData } = useQuery(CUISINES);
  const { data, loading, error } = useQuery(
    RESTAURANTS,
    { variables: { filters } },
  );
  // also search dishes when there's a term
  const { data: dishesData } = useQuery(SEARCH_FOOD, {
    variables: { query: search, page: 1, limit: 12 },
    skip: !search || search.trim().length < 2,
    errorPolicy: 'ignore',
  });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const el = (e.currentTarget.elements.namedItem('q') as HTMLInputElement);
    setParam({ search: el.value.trim() || undefined, page: undefined });
  };

  const list = data?.restaurants?.items ?? [];
  const pages = data?.restaurants?.pages ?? 1;
  const dishes: any[] = dishesData?.searchFood?.items ?? [];

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center">
        <form onSubmit={onSearch} className="flex max-w-lg flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={search} placeholder="Search restaurants or dishes…" className="pl-9" />
          </div>
          <Button type="submit" className="bg-brand hover:bg-brand-dark">Search</Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {SORTS.map((s) => (
            <Badge
              key={s.key}
              variant={sort === s.key ? 'default' : 'outline'}
              className={sort === s.key ? 'cursor-pointer bg-brand' : 'cursor-pointer'}
              onClick={() => setParam({ sort: s.key, page: undefined })}
            >
              {s.label}
            </Badge>
          ))}
          <label className="ml-2 flex items-center gap-2 text-sm">
            <Switch checked={openNow} onCheckedChange={(v) => setParam({ open: v ? '1' : undefined, page: undefined })} />
            Open now
          </label>
        </div>
      </div>

      {/* cuisine chips */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <Badge
          variant={!cuisineId ? 'default' : 'outline'}
          className={!cuisineId ? 'shrink-0 cursor-pointer bg-brand' : 'shrink-0 cursor-pointer'}
          onClick={() => setParam({ cuisine: undefined, page: undefined })}
        >
          All
        </Badge>
        {(cuisinesData?.cuisines ?? []).map((c: any) => (
          <Badge
            key={c.id}
            variant={cuisineId === c.id ? 'default' : 'outline'}
            className={cuisineId === c.id ? 'shrink-0 cursor-pointer bg-brand' : 'shrink-0 cursor-pointer'}
            onClick={() => setParam({ cuisine: c.id, page: undefined })}
          >
            {c.name}
          </Badge>
        ))}
      </div>

      {/* dish results */}
      {dishes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Star className="h-4 w-4 text-brand" /> Dishes matching “{search}”
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {dishes.map((d) => (
              <button
                key={d.id}
                className="rounded-xl border bg-card p-3 text-left text-sm transition-shadow hover:shadow-md"
                onClick={() => router.push(`/restaurant/${d.branch?.restaurant?.slug ?? ''}?highlight=${d.id}`)}
              >
                <p className="truncate font-semibold">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">{d.restaurantName}</p>
                <p className="mt-1 font-medium">{formatMoney(d.price)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-3 text-lg font-bold">
        {loading ? 'Loading…' : `${data?.restaurants?.total ?? 0} restaurants`}
      </h2>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Could not load restaurants. Is the API running?
        </div>
      )}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Clock className="h-8 w-8" />
          <p className="font-medium">No restaurants match your filters</p>
          <p className="text-sm">Try clearing the search or cuisine filter.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((r: any) => (
              <RestaurantCard key={r.id} r={r} />
            ))}
          </div>
          {pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setParam({ page: String(page - 1) })}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
              <Button
                variant="outline"
                disabled={page >= pages}
                onClick={() => setParam({ page: String(page + 1) })}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
