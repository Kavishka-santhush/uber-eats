import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { ChipRow, EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { RestaurantCard } from '@/components/restaurant-card';
import { formatPrice } from '@/components/price';
import { MY_FAVS } from '@/lib/graphql/queries';
import { TOGGLE_FAV_ITEM, TOGGLE_FAV_RESTAURANT } from '@/lib/graphql/mutations';
import { assetUrl } from '@/lib/config';
import { num } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';

/** Saved restaurants and dishes, split by a filter row. */
export default function FavoritesScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState('restaurants');
  const { data, loading, refetch } = useQuery(MY_FAVS, { fetchPolicy: 'cache-and-network' });
  const favorites: any[] = data?.me?.favorites ?? [];

  const [toggleRestaurant] = useMutation(TOGGLE_FAV_RESTAURANT);
  const [toggleItem] = useMutation(TOGGLE_FAV_ITEM);

  const restaurants = favorites.filter((f) => !!f.restaurant).map((f) => f.restaurant);
  const items = favorites.filter((f) => !!f.item).map((f) => ({ favId: f.id, item: f.item }));

  const confirmRemove = (label: string, run: () => Promise<unknown>) => {
    Alert.alert('Remove from favorites?', label, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await run();
            await refetch();
          } catch {
            /* the list simply stays as it was */
          }
        },
      },
    ]);
  };

  if (loading && !data) {
    return (
      <Screen back title="Favorites">
        <LoadingBlock label="Loading your saves…" />
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Favorites"
      subtitle={`${restaurants.length} places · ${items.length} dishes`}
      refresh={refetch}
      refreshing={loading && !!data}
    >
      <View style={styles.filters}>
        <ChipRow
          value={tab}
          onChange={setTab}
          options={[
            { value: 'restaurants', label: `Restaurants (${restaurants.length})` },
            { value: 'dishes', label: `Dishes (${items.length})` },
          ]}
        />
      </View>

      {tab === 'restaurants' ? (
        restaurants.length === 0 ? (
          <EmptyState
            icon="heart-outline"
            title="No saved restaurants"
            body="Tap the heart on any restaurant page to pin it here for quick reorders."
            ctaLabel="Browse restaurants"
            ctaOnPress={() => router.replace('/tabs/search')}
          />
        ) : (
          <Section title="Your restaurants" subtitle="Ordered from before, one tap away">
            <View style={styles.grid}>
              {restaurants.map((r: any) => (
                <View key={r.id} style={styles.gridItem}>
                  <RestaurantCard
                    restaurant={r}
                    onPress={() => router.push({ pathname: '/restaurant/[slug]', params: { slug: r.slug } })}
                  />
                  <Pressable
                    hitSlop={8}
                    onPress={() => confirmRemove(r.name, () => toggleRestaurant({ variables: { restaurantId: r.id } }))}
                    style={[styles.unsave, { backgroundColor: theme.card, borderColor: theme.border }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${r.name} from favorites`}
                  >
                    <Ionicons name="heart" size={15} color={palette.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          </Section>
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon="fast-food-outline"
          title="No saved dishes"
          body="Save the meals you keep coming back to and rebuild your basket in seconds."
          ctaLabel="Search the menu"
          ctaOnPress={() => router.replace('/tabs/search')}
        />
      ) : (
        <Section title="Your dishes" subtitle="Tap one to open its kitchen">
          <View style={styles.list}>
            {items.map(({ favId, item }: any) => {
              const image = assetUrl((item.imageUrls ?? [])[0]);
              const branch = item.branch;
              const soldOut = item.availability === 'SOLD_OUT' || item.availability === 'UNAVAILABLE';
              return (
                <Pressable
                  key={favId}
                  onPress={() =>
                    branch?.restaurant?.slug &&
                    router.push({ pathname: '/restaurant/[slug]', params: { slug: branch.restaurant.slug } })
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.dishRow,
                    { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
                  ]}
                >
                  {image ? (
                    <Image source={{ uri: image }} style={styles.dishImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.dishImage, styles.dishFallback]}>
                      <Ionicons name="restaurant-outline" size={18} color={palette.brandDark} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dishName, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!!branch?.name && (
                      <Text style={[styles.dishMeta, { color: theme.subtext }]} numberOfLines={1}>
                        {branch.restaurant?.name ?? branch.name}
                      </Text>
                    )}
                    <View style={styles.dishFoot}>
                      <Text style={[styles.dishPrice, { color: theme.text }]}>{formatPrice(item.price)}</Text>
                      {!!branch?.deliveryFee && (
                        <Badge
                          label={num(branch.deliveryFee) === 0 ? 'Free delivery' : `${formatPrice(branch.deliveryFee)} delivery`}
                          tone="brand"
                        />
                      )}
                      {soldOut && <Badge label="Sold out" tone="danger" />}
                      {!soldOut && branch && branch.isOpenNow === false && <Badge label="Closed now" tone="warning" />}
                    </View>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={() => confirmRemove(item.name, () => toggleItem({ variables: { menuItemId: item.id } }))}
                    style={styles.removeDish}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name} from favorites`}
                  >
                    <Ionicons name="heart" size={17} color={palette.danger} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47.5%', position: 'relative' },
  unsave: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 10 },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 10,
  },
  dishImage: { width: 58, height: 58, borderRadius: 12 },
  dishFallback: { backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  dishName: { fontSize: 14.5, fontWeight: '800' },
  dishMeta: { fontSize: 12, marginTop: 1 },
  dishFoot: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' },
  dishPrice: { fontSize: 13.5, fontWeight: '900' },
  removeDish: { padding: 6 },
});
