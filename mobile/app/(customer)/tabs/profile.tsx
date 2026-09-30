import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardRow } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingBlock, Screen, Section } from '@/components/screen';
import { formatPrice } from '@/components/price';
import { ME_FULL } from '@/lib/graphql/queries';
import { logout } from '@/lib/auth/api';
import { useAuth } from '@/lib/auth/store';
import { useCart } from '@/lib/cart/store';
import { assetUrl } from '@/lib/config';
import { palette, radius, useTheme } from '@/lib/theme';

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SUPPORT_AGENT'];

/** Account hub: balance, rewards, saved data, settings and sign out. */
export default function ProfileScreen() {
  const theme = useTheme();
  const session = useAuth((s) => s.user);
  const clearCart = useCart((s) => s.clear);
  const { data, loading, refetch } = useQuery(ME_FULL, { fetchPolicy: 'cache-and-network' });
  const me = data?.me;

  const signOut = () => {
    Alert.alert('Sign out?', 'You will need to log in again to place orders.', [
      { text: 'Stay signed in', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          clearCart();
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  if (loading && !me) {
    return (
      <Screen title="Account" back={false}>
        <LoadingBlock label="Loading your account…" />
      </Screen>
    );
  }

  const avatar = assetUrl(me?.avatarUrl ?? session?.avatarUrl);
  const name = me?.fullName ?? session?.fullName ?? 'Your account';
  const contact = me?.email ?? me?.phone ?? session?.email ?? '';
  const favourites = (me?.favorites ?? []).length;

  return (
    <Screen title="Account" back={false} refresh={() => refetch()} refreshing={loading && !!data}>
      {/* Identity */}
      <View style={styles.identity}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {name}
          </Text>
          {!!contact && (
            <Text style={[styles.contact, { color: theme.subtext }]} numberOfLines={1}>
              {contact}
            </Text>
          )}
          <View style={styles.roleRow}>
            <Badge label={roleLabel(me?.role ?? session?.role)} tone="brand" />
            {(me?.status ?? session?.status) === 'SUSPENDED' && <Badge label="Suspended" tone="danger" />}
          </View>
        </View>
        <Pressable
          hitSlop={8}
          onPress={() => router.push('/edit-profile')}
          accessibilityRole="button"
          style={[styles.editBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name="pencil" size={16} color={theme.text} />
        </Pressable>
      </View>

      {/* Money + rewards */}
      <View style={styles.stats}>
        <StatTile
          icon="wallet-outline"
          label="Wallet"
          value={formatPrice(me?.wallet?.balance ?? 0)}
          onPress={() => router.push('/wallet')}
        />
        <StatTile
          icon="trophy-outline"
          label="Loyalty"
          value={`${me?.loyaltyPoints ?? 0} pts`}
          onPress={() => router.push('/promos')}
        />
        <StatTile icon="heart-outline" label="Saved" value={`${favourites}`} onPress={() => router.push('/favorites')} />
      </View>

      {/* Staff pointers: the back-office consoles live on the web app */}
      {STAFF_ROLES.includes(me?.role ?? session?.role ?? '') && (
        <Card style={styles.noticeCard}>
          <CardRow>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Staff account</Text>
            <Text style={[styles.rowSub, { color: theme.subtext }]}>
              Admin, ops and support tooling runs in the web console — sign in there with this account.
            </Text>
          </CardRow>
        </Card>
      )}
      {(me?.ownedRestaurants ?? []).length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <CardRow onPress={() => router.push('/dashboard')} right={<Chevron />}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Restaurant manager</Text>
            <Text style={[styles.rowSub, { color: theme.subtext }]}>
              {me.ownedRestaurants.length} kitchen{me.ownedRestaurants.length > 1 ? 's' : ''} · order board, menu and earnings
            </Text>
          </CardRow>
        </Card>
      )}
      {!!me?.driverProfile && (
        <Card style={{ marginBottom: 12 }}>
          <CardRow onPress={() => router.push('/home')} right={<Chevron />}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Driver app</Text>
            <Text style={[styles.rowSub, { color: theme.subtext }]}>
              Availability: {me.driverProfile.availability ?? 'OFFLINE'} · {me.driverProfile.approvalStatus}
            </Text>
          </CardRow>
        </Card>
      )}

      <Section title="Delivery">
        <Card>
          <Row icon="location-outline" label="Addresses" hint={`${(me?.addresses ?? []).length} saved`} to="/addresses" />
          <Row icon="cube-outline" label="Orders" hint="Track and reorder" to="/tabs/orders" last />
        </Card>
      </Section>

      <Section title="Money & rewards">
        <Card>
          <Row icon="wallet-outline" label="Wallet & transactions" hint={formatPrice(me?.wallet?.balance ?? 0)} to="/wallet" />
          <Row icon="ticket-outline" label="Promo codes & loyalty" hint="Save on your next order" to="/promos" />
          <Row icon="heart-outline" label="Favorites" hint={`${favourites} places and dishes`} to="/favorites" last />
        </Card>
      </Section>

      <Section title="App">
        <Card>
          <Row
            icon="notifications-outline"
            label="Notifications"
            hint={(me?.unreadNotificationCount ?? 0) > 0 ? `${me?.unreadNotificationCount} unread` : 'All read'}
            to="/notifications"
          />
          <Row icon="settings-outline" label="Settings & preferences" hint="Appearance, notifications, data" to="/settings" />
          <Row icon="help-circle-outline" label="Help & support" hint="Tickets and FAQs" to="/support" last />
        </Card>
      </Section>

      <Pressable onPress={signOut} style={[styles.signOut, { borderColor: theme.border }]} accessibilityRole="button">
        <Ionicons name="log-out-outline" size={17} color={palette.danger} />
        <Text style={{ color: palette.danger, fontWeight: '800', fontSize: 14 }}>Sign out</Text>
      </Pressable>

      <Text style={[styles.version, { color: theme.subtext }]}>QuickBite for mobile</Text>
    </Screen>
  );
}

function Chevron() {
  const theme = useTheme();
  return <Ionicons name="chevron-forward" size={17} color={theme.subtext} />;
}

function Row({
  icon,
  label,
  hint,
  to,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  to: string;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <CardRow
      right={
        <View style={styles.rowRight}>
          {!!hint && <Text style={[styles.rowHint, { color: theme.subtext }]} numberOfLines={1}>{hint}</Text>}
          <Chevron />
        </View>
      }
      onPress={() => router.push(to)}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.rowIcon, { backgroundColor: theme.inputBg }]}>
          <Ionicons name={icon} size={17} color={palette.brandDark} />
        </View>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{label}</Text>
      </View>
    </CardRow>
  );
}

function StatTile({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.tile, { backgroundColor: theme.card, borderColor: theme.border }]} accessibilityRole="button">
      <Ionicons name={icon} size={18} color={palette.brand} />
      <Text style={[styles.tileValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.tileLabel, { color: theme.subtext }]}>{label}</Text>
    </Pressable>
  );
}

function roleLabel(role?: string | null): string {
  switch (role) {
    case 'CUSTOMER':
      return 'Customer';
    case 'DRIVER':
      return 'Driver';
    case 'RESTAURANT_OWNER':
      return 'Restaurant owner';
    case 'RESTAURANT_STAFF':
      return 'Restaurant staff';
    case 'SUPER_ADMIN':
      return 'Super admin';
    case 'ADMIN':
      return 'Admin';
    case 'OPS_MANAGER':
      return 'Ops manager';
    case 'SUPPORT_AGENT':
      return 'Support agent';
    default:
      return 'Account';
  }
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarFallback: { backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 22 },
  name: { fontSize: 19, fontWeight: '900' },
  contact: { fontSize: 12.5, marginTop: 1 },
  roleRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  editBtn: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tile: { flex: 1, borderWidth: 1, borderRadius: radius.card, padding: 12, alignItems: 'flex-start', gap: 4 },
  tileValue: { fontSize: 16, fontWeight: '900', maxWidth: '100%' },
  tileLabel: { fontSize: 11.5, fontWeight: '700' },
  noticeCard: { marginBottom: 12 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowHint: { fontSize: 12, maxWidth: 130 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingVertical: 13,
    marginTop: 6,
  },
  version: { textAlign: 'center', fontSize: 11.5, marginTop: 16 },
});
