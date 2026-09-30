import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { ME_FULL } from '@/lib/graphql/queries';
import { SET_BRANCH_STATUS } from '@/lib/graphql/mutations';
import { useAuth } from '@/lib/auth/store';
import { palette, radius, useTheme } from '@/lib/theme';

/**
 * Owner dashboard — lists the owner's restaurants and their branches with
 * quick open/close/status actions.
 */
export default function OwnerDashboardScreen() {
  const theme = useTheme();
  const session = useAuth((s) => s.user);

  const { data, loading, refetch } = useQuery(ME_FULL, { fetchPolicy: 'cache-and-network' });
  const restaurants: any[] = data?.me?.ownedRestaurants ?? [];

  const [setBranchStatus] = useMutation(SET_BRANCH_STATUS, { onCompleted: () => refetch() });

  const toggleBranch = (branchId: string, currentStatus: string) => {
    const next = currentStatus === 'OPEN' ? 'CLOSED' : 'OPEN';
    Alert.alert(
      next === 'OPEN' ? 'Open this branch?' : 'Close this branch?',
      next === 'OPEN' ? 'Customers will be able to place orders immediately.' : 'New orders will be hidden for this branch.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: next === 'OPEN' ? 'Open' : 'Close', onPress: () => setBranchStatus({ variables: { id: branchId, status: next } }) },
      ],
    );
  };

  if (loading && !data) {
    return (
      <Screen title="Dashboard" subtitle={session?.fullName}>
        <LoadingBlock label="Loading your restaurants…" />
      </Screen>
    );
  }

  if (!restaurants.length) {
    return (
      <Screen title="Dashboard" subtitle={session?.fullName}>
        <EmptyState
          icon="restaurant-outline"
          title="No restaurants yet"
          body="You do not manage any restaurants. If you believe this is an error, contact support."
        />
      </Screen>
    );
  }

  return (
    <Screen title="Dashboard" subtitle={session?.fullName} refresh={refetch} refreshing={loading && !!data}>
      {restaurants.map((r) => (
        <View key={r.id} style={{ marginBottom: 18 }}>
          <Section title={r.name} subtitle={`${r.totalOrders ?? 0} orders · ${r.avgRating?.toFixed(1) ?? '—'} \u2605`}>
            <View style={styles.quickLinks}>
              <QuickLink icon="cube-outline" label="Orders" onPress={() => router.push({ pathname: '/board', params: { restaurantId: r.id } })} theme={theme} />
              <QuickLink icon="list-outline" label="Menu" onPress={() => router.push({ pathname: '/menu', params: { restaurantId: r.id } })} theme={theme} />
              <QuickLink icon="cash-outline" label="Earnings" onPress={() => router.push({ pathname: '/earnings', params: { restaurantId: r.id } })} theme={theme} />
            </View>
          </Section>

          {(r.branches ?? []).map((b: any) => (
            <Card key={b.id} style={{ marginBottom: 8 }}>
              <CardRow
                right={
                  <Button
                    title={b.status === 'OPEN' ? 'Close' : 'Open'}
                    variant={b.status === 'OPEN' ? 'secondary' : 'primary'}
                    size="sm"
                    onPress={() => toggleBranch(b.id, b.status)}
                  />
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bold, { color: theme.text }]}>{b.name}</Text>
                  <Text style={[styles.hint, { color: theme.subtext }]}>
                    {b.addressLine1}{b.city ? `, ${b.city}` : ''}
                  </Text>
                  <View style={{ marginTop: 5 }}>
                    <Badge
                      label={b.status === 'OPEN' ? 'Open' : b.status === 'BUSY' ? 'Busy' : 'Closed'}
                      tone={b.status === 'OPEN' ? 'brand' : b.status === 'BUSY' ? 'warning' : 'neutral'}
                    />
                  </View>
                </View>
              </CardRow>
            </Card>
          ))}
        </View>
      ))}

      {/* Sign out */}
      <View style={{ marginTop: 8 }}>
        <Pressable
          style={[styles.signOut, { borderColor: theme.border }]}
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

function QuickLink({ icon, label, onPress, theme }: { icon: any; label: string; onPress: () => void; theme: any }) {
  return (
    <Pressable onPress={onPress} style={[styles.quickBtn, { borderColor: theme.border }]} accessibilityRole="button">
      <Ionicons name={icon} size={17} color={palette.brandDark} />
      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', marginTop: 4 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bold: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2 },
  quickLinks: { flexDirection: 'row', gap: 10, marginTop: 6, paddingHorizontal: 16 },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingVertical: 12,
  },
});
