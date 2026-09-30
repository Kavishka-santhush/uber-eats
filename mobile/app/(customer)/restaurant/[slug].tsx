import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardRow } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingBlock, Section, Screen } from '@/components/screen';
import { ItemModal, type MenuItemLike } from '@/components/item-modal';
import { formatPrice } from '@/components/price';
import { BRANCH_MENU, MY_FAVS, RESTAURANT_BY_SLUG, RESTAURANT_REVIEWS } from '@/lib/graphql/queries';
import { TOGGLE_FAV_RESTAURANT } from '@/lib/graphql/mutations';
import { assetUrl } from '@/lib/config';
import { haversineKm, num, useUserLocation } from '@/lib/geo';
import { useCart } from '@/lib/cart/store';
import { palette, radius, useTheme } from '@/lib/theme';
import { timeAgo } from '@/lib/date';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Branch {
  id: string;
  name: string;
  isOpenNow?: boolean | null;
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
  serviceFeePercent?: number | string | null;
  hours?: { id: string; dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[];
}

/** Restaurant profile + branch picker + menu + reviews. */
export default function RestaurantScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { coords } = useUserLocation();
  const lines = useCart((s) => s.lines);
  const cartBranchId = useCart((s) => s.branchId);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<MenuItemLike | null>(null);
  const [reviewsPage, setReviewsPage] = useState(1);

  const infoQ = useQuery(RESTAURANT_BY_SLUG, { variables: { slug }, skip: !slug, errorPolicy: 'all' });
  const restaurant = infoQ.data?.restaurantBySlug ?? null;

  // Open branches first, then nearest to the customer's position.
  const branches: Branch[] = useMemo(() => {
    const list: Branch[] = [...(restaurant?.branches ?? [])];
    return list.sort((a, b) => {
      if (!!b.isOpenNow !== !!a.isOpenNow) return Number(!!b.isOpenNow) - Number(!!a.isOpenNow);
      if (!coords) return 0;
      return haversineKm(coords, { lat: num(a.lat), lng: num(a.lng) }) - haversineKm(coords, { lat: num(b.lat), lng: num(b.lng) });
    });
  }, [restaurant]);

  const branch = branches.find((b) => b.id === branchId) ?? branches[0] ?? null;

  const menuQ = useQuery(BRANCH_MENU, { variables: { branchId: branch?.id }, skip: !branch?.id, errorPolicy: 'all' });
  const reviewsQ = useQuery(
    RESTAURANT_REVIEWS,
    { variables: { restaurantId: restaurant?.id, page: reviewsPage, limit: 10 }, skip: !restaurant?.id, errorPolicy: 'all' },
  );
  const favsQ = useQuery(MY_FAVS);
  const [toggleFav] = useMutation(TOGGLE_FAV_RESTAURANT, { refetchQueries: [{ query: MY_FAVS }] });

  const favouriteIds: string[] = (favsQ.data?.me?.favorites ?? [])
    .filter((f: any) => f.restaurant?.id)
    .map((f: any) => f.restaurant.id);
  const isFav = !!restaurant && favouriteIds.includes(restaurant.id);

  if (infoQ.loading && !restaurant) {
    return (
      <Screen back title="Restaurant">
        <LoadingBlock label="Opening the kitchen…" />
      </Screen>
    );
  }
  if (!restaurant) {
    return (
      <Screen back title="Restaurant">
        <EmptyState icon="storefront-outline" title="Restaurant not found" body="It may have been removed or renamed." ctaLabel="Back to browse" ctaOnPress={() => router.replace('/tabs')} />
      </Screen>
    );
  }

  const categories: any[] = menuQ.data?.branchMenu ?? [];
  const cartUnits = lines.reduce((n, l) => n + l.quantity, 0);
  const cover = assetUrl(restaurant.coverUrl);
  const logo = assetUrl(restaurant.logoUrl);
  const today = new Date().getDay();
  const hours = (branch?.hours ?? []).find((h) => h.dayOfWeek === today);

  return (
    <Screen
      back
      title={restaurant.name}
      action={{
        label: isFav ? '★ Saved' : '☆ Save',
        onPress: () => toggleFav({ variables: { restaurantId: restaurant.id } }),
      }}
      footer={
        branch ? (
          <View style={styles.footerRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.subtext, fontSize: 12 }}>
                Min order {formatPrice(branch.minOrderAmount)} · delivery {formatPrice(branch.deliveryFee)}
              </Text>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                {branch.prepTimeMinutes} min prep · {num(branch.deliveryRadiusKm)} km radius
              </Text>
            </View>
            {cartUnits > 0 && (
              <Button title={`View cart (${cartUnits})`} onPress={() => router.push('/cart')} style={{ minWidth: 130 }} />
            )}
          </View>
        ) : undefined
      }
    >
      {/* Hero */}
      <View style={styles.hero}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.heroImg} />
        ) : (
          <View style={[styles.heroImg, styles.heroFallback]} />
        )}
        <View style={styles.heroOverlay} />
        <View style={styles.heroText}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} /> : null}
          <Text style={styles.heroTitle} numberOfLines={1}>
            {restaurant.name}
          </Text>
          <View style={styles.heroBadges}>
            <View style={styles.pillDark}>
              <Ionicons name="star" size={11} color={palette.star} />
              <Text style={styles.pillText}>{num(restaurant.avgRating).toFixed(1)} ({restaurant.reviewCount})</Text>
            </View>
            <View style={styles.pillDark}>
              <Text style={styles.pillText}>{restaurant.totalOrders} orders</Text>
            </View>
            {(restaurant.cuisines ?? []).slice(0, 2).map((c: any) => (
              <View key={c.id} style={styles.pillDark}>
                <Text style={styles.pillText}>{c.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {!!restaurant.description && (
        <Text style={[styles.desc, { color: theme.subtext }]}>{restaurant.description}</Text>
      )}

      {/* Branch picker */}
      {branches.length > 0 && (
        <Section title="Choose a branch" subtitle={coords ? 'Sorted by distance from you' : 'Open branches first'}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {branches.map((b) => {
              const active = b.id === branch?.id;
              const distance = coords ? haversineKm(coords, { lat: num(b.lat), lng: num(b.lng) }) : null;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setBranchId(b.id)}
                  style={[
                    styles.branch,
                    {
                      backgroundColor: active ? palette.brand : theme.card,
                      borderColor: active ? palette.brand : theme.border,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '800', fontSize: 13.5 }} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Text style={{ color: active ? '#FFFFFFCC' : theme.subtext, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
                    {b.addressLine1}
                    {distance != null ? ` · ${distance.toFixed(1)} km` : ''}
                  </Text>
                  {!b.isOpenNow && (
                    <Text style={{ color: active ? '#fff' : palette.danger, fontSize: 10.5, fontWeight: '900', marginTop: 3 }}>
                      Closed now
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          {cartBranchId && branch && cartBranchId !== branch.id && (
            <View style={[styles.swapNotice, { backgroundColor: '#FEF3C7' }]}>
              <Text style={{ color: '#B45309', fontSize: 12, fontWeight: '700' }}>
                Your cart has items from another branch — ordering here will replace it.
              </Text>
            </View>
          )}
        </Section>
      )}

      {/* Today's hours */}
      {!!hours && (
        <Card style={{ marginBottom: 20 }}>
          <CardRow
            right={<Badge label={hours.isClosed ? 'Closed' : `${hours.openTime}–${hours.closeTime}`} tone={hours.isClosed ? 'danger' : 'brand'} />}
          >
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Today · {DAY_NAMES[today]}</Text>
          </CardRow>
        </Card>
      )}

      {/* Menu */}
      {menuQ.loading && (
        <Section title="Menu">
          <LoadingBlock label="Loading the menu…" />
        </Section>
      )}
      {!menuQ.loading && !categories.length && (
        <EmptyState icon="restaurant-outline" title="No menu published yet" body="This branch has not uploaded its dishes." />
      )}
      {categories.map((cat: any) => (
        <Section key={cat.id} title={cat.name} subtitle={`${(cat.items ?? []).length} dishes`}>
          <View style={{ gap: 10 }}>
            {(cat.items ?? []).map((item: MenuItemLike) => {
              const img = assetUrl(item.imageUrls?.[0]);
              const soldOut = item.availability && item.availability !== 'AVAILABLE';
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSheetItem(item)}
                  style={[styles.dish, { backgroundColor: theme.card, borderColor: theme.border, opacity: soldOut ? 0.6 : 1 }]}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={styles.dishHead}>
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14.5, flex: 1 }} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.isBestSeller && <Badge label="Bestseller" tone="warning" />}
                    </View>
                    {!!item.description && (
                      <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 3 }} numberOfLines={2}>
                        {item.description}
                      </Text>
                    )}
                    <View style={styles.dishMeta}>
                      <Text style={{ color: palette.brandDark, fontWeight: '900', fontSize: 14 }}>{formatPrice(item.price)}</Text>
                      {!!item.compareAtPrice && num(item.compareAtPrice) > 0 && (
                        <Text style={{ color: theme.subtext, fontSize: 12, textDecorationLine: 'line-through' }}>
                          {formatPrice(item.compareAtPrice)}
                        </Text>
                      )}
                      {!!item.prepTimeMinutes && (
                        <Text style={{ color: theme.subtext, fontSize: 11.5 }}>· {item.prepTimeMinutes} min</Text>
                      )}
                      {!!soldOut && <Text style={{ color: palette.danger, fontSize: 11.5, fontWeight: '800' }}>· {item.availability === 'SOLD_OUT' ? 'Sold out' : 'Unavailable'}</Text>}
                    </View>
                  </View>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.dishImg} />
                  ) : (
                    <View style={[styles.dishImg, styles.dishFallback]}>
                      <Ionicons name="fast-food-outline" size={20} color={palette.muted} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Section>
      ))}

      {/* Reviews */}
      <Section
        title="Reviews"
        subtitle={`${num(restaurant.avgRating).toFixed(1)} average · ${restaurant.reviewCount} ratings`}
        action={reviewsQ.data?.restaurantReviews?.pages > reviewsPage ? { label: 'More', onPress: () => setReviewsPage((p) => p + 1) } : undefined}
      >
        {reviewsQ.loading && !reviewsQ.data && <LoadingBlock />}
        {(reviewsQ.data?.restaurantReviews?.items ?? []).length === 0 && !reviewsQ.loading && (
          <Text style={{ color: theme.subtext, fontSize: 13 }}>No reviews yet — be the first to order.</Text>
        )}
        <View style={{ gap: 12 }}>
          {(reviewsQ.data?.restaurantReviews?.items ?? []).map((r: any) => (
            <View key={r.id} style={[styles.review, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.reviewHead}>
                <View style={styles.avatar}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>
                    {(r.author?.fullName ?? '?').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{r.author?.fullName ?? 'Customer'}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 11 }}>{timeAgo(r.createdAt)}</Text>
                </View>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ionicons key={n} name={n <= r.rating ? 'star' : 'star-outline'} size={12} color={palette.star} />
                  ))}
                </View>
              </View>
              {!!r.comment && <Text style={{ color: theme.text, fontSize: 13, marginTop: 8, lineHeight: 19 }}>{r.comment}</Text>}
              {!!r.response?.message && (
                <View style={[styles.reply, { backgroundColor: theme.inputBg }]}>
                  <Text style={{ color: theme.subtext, fontSize: 12 }}>
                    <Text style={{ fontWeight: '900' }}>Owner reply · </Text>
                    {r.response.message}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </Section>

      <ItemModal item={sheetItem} branchId={branch?.id ?? ''} branchName={branch?.name} visible={!!sheetItem} onClose={() => setSheetItem(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hero: { height: 170, borderRadius: radius.card, overflow: 'hidden', marginBottom: 14, position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroFallback: { backgroundColor: palette.brandSoft },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0F172A88' },
  heroText: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  logo: { width: 40, height: 40, borderRadius: 12, marginBottom: 8, borderWidth: 2, borderColor: '#fff' },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '900' },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pillDark: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0F172AAA', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  desc: { fontSize: 13.5, lineHeight: 20, marginBottom: 18 },
  rail: { gap: 10, paddingRight: 4 },
  branch: { width: 190, borderWidth: 1, borderRadius: radius.card, padding: 12 },
  swapNotice: { borderRadius: radius.input, padding: 10, marginTop: 10 },
  dish: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.card, padding: 12 },
  dishHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dishMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  dishImg: { width: 64, height: 64, borderRadius: 12 },
  dishFallback: { backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  review: { borderWidth: 1, borderRadius: radius.card, padding: 12 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  stars: { flexDirection: 'row', gap: 1 },
  reply: { borderRadius: radius.input, padding: 9, marginTop: 8 },
});
