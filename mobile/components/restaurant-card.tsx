import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assetUrl } from '@/lib/config';
import { formatDistance, num } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';

/** Subset of the Restaurant type used by browse cards (RESTAURANT_CARD fragment). */
export interface RestaurantLike {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  avgRating?: number | string | null;
  reviewCount?: number | null;
  isFeatured?: boolean | null;
  distanceKm?: number | string | null;
  minDeliveryTimeMin?: number | null;
  cuisines?: { id: string; name: string }[] | null;
  branches?: { id: string; name: string; isOpenNow?: boolean | null; deliveryFee?: number | string | null; minOrderAmount?: number | string | null }[] | null;
}

/** Any branch open right now (a restaurant is "open" if one kitchen is). */
export function isRestaurantOpen(r: RestaurantLike): boolean {
  return (r.branches ?? []).some((b) => b.isOpenNow !== false);
}

function StarRow({ rating, count }: { rating: number; count?: number }) {
  return (
    <View style={styles.starRow}>
      <Ionicons name="star" size={13} color={palette.star} />
      <Text style={styles.starValue}>{rating.toFixed(1)}</Text>
      {count != null && <Text style={styles.starCount}>({count})</Text>}
    </View>
  );
}

interface Props {
  restaurant: RestaurantLike;
  onPress?: () => void;
  /** Carousel layout (fixed width) — defaults to a full-width row card. */
  compact?: boolean;
  showDistance?: boolean;
}

export function RestaurantCard({ restaurant: r, onPress, compact, showDistance }: Props) {
  const theme = useTheme();
  const image = assetUrl(r.coverUrl || r.logoUrl);
  const rating = num(r.avgRating, 0);
  const open = isRestaurantOpen(r);
  const cuisines = (r.cuisines ?? []).map((c) => c.name).slice(0, 3).join(' · ');
  const branch = r.branches?.[0];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
        compact ? styles.cardCompact : styles.cardFull,
      ]}
    >
      <View style={[styles.imageBox, compact ? styles.imageCompact : styles.imageFull]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>{r.name.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        {!!r.isFeatured && (
          <View style={styles.featured}>
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        )}
        {!open && (
          <View style={styles.closedPill}>
            <Text style={styles.closedText}>Closed now</Text>
          </View>
        )}
        {compact && (
          <View style={styles.ratingFloat}>
            <Ionicons name="star" size={11} color={palette.star} />
            <Text style={styles.ratingFloatText}>{rating.toFixed(1)}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {r.name}
        </Text>
        {!!cuisines && (
          <Text style={[styles.meta, { color: theme.subtext }]} numberOfLines={1}>
            {cuisines}
          </Text>
        )}

        {!compact && <StarRow rating={rating} count={r.reviewCount ?? 0} />}

        <View style={styles.footerRow}>
          {showDistance && r.distanceKm != null && (
            <Text style={[styles.pill, { color: theme.subtext, backgroundColor: theme.inputBg }]}>
              {formatDistance(num(r.distanceKm))}
            </Text>
          )}
          {!!r.minDeliveryTimeMin && (
            <Text style={[styles.pill, { color: theme.subtext, backgroundColor: theme.inputBg }]}>
              {r.minDeliveryTimeMin} min
            </Text>
          )}
          {branch?.deliveryFee != null && (
            <Text style={[styles.pill, { color: palette.brandDark, backgroundColor: palette.brandSoft }]}>
              {num(branch.deliveryFee) === 0 ? 'Free delivery' : `$${num(branch.deliveryFee).toFixed(2)} delivery`}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  cardFull: { width: '100%' },
  cardCompact: { width: 220, marginRight: 12 },
  imageBox: { position: 'relative' },
  imageFull: { height: 140 },
  imageCompact: { height: 110 },
  image: { width: '100%', height: '100%' },
  placeholder: {
    backgroundColor: palette.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: palette.brandDark, fontWeight: '900', fontSize: 24, letterSpacing: 1 },
  featured: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#0F172ACC',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  featuredText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  closedPill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#DC2626EE',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  closedText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  ratingFloat: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFFEE',
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ratingFloatText: { fontSize: 11, fontWeight: '800', color: palette.ink },
  body: { padding: 12 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 2 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  starValue: { fontSize: 12.5, fontWeight: '800', color: palette.ink },
  starCount: { fontSize: 12, color: palette.muted },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { fontSize: 11, fontWeight: '700', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
});
