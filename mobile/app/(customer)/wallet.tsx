import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { CardPaymentModal } from '@/components/card-payment';
import { formatPrice } from '@/components/price';
import { LOYALTY_HISTORY, ME_FULL, MY_WALLET } from '@/lib/graphql/queries';
import { CONFIRM_TOPUP, REDEEM_LOYALTY, TOPUP_WALLET } from '@/lib/graphql/mutations';
import { useAuth } from '@/lib/auth/store';
import { num } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';
import { formatDateTime } from '@/lib/date';

const PRESETS = ['10', '25', '50', '100'];
/** Server credits 1 point = $0.01, so 500 pts is a $5 voucher. */
const REDEEM_STEP = 500;

/** Money types colour the transaction list the same way the web wallet does. */
const DEBITS = new Set(['ORDER_PAYMENT', 'WITHDRAWAL']);

/** Wallet balance, card top-up, loyalty redemption and transaction history. */
export default function WalletScreen() {
  const theme = useTheme();
  const session = useAuth((s) => s.user);

  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useQuery(MY_WALLET, {
    variables: { page, limit: 15 },
    fetchPolicy: 'cache-and-network',
  });
  const meQ = useQuery(ME_FULL, { fetchPolicy: 'cache-and-network' });
  const loyaltyQ = useQuery(LOYALTY_HISTORY, { variables: { page: 1, limit: 10 } });

  const wallet = data?.myWallet;
  const transactions: any[] = wallet?.transactions?.items ?? [];
  const pages = wallet?.transactions?.pages ?? 1;
  const loyalty = num(meQ.data?.me?.loyaltyPoints);
  const history: any[] = loyaltyQ.data?.loyaltyHistory ?? [];

  const [amount, setAmount] = useState('25');
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetSecret, setSheetSecret] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);

  const [topUpWallet] = useMutation(TOPUP_WALLET);
  const [confirmTopup] = useMutation(CONFIRM_TOPUP);
  const [redeemLoyalty] = useMutation(REDEEM_LOYALTY);

  const refreshAll = () => {
    refetch();
    meQ.refetch();
    loyaltyQ.refetch();
  };

  const startTopUp = async () => {
    setBanner(null);
    const amt = num(amount);
    if (!amt || amt < 1) {
      setBanner('Enter a top-up amount of at least 1.00');
      return;
    }
    setBusy(true);
    try {
      const res = await topUpWallet({ variables: { amount: amt.toFixed(2) } });
      const payload = res.data?.topUpWallet ?? {};
      if (!payload.clientSecret) throw new Error('The payment provider did not return a card secret');
      setPendingIntent(payload.intentId ?? null);
      setSheetSecret(payload.clientSecret);
    } catch (e: any) {
      setBanner(cleanError(e) || 'Top-up failed');
    } finally {
      setBusy(false);
    }
  };

  // The webhook also credits the wallet, but confirmTopup makes it instant.
  const finishTopUp = async (intentId: string) => {
    setSheetSecret(null);
    setBusy(true);
    try {
      await confirmTopup({ variables: { intentId: intentId || pendingIntent || '' } });
      setBanner(null);
      refreshAll();
    } catch (e: any) {
      setBanner(cleanError(e) || 'The card was charged but the balance is still syncing — pull to refresh');
      refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    setBanner(null);
    setBusy(true);
    try {
      const res = await redeemLoyalty({ variables: { points: Math.min(loyalty, REDEEM_STEP) } });
      const credited = num(res.data?.redeemLoyalty?.credited);
      setBanner(`${Math.min(loyalty, REDEEM_STEP)} points converted to ${formatPrice(credited)} of wallet credit.`);
      refreshAll();
    } catch (e: any) {
      setBanner(cleanError(e) || 'Could not redeem your points');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !wallet) {
    return (
      <Screen back title="Wallet & rewards">
        <LoadingBlock label="Loading your balance…" />
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Wallet & rewards"
      refresh={refreshAll}
      refreshing={loading && !!data}
      footer={
        <Button title="Use wallet at checkout" variant="secondary" onPress={() => router.replace('/tabs')} />
      }
    >
      {/* Balance hero */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Available balance</Text>
        <Text style={styles.heroValue}>{formatPrice(wallet?.balance ?? 0)}</Text>
        <Text style={styles.heroNote}>
          Wallet money pays for any order instantly — no card needed.
        </Text>
        <View style={styles.heroPoints}>
          <Ionicons name="trophy" size={14} color={palette.brandDark} />
          <Text style={styles.heroPointsText}>{loyalty.toLocaleString()} loyalty points</Text>
        </View>
      </View>

      {!!banner && (
        <View style={[styles.banner, { backgroundColor: theme.inputBg }]}>
          <Text style={{ color: theme.text, fontSize: 12.5, flex: 1, lineHeight: 18 }}>{banner}</Text>
        </View>
      )}

      <Section title="Top up" subtitle="Charged to your card through Stripe">
        <View style={styles.presets}>
          {PRESETS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setAmount(p)}
              accessibilityRole="button"
              style={[
                styles.preset,
                amount === p
                  ? { backgroundColor: palette.brand, borderColor: palette.brand }
                  : { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={{ color: amount === p ? '#fff' : theme.text, fontWeight: '800', fontSize: 14 }}>
                {formatPrice(p, 0)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Input
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="25.00"
          hint="Minimum 1.00"
        />
        <View style={styles.topUpRow}>
          <Button title="Add funds with card" onPress={startTopUp} loading={busy && !sheetSecret} style={{ flex: 1 }} />
          <Button
            title={`Redeem ${REDEEM_STEP} pts`}
            variant="ghost"
            onPress={redeem}
            disabled={loyalty < REDEEM_STEP}
          />
        </View>
        {loyalty < REDEEM_STEP && (
          <Text style={[styles.finePrint, { color: theme.subtext }]}>
            {REDEEM_STEP - loyalty} more points unlocks a {formatPrice(REDEEM_STEP * 0.01)} wallet credit.
          </Text>
        )}
      </Section>

      <Section
        title="Transactions"
        subtitle={pages > 1 ? `Page ${page} of ${pages}` : `${transactions.length} movements`}
        action={
          pages > 1 && page > 1
            ? { label: 'Newer', onPress: () => setPage((p) => Math.max(1, p - 1)) }
            : undefined
        }
      >
        <Card>
          {transactions.length === 0 ? (
            <EmptyState
              icon="wallet-outline"
              title="No transactions yet"
              body="Top ups, order payments and refunds all show up here."
            />
          ) : (
            transactions.map((t: any) => {
              const value = num(t.amount);
              const debit = DEBITS.has(t.type) || value < 0;
              return (
                <CardRow key={t.id}>
                  <View style={styles.txRow}>
                    <View style={[styles.txIcon, { backgroundColor: debit ? '#FEE2E2' : palette.brandSoft }]}>
                      <Ionicons
                        name={debit ? 'arrow-up' : 'arrow-down'}
                        size={14}
                        color={debit ? palette.danger : palette.brandDark}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.txTitle, { color: theme.text }]} numberOfLines={1}>
                        {t.note || labelType(t.type)}
                      </Text>
                      <Text style={[styles.txSub, { color: theme.subtext }]}>
                        {formatDateTime(t.createdAt)} · balance {formatPrice(t.balanceAfter)}
                      </Text>
                    </View>
                    <Text style={[styles.txAmount, { color: debit ? palette.danger : palette.brandDark }]}>
                      {value >= 0 && !debit ? '+' : ''}
                      {formatPrice(value)}
                    </Text>
                  </View>
                </CardRow>
              );
            })
          )}
          {pages > 1 && page < pages && (
            <CardRow
              right={<Ionicons name="chevron-down" size={16} color={palette.brand} />}
              onPress={() => setPage((p) => p + 1)}
            >
              <Text style={{ color: palette.brand, fontWeight: '800', fontSize: 13.5 }}>Load older transactions</Text>
            </CardRow>
          )}
        </Card>
      </Section>

      <Section title="Loyalty history" subtitle="Points are earned on every delivered order">
        {history.length === 0 ? (
          <Card>
            <CardRow>
              <Text style={{ color: theme.subtext, fontSize: 13 }}>No points yet — order something delicious.</Text>
            </CardRow>
          </Card>
        ) : (
          <Card>
            {history.map((h: any) => {
              const pts = num(h.points);
              return (
                <CardRow key={h.id} right={<Badge label={`${pts >= 0 ? '+' : ''}${pts} pts`} tone={pts >= 0 ? 'brand' : 'neutral'} />}>
                  <Text style={[styles.txTitle, { color: theme.text }]} numberOfLines={1}>
                    {h.note || labelType(h.type)}
                  </Text>
                  <Text style={[styles.txSub, { color: theme.subtext }]}>{formatDateTime(h.createdAt)}</Text>
                </CardRow>
              );
            })}
          </Card>
        )}
      </Section>

      <Pressable onPress={() => router.push('/promos')} style={[styles.promoLink, { borderColor: theme.border }]}>
        <Ionicons name="ticket-outline" size={17} color={palette.brand} />
        <Text style={{ color: palette.brand, fontWeight: '800', fontSize: 13.5, flex: 1 }}>
          Browse active promo codes
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.subtext} />
      </Pressable>

      <CardPaymentModal
        visible={!!sheetSecret}
        clientSecret={sheetSecret}
        title="Add funds"
        amountLabel={formatPrice(num(amount) || 0)}
        billingName={session?.fullName}
        billingEmail={session?.email}
        onSucceeded={finishTopUp}
        onCancel={() => setSheetSecret(null)}
      />
    </Screen>
  );
}

function labelType(type?: string | null): string {
  if (!type) return 'Wallet movement';
  return type.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function cleanError(e: any): string | undefined {
  const message: string | undefined = e?.message;
  return message ? message.replace('GraphQL error: ', '') : undefined;
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.card,
    padding: 18,
    marginBottom: 16,
    backgroundColor: palette.brand,
  },
  heroLabel: { color: '#D1FAE5', fontSize: 12.5, fontWeight: '700', letterSpacing: 0.3 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 4, letterSpacing: -0.6 },
  heroNote: { color: '#ECFDF5', fontSize: 12, marginTop: 6, lineHeight: 17 },
  heroPoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#FFFFFF22',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroPointsText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  banner: { borderRadius: radius.input, padding: 11, marginBottom: 14 },
  presets: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  preset: { flex: 1, borderWidth: 1, borderRadius: radius.input, paddingVertical: 10, alignItems: 'center' },
  topUpRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  finePrint: { fontSize: 11.5, marginTop: 8 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  txIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 13.5, fontWeight: '700' },
  txSub: { fontSize: 11.5, marginTop: 1 },
  txAmount: { fontSize: 13.5, fontWeight: '900' },
  promoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 14,
    marginTop: 4,
  },
});
