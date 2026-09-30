import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { MY_DELIVERY_REQUESTS, MY_DRIVER_PROFILE } from '@/lib/graphql/queries';
import { RESPOND_TO_DELIVERY, SET_DRIVER_ONLINE } from '@/lib/graphql/mutations';
import { formatPrice } from '@/components/price';
import { num } from '@/lib/geo';
import { getSocket } from '@/lib/socket';
import { palette, radius, useTheme } from '@/lib/theme';

/**
 * Driver home — availability toggle, incoming delivery requests,
 * active-delivery summary, and a quick earnings strip.
 */
export default function DriverHomeScreen() {
  const theme = useTheme();

  const { data: profileData, loading: loadingProfile, refetch: refetchProfile } = useQuery(MY_DRIVER_PROFILE, {
    fetchPolicy: 'cache-and-network',
  });
  const profile = profileData?.myDriverProfile;

  const { data: reqData, refetch: refetchRequests } = useQuery(MY_DELIVERY_REQUESTS, {
    fetchPolicy: 'network-only',
    skip: profile?.availability === 'OFFLINE',
  });
  const requests: any[] = reqData?.myDeliveryRequests ?? [];

  const [setOnline, settingOnline] = useMutation(SET_DRIVER_ONLINE, {
    onCompleted: () => refetchProfile(),
  });
  const [respond] = useMutation(RESPOND_TO_DELIVERY, {
    onCompleted: () => { refetchRequests(); refetchProfile(); },
  });

  const isOnline = profile?.availability === 'ONLINE' || profile?.availability === 'ON_DELIVERY';
  const active = profile?.activeDelivery;
  const earnings = num(profile?.earningsBalance);

  const [busyId, setBusyId] = useState<string | null>(null);

  // Listen for real-time delivery:request events pushed to user:<id>
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => refetchRequests();
    socket.on('delivery:request', handler);
    return () => { socket.off('delivery:request', handler); };
  }, [refetchRequests]);

  const toggleOnline = useCallback(
    (val: boolean) => {
      if (profile?.approvalStatus !== 'APPROVED') {
        Alert.alert('Not approved yet', 'Your driver account is still under review. You will be notified once it is approved.');
        return;
      }
      if (profile?.isSuspended) {
        Alert.alert('Account suspended', 'Contact operations to resolve the suspension before going online.');
        return;
      }
      setOnline({ variables: { online: val } });
    },
    [profile, setOnline],
  );

  const accept = async (deliveryId: string) => {
    setBusyId(deliveryId);
    try {
      await respond({ variables: { deliveryId, accept: true } });
      router.push('/run');
    } catch (e: any) {
      Alert.alert('Could not accept', e?.message?.replace('GraphQL error: ', '') || 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  const decline = (deliveryId: string) => {
    Alert.alert('Decline this job?', 'The next nearby driver will be offered it.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setBusyId(deliveryId);
          try { await respond({ variables: { deliveryId, accept: false } }); }
          finally { setBusyId(null); }
        },
      },
    ]);
  };

  if (loadingProfile && !profile) {
    return (
      <Screen title="Driver">
        <LoadingBlock label="Loading your profile…" />
      </Screen>
    );
  }

  return (
    <Screen title="Driver" subtitle={profile?.user?.fullName ?? ''} refresh={refetchProfile} refreshing={loadingProfile && !!profile}>
      {/* Availability card */}
      <Card>
        <CardRow
          right={
            <Switch
              value={isOnline}
              onValueChange={toggleOnline}
              disabled={settingOnline || profile?.availability === 'ON_DELIVERY'}
              trackColor={{ true: palette.brandSoft, false: theme.border }}
              thumbColor={isOnline ? palette.brand : '#fff'}
            />
          }
        >
          <Text style={[styles.bold, { color: theme.text }]}>
            {isOnline ? 'You are online' : 'You are offline'}
          </Text>
          <Text style={[styles.hint, { color: theme.subtext }]}>
            {profile?.availability === 'ON_DELIVERY'
              ? 'Currently on a delivery — finish it to go back offline.'
              : isOnline
                ? 'Waiting for nearby requests…'
                : 'Go online to start receiving requests.'}
          </Text>
        </CardRow>
      </Card>

      {/* Active delivery */}
      {active && (
        <View style={{ marginTop: 14 }}>
          <Section title="Active delivery">
            <Card>
              <CardRow onPress={() => router.push('/run')} right={<Ionicons name="chevron-forward" size={17} color={theme.subtext} />}>
                <Text style={[styles.bold, { color: theme.text }]}>
                  {active.order?.orderNumber ?? 'Order'}
                </Text>
                <Text style={[styles.hint, { color: theme.subtext }]}>
                  {active.order?.branch?.name} → {active.order?.address?.line1 ?? 'Customer'}
                </Text>
                <Badge label={active.status?.replace(/_/g, ' ') ?? 'Active'} tone="info" />
              </CardRow>
            </Card>
          </Section>
        </View>
      )}

      {/* Pending requests */}
      {!active && isOnline && (
        <View style={{ marginTop: 14 }}>
          <Section title="Incoming requests" subtitle={requests.length ? `${requests.length} waiting` : 'None right now'}>
            {requests.length === 0 ? (
              <EmptyState icon="time-outline" title="No pending requests" body="New offers appear the moment a restaurant marks an order ready." />
            ) : (
              requests.map((r) => {
                const expiresAt = r.expiresAt ? new Date(r.expiresAt).getTime() : 0;
                const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
                return (
                  <Card key={r.id} style={{ marginBottom: 10 }}>
                    <CardRow>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.bold, { color: theme.text }]}>
                          {r.order?.branch?.name ?? 'Restaurant'}
                        </Text>
                        <Text style={[styles.hint, { color: theme.subtext }]}>
                          {r.order?.address?.line1}, {r.order?.address?.city} · {num(r.distanceKm).toFixed(1)} km
                        </Text>
                        <Text style={[styles.meta, { color: theme.subtext }]}>
                          Fee: <Text style={{ fontWeight: '700', color: theme.text }}>{formatPrice(r.fee)}</Text>
                          {'  ·  '}
                          Expires in <Text style={{ fontWeight: '700', color: remaining < 30 ? palette.danger : theme.text }}>{remaining}s</Text>
                        </Text>
                      </View>
                    </CardRow>
                    <View style={styles.btnRow}>
                      <Button
                        title="Decline"
                        variant="secondary"
                        size="sm"
                        onPress={() => decline(r.deliveryId)}
                        disabled={busyId === r.deliveryId}
                      />
                      <Button
                        title="Accept"
                        size="sm"
                        onPress={() => accept(r.deliveryId)}
                        loading={busyId === r.deliveryId}
                      />
                    </View>
                  </Card>
                );
              })
            )}
          </Section>
        </View>
      )}

      {/* Earnings snapshot + quick links */}
      <View style={{ marginTop: 14 }}>
        <Section title="Earnings">
          <Card>
            <CardRow>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bold, { color: theme.text }]}>{formatPrice(earnings)}</Text>
                <Text style={[styles.hint, { color: theme.subtext }]}>Available balance</Text>
              </View>
              <Badge label={`${profile?.totalDeliveries ?? 0} trips`} tone="neutral" />
            </CardRow>
            <CardRow onPress={() => router.push('/income')} right={<Ionicons name="chevron-forward" size={17} color={theme.subtext} />}>
              <Text style={{ color: palette.brand, fontWeight: '700', fontSize: 13 }}>View full breakdown</Text>
            </CardRow>
            <CardRow onPress={() => router.push('/history')} right={<Ionicons name="chevron-forward" size={17} color={theme.subtext} />}>
              <Text style={{ color: palette.brand, fontWeight: '700', fontSize: 13 }}>Delivery history</Text>
            </CardRow>
          </Card>
        </Section>
      </View>

      {/* Rating */}
      <View style={{ marginTop: 14 }}>
        <Card>
          <CardRow>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={17} color={palette.brand} />
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>
                {(profile?.avgRating ?? 0).toFixed(2)}
              </Text>
              <Text style={{ color: theme.subtext, fontSize: 12 }}>
                {'  '}{profile?.reviewCount ?? 0} reviews
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <Badge label={`${num(profile?.onTimeRate).toFixed(0)}% on time`} tone="brand" />
          </CardRow>
        </Card>
      </View>

      {/* Sign out link */}
      <View style={{ marginTop: 14 }}>
        <Pressable
          style={[styles.supportBtn, { borderColor: theme.border }]}
          onPress={() => router.replace('/login')}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={16} color={palette.danger} />
          <Text style={{ color: palette.danger, fontWeight: '700', fontSize: 13 }}>Sign out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  meta: { fontSize: 12, marginTop: 4 },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingVertical: 12,
  },
});
