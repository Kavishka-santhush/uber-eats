import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { formatPrice } from '@/components/price';
import { ACTIVE_PROMOS, LOYALTY_HISTORY, ME_FULL } from '@/lib/graphql/queries';
import { num } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';
import { formatDate, timeAgo } from '@/lib/date';

/** Default server rate: 100 points convert to one currency unit. */
const POINTS_PER_UNIT = 100;

function describePromo(p: any): string {
  const value = num(p.value);
  if (p.type === 'PERCENTAGE') {
    const cap = p.maxDiscount ? ` (max ${formatPrice(p.maxDiscount)})` : '';
    return `${Math.round(value)}% off${cap}`;
  }
  if (p.type === 'FREE_DELIVERY') return 'Free delivery';
  return `${formatPrice(value)} off`;
}

/** Promo codes and loyalty balance for the account area. */
export default function PromosScreen() {
  const theme = useTheme();
  const promosQ = useQuery(ACTIVE_PROMOS, { fetchPolicy: 'cache-and-network' });
  const meQ = useQuery(ME_FULL, { fetchPolicy: 'cache-and-network' });
  const loyaltyQ = useQuery(LOYALTY_HISTORY, { variables: { page: 1, limit: 8 } });

  const promos: any[] = promosQ.data?.activePromos ?? [];
  const loyalty = num(meQ.data?.me?.loyaltyPoints);
  const history: any[] = loyaltyQ.data?.loyaltyHistory ?? [];

  const showCode = (p: any) => {
    const conditions: string[] = [`${describePromo(p)} when the basket reaches ${formatPrice(p.minOrderAmount)}`];
    if (p.restaurant?.name) conditions.push(`valid at ${p.restaurant.name}`);
    if (p.usageLimit) conditions.push(`${Math.max(0, num(p.usageLimit) - num(p.usedCount))} of ${p.usageLimit} uses left`);
    conditions.push(`expires ${formatDate(p.expiresAt)}`);
    Alert.alert(p.code, `Enter this code at checkout.\n\n• ${conditions.join('\n• ')}`);
  };

  return (
    <Screen
      back
      title="Promos & loyalty"
      refresh={() => {
        promosQ.refetch();
        meQ.refetch();
        loyaltyQ.refetch();
      }}
      refreshing={promosQ.loading && !!promosQ.data}
      footer={
        <Button title="Use a code at checkout" variant="secondary" onPress={() => router.push('/tabs')} />
      }
    >
      {/* Loyalty balance */}
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>Loyalty balance</Text>
          <Text style={styles.heroValue}>
            {loyalty.toLocaleString()}
            <Text style={styles.heroUnit}> pts</Text>
          </Text>
          <Text style={styles.heroNote}>
            Worth about {formatPrice(loyalty / POINTS_PER_UNIT)} — points are earned on every delivered order.
          </Text>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="trophy" size={22} color="#fff" />
        </View>
      </View>

      <Section title="Redeem" subtitle="Points convert into wallet credit you can spend on any order">
        <Card>
          <CardRow
            right={<Ionicons name="chevron-forward" size={17} color={theme.subtext} />}
            onPress={() => router.push('/wallet')}
          >
            <Text style={[styles.rowTitle, { color: theme.text }]}>Convert points in the wallet</Text>
            <Text style={[styles.rowSub, { color: theme.subtext }]}>
              Open the wallet and tap “Redeem 500 pts” once you have enough.
            </Text>
          </CardRow>
        </Card>
      </Section>

      <Section
        title="Active promo codes"
        subtitle={promosQ.loading && !promosQ.data ? 'Loading offers…' : `${promos.length} offers you can use now`}
      >
        {promosQ.loading && !promosQ.data ? (
          <LoadingBlock label="Fetching offers…" />
        ) : promos.length === 0 ? (
          <EmptyState
            icon="ticket-outline"
            title="No open offers"
            body="New codes appear here as soon as marketing publishes them — enable promo notifications in settings to get them first."
            ctaLabel="Notification settings"
            ctaOnPress={() => router.push('/settings')}
          />
        ) : (
          <View style={styles.promoList}>
            {promos.map((p: any) => (
              <Pressable
                key={p.id}
                onPress={() => showCode(p)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.promoCard,
                  { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.92 : 1 },
                ]}
              >
                <View style={styles.promoStub}>
                  <Text style={styles.promoDiscount}>{describePromo(p)}</Text>
                  <Text style={styles.promoCodeText}>{p.code}</Text>
                </View>
                <View style={styles.promoBody}>
                  <Text style={[styles.promoTitle, { color: theme.text }]} numberOfLines={2}>
                    {p.description || 'Limited-time offer'}
                  </Text>
                  <Text style={[styles.promoMeta, { color: theme.subtext }]} numberOfLines={1}>
                    Min. {formatPrice(p.minOrderAmount)}
                    {p.restaurant?.name ? ` · ${p.restaurant.name}` : ''}
                  </Text>
                  <View style={styles.promoFoot}>
                    <Badge label={`Ends ${formatDate(p.expiresAt)}`} tone="neutral" />
                    {!!p.usageLimit && num(p.usageLimit) - num(p.usedCount) <= 50 && (
                      <Badge label="Almost gone" tone="warning" />
                    )}
                  </View>
                </View>
                <Ionicons name="pricetags-outline" size={18} color={palette.brand} />
              </Pressable>
            ))}
          </View>
        )}
      </Section>

      <Section title="Points activity" subtitle="Latest earnings and redemptions">
        {history.length === 0 ? (
          <Card>
            <CardRow>
              <Text style={{ color: theme.subtext, fontSize: 13 }}>No activity yet — your first delivered order earns points.</Text>
            </CardRow>
          </Card>
        ) : (
          <Card>
            {history.map((h: any) => {
              const pts = num(h.points);
              return (
                <CardRow
                  key={h.id}
                  right={
                    <Text style={[styles.pointsValue, { color: pts >= 0 ? palette.brandDark : palette.danger }]}>
                      {pts >= 0 ? '+' : ''}
                      {pts}
                    </Text>
                  }
                >
                  <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                    {h.note || String(h.type).replace(/_/g, ' ').toLowerCase()}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.subtext }]}>{timeAgo(h.createdAt)}</Text>
                </CardRow>
              );
            })}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.card,
    padding: 18,
    marginBottom: 16,
    backgroundColor: palette.brand,
  },
  heroLabel: { color: '#D1FAE5', fontSize: 12.5, fontWeight: '700' },
  heroValue: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 3, letterSpacing: -0.5 },
  heroUnit: { fontSize: 16, fontWeight: '800', color: '#D1FAE5' },
  heroNote: { color: '#ECFDF5', fontSize: 12, marginTop: 5, lineHeight: 17 },
  heroBadge: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  rowSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  promoList: { gap: 10 },
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 12,
  },
  promoStub: {
    width: 96,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    borderStyle: 'dashed',
    paddingRight: 10,
  },
  promoDiscount: { color: palette.brandDark, fontSize: 14, fontWeight: '900' },
  promoCodeText: { color: palette.ink, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginTop: 3 },
  promoBody: { flex: 1 },
  promoTitle: { fontSize: 13.5, fontWeight: '800' },
  promoMeta: { fontSize: 11.5, marginTop: 2 },
  promoFoot: { flexDirection: 'row', gap: 6, marginTop: 7, flexWrap: 'wrap' },
  pointsValue: { fontSize: 14, fontWeight: '900' },
});
