import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, QtyStepper, Screen, Section } from '@/components/screen';
import { formatPrice } from '@/components/price';
import { cartItemsTotal, useCart } from '@/lib/cart/store';
import { assetUrl } from '@/lib/config';
import { palette, useTheme } from '@/lib/theme';

/** Basket for a single branch: edit quantities, drop lines, go to checkout. */
export default function CartScreen() {
  const theme = useTheme();
  const lines = useCart((s) => s.lines);
  const branchName = useCart((s) => s.branchName);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);

  const subtotal = cartItemsTotal(lines);
  const units = lines.reduce((n, l) => n + l.quantity, 0);

  const confirmClear = () => {
    Alert.alert('Empty the cart?', `${units} item${units === 1 ? '' : 's'} will be removed.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Empty cart', style: 'destructive', onPress: clear },
    ]);
  };

  if (!lines.length) {
    return (
      <Screen back title="Your cart">
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          body="Add something delicious from a kitchen near you."
          ctaLabel="Browse restaurants"
          ctaOnPress={() => router.replace('/tabs')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Your cart"
      action={{ label: 'Clear', onPress: confirmClear }}
      footer={
        <View style={{ gap: 10 }}>
          <View style={styles.totalRow}>
            <Text style={{ color: theme.subtext, fontSize: 13 }}>Subtotal ({units} items)</Text>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900' }}>{formatPrice(subtotal)}</Text>
          </View>
          <Button title="Go to checkout" size="lg" onPress={() => router.push('/checkout')} />
          <Text style={[styles.feeNote, { color: theme.subtext }]}>
            Delivery fee, service fee and any promo discount are calculated at checkout.
          </Text>
        </View>
      }
    >
      {!!branchName && (
        <View style={styles.branchRow}>
          <Badge label={`Delivering from ${branchName}`} tone="brand" />
          <Pressable onPress={() => router.replace('/tabs')} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: palette.brandDark, fontSize: 12.5, fontWeight: '800' }}>Browse more</Text>
          </Pressable>
        </View>
      )}

      <Section title={`${lines.length} line${lines.length === 1 ? '' : 's'}`}>
        <Card>
          {lines.map((l) => {
            const unit = l.unitPrice + l.addOns.reduce((n, a) => n + a.price, 0);
            const image = assetUrl(l.image);
            return (
              <CardRow key={l.lineId}>
                <View style={styles.line}>
                  {image ? (
                    <Image source={{ uri: image }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Ionicons name="fast-food-outline" size={18} color={palette.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                      {l.name}
                    </Text>
                    {!!l.variantLabel && (
                      <Text style={[styles.detail, { color: theme.subtext }]}>{l.variantLabel}</Text>
                    )}
                    {l.addOns.map((a) => (
                      <Text key={a.id} style={[styles.detail, { color: theme.subtext }]}>
                        + {a.name} {a.price > 0 ? `(${formatPrice(a.price)})` : ''}
                      </Text>
                    ))}
                    {!!l.specialInstructions && (
                      <Text style={[styles.notes, { color: theme.subtext }]} numberOfLines={2}>
                        “{l.specialInstructions}”
                      </Text>
                    )}
                    <View style={styles.lineFoot}>
                      <Text style={{ color: palette.brandDark, fontWeight: '900', fontSize: 14 }}>
                        {formatPrice(unit * l.quantity)}
                      </Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => remove(l.lineId)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${l.name}`}
                        style={styles.removeBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={palette.danger} />
                      </Pressable>
                    </View>
                  </View>
                  <QtyStepper value={l.quantity} min={0} onChange={(n) => setQty(l.lineId, n)} />
                </View>
              </CardRow>
            );
          })}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  branchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  line: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', paddingVertical: 2, flex: 1 },
  thumb: { width: 54, height: 54, borderRadius: 12 },
  thumbFallback: { backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14.5, fontWeight: '800' },
  detail: { fontSize: 11.5, marginTop: 2 },
  notes: { fontSize: 11.5, fontStyle: 'italic', marginTop: 2 },
  lineFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  removeBtn: { padding: 2 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feeNote: { fontSize: 11.5, textAlign: 'center', lineHeight: 16 },
});
