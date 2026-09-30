import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CartFab } from '@/components/cart-fab';
import { EmptyState, LoadingBlock, Section, Screen } from '@/components/screen';
import { RestaurantCard, type RestaurantLike } from '@/components/restaurant-card';
import { StatusBadge } from '@/components/status-badge';
import { ACTIVE_ORDER, CUISINES, RESTAURANTS, RECOMMENDED, TRENDING_RESTAURANTS } from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth/store';
import { assetUrl } from '@/lib/config';
import { useUserLocation } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';

const PAGE_SIZE = 12;

/** Customer home: active order, cuisines, AI picks, trending and nearby list. */
export default function BrowseScreen() {
  const theme = useTheme();
  const user = useAuth((s) => s.user);
  const { coords, loading: geoLoading, denied, refresh: refreshGeo } = useUserLocation();
  const [page, setPage] = useState(1);
  const [cuisineId, setCuisineId] = useState<string>('');

  const activeQ = useQuery(ACTIVE_ORDER, { pollInterval: 30_000, fetchPolicy: 'cache-and-network' });
  const cuisinesQ = useQuery(CUISINES);
  const recommendedQ = useQuery(RECOMMENDED, { variables: { limit: 10 } });
  const trendingQ = useQuery(TRENDING_RESTAURANTS, { variables: { limit: 10 } });

  const filters = useMemo(
    () => ({
      ...(coords ? { lat: String(coords.lat), lng: String(coords.lng), near: true } : {}),
      ...(cuisineId ? { cuisineId } : {}),
      sort: coords ? 'distance' : 'popularity',
      page,
      limit: PAGE_SIZE,
    }),
    [coords, cuisineId, page],
  );
  const nearbyQ = useQuery(RESTAURANTS, { variables: { filters }, fetchPolicy: 'cache-and-network' });

  const refreshAll = () => {
    activeQ.refetch();
    cuisinesQ.refetch();
    recommendedQ.refetch();
    trendingQ.refetch();
    nearbyQ.refetch();
    refreshGeo();
  };

  const active = activeQ.data?.activeOrder;
  const restaurants: RestaurantLike[] = nearbyQ.data?.restaurants?.items ?? [];
  const pages: number = nearbyQ.data?.restaurants?.pages ?? 1;
  const firstLine = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <Screen refresh={refreshAll} refreshing={nearbyQ.loading && !nearbyQ.data}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.hello, { color: theme.subtext }]}>Hi {firstLine} 👋</Text>
          <Pressable style={styles.locRow} onPress={() => router.push('/addresses')} accessibilityRole="button">
            <Ionicons name="location-outline" size={14} color={palette.brand} />
            <Text style={[styles.locText, { color: theme.text }]} numberOfLines={1}>
              {geoLoading
                ? 'Getting your location…'
                : coords
                  ? 'Food near you'
                  : denied
                    ? 'Enable location for nearby spots'
                    : 'Choose a delivery address'}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.subtext} />
          </Pressable>
        </View>
        <Link href="/notifications" asChild>
          <Pressable style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }]} accessibilityRole="button">
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
          </Pressable>
        </Link>
      </View>

      {/* Fake search field — the real search lives in its own tab */}
      <Pressable
        style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => router.push('/tabs/search')}
        accessibilityRole="search"
      >
        <Ionicons name="search" size={17} color={theme.subtext} />
        <Text style={{ color: theme.subtext, fontSize: 14 }}>Search restaurants and dishes</Text>
      </Pressable>

      {/* Active order */}
      {active && (
        <Link href={{ pathname: '/track/[id]', params: { id: active.id } }} asChild>
          <Pressable style={[styles.active, { backgroundColor: theme.card, borderColor: palette.brand }]}>
            <View style={styles.activeIcon}>
              <Ionicons name="cube-outline" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeTitle, { color: theme.text }]}>
                Order #{active.orderNumber} · {active.branch?.restaurant?.name ?? active.branch?.name}
              </Text>
              <Text style={[styles.activeSub, { color: theme.subtext }]}>
                {active.estimatedDeliveryAt ? `Arriving around ${new Date(active.estimatedDeliveryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'We are on it'}
              </Text>
              <View style={{ marginTop: 6 }}>
                <StatusBadge status={active.status} />
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.brand} />
          </Pressable>
        </Link>
      )}

      {/* Cuisines */}
      {!!cuisinesQ.data?.cuisines?.length && (
        <View style={styles.cuisineWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cuisineRow}>
            <CuisinePill label="All" active={!cuisineId} onPress={() => setCuisineId('')} />
            {cuisinesQ.data.cuisines.map((c: any) => (
              <CuisinePill
                key={c.id}
                label={c.name}
                image={assetUrl(c.iconUrl)}
                active={cuisineId === c.id}
                onPress={() => {
                  setPage(1);
                  setCuisineId(cuisineId === c.id ? '' : c.id);
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recommended (AI + order history) */}
      {!!recommendedQ.data?.recommendedForMe?.length && (
        <Section title="Picked for you" subtitle="Based on what you usually order">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {recommendedQ.data.recommendedForMe.map((r: RestaurantLike) => (
              <RestaurantCard
                key={r.id}
                restaurant={r}
                compact
                showDistance={!!coords}
                onPress={() => router.push({ pathname: '/restaurant/[slug]', params: { slug: r.slug } })}
              />
            ))}
          </ScrollView>
        </Section>
      )}

      {/* Trending */}
      {!!trendingQ.data?.trendingRestaurants?.length && (
        <Section title="Trending now" subtitle="Most ordered around you this week">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {trendingQ.data.trendingRestaurants.map((r: RestaurantLike) => (
              <RestaurantCard
                key={r.id}
                restaurant={r}
                compact
                showDistance={!!coords}
                onPress={() => router.push({ pathname: '/restaurant/[slug]', params: { slug: r.slug } })}
              />
            ))}
          </ScrollView>
        </Section>
      )}

      {/* Nearby list */}
      <Section title={cuisineId ? 'Restaurants in this cuisine' : 'Nearby'} subtitle={`${nearbyQ.data?.restaurants?.total ?? 0} places`}>
        {nearbyQ.loading && !nearbyQ.data && <LoadingBlock label="Finding kitchens near you…" />}
        {nearbyQ.error && <EmptyState icon="wifi-outline" title="Could not load restaurants" body={nearbyQ.error.message} ctaLabel="Try again" ctaOnPress={refreshAll} />}
        {!nearbyQ.loading && !restaurants.length && !nearbyQ.error && (
          <EmptyState
            icon="fast-food-outline"
            title="Nothing here yet"
            body={coords ? 'Try widening your filters or another cuisine.' : 'Allow location or pick an address to see nearby spots.'}
            ctaLabel={coords ? 'Clear filters' : 'Enable location'}
            ctaOnPress={coords ? () => { setCuisineId(''); setPage(1); } : refreshGeo}
          />
        )}

        <FlatList
          data={restaurants}
          keyExtractor={(r) => r.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              showDistance={!!coords}
              onPress={() => router.push({ pathname: '/restaurant/[slug]', params: { slug: item.slug } })}
            />
          )}
        />

        {page < pages && (
          <Pressable style={[styles.more, { borderColor: theme.border }]} onPress={() => setPage((p) => p + 1)} accessibilityRole="button">
            <Text style={{ color: palette.brand, fontWeight: '800' }}>Show more places</Text>
          </Pressable>
        )}
      </Section>

      <CartFab />
    </Screen>
  );
}

function CuisinePill({ label, image, active, onPress }: { label: string; image?: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.cuisine,
        { backgroundColor: active ? palette.brand : theme.card, borderColor: active ? palette.brand : theme.border },
      ]}
    >
      {!!image && <Image source={{ uri: image }} style={styles.cuisineImg} />}
      <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hello: { fontSize: 13, fontWeight: '600' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  locText: { fontSize: 16, fontWeight: '900', maxWidth: 240 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  active: { borderWidth: 1, borderRadius: radius.card, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  activeIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  activeTitle: { fontSize: 14, fontWeight: '800' },
  activeSub: { fontSize: 12, marginTop: 2 },
  cuisineWrap: { marginBottom: 18, marginHorizontal: -16 },
  cuisineRow: { paddingHorizontal: 16, gap: 8 },
  cuisine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1 },
  cuisineImg: { width: 18, height: 18, borderRadius: 9 },
  rail: { gap: 12, paddingRight: 16 },
  more: {
    borderWidth: 1,
    borderRadius: radius.input,
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 14,
  },
});
