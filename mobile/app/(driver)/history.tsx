import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, LoadingBlock, Screen } from '@/components/screen';
import { DRIVER_HISTORY } from '@/lib/graphql/queries';
import { formatPrice } from '@/components/price';
import { num } from '@/lib/geo';
import { useTheme } from '@/lib/theme';

/**
 * Driver history — paginated list of completed deliveries.
 */
export default function DriverHistoryScreen() {
  const theme = useTheme();
  const [page, setPage] = useState(1);

  const { data, loading, refetch } = useQuery(DRIVER_HISTORY, {
    variables: { page, limit: 20 },
    fetchPolicy: 'cache-and-network',
  });
  const result = data?.driverHistory;
  const items: any[] = result?.items ?? [];

  return (
    <Screen back title="Delivery history" refresh={refetch} refreshing={loading && !!data}>
      {loading && !result ? (
        <LoadingBlock label="Loading deliveries…" />
      ) : items.length === 0 ? (
        <EmptyState icon="cube-outline" title="No completed deliveries" body="Finish a delivery and it will show up here." />
      ) : (
        <>
          {items.map((o) => (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <CardRow>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bold, { color: theme.text }]}>{o.orderNumber}</Text>
                  <Text style={[styles.hint, { color: theme.subtext }]}>
                    {o.branch?.restaurant?.name ?? o.branch?.name} · {o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString() : '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>
                    {formatPrice(o.delivery?.driverEarning)}
                  </Text>
                  <Text style={{ color: theme.subtext, fontSize: 11 }}>
                    {num(o.delivery?.distanceKm).toFixed(1)} km
                  </Text>
                </View>
              </CardRow>
            </Card>
          ))}

          {/* Pager */}
          {result.pages > 1 && (
            <View style={styles.pager}>
              <PagerBtn label="← Prev" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} theme={theme} />
              <Text style={{ color: theme.subtext, fontSize: 12 }}>{page} / {result.pages}</Text>
              <PagerBtn label="Next →" disabled={page >= result.pages} onPress={() => setPage((p) => p + 1)} theme={theme} />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function PagerBtn({ label, disabled, onPress, theme }: { label: string; disabled: boolean; onPress: () => void; theme: any }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
      <Text style={{ color: disabled ? theme.border : theme.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bold: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2 },
  pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
});
