import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChipRow, EmptyState, LoadingBlock, Screen } from '@/components/screen';
import { RestaurantCard, type RestaurantLike } from '@/components/restaurant-card';
import { formatPrice } from '@/components/price';
import { RESTAURANTS, SEARCH_FOOD } from '@/lib/graphql/queries';
import { assetUrl } from '@/lib/config';
import { useUserLocation } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';

/** Search across restaurants and individual dishes, with lightweight filters. */
export default function SearchScreen() {
  const theme = useTheme();
  const { coords } = useUserLocation();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tab, setTab] = useState<'restaurants' | 'dishes'>('restaurants');
  const [openNow, setOpenNow] = useState(false);
  const [sort, setSort] = useState('relevance');

  // 400 ms debounce keeps the GraphQL endpoint quiet while typing.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 400);
    return () => clearTimeout(t);
  }, [term]);

  const filters = useMemo(
    () => ({
      ...(debounced ? { search: debounced } : {}),
      ...(coords ? { lat: String(coords.lat), lng: String(coords.lng) } : {}),
      ...(openNow ? { openNow: true } : {}),
      sort,
      page: 1,
      limit: 30,
    }),
    [debounced, coords, openNow, sort],
  );

  const placesQ = useQuery(RESTAURANTS, { variables: { filters }, skip: tab !== 'restaurants' });
  const dishesQ = useQuery(SEARCH_FOOD, {
    variables: { query: debounced, page: 1, limit: 30 },
    skip: tab !== 'dishes' || debounced.length < 2,
  });

  const places: RestaurantLike[] = placesQ.data?.restaurants?.items ?? [];
  const dishes: any[] = dishesQ.data?.searchFood?.items ?? [];
  const busy = tab === 'restaurants' ? placesQ.loading : dishesQ.loading;
  const empty = tab === 'restaurants' ? !places.length : !dishes.length;

  return (
    <Screen title="Search" back={false} refresh={tab === 'restaurants' ? placesQ.refetch : dishesQ.refetch} refreshing={busy}>
      <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.subtext} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Restaurants, cuisines, dishes…"
          placeholderTextColor={theme.subtext}
          style={[styles.input, { color: theme.text }]}
          autoCorrect={false}
          returnKeyType="search"
        />
        {!!term && (
          <Pressable onPress={() => setTerm('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={theme.subtext} />
          </Pressable>
        )}
      </View>

      <ChipRow
        value={tab}
        onChange={(v) => setTab(v as 'restaurants' | 'dishes')}
        options={[
          { value: 'restaurants', label: 'Restaurants' },
          { value: 'dishes', label: 'Dishes' },
        ]}
      />

      <View style={styles.filterRow}>
        <ChipRow
          value={sort}
          onChange={setSort}
          options={[
            { value: 'relevance', label: 'Relevance' },
            { value: 'rating', label: 'Top rated' },
            { value: 'delivery_time', label: 'Fastest' },
            ...(coords ? [{ value: 'distance', label: 'Nearest' }] : []),
          ]}
        />
        <Pressable
          onPress={() => setOpenNow((v) => !v)}
          style={[
            styles.openNow,
            { borderColor: openNow ? palette.brand : theme.border, backgroundColor: openNow ? palette.brandSoft : theme.card },
          ]}
          accessibilityRole="button"
        >
          <Text style={{ color: openNow ? palette.brandDark : theme.subtext, fontWeight: '800', fontSize: 12 }}>Open now</Text>
        </Pressable>
      </View>

      {busy && <LoadingBlock label="Searching…" />}

      {!busy && empty && (
        <EmptyState
          icon="search-outline"
          title={debounced ? `No matches for "${debounced}"` : 'Start typing'}
          body={debounced ? 'Try a dish name, a cuisine or a restaurant.' : 'Search thousands of dishes from local kitchens.'}
        />
      )}

      {tab === 'restaurants' && !busy && !!places.length && (
        <FlatList
          data={places}
          keyExtractor={(r) => r.id}
          scrollEnabled={false}
          contentContainerStyle={{ gap: 12, marginTop: 16 }}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              showDistance={!!coords}
              onPress={() => router.push({ pathname: '/restaurant/[slug]', params: { slug: item.slug } })}
            />
          )}
        />
      )}

      {tab === 'dishes' && !busy && !!dishes.length && (
        <View style={{ marginTop: 16, gap: 10 }}>
          {dishes.map((d) => {
            const image = assetUrl(d.imageUrls?.[0]);
            return (
              <Pressable
                key={d.id}
                onPress={() =>
                  router.push({ pathname: '/restaurant/[slug]', params: { slug: d.branch?.restaurant?.slug ?? '' } })
                }
                style={[styles.dish, { backgroundColor: theme.card, borderColor: theme.border }]}
                accessibilityRole="button"
              >
                {image ? (
                  <Image source={{ uri: image }} style={styles.dishImg} />
                ) : (
                  <View style={[styles.dishImg, styles.dishFallback]}>
                    <Ionicons name="restaurant" size={18} color={palette.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14.5 }} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {d.restaurantName}
                    {d.branch?.name ? ` · ${d.branch.name}` : ''}
                  </Text>
                </View>
                <Text style={{ color: palette.brandDark, fontWeight: '900', fontSize: 14 }}>{formatPrice(d.price)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 2 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  openNow: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  dish: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.card, padding: 10 },
  dishImg: { width: 52, height: 52, borderRadius: 12 },
  dishFallback: { backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
});
