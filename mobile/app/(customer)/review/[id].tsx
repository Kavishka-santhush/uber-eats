import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { formatPrice } from '@/components/price';
import { ORDER_DETAIL, PENDING_REVIEW } from '@/lib/graphql/queries';
import { CREATE_REVIEW } from '@/lib/graphql/mutations';
import { assetUrl } from '@/lib/config';
import { palette, radius, useTheme } from '@/lib/theme';

const WORDS = ['', 'Terrible', 'Poor', 'Okay', 'Great', 'Excellent'];

/** Tap-to-rate star row (the mobile twin of the web dialog's StarsInput). */
function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.starsBox}>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''} for ${label}`}
          >
            <Ionicons name={n <= value ? 'star' : 'star-outline'} size={30} color={palette.star} />
          </Pressable>
        ))}
      </View>
      <Text style={[styles.starWord, { color: theme.subtext }]}>{WORDS[value] || 'Tap a star'}</Text>
    </View>
  );
}

/** Post-delivery rating screen: restaurant + courier, skipping what is rated. */
export default function ReviewScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const orderQ = useQuery(ORDER_DETAIL, { variables: { id }, skip: !id, fetchPolicy: 'cache-and-network' });
  const pendingQ = useQuery(PENDING_REVIEW, { variables: { orderId: id }, skip: !id, errorPolicy: 'ignore' });
  const [createReview, { loading: busy }] = useMutation(CREATE_REVIEW);

  const order: any = orderQ.data?.order ?? null;
  const pending: any = pendingQ.data?.pendingReviewForOrder ?? null;

  // Whatever the server says is already rated is hidden from the form.
  const [restaurantDone, setRestaurantDone] = useState(false);
  const [driverDone, setDriverDone] = useState(false);
  useEffect(() => {
    if (!pending) return;
    setRestaurantDone(!!pending.orderRated);
    setDriverDone(!!pending.driverRated);
  }, [pending]);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [driverRating, setDriverRating] = useState(5);
  const [driverComment, setDriverComment] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const restaurantId: string | undefined = order?.branch?.restaurant?.id;
  const driverUserId: string | undefined = order?.delivery?.driver?.userId;
  const canRateRestaurant = !!restaurantId && !restaurantDone;
  const canRateDriver = !!driverUserId && !driverDone;

  const submit = async () => {
    if (!order) return;
    setBanner(null);
    try {
      // One mutation per target: the server stores a review per (order, type).
      if (canRateRestaurant) {
        await createReview({
          variables: {
            input: {
              orderId: order.id,
              restaurantId,
              branchId: order.branch?.id,
              type: 'restaurant',
              rating,
              comment: comment.trim() || undefined,
            },
          },
        });
        setRestaurantDone(true);
      }
      if (canRateDriver) {
        await createReview({
          variables: {
            input: {
              orderId: order.id,
              restaurantId,
              driverUserId,
              type: 'driver',
              rating: driverRating,
              comment: driverComment.trim() || undefined,
            },
          },
        });
        setDriverDone(true);
      }
      router.replace({ pathname: '/track/[id]', params: { id: order.id } });
    } catch (e: any) {
      setBanner(cleanError(e) || 'Could not save your review');
    }
  };

  if (orderQ.loading && !order) {
    return (
      <Screen back title="Rate your order">
        <LoadingBlock label="Loading the order…" />
      </Screen>
    );
  }
  if (!order) {
    return (
      <Screen back title="Rate your order">
        <EmptyState
          icon="alert-circle-outline"
          title="Order not found"
          body="We could not load this order to rate it."
          ctaLabel="Back to your orders"
          ctaOnPress={() => router.replace('/tabs/orders')}
        />
      </Screen>
    );
  }
  if (order.status !== 'DELIVERED') {
    return (
      <Screen back title="Rate your order">
        <EmptyState
          icon="time-outline"
          title="Not quite yet"
          body="You can rate an order once it has been delivered."
          ctaLabel="Track this order"
          ctaOnPress={() => router.replace({ pathname: '/track/[id]', params: { id: order.id } })}
        />
      </Screen>
    );
  }
  if (!canRateRestaurant && !canRateDriver) {
    return (
      <Screen back title="Rate your order">
        <EmptyState
          icon="checkmark-circle-outline"
          title="All rated — thank you!"
          body="You have already reviewed the restaurant and the courier for this order."
          ctaLabel="Back to the order"
          ctaOnPress={() => router.replace({ pathname: '/track/[id]', params: { id: order.id } })}
        />
      </Screen>
    );
  }

  const avatar = assetUrl(order.delivery?.driver?.user?.avatarUrl);

  return (
    <Screen
      back
      title="Rate your order"
      subtitle={`#${order.orderNumber} · ${order.branch?.restaurant?.name ?? order.branch?.name ?? ''}`}
      footer={
        <Button title={busy ? 'Sending…' : 'Submit review'} onPress={submit} loading={busy} />
      }
    >
      {/* What was ordered — a nudge for the comment you are about to write */}
      <Card style={styles.orderCard}>
        <CardRow>
          <Text style={[styles.orderTitle, { color: theme.text }]} numberOfLines={1}>
            {order.items?.length ?? 0} item{order.items?.length === 1 ? '' : 's'} · {formatPrice(order.total)}
          </Text>
          <View style={styles.thumbRow}>
            {(order.items ?? []).slice(0, 3).map((i: any) => (
              <View key={i.id} style={styles.thumbBox}>
                <Text style={styles.thumbText}>{(i.nameSnapshot ?? '?').slice(0, 1).toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </CardRow>
      </Card>

      {!!banner && (
        <View style={[styles.banner, { backgroundColor: '#FEF3C7' }]}>
          <Text style={{ color: '#B45309', fontSize: 12.5, flex: 1, lineHeight: 18 }}>{banner}</Text>
        </View>
      )}

      {canRateRestaurant && (
        <Section title="The restaurant" subtitle={order.branch?.restaurant?.name ?? order.branch?.name}>
          <Card style={{ padding: 14 }}>
            <Stars value={rating} onChange={setRating} label="the restaurant" />
            <Input
              label="How was the food and service?"
              value={comment}
              onChangeText={setComment}
              placeholder="Fresh, hot and on time…"
              multiline
              numberOfLines={3}
              style={styles.textarea}
              maxLength={600}
              hint="Optional, but restaurants really read these."
            />
          </Card>
        </Section>
      )}
      {restaurantDone && <DoneNote text="You already rated the restaurant for this order." theme={theme} />}

      {canRateDriver && (
        <Section title="Your courier" subtitle="Delivery speed, friendliness and care">
          <Card style={{ padding: 14 }}>
            <View style={styles.driverRow}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.driverAvatar} />
              ) : (
                <View style={[styles.driverAvatar, styles.driverFallback]}>
                  <Ionicons name="bicycle" size={18} color={palette.brandDark} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { color: theme.text }]}>
                  {order.delivery?.driver?.user?.fullName ?? 'Your courier'}
                </Text>
                <Text style={[styles.driverMeta, { color: theme.subtext }]} numberOfLines={1}>
                  {[order.delivery?.driver?.vehicleType, order.delivery?.driver?.vehiclePlate]
                    .filter(Boolean)
                    .join(' · ') || 'Delivery partner'}
                </Text>
              </View>
              <Badge label={`★ ${Number(order.delivery?.driver?.avgRating ?? 5).toFixed(1)}`} tone="brand" />
            </View>
            <View style={{ marginTop: 12 }}>
              <Stars value={driverRating} onChange={setDriverRating} label="the courier" />
            </View>
            <Input
              label="How was the delivery?"
              value={driverComment}
              onChangeText={setDriverComment}
              placeholder="Friendly, fast, kept the food hot…"
              multiline
              numberOfLines={3}
              style={styles.textarea}
              maxLength={600}
              hint="Optional"
            />
          </Card>
        </Section>
      )}
      {driverDone && !!driverUserId && <DoneNote text="You already rated the courier." theme={theme} />}

      <Text style={[styles.privacy, { color: theme.subtext }]}>
        Ratings update the restaurant and courier profiles immediately. Only your first name is shown with a comment.
      </Text>
    </Screen>
  );
}

function DoneNote({ text, theme }: { text: string; theme: { card: string; subtext: string; border: string } }) {
  return (
    <View style={[styles.doneNote, { borderColor: theme.border }]}>
      <Ionicons name="checkmark-circle-outline" size={16} color={palette.brand} />
      <Text style={{ color: theme.subtext, fontSize: 12.5, flex: 1 }}>{text}</Text>
    </View>
  );
}

function cleanError(e: any): string | undefined {
  const message: string | undefined = e?.message;
  return message ? message.replace('GraphQL error: ', '') : undefined;
}

const styles = StyleSheet.create({
  orderCard: { marginBottom: 14 },
  orderTitle: { fontSize: 13.5, fontWeight: '800', flex: 1 },
  thumbRow: { flexDirection: 'row', gap: 5 },
  thumbBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: palette.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { color: palette.brandDark, fontSize: 11, fontWeight: '900' },
  banner: { borderRadius: radius.input, padding: 11, marginBottom: 14, flexDirection: 'row' },
  starsBox: { alignItems: 'center', marginBottom: 14 },
  starsRow: { flexDirection: 'row', gap: 10 },
  starWord: { fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  textarea: { height: 84, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'top' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  driverAvatar: { width: 40, height: 40, borderRadius: 20 },
  driverFallback: { backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 14, fontWeight: '900' },
  driverMeta: { fontSize: 11.5, marginTop: 1 },
  doneNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 12,
    marginBottom: 14,
  },
  privacy: { fontSize: 11.5, textAlign: 'center', lineHeight: 16, marginTop: 4 },
});
