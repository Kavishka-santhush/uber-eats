'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import { Heart, Star, MapPin, Clock, Bike } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ItemDialog, type MenuViewItem } from '@/components/item-dialog';
import { RESTAURANT_BY_SLUG, BRANCH_MENU, RESTAURANT_REVIEWS } from '@/lib/graphql/queries';
import { TOGGLE_FAV_RESTAURANT } from '@/lib/graphql/mutations';
import { assetUrl } from '@/lib/config';
import { formatMoney } from '@/lib/utils';
import { useAuth } from '@/lib/auth/store';
import { timeAgo } from '@/lib/date';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Branch {
  id: string;
  name: string;
  isOpenNow?: boolean;
  status: string;
  addressLine1: string;
  city?: string | null;
  lat: number | string;
  lng: number | string;
  deliveryFee: number | string;
  minOrderAmount: number | string;
  freeDeliveryAbove?: number | string | null;
  prepTimeMinutes: number;
  deliveryRadiusKm: number | string;
  hours?: { id: string; dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[];
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  avgRating: number;
  reviewCount: number;
  totalOrders: number;
  cuisines: { id: string; name: string }[];
  branches: Branch[];
}

export default function RestaurantPage() {
  const { slug } = useParams<{ slug: string }>();
  const me = useAuth((s) => s.user);

  const { data, loading, error } = useQuery<{ restaurantBySlug: Restaurant | null }>(
    RESTAURANT_BY_SLUG,
    { variables: { slug }, skip: !slug, errorPolicy: 'all' },
  );
  const restaurant = data?.restaurantBySlug ?? null;

  const branches = useMemo(
    () => (restaurant?.branches ?? []).slice().sort((a, b) => Number(!!b.isOpenNow) - Number(!!a.isOpenNow)),
    [restaurant],
  );
  const [branchId, setBranchId] = useState<string | null>(null);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0] ?? null;

  const menuQ = useQuery(
    BRANCH_MENU,
    { variables: { branchId: branch?.id }, skip: !branch?.id, errorPolicy: 'all' },
  );
  const reviewsQ = useQuery(
    RESTAURANT_REVIEWS,
    { variables: { restaurantId: restaurant?.id, page: 1, limit: 20 }, skip: !restaurant?.id, errorPolicy: 'all' },
  );

  const [fav] = useMutation(TOGGLE_FAV_RESTAURANT);
  const favIds: string[] = useMemo(() => {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('qb_favs') : null;
    return raw ? JSON.parse(raw) : [];
  }, []);
  const [favSet, setFavSet] = useState<Set<string>>(new Set(favIds));

  const [dialogItem, setDialogItem] = useState<MenuViewItem | null>(null);

  const toggleFavorite = async () => {
    if (!restaurant) return;
    if (!me) {
      toast.error('Log in to save favorites');
      return;
    }
    setFavSet((s) => {
      const next = new Set(s);
      if (next.has(restaurant.id)) next.delete(restaurant.id);
      else next.add(restaurant.id);
      window.localStorage.setItem('qb_favs', JSON.stringify([...next]));
      return next;
    });
    try {
      await fav({ variables: { restaurantId: restaurant.id } });
    } catch {
      toast.error('Could not update favorites');
    }
  };

  if (loading) {
    return (
      <div className="container space-y-4 py-10">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !restaurant) {
    return (
      <div className="container py-20 text-center text-muted-foreground">
        Restaurant not found.
      </div>
    );
  }

  const categories: any[] = menuQ.data?.branchMenu ?? [];

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <div className="relative h-44 w-full bg-muted md:h-60">
        {restaurant.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(restaurant.coverUrl)} alt={restaurant.name} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="container absolute bottom-4 flex items-end gap-4">
          {restaurant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(restaurant.logoUrl)}
              alt=""
              className="h-16 w-16 rounded-xl border-2 border-white object-cover shadow md:h-20 md:w-20"
            />
          )}
          <div className="text-white">
            <h1 className="text-2xl font-extrabold md:text-3xl">{restaurant.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
              {restaurant.avgRating > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {restaurant.avgRating.toFixed(1)} ({restaurant.reviewCount})
                </span>
              )}
              <span>{restaurant.cuisines.map((c) => c.name).join(' · ')}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="ml-auto shrink-0"
            onClick={toggleFavorite}
            aria-label="Save to favorites"
          >
            <Heart className={favSet.has(restaurant.id) ? 'fill-red-500 text-red-500' : ''} />
          </Button>
        </div>
      </div>

      <div className="container py-6">
        {/* Branch picker + quick facts */}
        {branches.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {branches.map((b) => (
              <Badge
                key={b.id}
                variant={branch?.id === b.id ? 'default' : 'outline'}
                className={
                  'cursor-pointer py-1.5 ' +
                  (branch?.id === b.id ? 'bg-brand' : '') +
                  (b.isOpenNow ? '' : ' opacity-60')
                }
                onClick={() => setBranchId(b.id)}
              >
                <MapPin className="mr-1 h-3 w-3" />
                {b.name}
                {!b.isOpenNow && ' (closed)'}
              </Badge>
            ))}
          </div>
        )}
        {branch && (
          <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Delivery fee</p>
              <p className="font-semibold">{Number(branch.deliveryFee) === 0 ? 'Free' : formatMoney(branch.deliveryFee)}</p>
              {branch.freeDeliveryAbove != null && Number(branch.freeDeliveryAbove) > 0 && (
                <p className="text-xs text-brand">Free over {formatMoney(branch.freeDeliveryAbove)}</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Min. order</p>
              <p className="font-semibold">{formatMoney(branch.minOrderAmount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Prep time</p>
              <p className="flex items-center gap-1 font-semibold">
                <Clock className="h-3.5 w-3.5" /> {branch.prepTimeMinutes} min
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Delivers up to</p>
              <p className="flex items-center gap-1 font-semibold">
                <Bike className="h-3.5 w-3.5" /> {Number(branch.deliveryRadiusKm).toFixed(1)} km
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="menu">
          <TabsList className="mb-4">
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="reviews">Reviews ({restaurant.reviewCount})</TabsTrigger>
            <TabsTrigger value="info">Info & hours</TabsTrigger>
          </TabsList>

          <TabsContent value="menu" className="space-y-8">
            {menuQ.loading && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            )}
            {!menuQ.loading && categories.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">
                {branch?.isOpenNow === false ? 'This branch is closed right now.' : 'Menu is empty for now.'}
              </p>
            )}
            {categories.map((cat: any) => (
              <section key={cat.id}>
                <h2 className="mb-3 text-lg font-bold">{cat.name}</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(cat.items ?? []).map((item: MenuViewItem & { isBestSeller?: boolean; isNew?: boolean; availability: string }) => (
                    <button
                      key={item.id}
                      disabled={item.availability !== 'AVAILABLE'}
                      onClick={() => setDialogItem(item)}
                      className="flex gap-3 rounded-xl border bg-card p-3 text-left transition-shadow hover:shadow-md disabled:opacity-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{item.name}</p>
                          {item.isBestSeller && <Badge className="bg-amber-500 hover:bg-amber-500">Popular</Badge>}
                          {item.isNew && <Badge variant="secondary">New</Badge>}
                        </div>
                        {item.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                        )}
                        <p className="mt-1 font-medium text-brand">{formatMoney(item.price)}</p>
                        {item.availability === 'SOLD_OUT' && (
                          <p className="text-xs text-destructive">Sold out</p>
                        )}
                      </div>
                      {item.imageUrls?.[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetUrl(item.imageUrls[0])}
                          alt=""
                          className="h-20 w-20 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </TabsContent>

          <TabsContent value="reviews" className="space-y-4">
            {(reviewsQ.data?.restaurantReviews?.items ?? []).length === 0 && (
              <p className="py-10 text-center text-muted-foreground">No reviews yet.</p>
            )}
            {(reviewsQ.data?.restaurantReviews?.items ?? []).map((rv: any) => (
              <div key={rv.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {rv.author?.avatarUrl && <img src={assetUrl(rv.author.avatarUrl)} alt="" className="h-8 w-8 rounded-full object-cover" />}
                  <p className="font-medium">{rv.author?.fullName ?? 'Anonymous'}</p>
                  <span className="ml-auto flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={'h-3.5 w-3.5 ' + (i < rv.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted')}
                      />
                    ))}
                  </span>
                </div>
                {rv.comment && <p className="mt-2 text-sm">{rv.comment}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{timeAgo(rv.createdAt)}{rv.helpfulCount ? ` · ${rv.helpfulCount} helpful` : ''}</p>
                {rv.response && (
                  <div className="mt-2 rounded-lg bg-muted p-2 text-sm">
                    <p className="text-xs font-semibold">Owner reply</p>
                    {rv.response.message}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="info" className="max-w-xl space-y-4">
            {restaurant.description && <p className="text-sm text-muted-foreground">{restaurant.description}</p>}
            <Separator />
            {branch && (
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand" /> {branch.addressLine1}{branch.city ? `, ${branch.city}` : ''}</p>
                <p className="font-semibold">{branch.name} — opening hours</p>
                <ul className="space-y-1">
                  {(branch.hours ?? []).slice().sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((h) => (
                    <li key={h.id} className="flex justify-between">
                      <span className="text-muted-foreground">{DAY_NAMES[h.dayOfWeek]}</span>
                      <span>{h.isClosed ? 'Closed' : `${h.openTime} – ${h.closeTime}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {dialogItem && branch && (
        <ItemDialog
          item={dialogItem}
          branchId={branch.id}
          branchName={branch.name}
          restaurantId={restaurant.id}
          open={!!dialogItem}
          onOpenChange={(o) => !o && setDialogItem(null)}
        />
      )}
    </div>
  );
}
