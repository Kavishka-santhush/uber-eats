import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { StatusBadge, statusLabel, ACTIVE_ORDER_STATUSES } from '@/components/status-badge';
import { OrderTimeline } from '@/components/order-timeline';
import { MapTracker, type TrackMarker } from '@/components/map-tracker';
import { ChatPanel } from '@/components/chat-panel';
import { CardPaymentModal } from '@/components/card-payment';
import { formatPrice } from '@/components/price';
import { ORDER_DETAIL } from '@/lib/graphql/queries';
import { CANCEL_ORDER, CREATE_CARD_PAYMENT } from '@/lib/graphql/mutations';
import { getSocket, joinOrder, leaveOrder } from '@/lib/socket';
import { assetUrl } from '@/lib/config';
import { num } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';
import { formatDateTime, formatTime } from '@/lib/date';

/** Statuses the server will still refund (partially from PREPARING down). */
const CANCELLABLE: Record<string, string> = {
  PLACED: 'Fully refunded.',
  CONFIRMED: 'Fully refunded.',
  PREPARING: '90% refunded — the kitchen already started.',
  READY_FOR_PICKUP: '80% refunded — the courier is on the way.',
};

/** Live order tracking: map, timeline, courier contact, chat and payment top-up. */
export default function TrackOrderScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, loading, error, refetch } = useQuery(ORDER_DETAIL, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const order: any = data?.order ?? null;
  const isActive = !!order && ACTIVE_ORDER_STATUSES.includes(order.status);

  // Live driver position arrives in the order room; the query is the fallback.
  const [fix, setFix] = useState<{ lat: number; lng: number; heading?: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardSecret, setCardSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    joinOrder(id);
    const socket = getSocket();
    const onLocation = (payload: any) => {
      if (typeof payload?.lat !== 'number' || typeof payload?.lng !== 'number') return;
      setFix({ lat: payload.lat, lng: payload.lng, heading: payload.heading });
    };
    const onStatus = (payload: any) => {
      if (payload?.orderId && payload.orderId !== id) return;
      refetch();
    };
    socket?.on('delivery:location', onLocation);
    socket?.on('order:status', onStatus);
    return () => {
      socket?.off('delivery:location', onLocation);
      socket?.off('order:status', onStatus);
      leaveOrder(id);
    };
  }, [id, refetch]);

  // Seed from the last recorded GPS fix so the map is right on cold open.
  useEffect(() => {
    const locations = order?.delivery?.liveLocations;
    if (!locations?.length) return;
    const last = locations[locations.length - 1];
    setFix((current) =>
      current || { lat: num(last.lat), lng: num(last.lng), heading: num(last.heading, 0) },
    );
  }, [order]);

  const [cancelOrder] = useMutation(CANCEL_ORDER);
  const [cardPayment, { loading: paying }] = useMutation(CREATE_CARD_PAYMENT);

  const unpaid =
    !!order && order.status !== 'CANCELLED' && order.paymentMethod === 'CARD' && ['PENDING', 'PROCESSING'].includes(order.paymentStatus);

  const markers = useMemo<TrackMarker[]>(() => {
    if (!order) return [];
    const out: TrackMarker[] = [];
    if (order.branch) out.push({ id: 'pickup', lat: num(order.branch.lat), lng: num(order.branch.lng), title: 'Restaurant', kind: 'pickup' });
    if (order.address) out.push({ id: 'dropoff', lat: num(order.address.lat), lng: num(order.address.lng), title: 'Your address', kind: 'dropoff' });
    if (fix) out.push({ id: 'driver', lat: fix.lat, lng: fix.lng, heading: fix.heading, title: 'Courier', kind: 'driver' });
    return out;
  }, [order, fix]);

  if (loading && !order) {
    return (
      <Screen back title="Track order">
        <LoadingBlock label="Finding your order…" />
      </Screen>
    );
  }
  if (error || !order) {
    return (
      <Screen back title="Track order">
        <EmptyState
          icon="alert-circle-outline"
          title="Order not found"
          body={error?.message?.replace('GraphQL error: ', '') || 'This order no longer exists.'}
          ctaLabel="Back to your orders"
          ctaOnPress={() => router.replace('/tabs/orders')}
        />
      </Screen>
    );
  }

  const driver = order.delivery?.driver;
  const cancelableReason = CANCELLABLE[order.status];

  const askCancel = () => {
    if (!cancelableReason) return;
    Alert.alert('Cancel this order?', `${statusLabel(order.status)} · ${cancelableReason}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelOrder({ variables: { id: order.id, reason: 'Cancelled by customer' } });
            setBanner('Order cancelled. Any charge is refunded to the original method.');
            refetch();
          } catch (e: any) {
            setBanner(e?.message?.replace('GraphQL error: ', '') || 'Could not cancel the order');
          }
        },
      },
    ]);
  };

  const startPayment = async () => {
    setBanner(null);
    try {
      const res = await cardPayment({ variables: { orderId: order.id } });
      const secret: string | undefined = res.data?.createCardPayment?.clientSecret;
      if (!secret) throw new Error('Payment could not be set up');
      setCardSecret(secret);
      setCardOpen(true);
    } catch (e: any) {
      setBanner(e?.message?.replace('GraphQL error: ', '') || 'Could not start the payment');
    }
  };

  return (
    <Screen
      back
      title={`Order #${order.orderNumber}`}
      subtitle={order.branch?.restaurant?.name ?? order.branch?.name}
      refresh={() => refetch()}
      refreshing={loading && !!data}
      footer={
        <View style={{ gap: 9 }}>
          {order.status === 'DELIVERED' ? (
            <>
              <Button title="Rate this order" onPress={() => router.push({ pathname: '/review/[id]', params: { id: order.id } })} />
              <Button title="Order again" variant="secondary" onPress={() => router.replace('/tabs')} />
            </>
          ) : order.status === 'CANCELLED' ? (
            <>
              {!!order.cancelReason && (
                <Text style={[styles.cancelNote, { color: theme.subtext }]}>Cancelled · {order.cancelReason}</Text>
              )}
              <Button title="Browse restaurants" onPress={() => router.replace('/tabs')} />
              <Button title="Need a refund? Contact support" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/support', params: { orderId: order.id } })} />
            </>
          ) : (
            <>
              <Button title="Message the restaurant & courier" variant={chatOpen ? 'secondary' : 'primary'} onPress={() => setChatOpen((v) => !v)} />
              {!!cancelableReason && <Button title="Cancel order" variant="ghost" size="sm" onPress={askCancel} />}
            </>
          )}
        </View>
      }
    >
      {!!banner && (
        <View style={[styles.banner, { backgroundColor: '#FEF3C7' }]}>
          <Text style={{ color: '#B45309', fontSize: 12.5, flex: 1 }}>{banner}</Text>
        </View>
      )}

      {unpaid && (
        <View style={[styles.payBox, { borderColor: palette.warning }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.payTitle, { color: theme.text }]}>Payment still pending</Text>
            <Text style={[styles.payBody, { color: theme.subtext }]}>
              The order is placed, but the card has not been charged yet. Complete it now so the kitchen can accept.
            </Text>
          </View>
          <Button title="Pay now" size="sm" onPress={startPayment} loading={paying} />
        </View>
      )}

      {/* Status header */}
      <Card style={styles.statusCard}>
        <View style={styles.statusHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusMain, { color: theme.text }]}>{statusLabel(order.status)}</Text>
            <Text style={[styles.statusSub, { color: theme.subtext }]}>
              {order.estimatedDeliveryAt
                ? `Arriving around ${formatTime(order.estimatedDeliveryAt)}`
                : isActive
                  ? 'No ETA published yet'
                  : `Closed ${formatDateTime(order.deliveredAt ?? order.createdAt)}`}
            </Text>
          </View>
          <StatusBadge status={order.status} />
        </View>
        <View style={{ marginTop: 14 }}>
          <OrderTimeline status={order.status} logs={order.statusLogs} />
        </View>
      </Card>

      {/* Map */}
      {(isActive || !!order.delivery) && (
        <Section title="Live tracking" subtitle={fix ? 'Courier position updated live' : 'Waiting for the courier’s first ping'}>
          <MapTracker markers={markers} polyline={order.delivery?.routePolyline} followId={fix ? 'driver' : undefined} height={240} />
          {!!driver && (
            <Card style={{ marginTop: 12 }}>
              <CardRow
                right={
                  driver.user?.phone ? (
                    <Pressable
                      hitSlop={8}
                      onPress={() => Linking.openURL(`tel:${driver.user.phone}`)}
                      style={[styles.callBtn, { backgroundColor: palette.brandSoft }]}
                      accessibilityRole="button"
                      accessibilityLabel="Call the courier"
                    >
                      <Ionicons name="call" size={17} color={palette.brandDark} />
                    </Pressable>
                  ) : null
                }
              >
                <View style={styles.driverRow}>
                  {assetUrl(driver.user?.avatarUrl) ? (
                    <Image source={{ uri: assetUrl(driver.user?.avatarUrl) }} style={styles.driverAvatar} />
                  ) : (
                    <View style={[styles.driverAvatar, styles.driverFallback]}>
                      <Ionicons name="bicycle" size={17} color={palette.brandDark} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14.5 }}>
                      {driver.user?.fullName ?? 'Your courier'}
                    </Text>
                    <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 1 }}>
                      {driver.vehicleType ? `${driver.vehicleType} · ` : ''}
                      {driver.vehiclePlate ? `${driver.vehiclePlate} · ` : ''}★ {num(driver.avgRating, 5).toFixed(1)}
                    </Text>
                    {order.delivery?.etaMinutes ? (
                      <Text style={{ color: palette.brandDark, fontSize: 11.5, fontWeight: '800', marginTop: 2 }}>
                        ETA {order.delivery.etaMinutes} min
                      </Text>
                    ) : null}
                  </View>
                </View>
              </CardRow>
            </Card>
          )}
        </Section>
      )}

      {chatOpen && (
        <Section title="Order chat" subtitle="Shared with the restaurant and your courier">
          <View style={[styles.chatBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ChatPanel orderId={order.id} height={240} />
          </View>
        </Section>
      )}

      {/* Receipt */}
      <Section title="Order details">
        <Card>
          <CardRow>
            <View style={styles.infoRow}>
              <Ionicons name="storefront-outline" size={16} color={theme.subtext} />
              <Text style={{ color: theme.text, fontSize: 13.5, flex: 1 }}>
                {order.branch?.name}
                {order.branch?.restaurant?.name ? ` · ${order.branch.restaurant.name}` : ''}
              </Text>
            </View>
          </CardRow>
          <CardRow>
            <View style={styles.infoRow}>
              <Ionicons name="home-outline" size={16} color={theme.subtext} />
              <Text style={{ color: theme.text, fontSize: 13.5, flex: 1 }} numberOfLines={2}>
                {[order.address?.line1, order.address?.line2, order.address?.city].filter(Boolean).join(', ')}
              </Text>
            </View>
          </CardRow>
          {!!order.specialInstructions && (
            <CardRow>
              <View style={[styles.notesBox, { backgroundColor: theme.inputBg }]}>
                <Text style={{ color: theme.subtext, fontSize: 12.5, flex: 1 }}>“{order.specialInstructions}”</Text>
              </View>
            </CardRow>
          )}
          <CardRow>
            <View style={{ flex: 1 }}>
              {(order.items ?? []).map((i: any) => (
                <View key={i.id} style={styles.itemRow}>
                  <Text style={{ color: theme.text, fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                    {i.quantity}× {i.nameSnapshot}
                  </Text>
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>{formatPrice(i.lineTotal)}</Text>
                </View>
              ))}
            </View>
          </CardRow>
          <CardRow>
            <View style={{ flex: 1 }}>
              <FeeLine label="Items" value={formatPrice(order.itemsTotal)} theme={theme} />
              <FeeLine label="Delivery" value={formatPrice(order.deliveryFee)} theme={theme} />
              <FeeLine label="Service" value={formatPrice(order.serviceFee)} theme={theme} />
              {num(order.discountTotal) > 0 && (
                <FeeLine label={`Discount${order.promoCode ? ` · ${order.promoCode.code}` : ''}`} value={`−${formatPrice(order.discountTotal)}`} theme={theme} accent />
              )}
              <View style={styles.totalLine}>
                <Text style={{ color: theme.text, fontWeight: '900', fontSize: 15, flex: 1 }}>Total</Text>
                <Text style={{ color: theme.text, fontWeight: '900', fontSize: 16 }}>{formatPrice(order.total)}</Text>
              </View>
              <View style={styles.payRow}>
                <Text style={{ color: theme.subtext, fontSize: 12, flex: 1 }}>
                  {paymentLabel(order.paymentMethod)} · {statusLabel(order.paymentStatus)}
                </Text>
                <Badge label={order.paymentStatus} tone={order.paymentStatus === 'SUCCEEDED' ? 'brand' : 'warning'} />
              </View>
            </View>
          </CardRow>
        </Card>
      </Section>

      {!!order.delivery?.distanceKm && (
        <Text style={[styles.metaLine, { color: theme.subtext }]}>
          Trip distance {num(order.delivery.distanceKm).toFixed(1)} km
        </Text>
      )}

      <CardPaymentModal
        visible={cardOpen}
        clientSecret={cardSecret}
        amountLabel={formatPrice(order.total)}
        onSucceeded={() => {
          setCardOpen(false);
          setBanner(null);
          refetch();
        }}
        onCancel={() => setCardOpen(false)}
      />
    </Screen>
  );
}

function FeeLine({
  label,
  value,
  theme,
  accent,
}: {
  label: string;
  value: string;
  theme: { text: string; subtext: string };
  accent?: boolean;
}) {
  return (
    <View style={styles.feeRow}>
      <Text style={{ color: accent ? palette.brandDark : theme.subtext, fontSize: 12.5, flex: 1 }}>{label}</Text>
      <Text style={{ color: accent ? palette.brandDark : theme.text, fontSize: 12.5, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function paymentLabel(method?: string | null): string {
  if (method === 'WALLET') return 'Paid from wallet';
  if (method === 'CASH') return 'Cash on delivery';
  return 'Paid by card';
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.input, padding: 11, marginBottom: 14, flexDirection: 'row' },
  payBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.card, padding: 12, marginBottom: 14 },
  payTitle: { fontSize: 14, fontWeight: '900' },
  payBody: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  statusCard: { padding: 14, marginBottom: 20 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusMain: { fontSize: 17, fontWeight: '900' },
  statusSub: { fontSize: 12.5, marginTop: 2 },
  cancelNote: { fontSize: 12, textAlign: 'center' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  driverAvatar: { width: 42, height: 42, borderRadius: 21 },
  driverFallback: { backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  callBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatBox: { borderWidth: 1, borderRadius: radius.card, padding: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, flex: 1 },
  notesBox: { borderRadius: radius.input, padding: 9, flexDirection: 'row', flex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  feeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  totalLine: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', marginTop: 8, paddingTop: 8 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  metaLine: { fontSize: 11.5, textAlign: 'center', marginBottom: 10 },
});
