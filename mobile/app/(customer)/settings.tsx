import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { ChipRow, LoadingBlock, Screen, Section } from '@/components/screen';
import { ME_FULL } from '@/lib/graphql/queries';
import { UPDATE_NOTIFICATION_PREF, UPDATE_PROFILE } from '@/lib/graphql/mutations';
import { logout, registerPushToken } from '@/lib/auth/api';
import { useAuth } from '@/lib/auth/store';
import { useAppearance, type AppearanceMode } from '@/lib/appearance';
import { useCart } from '@/lib/cart/store';
import { config } from '@/lib/config';
import { palette, radius, useTheme } from '@/lib/theme';

interface Prefs {
  pushOrders: boolean;
  pushPromos: boolean;
  emailOrders: boolean;
  emailPromos: boolean;
  smsCritical: boolean;
}

const PREF_ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'pushOrders', label: 'Order updates', hint: 'Accepted, cooking, courier assigned, delivered' },
  { key: 'pushPromos', label: 'Offers & promo codes', hint: 'Marketing pushes — off if you prefer quiet' },
  { key: 'emailOrders', label: 'Email receipts', hint: 'Order confirmations and refunds by email' },
  { key: 'emailPromos', label: 'Email offers', hint: 'Occasional campaign emails' },
  { key: 'smsCritical', label: 'SMS for critical alerts', hint: 'Payment problems or delivery failures only' },
];

/** App preferences: appearance, notification channels and account data. */
export default function SettingsScreen() {
  const theme = useTheme();
  const session = useAuth((s) => s.user);
  const clearCart = useCart((s) => s.clear);
  const mode = useAppearance((s) => s.mode);
  const setMode = useAppearance((s) => s.setMode);

  const { data, loading, refetch } = useQuery(ME_FULL, { fetchPolicy: 'cache-and-network' });
  const me = data?.me;

  const [updateProfile] = useMutation(UPDATE_PROFILE);
  const [updatePref] = useMutation(UPDATE_NOTIFICATION_PREF);

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (me?.notificationPref) setPrefs(me.notificationPref as Prefs);
  }, [me]);

  // Read the OS permission once on mount so the row tells the truth about what is possible.
  useEffect(() => {
    let cancelled = false;
    Notifications.getPermissionsAsync()
      .then((r) => {
        if (!cancelled) setPushGranted(r.granted || r.ios?.includes('alert') === true);
      })
      .catch(() => {
        if (!cancelled) setPushGranted(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeMode = async (next: AppearanceMode) => {
    setMode(next);
    try {
      // Mirror the choice on the account (User.darkMode) so other clients can read it.
      await updateProfile({ variables: { input: { darkMode: next === 'dark' } } });
    } catch {
      /* the local override still applies — this is best effort */
    }
  };

  const toggle = async (key: keyof Prefs, value: boolean) => {
    if (!prefs) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next); // optimistic: switches should not lag the network
    try {
      await updatePref({ variables: { input: next } });
      setBanner(null);
    } catch (e: any) {
      setPrefs(previous);
      setBanner(cleanError(e) || 'Could not save that preference');
    }
  };

  const enablePush = async () => {
    setBanner(null);
    try {
      const res = await Notifications.requestPermissionsAsync();
      const granted = res.granted || res.ios?.includes('alert') === true;
      setPushGranted(granted);
      if (!granted) {
        setBanner('Notifications are blocked for QuickBite in your system settings.');
        return;
      }
      await registerPushToken();
      setBanner(null);
    } catch (e: any) {
      setBanner(cleanError(e) || 'Could not register this device for push');
    }
  };

  const signOut = () => {
    Alert.alert('Sign out?', 'Your cart will be emptied and you will need to log in again.', [
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
      <Screen back title="Settings">
        <LoadingBlock label="Loading your preferences…" />
      </Screen>
    );
  }

  return (
    <Screen back title="Settings" refresh={refetch} refreshing={loading && !!data}>
      {!!banner && (
        <View style={[styles.banner, { backgroundColor: '#FEF3C7' }]}>
          <Text style={{ color: '#B45309', fontSize: 12.5, flex: 1, lineHeight: 18 }}>{banner}</Text>
        </View>
      )}

      <Section title="Appearance" subtitle="Only affects this device">
        <Card>
          <CardRow>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Theme</Text>
              <Text style={[styles.rowHint, { color: theme.subtext }]}>
                System follows your phone's light or dark setting.
              </Text>
              <View style={{ marginTop: 10 }}>
                <ChipRow
                  value={mode}
                  onChange={(v) => changeMode(v as AppearanceMode)}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </View>
            </View>
          </CardRow>
        </Card>
      </Section>

      <Section title="Push notifications" subtitle="Order status changes reach your phone instantly">
        <Card>
          <CardRow
            right={
              <Badge
                label={pushGranted === null ? 'Checking…' : pushGranted ? 'Allowed' : 'Blocked'}
                tone={pushGranted ? 'brand' : pushGranted === false ? 'danger' : 'neutral'}
              />
            }
          >
            <Text style={[styles.rowTitle, { color: theme.text }]}>Device permission</Text>
            <Text style={[styles.rowHint, { color: theme.subtext }]}>
              {pushGranted === false
                ? 'Allow notifications for QuickBite in your system settings, then retry.'
                : `Registered to the ${Platform.OS} push service.`}
            </Text>
            <View style={{ marginTop: 9 }}>
              <Button title="Retry registration" variant="secondary" size="sm" onPress={enablePush} />
            </View>
          </CardRow>

          <CardRow>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>What we send you</Text>
              <Text style={[styles.rowHint, { color: theme.subtext }]}>
                Saved to your account, so the web app respects them too.
              </Text>
            </View>
          </CardRow>

          {!prefs ? (
            <CardRow>
              <Text style={{ color: theme.subtext, fontSize: 13 }}>Loading your preferences…</Text>
            </CardRow>
          ) : (
            PREF_ROWS.map((row) => (
              <CardRow
                key={row.key}
                right={
                  <Switch
                    value={!!prefs[row.key]}
                    onValueChange={(v) => toggle(row.key, v)}
                    trackColor={{ true: palette.brandSoft, false: theme.border }}
                    thumbColor={prefs[row.key] ? palette.brand : '#fff'}
                  />
                }
              >
                <Text style={[styles.rowTitle, { color: theme.text }]}>{row.label}</Text>
                <Text style={[styles.rowHint, { color: theme.subtext }]}>{row.hint}</Text>
              </CardRow>
            ))
          )}
        </Card>
      </Section>

      <Section title="Account">
        <Card>
          <LinkRow
            icon="person-outline"
            label="Edit profile"
            hint={session?.email ?? 'Name, phone, password'}
            onPress={() => router.push('/edit-profile')}
            theme={theme}
          />
          <LinkRow
            icon="location-outline"
            label="Delivery addresses"
            hint={`${(me?.addresses ?? []).length} saved`}
            onPress={() => router.push('/addresses')}
            theme={theme}
          />
          <LinkRow
            icon="notifications-outline"
            label="Notification inbox"
            hint={(me?.unreadNotificationCount ?? 0) > 0 ? `${me?.unreadNotificationCount} unread` : 'All read'}
            onPress={() => router.push('/notifications')}
            theme={theme}
          />
          <LinkRow
            icon="help-circle-outline"
            label="Help & support"
            hint="Tickets, FAQs and live order chat"
            onPress={() => router.push('/support')}
            theme={theme}
          />
        </Card>
      </Section>

      <Section title="Data on this device">
        <Card>
          <CardRow
            right={
              <Pressable
                hitSlop={8}
                onPress={() => {
                  Alert.alert('Empty your cart?', 'Items saved on this device will be removed.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Empty cart', style: 'destructive', onPress: () => clearCart() },
                  ]);
                }}
                accessibilityRole="button"
              >
                <Text style={{ color: palette.danger, fontWeight: '800', fontSize: 13 }}>Clear</Text>
              </Pressable>
            }
          >
            <Text style={[styles.rowTitle, { color: theme.text }]}>Shopping cart</Text>
            <Text style={[styles.rowHint, { color: theme.subtext }]}>
              Stored locally so it survives app restarts.
            </Text>
          </CardRow>
          <CardRow>
            <Text style={[styles.rowTitle, { color: theme.text }]}>API server</Text>
            <Text style={[styles.rowHint, { color: theme.subtext }]} numberOfLines={1}>
              {config.apiUrl}
            </Text>
          </CardRow>
        </Card>
      </Section>

      <Pressable onPress={signOut} style={[styles.signOut, { borderColor: theme.border }]} accessibilityRole="button">
        <Ionicons name="log-out-outline" size={17} color={palette.danger} />
        <Text style={{ color: palette.danger, fontWeight: '800', fontSize: 14 }}>Sign out</Text>
      </Pressable>

      <Text style={[styles.version, { color: theme.subtext }]}>{config.appName} · mobile</Text>
    </Screen>
  );
}

function LinkRow({
  icon,
  label,
  hint,
  onPress,
  last,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  theme: { text: string; subtext: string; inputBg: string };
}) {
  return (
    <CardRow onPress={onPress} right={<Ionicons name="chevron-forward" size={17} color={theme.subtext} />}>
      <View style={styles.linkRow}>
        <View style={[styles.linkIcon, { backgroundColor: theme.inputBg }]}>
          <Ionicons name={icon} size={16} color={palette.brandDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>{label}</Text>
          {!!hint && <Text style={[styles.rowHint, { color: theme.subtext }]}>{hint}</Text>}
        </View>
      </View>
    </CardRow>
  );
}

function cleanError(e: any): string | undefined {
  const message: string | undefined = e?.message;
  return message ? message.replace('GraphQL error: ', '') : undefined;
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.input, padding: 11, marginBottom: 14, flexDirection: 'row' },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  rowHint: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  linkIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
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
  version: { textAlign: 'center', fontSize: 11.5, marginTop: 14 },
});
