import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { useLocalSearchParams } from 'expo-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { ChipRow, EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { ME_FULL, MGR_BRANCH_MENU } from '@/lib/graphql/queries';
import { SET_MENU_ITEM_AVAILABILITY } from '@/lib/graphql/mutations';
import { formatPrice } from '@/components/price';
import { useTheme } from '@/lib/theme';

/**
 * Owner menu — displays categories and items for the selected branch with
 * a quick availability toggle per item (AVAILABLE / SOLD_OUT / UNAVAILABLE).
 */
export default function OwnerMenuScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ restaurantId?: string }>();

  const { data: meData } = useQuery(ME_FULL);
  const restaurants: any[] = meData?.me?.ownedRestaurants ?? [];
  const restaurant = restaurants.find((r: any) => r.id === params.restaurantId) ?? restaurants[0];
  const branches: any[] = restaurant?.branches ?? [];

  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  useEffect(() => { if (branches.length && !branchId) setBranchId(branches[0].id); }, [branches, branchId]);

  const { data: menuData, loading, refetch } = useQuery(MGR_BRANCH_MENU, {
    variables: { branchId },
    skip: !branchId,
    fetchPolicy: 'cache-and-network',
  });
  const categories: any[] = menuData?.branchMenu ?? [];

  const [setAvailability] = useMutation(SET_MENU_ITEM_AVAILABILITY, { onCompleted: () => refetch() });

  const cycleAvailability = (itemId: string, current: string) => {
    const next = current === 'AVAILABLE' ? 'SOLD_OUT' : 'AVAILABLE';
    setAvailability({ variables: { id: itemId, availability: next } });
  };

  if (!restaurant || !branches.length) {
    return (
      <Screen back title="Menu">
        <EmptyState icon="list-outline" title="No branches" body="You need at least one branch to manage a menu." />
      </Screen>
    );
  }

  return (
    <Screen back title="Menu" subtitle={restaurant.name} refresh={refetch} refreshing={loading && !!menuData}>
      {branches.length > 1 && (
        <View style={{ marginBottom: 12 }}>
          <ChipRow value={branchId} onChange={setBranchId} options={branches.map((b: any) => ({ value: b.id, label: b.name }))} />
        </View>
      )}

      {loading && !menuData ? (
        <LoadingBlock label="Loading menu…" />
      ) : categories.length === 0 ? (
        <EmptyState icon="restaurant-outline" title="No menu items" body="This branch does not have a menu configured yet." />
      ) : (
        categories.map((cat) => (
          <View key={cat.id} style={{ marginBottom: 18 }}>
            <Section title={cat.name} subtitle={`${cat.items?.length ?? 0} items`}>
              {(cat.items ?? []).map((item: any) => (
                <Card key={item.id} style={{ marginBottom: 6 }}>
                  <CardRow
                    right={
                      <Button
                        title={item.availability === 'AVAILABLE' ? 'Sold out' : 'Make available'}
                        variant={item.availability === 'AVAILABLE' ? 'secondary' : 'primary'}
                        size="sm"
                        onPress={() => cycleAvailability(item.id, item.availability)}
                      />
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bold, { color: theme.text }]}>{item.name}</Text>
                      <Text style={[styles.hint, { color: theme.subtext }]}>
                        {formatPrice(item.price)}
                        {item.prepTimeMinutes ? ` · ${item.prepTimeMinutes} min` : ''}
                      </Text>
                      <View style={{ marginTop: 4 }}>
                        <Badge
                          label={item.availability === 'AVAILABLE' ? 'Available' : item.availability === 'SOLD_OUT' ? 'Sold out' : 'Unavailable'}
                          tone={item.availability === 'AVAILABLE' ? 'brand' : item.availability === 'SOLD_OUT' ? 'warning' : 'danger'}
                        />
                      </View>
                    </View>
                  </CardRow>
                </Card>
              ))}
            </Section>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2 },
});
