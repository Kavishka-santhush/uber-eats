import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChipRow, EmptyState, LoadingBlock, Screen } from '@/components/screen';
import { OrderTimeline } from '@/components/order-timeline';
import { StatusBadge, ACTIVE_ORDER_STATUSES } from '@/components/status-badge';
import { formatPrice } from '@/components/price';
import { MY_ORDERS } from '@/lib/graphql/queries';
import { REORDER } from '@/lib/graphql/mutations';
import { assetUrl } from '@/lib/config';
import { palette, radius, useTheme } from '@/lib/theme';
import { formatDate, formatTime } from '@/lib/date';

const PAGE_SIZE = 10;

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Order history: live orders on top, past orders with one-tap reorder. */
export default function OrdersScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState('all');
  // Growing window: one query at page 1 whose limit widens as more is asked for
  const [pages, setPages] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [reorder, { loading: reordering }] = useMutation(REORDER);

  const { data, loading, refetch } = useQuery(MY_ORDERS, {
    variables: { page: 1, limit: pages * PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
  });

  const all = useMemo<any[]>(() => data?.myOrders?.items ?? [], [data]);
  const total: number = data?.myOrders?.total ?? 0;
  const orders = useMemo(() => {
    if (filter === 'active') return all.filter((o: any) => ACTIVE_ORDER_STATUSES.includes(o.status));
    if (filter === 'delivered') return all.filter((o: any) => o.status === 'DELIVERED');
    if (filter === 'cancelled') return all.filter((o: any) => o.status === 'CANCELLED');
    return all;
  }, [all, filter]);

  const loadMore = () => setPages((p) => p + 1);

  /** `reorder` places a brand new order server-side, so jump straight to it. */
  const doReorder = async (orderId: string) => {
    setNotice(null);
    try {
      const res = await reorder({ variables: { orderId } });
      const fresh = res.data?.reorder;
      if (!fresh?.id) throw new Error('Nothing came back from the kitchen');
      refetch();
      router.push({ pathname: '/track/[id]', params: { id: fresh.id } });
    } catch (e: any) {
      setNotice(cleanError(e) || 'Could not repeat this order');
    }
  };

  return (
    <Screen title="Your orders" back={false} refresh={() => refetch()} refreshing={loading && !!data}>
      {!!notice && (
        <View style={[styles.notice, { backgroundColor: '#FEE2E2' }]}>
          <Text style={{ color: '#B91C1C', fontSize: 12.5, flex: 1 }}>{notice}</Text>
          <Pressable hitSlop={8} onPress={() => setNotice(null)} accessibilityRole="button" accessibilityLabel="Dismiss">
            <Ionicons name="close" size={16} color="#B91C1C" />
          </Pressable>
        </View>
      )}

      <ChipRow options={FILTERS} value={filter} onChange={setFilter} />

      {loading && !data && <LoadingBlock label="Loading your orders…" />}

      {!loading && !orders.length && (
        <EmptyState
          icon="receipt-outline"
          title={filter === 'all' ? 'No orders yet' : `No ${filter} orders`}
          body={
            filter === 'all'
              ? 'When you place your first order it will show up here with live tracking.'
              : 'Try another filter — your other orders are still here.'
          }
          ctaLabel={filter === 'all' ? 'Browse restaurants' : 'Show all'}
          ctaOnPress={filter === 'all' ? () => router.replace('/tabs') : () => setFilter('all')}
        />
      )}

      <View style={styles.list}>
        {orders.map((o: any) => {
          const active = ACTIVE_ORDER_STATUSES.includes(o.status);
          const logo = assetUrl(o.branch?.restaurant?.logoUrl);
          const summary = (o.items ?? [])
            .map((i: any) => `${i.quantity}× ${i.nameSnapshot}`)
            .slice(0, 2)
            .join(', ');
          const extra = (o.items ?? []).length - 2;
          return (
            <View key={o.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Pressable
                onPress={() => router.push({ pathname: '/track/[id]', params: { id: o.id } })}
                accessibilityRole="button"
                style={styles.head}
              >
                {logo ? (
                  <Image source={{ uri: logo }} style={styles.logo} />
                ) : (
                  <View style={[styles.logo, styles.logoFallback]}>
                    <Ionicons name="restaurant" size={16} color={palette.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rest, { color: theme.text }]} numberOfLines={1}>
                    {o.branch?.restaurant?.name ?? o.branch?.name ?? 'Order'}
                  </Text>
                  <Text style={[styles.meta, { color: theme.subtext }]} numberOfLines={1}>
                    #{o.orderNumber} · {formatDate(o.createdAt)} {formatTime(o.createdAt)}
                  </Text>
                </View>
                <StatusBadge status={o.status} />
              </Pressable>

              {!!summary && (
                <Text style={[styles.items, { color: theme.subtext }]} numberOfLines={1}>
                  {summary}
                  {extra > 0 ? ` +${extra} more` : ''}
                </Text>
              )}

              {active && (
                <View style={styles.timeline}>
                  <OrderTimeline status={o.status} compact />
                  {!!o.estimatedDeliveryAt && (
                    <Text style={[styles.eta, { color: theme.subtext }]}>
                      ETA {formatTime(o.estimatedDeliveryAt)}
                    </Text>
                  )}
                </View>
              )}

              <View style={[styles.foot, { borderTopColor: theme.border }]}>
                <Text style={[styles.total, { color: theme.text }]}>{formatPrice(o.total)}</Text>
                <View style={styles.actions}>
                  {active ? (
                    <ActionLink
                      icon="locate"
                      label="Track"
                      onPress={() => router.push({ pathname: '/track/[id]', params: { id: o.id } })}
                    />
                  ) : o.status === 'DELIVERED' ? (
                    <ActionLink
                      icon="star-outline"
                      label="Rate"
                      onPress={() => router.push({ pathname: '/review/[id]', params: { id: o.id } })}
                    />
                  ) : null}
                  <ActionLink
                    icon="repeat"
                    label={reordering ? 'Reordering…' : 'Reorder'}
                    disabled={reordering}
                    onPress={() => doReorder(o.id)}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {all.length < total && (
        <Pressable style={[styles.more, { borderColor: theme.border }]} onPress={loadMore} accessibilityRole="button">
          <Text style={{ color: palette.brand, fontWeight: '800' }}>
            {loading ? 'Loading…' : `Show older orders (${total - all.length} left)`}
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

function ActionLink({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      hitSlop={6}
      accessibilityRole="button"
      style={[styles.action, { borderColor: theme.border, opacity: disabled ? 0.55 : 1 }]}
    >
      <Ionicons name={icon} size={13} color={palette.brandDark} />
      <Text style={{ color: palette.brandDark, fontSize: 12.5, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

/** Apollo surfaces GraphQL failures as "GraphQL error: …" — trim it for humans. */
function cleanError(e: any): string {
  return String(e?.message ?? '').replace('GraphQL error: ', '');
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.input, padding: 10, marginBottom: 12 },
  list: { gap: 12, marginTop: 16 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 10 },
  logoFallback: { backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  rest: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 11.5, marginTop: 2 },
  items: { fontSize: 12.5, marginTop: 10, lineHeight: 18 },
  timeline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  eta: { fontSize: 11.5, fontWeight: '700' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  total: { fontSize: 16, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  more: { borderWidth: 1, borderRadius: radius.input, alignItems: 'center', paddingVertical: 12, marginTop: 14 },
});
