'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, gql } from '@apollo/client';
import { Search, UtensilsCrossed, Bike, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RestaurantCard } from '@/components/restaurant-card';
import { RESTAURANT_CARD } from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth/store';
import { config } from '@/lib/config';

const HOME_QUERY = gql`
  query Home {
    cuisines { id name slug iconUrl }
    trendingRestaurants(limit: 10) { ...RestaurantCard }
    recommendedForMe(limit: 8) { ...RestaurantCard }
  }
  ${RESTAURANT_CARD}
`;

interface Cuisine { id: string; name: string; slug: string; iconUrl?: string | null }
interface PageData {
  cuisines: Cuisine[];
  trendingRestaurants: any[];
  recommendedForMe: any[];
}

export default function HomePage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [q, setQ] = useState('');

  const { data, loading } = useQuery<PageData>(HOME_QUERY, {
    errorPolicy: 'all', // recommendedForMe needs auth — ignore its error for guests
  });

  const search = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/restaurants?search=${encodeURIComponent(term)}`);
    else router.push('/restaurants');
  };

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand/10 via-background to-background py-14 md:py-20">
        <div className="container max-w-3xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Delicious food, <span className="text-brand">delivered fast</span>
          </h1>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            Order from the best local restaurants on {config.appName}.
          </p>
          <form onSubmit={search} className="mx-auto mt-6 flex max-w-xl gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search restaurants or dishes…"
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-brand hover:bg-brand-dark">Search</Button>
          </form>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><UtensilsCrossed className="h-4 w-4 text-brand" /> Thousands of dishes</span>
            <span className="flex items-center gap-2"><Bike className="h-4 w-4 text-brand" /> Real-time tracking</span>
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> AI recommendations</span>
          </div>
        </div>
      </section>

      {/* Cuisines */}
      <section className="container py-8">
        <h2 className="mb-4 text-xl font-bold">Browse by cuisine</h2>
        {loading ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-28 shrink-0 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
            {(data?.cuisines ?? []).map((c) => (
              <Link
                key={c.id}
                href={`/restaurants?cuisine=${c.id}`}
                className="flex w-28 shrink-0 flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center text-sm font-medium transition-shadow hover:shadow-md"
              >
                {c.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.iconUrl} alt={c.name} className="h-10 w-10 object-contain" />
                ) : (
                  <UtensilsCrossed className="h-8 w-8 text-brand" />
                )}
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recommended (logged-in) */}
      {user && (data?.recommendedForMe?.length ?? 0) > 0 && (
        <section className="container py-6">
          <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
            <Sparkles className="h-5 w-5 text-brand" /> Picked for you
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">Based on your order history, powered by AI.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data!.recommendedForMe.slice(0, 8).map((r: any) => (
              <RestaurantCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {/* Trending */}
      <section className="container py-6 pb-16">
        <h2 className="mb-4 text-xl font-bold">Trending near you</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : (data?.trendingRestaurants?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data!.trendingRestaurants.map((r: any) => (
              <RestaurantCard key={r.id} r={r} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No restaurants yet — check back soon, or seed the database.
          </p>
        )}
      </section>

      {/* Become partner / driver */}
      <section className="container pb-16">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <h3 className="text-lg font-bold">Partner with us</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Grow your business by reaching thousands of hungry customers.
            </p>
            <Button className="mt-4 bg-brand hover:bg-brand-dark" asChild>
              <Link href="/profile?tab=business">Become a restaurant partner</Link>
            </Button>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h3 className="text-lg font-bold">Deliver and earn</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Flexible hours, weekly payouts, and a driver app that guides every stop.
            </p>
            <Button className="mt-4 bg-brand hover:bg-brand-dark" asChild>
              <Link href={user ? '/driver' : '/login?next=/driver'}>Become a driver</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
