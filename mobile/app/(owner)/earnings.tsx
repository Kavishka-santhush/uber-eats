import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { useLocalSearchParams } from 'expo-router';
import { Card, CardRow } from '@/components/ui/card';
import { ChipRow, EmptyState, LoadingBlock, Screen } from '@/components/screen';
import { ME_FULL, MY_RESTAURANT_EARNINGS } from '@/lib/graphql/queries';
import { formatPrice } from '@/components/price';
import { num } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';

/**
 * Owner earnings — revenue breakdown (gross, commission, net) for a chosen
 * time period. restaurantEarnings returns a JSONObject scalar.
 */
const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

export default function OwnerEarningsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ restaurantId?: string }>();

  const { data: meData } = useQuery(ME_FULL);
  const restaurants: any[] = meData?.me?.ownedRestaurants ?? [];
  const restaurant = restaurants.find((r: any) => r.id === params.restaurantId) ?? restaurants[0];

  const [days, setDays] = useState('30');

  const { from, to } = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getTime() - Number(days) * 86400_000);
    return { from: d.toISOString(), to: now.toISOString() };
  }, [days]);

  const { data: earnData, loading, refetch } = useQuery(MY_RESTAURANT_EARNINGS, {
    variables: { restaurantId: restaurant?.id, from, to },
    skip: !restaurant?.id,
    fetchPolicy: 'cache-and-network',
  });
  const earnings: any = earnData?.restaurantEarnings;

  if (!restaurant) {
    return (
      <Screen back title="Earnings">
        <EmptyState icon="cash-outline" title="No restaurants" body="You need a restaurant to view earnings." />
      </Screen>
    );
  }

  return (
    <Screen back title="Earnings" subtitle={restaurant.name} refresh={refetch} refreshing={loading && !!earnData}>
      {/* Period selector */}
      <View style={{ marginBottom: 14 }}>
        <ChipRow value={days} onChange={setDays} options={PERIODS} />
      </View>

      {loading && !earnings ? (
        <LoadingBlock label="Calculating earnings…" />
      ) : !earnings ? (
        <EmptyState icon="trending-up-outline" title="No data" body="No completed orders in this period." />
      ) : (
        <>
          <View style={styles.grid}>
            <Tile label="Delivered orders" value={String(earnings.count ?? 0)} theme={theme} />
            <Tile label="Gross revenue" value={formatPrice(earnings.gross)} theme={theme} />
            <Tile label="Platform commission" value={formatPrice(earnings.commission)} theme={theme} />
            <Tile label="Your net earning" value={formatPrice(earnings.net)} highlight theme={theme} />
          </View>

          <Card style={{ marginTop: 14 }}>
            <CardRow>
              <Text style={{ color: theme.subtext, fontSize: 13, flex: 1 }}>Commission rate</Text>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                {num(restaurant.commissionRate).toFixed(1)}%
              </Text>
            </CardRow>
            <CardRow>
              <Text style={{ color: theme.subtext, fontSize: 13, flex: 1 }}>Period</Text>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Last {days} days</Text>
            </CardRow>
            <CardRow>
              <Text style={{ color: theme.subtext, fontSize: 13, flex: 1 }}>Currency</Text>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{earnings.currency ?? 'USD'}</Text>
            </CardRow>
          </Card>
        </>
      )}
    </Screen>
  );
}

function Tile({ label, value, highlight, theme }: { label: string; value: string; highlight?: boolean; theme: any }) {
  return (
    <View style={[styles.tile, { backgroundColor: highlight ? palette.brandSoft : theme.card, borderColor: highlight ? palette.brand : theme.border }]}>
      <Text style={[styles.tileLabel, { color: highlight ? palette.brandDark : theme.subtext }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: highlight ? palette.brandDark : theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.card, borderWidth: 1, padding: 14 },
  tileLabel: { fontSize: 12, marginBottom: 4 },
  tileValue: { fontSize: 17, fontWeight: '800' },
});
