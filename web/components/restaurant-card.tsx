'use client';

import Link from 'next/link';
import { Star, Clock, Bike } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/utils';
import { assetUrl } from '@/lib/config';

export interface RestaurantCardData {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  avgRating?: number | null;
  reviewCount?: number | null;
  isFeatured?: boolean;
  distanceKm?: number | null;
  minDeliveryTimeMin?: number | null;
  cuisines?: { id: string; name: string }[];
  branches?: {
    id: string;
    name: string;
    isOpenNow?: boolean;
    deliveryFee?: number | string | null;
    minOrderAmount?: number | string | null;
    prepTimeMinutes?: number | null;
  }[];
}

/** Grid card used on the landing + browse pages. */
export function RestaurantCard({ r }: { r: RestaurantCardData }) {
  const branch = r.branches?.[0];
  return (
    <Link href={`/restaurant/${r.slug}`} className="group block">
      <Card className="overflow-hidden transition-shadow group-hover:shadow-md h-full">
        <div className="relative aspect-[16/9] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl(r.coverUrl || r.logoUrl) || '/placeholder-food.svg'}
            alt={r.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {r.isFeatured && (
            <Badge className="absolute left-2 top-2 bg-brand hover:bg-brand">Featured</Badge>
          )}
          {branch && branch.isOpenNow === false && (
            <Badge variant="secondary" className="absolute left-2 top-2">Closed</Badge>
          )}
        </div>
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-semibold">{r.name}</h3>
            {typeof r.avgRating === 'number' && r.avgRating > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {r.avgRating.toFixed(1)}
              </span>
            )}
          </div>
          {r.cuisines && r.cuisines.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {r.cuisines.map((c) => c.name).join(' · ')}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            {(r.minDeliveryTimeMin ?? branch?.prepTimeMinutes) != null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {r.minDeliveryTimeMin ?? branch?.prepTimeMinutes}–{((r.minDeliveryTimeMin ?? branch?.prepTimeMinutes ?? 30) + 15)} min
              </span>
            )}
            {branch?.deliveryFee != null && (
              <span className="flex items-center gap-1">
                <Bike className="h-3.5 w-3.5" />
                {Number(branch.deliveryFee) === 0 ? 'Free delivery' : formatMoney(branch.deliveryFee)}
              </span>
            )}
            {r.distanceKm != null && <span>{Number(r.distanceKm).toFixed(1)} km</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
