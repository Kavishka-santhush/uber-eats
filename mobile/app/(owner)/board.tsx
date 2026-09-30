import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { useLocalSearchParams } from 'expo-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { ChipRow, EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { ME_FULL, BRANCH_ORDERS } from '@/lib/graphql/queries';
import { ACCEPT_ORDER, REJECT_ORDER, SET_ORDER_PREPARING, MARK_ORDER_READY } from '@/lib/graphql/mutations';
import { formatPrice } from '@/components/price';
import { getSocket, joinBranch, leaveBranch } from '@/lib/socket';
import { palette, radius, useTheme } from '@/lib/theme';

const FILTERS = [
  { value: 'new', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
];

const STATUS_MAP: Record<string, string | undefined> = {
  new: 'PLACED',
  confirmed: 'CONFIRMED',
  preparing: 'PREPARING',
  ready: 'READY_FOR_PICKUP',
};

/**
 * Owner board — live order feed filtered by status. Joins the branch socket
 * room so order:status events trigger instant refreshes.
 */
export default function OwnerBoardScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ restaurantId?: string }>();

  const { data: meData } = useQuery(ME_FULL);
  const restaurants: any[] = meData?.me?.ownedRestaurants ?? [];
  const restaurant = restaurants.find((r) => r.id === params.restaurantId) ?? restaurants[0];
  const branches: any[] = restaurant?.branches ?? [];

  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [filter, setFilter] = useState('new');

  useEffect(() => {
    if (branches.length && !branchId) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const { data: ordersData, loading, refetch } = useQuery(BRANCH_ORDERS, {
    variables: { branchId, status: STATUS_MAP[filter], page: 1, limit: 50 },
    skip: !branchId,
    fetchPolicy: 'cache-and-network',
  });
  const orders: any[] = ordersData?.branchOrders?.items ?? [];

  // Join branch socket room + listen for order:status
  useEffect(() => {
    if (!branchId) return;
    joinBranch(branchId);
    const socket = getSocket();
    const handler = () => refetch();
    socket?.on('order:status', handler);
    return () => {
      socket?.off('order:status', handler);
      leaveBranch(branchId);
    };
  }, [branchId, refetch]);

  const [acceptOrder] = useMutation(ACCEPT_ORDER, { onCompleted: () => refetch() });
  const [rejectOrder] = useMutation(REJECT_ORDER, { onCompleted: () => refetch() });
  const [setPreparing] = useMutation(SET_ORDER_PREPARING, { onCompleted: () => refetch() });
  const [markReady] = useMutation(MARK_ORDER_READY, { onCompleted: () => refetch() });

  const handleReject = (orderId: string) => {
    Alert.alert('Reject this order?', 'The customer will be refunded in full.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: () => rejectOrder({ variables: { id: orderId, reason: 'Kitchen unable to fulfil' } }),
      },
    ]);
  };

  if (!restaurant || !branches.length) {
    return (
      <Screen back title="Order board">
        <EmptyState icon="cube-outline" title="No branches" body="You need at least one branch to view orders." />
      </Screen>
    );
  }

  return (
    <Screen back title="Order board" subtitle={restaurant.name} refresh={refetch} refreshing={loading && !!ordersData}>
      {/* Branch selector */}
      {branches.length > 1 && (
        <View style={{ marginBottom: 12 }}>
          <ChipRow
            value={branchId}
            onChange={setBranchId}
            options={branches.map((b: any) => ({ value: b.id, label: b.name }))}
          />
        </View>
      )}

      {/* Status filter */}
      <View style={{ marginBottom: 12 }}>
        <ChipRow value={filter} onChange={setFilter} options={FILTERS} />
      </View>

      {loading && !ordersData ? (
        <LoadingBlock label="Loading orders…" />
      ) : orders.length === 0 ? (
        <EmptyState icon="clock-outline" title="No orders here" body="New orders will appear when customers place them." />
      ) : (
        orders.map((o) => (
          <Card key={o.id} style={{ marginBottom: 10 }}>
            <CardRow>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bold, { color: theme.text }]}>
                  {o.orderNumber} · {formatPrice(o.total)}
                </Text>
                <Text style={[styles.hint, { color: theme.subtext }]}>
                  {o.customer?.fullName}
                  {o.specialInstructions ? ` · "${o.specialInstructions}"` : ''}
                </Text>
                <View style={{ marginTop: 5 }}>
                  <Badge
                    label={o.status?.replace(/_/g, ' ')}
                    tone={o.status === 'PLACED' ? 'warning' : o.status === 'CANCELLED' ? 'danger' : 'info'}
                  />
                </View>
              </View>
            </CardRow>

            {/* Action buttons */}
            <View style={styles.actions}>
              {o.status === 'PLACED' && (
                <>
                  <Button title="Reject" variant="danger" size="sm" onPress={() => handleReject(o.id)} />
                  <Button title="Accept" size="sm" onPress={() => acceptOrder({ variables: { id: o.id } })} />
                </>
              )}
              {o.status === 'CONFIRMED' && (
                <Button title="Start preparing" size="sm" onPress={() => setPreparing({ variables: { id: o.id } })} />
              )}
              {o.status === 'PREPARING' && (
                <Button title="Mark ready" size="sm" onPress={() => markReady({ variables: { id: o.id } })} />
              )}
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
});
