import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CardField, useConfirmPayment } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { config } from '@/lib/config';
import { palette, radius, useTheme } from '@/lib/theme';

interface Props {
  visible: boolean;
  /** PaymentIntent secret returned by createCardPayment / topUpWallet. */
  clientSecret?: string | null;
  amountLabel: string;
  title?: string;
  billingName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  /** Called with the succeeded PaymentIntent id (used to confirm a top-up). */
  onSucceeded: (intentId: string) => void;
  onCancel: () => void;
  /** Optional "pay another way" escape hatch shown next to Cancel. */
  alternativeLabel?: string;
  onAlternative?: () => void;
}

/**
 * Native card sheet for Stripe. The order is already created server-side; this
 * component only confirms the PaymentIntent against the returned clientSecret,
 * mirroring what lib/stripe.ts does with Stripe Elements on the web.
 */
export function CardPaymentModal({
  visible,
  clientSecret,
  amountLabel,
  title = 'Pay with card',
  billingName,
  billingEmail,
  billingPhone,
  onSucceeded,
  onCancel,
  alternativeLabel,
  onAlternative,
}: Props) {
  const theme = useTheme();
  const { confirmPayment } = useConfirmPayment();
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh intent must start from a clean error state.
  useEffect(() => {
    if (visible) {
      setError(null);
      setBusy(false);
    }
  }, [visible, clientSecret]);

  const pay = async () => {
    if (!clientSecret || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: payError, paymentIntent } = await confirmPayment(clientSecret, {
        type: 'Card',
        billingDetails: {
          name: billingName ?? undefined,
          email: billingEmail ?? undefined,
          phone: billingPhone ?? undefined,
        },
      });
      if (payError) {
        setError(payError.localizedMessage || payError.message || 'The card was declined.');
        setBusy(false);
        return;
      }
      if (paymentIntent?.status === 'Succeeded') {
        onSucceeded(paymentIntent.id);
        return;
      }
      setError(`Payment is not complete yet (${paymentIntent?.status ?? 'unknown'}).`);
      setBusy(false);
    } catch (e: any) {
      setError(e?.message || 'Could not process the payment.');
      setBusy(false);
    }
  };

  const noKey = !config.stripePublishableKey;
  const onWeb = Platform.OS === 'web';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} accessibilityRole="button">
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={() => undefined}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
              <Text style={[styles.amount, { color: theme.subtext }]}>{amountLabel}</Text>
            </View>
            <Pressable hitSlop={10} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={theme.subtext} />
            </Pressable>
          </View>

          {noKey || onWeb ? (
            <View style={[styles.notice, { backgroundColor: theme.inputBg }]}>
              <Ionicons name="information-circle-outline" size={20} color={palette.info} />
              <Text style={{ color: theme.text, fontSize: 13, flex: 1, lineHeight: 19 }}>
                {noKey
                  ? 'Card payments are not configured on this build (missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY). Pay with wallet or cash, or finish by card on the web app.'
                  : 'The native card sheet is unavailable in the web preview. Use a device build, or pay with wallet or cash.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.label, { color: theme.subtext }]}>Card details</Text>
              <CardField
                postalCodeEnabled={false}
                placeholders={{ number: '4242 4242 4242 4242' }}
                cardStyle={cardStyle(theme.dark)}
                style={styles.cardField}
                onCardChange={(card) => setComplete(card.complete)}
              />
              {!!error && (
                <View style={[styles.error, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={{ color: '#B91C1C', fontSize: 12.5, flex: 1 }}>{error}</Text>
                </View>
              )}
            </>
          )}

          <View style={styles.actions}>
            <Button
              title={alternativeLabel ?? 'Cancel'}
              variant="secondary"
              onPress={onAlternative ?? onCancel}
              style={{ flex: 1 }}
            />
            <View style={{ flex: 1 }}>
              <Button
                title={busy ? 'Processing…' : `Pay ${amountLabel}`}
                onPress={pay}
                disabled={noKey || onWeb || !clientSecret || !complete}
                style={{ minWidth: 100 }}
              />
            </View>
          </View>

          {busy && (
            <View style={styles.busyRow}>
              <ActivityIndicator color={palette.brand} />
              <Text style={{ color: theme.subtext, fontSize: 12, marginLeft: 8 }}>Contacting the bank…</Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function cardStyle(isDark: boolean) {
  return {
    backgroundColor: isDark ? '#16213A' : '#F1F5F9',
    textColor: isDark ? '#E2E8F0' : '#0F172A',
    borderRadius: radius.input,
    borderWidth: 1,
    borderCurve: 'continuous' as const,
    focusedBorderColor: palette.brand,
    unfocusedBorderColor: isDark ? '#1E2A44' : '#E2E8F0',
  };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0F172AAA', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30 },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '900' },
  amount: { fontSize: 13, marginTop: 2 },
  label: { fontSize: 12.5, fontWeight: '700', marginBottom: 6 },
  cardField: { width: '100%', height: 52 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: radius.input, padding: 12 },
  error: { borderRadius: radius.input, padding: 10, marginTop: 10, flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
});
