import React, { useEffect, useMemo, useState } from 'react';
import { Redirect, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ChipRow, LoadingBlock, Screen, Section } from '@/components/screen';
import { formatPrice } from '@/components/price';
import { CardPaymentModal } from '@/components/card-payment';
import { AddressFormModal, type AddressDraft } from '@/components/address-form';
import { ACTIVE_PROMOS, DELIVERY_QUOTE, ME_FULL } from '@/lib/graphql/queries';
import { ADD_ADDRESS, CREATE_CARD_PAYMENT, PLACE_ORDER } from '@/lib/graphql/mutations';
import { cartItemsTotal, useCart } from '@/lib/cart/store';
import { useAuth } from '@/lib/auth/store';
import { num } from '@/lib/geo';
import { isoFromNow } from '@/lib/date';
import { palette, radius, useTheme } from '@/lib/theme';

type Method = 'CARD' | 'WALLET' | 'CASH';

const SCHEDULES = [
  { value: '0', label: 'ASAP' },
  { value: '30', label: 'In 30 min' },
  { value: '60', label: 'In 1 h' },
  { value: '120', label: 'In 2 h' },
];

/** Checkout: address, payment method, rewards and the server-side fee quote. */
export default function CheckoutScreen() {
  const theme = useTheme();
  const me = useAuth((s) => s.user);
  const lines = useCart((s) => s.lines);
  const branchId = useCart((s) => s.branchId);
  const branchName = useCart((s) => s.branchName);
  const clearCart = useCart((s) => s.clear);

  const subtotal = useMemo(() => cartItemsTotal(lines), [lines]);

  const meQ = useQuery(ME_FULL, { fetchPolicy: 'network-only' });
  const addresses: any[] = meQ.data?.me?.addresses ?? [];
  const walletBalance = num(meQ.data?.me?.wallet?.balance, 0);
  const loyaltyPoints: number = meQ.data?.me?.loyaltyPoints ?? 0;

  const [addressId, setAddressId] = useState('');
  useEffect(() => {
    if (!addressId && addresses.length) {
      setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0]).id);
    }
  }, [addresses, addressId]);

  const [method, setMethod] = useState<Method>('CARD');
  const [promo, setPromo] = useState('');
  const [points, setPoints] = useState('');
  const [schedule, setSchedule] = useState('0');
  const [notes, setNotes] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const [addrOpen, setAddrOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [cardAmount, setCardAmount] = useState('');
  // the order the open card sheet belongs to (created before the card is charged)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const quoteLive = useQuery(DELIVERY_QUOTE, {
    variables: { branchId, addressId, itemsTotal: subtotal.toFixed(2) },
    skip: !branchId || !addressId,
  });

  const promosQ = useQuery(ACTIVE_PROMOS);
  const [addAddress, { loading: savingAddr, error: addrError }] = useMutation(ADD_ADDRESS, {
    onCompleted: (res) => {
      setAddrOpen(false);
      meQ.refetch();
      if (res?.addAddress?.id) setAddressId(res.addAddress.id);
    },
  });
  const [placeOrder] = useMutation(PLACE_ORDER);
  const [cardPayment] = useMutation(CREATE_CARD_PAYMENT);

  const quote: any = quoteLive.data?.deliveryQuote;
  const deliveryFee = num(quote?.deliveryFee, 0);
  const serviceFee = num(quote?.serviceFee, 0);
  const total = Math.max(0, subtotal + deliveryFee + serviceFee);
  const meetsMinimum = quote ? quote.meetsMinimum !== false : true;
  const pointsToUse = Math.max(0, Math.min(loyaltyPoints, Number(points) || 0));
  const walletShort = walletBalance + pointsToUse * 0.01 < total;

  if (!lines.length) return <Redirect href="/cart" />;

  /** Empties the basket and hands the customer over to live tracking. */
  const finish = (orderId: string) => {
    clearCart();
    setCardOpen(false);
    setPlacing(false);
    router.replace({ pathname: '/track/[id]', params: { id: orderId } });
  };

  const submitOrder = async () => {
    if (placing || !branchId || !addressId || !meetsMinimum) return;
    setPlacing(true);
    setBanner(null);
    try {
      const { data } = await placeOrder({
        variables: {
          input: {
            branchId,
            addressId,
            paymentMethod: method,
            promoCode: promo.trim() || undefined,
            loyaltyPointsToUse: pointsToUse > 0 ? pointsToUse : undefined,
            specialInstructions: notes.trim() || undefined,
            scheduledFor: Number(schedule) > 0 ? isoFromNow(Number(schedule) * 60_000) : undefined,
            items: lines.map((l) => ({
              menuItemId: l.menuItemId,
              quantity: l.quantity,
              variantOptionId: l.variantOptionId || undefined,
              // the server accepts one add-on per line (same rule as the web app)
              addOnId: l.addOns[0]?.id || undefined,
              specialInstructions: l.specialInstructions || undefined,
            })),
          },
        },
      });
      const order = data?.placeOrder;
      if (!order?.id) throw new Error('The order was not created');

      if (method === 'CARD') {
        const payRes = await cardPayment({ variables: { orderId: order.id } });
        const secret: string | undefined = payRes.data?.createCardPayment?.clientSecret;
        if (!secret) throw new Error('Card payment could not be set up');
        setPendingOrderId(order.id);
        setCardSecret(secret);
        setCardAmount(formatPrice(order.total ?? total));
        setCardOpen(true);
        setPlacing(false);
        return;
      }

      finish(order.id);
    } catch (e: any) {
      setBanner(cleanError(e) || 'Could not place the order');
      setPlacing(false);
    }
  };

  /**
   * The card sheet was dismissed without a charge. The order exists and is
   * unpaid, so send the customer to it — that screen offers "Complete payment".
   */
  const abandonCard = () => {
    setCardOpen(false);
    setPlacing(false);
    if (pendingOrderId) finish(pendingOrderId);
  };

  const disabled = placing || !addressId || !meetsMinimum || (method === 'WALLET' && walletShort);

  return (
    <Screen
      back
      title="Checkout"
      subtitle={branchName ? `From ${branchName}` : undefined}
      keyboardAvoiding
      footer={
        <View style={{ gap: 8 }}>
          <View style={styles.totalRow}>
            <Text style={{ color: theme.subtext, fontSize: 13 }}>Estimated total</Text>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>{formatPrice(total)}</Text>
          </View>
          <Button
            title={placing ? 'Placing order…' : `Place order · ${formatPrice(total)}`}
            size="lg"
            onPress={submitOrder}
            loading={placing}
            disabled={disabled}
          />
          {!meetsMinimum && (
            <Text style={[styles.footNote, { color: palette.danger }]}>
              This branch has a minimum order — add more items to check out.
            </Text>
          )}
          {method === 'WALLET' && walletShort && (
            <Text style={[styles.footNote, { color: palette.danger }]}>
              Wallet balance is short. Top up, or pay by card or cash.
            </Text>
          )}
          <Text style={[styles.footNote, { color: theme.subtext }]}>
            By placing the order you agree to our delivery terms.
          </Text>
        </View>
      }
    >
      {!!banner && (
        <View style={[styles.banner, { backgroundColor: '#FEE2E2' }]}>
          <Text style={{ color: '#B91C1C', fontSize: 12.5, flex: 1 }}>{banner}</Text>
        </View>
      )}

      {/* Address */}
      <Section title="Delivery address" action={{ label: 'Manage', onPress: () => router.push('/addresses') }}>
        {meQ.loading && !addresses.length ? (
          <LoadingBlock label="Loading your addresses…" />
        ) : !addresses.length ? (
          <Card>
            <CardRow onPress={() => setAddrOpen(true)} right={<Badge label="Required" tone="warning" />}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>No address yet</Text>
              <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }}>Add one to see delivery fees.</Text>
            </CardRow>
          </Card>
        ) : (
          <Card>
            {addresses.map((a) => {
              const active = a.id === addressId;
              return (
                <CardRow key={a.id} onPress={() => setAddressId(a.id)} right={<Radio checked={active} />}>
                  <Text style={{ color: theme.text, fontWeight: active ? '800' : '600', fontSize: 14 }}>
                    {a.label || 'Address'}
                    {a.isDefault ? ' · default' : ''}
                  </Text>
                  <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                    {[a.line1, a.line2, a.city, a.postalCode].filter(Boolean).join(', ')}
                  </Text>
                </CardRow>
              );
            })}
            <CardRow onPress={() => setAddrOpen(true)} right={<Ionicons name="add-circle-outline" size={20} color={palette.brand} />}>
              <Text style={{ color: palette.brandDark, fontWeight: '800', fontSize: 14 }}>Add new address</Text>
            </CardRow>
          </Card>
        )}
      </Section>

      {/* Fees */}
      <Section title="Fees">
        <Card>
          <SummaryRow label="Items" value={formatPrice(subtotal)} />
          <SummaryRow label="Delivery fee" value={quoteLive.loading ? '…' : formatPrice(deliveryFee)} muted />
          <SummaryRow label="Service fee" value={quoteLive.loading ? '…' : formatPrice(serviceFee)} muted />
          {!!quote?.surge && num(quote.surge) > 1 && (
            <CardRow>
              <View style={styles.surgeRow}>
                <Badge label={`High demand · ${num(quote.surge)}×`} tone="warning" />
                <Text style={{ color: theme.subtext, fontSize: 11.5, flex: 1, marginLeft: 8 }}>
                  Fees rise when couriers are scarce nearby.
                </Text>
              </View>
            </CardRow>
          )}
          {!!quote?.etaMinutes && (
            <CardRow>
              <Text style={{ color: theme.text, fontSize: 13.5, flex: 1 }}>Estimated arrival</Text>
              <Text style={{ color: theme.subtext, fontSize: 13.5, fontWeight: '700' }}>
                ~{Math.round(quote.etaMinutes)} min
              </Text>
            </CardRow>
          )}
        </Card>
      </Section>

      {/* Payment */}
      <Section title="Payment method">
        <Card>
          <PayRow
            icon="card-outline"
            label="Credit or debit card"
            hint="Stripe · 3-D Secure supported"
            active={method === 'CARD'}
            onPress={() => setMethod('CARD')}
          />
          <PayRow
            icon="wallet-outline"
            label="Wallet"
            hint={`Balance ${formatPrice(walletBalance)}${walletShort ? ' · not enough for this order' : ''}`}
            active={method === 'WALLET'}
            onPress={() => (walletShort ? router.push('/wallet') : setMethod('WALLET'))}
          />
          <PayRow
            icon="cash-outline"
            label="Cash on delivery"
            hint="Pay the courier when it arrives"
            active={method === 'CASH'}
            onPress={() => setMethod('CASH')}
          />
        </Card>
      </Section>

      {/* Rewards & notes */}
      <Section title="Promo, rewards & notes">
        <Card style={styles.rewardsCard}>
          <Input
            label="Promo code"
            value={promo}
            onChangeText={(v) => setPromo(v.toUpperCase())}
            placeholder="SUMMER20"
            autoCapitalize="characters"
          />
          {!!(promosQ.data?.activePromos ?? []).length && (
            <>
              <ChipRow
                value={promo}
                onChange={(v) => setPromo(v === promo ? '' : v)}
                options={(promosQ.data.activePromos ?? []).slice(0, 4).map((p: any) => ({ value: p.code, label: p.code }))}
              />
              <View style={{ height: 14 }} />
            </>
          )}
          {loyaltyPoints > 0 && (
            <Input
              label={`Loyalty points to use (${loyaltyPoints} available)`}
              value={points}
              onChangeText={(v) => setPoints(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              hint="1 point = 1 cent off your total"
              placeholder="0"
            />
          )}
          <Text style={[styles.fieldLabel, { color: theme.subtext }]}>When should it arrive?</Text>
          <ChipRow options={SCHEDULES} value={schedule} onChange={setSchedule} />
          <View style={{ height: 14 }} />
          <Input
            label="Notes for the restaurant"
            value={notes}
            onChangeText={setNotes}
            placeholder="Allergies, doorbell, cutlery…"
            multiline
            style={styles.notes}
          />
        </Card>
      </Section>

      <AddressFormModal
        visible={addrOpen}
        saving={savingAddr}
        error={addrError ? cleanError(addrError) : null}
        initial={{ fullName: me?.fullName ?? undefined, phone: me?.phone ?? undefined }}
        onSubmit={(draft: AddressDraft) =>
          addAddress({
            variables: {
              input: {
                label: draft.label,
                fullName: draft.fullName,
                phone: draft.phone,
                line1: draft.line1,
                line2: draft.line2,
                city: draft.city,
                state: draft.state,
                country: draft.country,
                postalCode: draft.postalCode,
                notes: draft.notes,
                lat: draft.lat,
                lng: draft.lng,
                isDefault: draft.isDefault ?? !addresses.length,
              },
            },
          }).catch(() => undefined)
        }
        onClose={() => setAddrOpen(false)}
      />

      <CardPaymentModal
        visible={cardOpen}
        clientSecret={cardSecret}
        amountLabel={cardAmount}
        billingName={me?.fullName}
        billingEmail={me?.email}
        billingPhone={me?.phone}
        onSucceeded={() => pendingOrderId && finish(pendingOrderId)}
        onCancel={abandonCard}
      />
    </Screen>
  );
}

/** GraphQL errors arrive prefixed; keep the human sentence. */
function cleanError(e: any): string {
  return String(e?.message ?? '').replace('GraphQL error: ', '');
}

function Radio({ checked }: { checked: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.radio, { borderColor: checked ? palette.brand : theme.border }]}>
      {checked && <View style={styles.radioDot} />}
    </View>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const theme = useTheme();
  return (
    <CardRow>
      <Text style={{ color: muted ? theme.subtext : theme.text, fontSize: 13.5, flex: 1 }}>{label}</Text>
      <Text style={{ color: muted ? theme.subtext : theme.text, fontSize: 13.5, fontWeight: '800' }}>{value}</Text>
    </CardRow>
  );
}

function PayRow({
  icon,
  label,
  hint,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <CardRow onPress={onPress} right={<Radio checked={active} />}>
      <View style={styles.payRow}>
        <View style={[styles.payIcon, { backgroundColor: active ? palette.brandSoft : theme.inputBg }]}>
          <Ionicons name={icon} size={18} color={active ? palette.brandDark : theme.subtext} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: active ? '800' : '600', fontSize: 14 }}>{label}</Text>
          <Text style={{ color: theme.subtext, fontSize: 11.5, marginTop: 1 }}>{hint}</Text>
        </View>
      </View>
    </CardRow>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.input, padding: 11, marginBottom: 14, flexDirection: 'row' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footNote: { fontSize: 11.5, textAlign: 'center', lineHeight: 16 },
  surgeRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  rewardsCard: { padding: 12 },
  notes: { minHeight: 70, textAlignVertical: 'top' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.brand },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  payIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
