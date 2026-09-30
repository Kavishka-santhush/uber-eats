import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { MY_DRIVER_PROFILE } from '@/lib/graphql/queries';
import {
  MARK_DELIVERED,
  MARK_PICKED_UP,
  UPDATE_DELIVERY_STATUS,
  UPDATE_DRIVER_LOCATION,
} from '@/lib/graphql/mutations';
import { formatPrice } from '@/components/price';
import { num } from '@/lib/geo';
import { watchCoords, type LiveFix } from '@/lib/geo';
import { emitDeliveryLocation } from '@/lib/socket';
import { palette, useTheme } from '@/lib/theme';

/**
 * Driver run — shows the active delivery with pickup/dropoff details and
 * drives the status lifecycle:
 *   DRIVER_ASSIGNED → arrive at restaurant (PICKED_UP) → deliver (DELIVERED).
 * It also streams GPS via watchPosition + socket while mounted.
 */
export default function DriverRunScreen() {
  const theme = useTheme();

  const { data, loading, refetch } = useQuery(MY_DRIVER_PROFILE, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 8000,
  });
  const profile = data?.myDriverProfile;
  const delivery = profile?.activeDelivery;

  const [markPickedUp, pickingUp] = useMutation(MARK_PICKED_UP, { onCompleted: () => refetch() });
  const [markDelivered, delivering] = useMutation(MARK_DELIVERED, { onCompleted: () => router.replace('/home') });
  const [updateStatus, updatingStatus] = useMutation(UPDATE_DELIVERY_STATUS, { onCompleted: () => refetch() });
  const [updateLoc] = useMutation(UPDATE_DRIVER_LOCATION);

  // --- GPS streaming ---
  const lastSent = useRef(0);
  useEffect(() => {
    if (!delivery?.id) return;
    let unsub: (() => void) | undefined;
    watchCoords((fix: LiveFix) => {
      // Throttle REST mutation + socket to once every 5 seconds
      const now = Date.now();
      if (now - lastSent.current < 5000) return;
      lastSent.current = now;
      updateLoc({ variables: { lat: fix.lat, lng: fix.lng } }).catch(() => undefined);
      emitDeliveryLocation({ deliveryId: delivery.id, lat: fix.lat, lng: fix.lng, heading: fix.heading ?? undefined, speed: fix.speed ?? undefined });
    }).then((fn) => { unsub = fn; });
    return () => { unsub?.(); };
  }, [delivery?.id, updateLoc]);

  // --- Status progression helpers ---
  const isAtRestaurant = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(delivery?.status);
  const isEnRoute = delivery?.status === 'OUT_FOR_DELIVERY';
  const isReady = delivery?.status === 'READY_FOR_PICKUP' || delivery?.status === 'DRIVER_EN_ROUTE_TO_RESTAURANT';

  const confirmAction = useCallback(
    (title: string, message: string, onYes: () => void) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: onYes },
      ]);
    },
    [],
  );

  const handleEnRouteToRestaurant = () => {
    confirmAction('Start navigation?', 'You are heading to the restaurant.', () => {
      updateStatus({ variables: { deliveryId: delivery.id, status: 'DRIVER_EN_ROUTE_TO_RESTAURANT' } });
    });
  };

  const handlePickedUp = () => {
    confirmAction('Confirm pickup', 'You have collected the order from the restaurant.', () => {
      markPickedUp({ variables: { deliveryId: delivery.id } });
    });
  };

  const handleDelivered = () => {
    confirmAction('Confirm delivery', 'The customer has received their order.', () => {
      markDelivered({ variables: { deliveryId: delivery.id } });
    });
  };

  const openMaps = (lat: unknown, lng: unknown) => {
    const la = num(lat); const ln = num(lng);
    if (!la && !ln) return;
    Linking.openURL(`https://maps.google.com/maps?q=${la},${ln}`).catch(() => undefined);
  };

  const callNumber = (phone?: string | null) => {
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => undefined);
  };

  if (loading && !profile) {
    return (
      <Screen back title="Active delivery">
        <LoadingBlock label="Loading delivery…" />
      </Screen>
    );
  }

  if (!delivery) {
    return (
      <Screen back title="Active delivery">
        <EmptyState
          icon="cube-outline"
          title="No active delivery"
          body="Accept a request from the home screen to start a run."
          ctaLabel="Back to home"
          ctaOnPress={() => router.replace('/home')}
        />
      </Screen>
    );
  }

  const order = delivery.order;

  return (
    <Screen back title={`Run · ${order?.orderNumber ?? ''}`} refresh={refetch} refreshing={loading && !!data}>
      {/* Status badge */}
      <View style={styles.statusWrap}>
        <Badge label={delivery.status?.replace(/_/g, ' ') ?? ''} tone="info" />
        {delivery.etaMinutes != null && (
          <Text style={{ color: theme.subtext, fontSize: 12, marginLeft: 8 }}>~{delivery.etaMinutes} min remaining</Text>
        )}
      </View>

      {/* Pickup card */}
      <Section title="Pickup">
        <Card>
          <CardRow
            right={
              <Button title="Map" variant="ghost" size="sm" onPress={() => openMaps(delivery.pickupLat, delivery.pickupLng)} />
            }
          >
            <Text style={[styles.bold, { color: theme.text }]}>{order?.branch?.name ?? 'Restaurant'}</Text>
            <Text style={[styles.hint, { color: theme.subtext }]}>{order?.branch?.addressLine1 ?? '—'}</Text>
          </CardRow>
        </Card>
      </Section>

      {/* Dropoff card */}
      <Section title="Drop-off">
        <Card>
          <CardRow
            right={
              <Button title="Map" variant="ghost" size="sm" onPress={() => openMaps(delivery.dropoffLat, delivery.dropoffLng)} />
            }
          >
            <Text style={[styles.bold, { color: theme.text }]}>{order?.customer?.fullName ?? 'Customer'}</Text>
            <Text style={[styles.hint, { color: theme.subtext }]}>{order?.address?.line1 ?? '—'}</Text>
          </CardRow>
          {!!order?.customer?.phone && (
            <CardRow
              onPress={() => callNumber(order.customer.phone)}
              right={<Ionicons name="call-outline" size={18} color={palette.brand} />}
            >
              <Text style={{ color: palette.brand, fontWeight: '700', fontSize: 13 }}>Call customer</Text>
            </CardRow>
          )}
        </Card>
      </Section>

      {/* Earning */}
      <Card style={{ marginBottom: 14 }}>
        <CardRow>
          <Text style={{ color: theme.subtext, fontSize: 13, flex: 1 }}>Your earning</Text>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{formatPrice(delivery.driverEarning ?? delivery.distanceKm)}</Text>
        </CardRow>
      </Card>

      {/* Action buttons — flow depends on current status */}
      <Section title="Actions">
        <Card style={{ padding: 16 }}>
          {/* Assigned (not yet en route) → Start navigation to restaurant */}
          {delivery.status === 'DRIVER_ASSIGNED' && (
            <Button
              title="Start navigation to restaurant"
              size="lg"
              onPress={handleEnRouteToRestaurant}
              loading={updatingStatus}
            />
          )}

          {/* En route to restaurant or restaurant ready → Mark picked up */}
          {(delivery.status === 'DRIVER_EN_ROUTE_TO_RESTAURANT' || isReady) && !isAtRestaurant && (
            <Button
              title="Confirm pickup"
              size="lg"
              onPress={handlePickedUp}
              loading={pickingUp}
            />
          )}

          {/* PICKED_UP → start delivery navigation */}
          {delivery.status === 'PICKED_UP' && (
            <Button
              title="Head to customer"
              size="lg"
              onPress={() => updateStatus({ variables: { deliveryId: delivery.id, status: 'OUT_FOR_DELIVERY' } })}
              loading={updatingStatus}
            />
          )}

          {/* OUT_FOR_DELIVERY → mark delivered */}
          {isEnRoute && (
            <Button
              title="Confirm delivered"
              size="lg"
              onPress={handleDelivered}
              loading={delivering}
            />
          )}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  bold: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2, lineHeight: 17 },
});
