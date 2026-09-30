import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QtyStepper } from '@/components/screen';
import { formatPrice } from '@/components/price';
import { assetUrl } from '@/lib/config';
import { num } from '@/lib/geo';
import { useCart } from '@/lib/cart/store';
import { palette, radius, useTheme } from '@/lib/theme';

export interface MenuOptionLike { id: string; label: string; priceModifier?: number | string | null; isDefault?: boolean | null }
export interface MenuVariantLike { id: string; name: string; optionType?: string | null; options?: MenuOptionLike[] | null }
export interface MenuAddOnLike { id: string; name: string; price?: number | string | null; isRequired?: boolean | null }

export interface MenuItemLike {
  id: string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  compareAtPrice?: number | string | null;
  imageUrls?: string[] | null;
  availability?: string | null;
  prepTimeMinutes?: number | null;
  calories?: number | null;
  tags?: string[] | null;
  variants?: MenuVariantLike[] | null;
  addOns?: MenuAddOnLike[] | null;
}

interface Props {
  item: MenuItemLike | null;
  branchId: string;
  branchName?: string | null;
  visible: boolean;
  onClose: () => void;
  /** Extra line price override for combos / specials (defaults to item.price). */
  unitPriceOverride?: number;
}

/**
 * Dish detail sheet: variant group (single choice), one add-on (the server
 * CartLineInput carries a single addOnId per line — same rule as the web
 * dialog), quantity and kitchen notes, then pushes the line into the cart.
 */
export function ItemModal({ item, branchId, branchName, visible, onClose, unitPriceOverride }: Props) {
  const theme = useTheme();
  const add = useCart((s) => s.add);
  const [qty, setQty] = useState(1);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [optionLabel, setOptionLabel] = useState<string | null>(null);
  const [addOnId, setAddOnId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  // Seed defaults each time the sheet opens so state never leaks between dishes.
  useEffect(() => {
    if (!visible || !item) return;
    setQty(1);
    setNotes('');
    const firstGroup = (item.variants ?? [])[0];
    const preferred =
      firstGroup?.options?.find((o) => o.isDefault) ?? firstGroup?.options?.[0] ?? null;
    setOptionId(preferred?.id ?? null);
    setOptionLabel(preferred?.label ?? null);
    const requiredAddOn = (item.addOns ?? []).find((a) => a.isRequired);
    setAddOnId(requiredAddOn?.id ?? null);
  }, [visible, item?.id]);

  const unit = unitPriceOverride ?? num(item?.price, 0);
  const variantExtra = useMemo(() => {
    for (const v of item?.variants ?? []) {
      const hit = (v.options ?? []).find((o) => o.id === optionId);
      if (hit) return num(hit.priceModifier, 0);
    }
    return 0;
  }, [item?.variants, optionId]);
  const addOnExtra = useMemo(() => {
    const a = (item?.addOns ?? []).find((x) => x.id === addOnId);
    return a ? num(a.price, 0) : 0;
  }, [item?.addOns, addOnId]);
  const lineTotal = (unit + variantExtra + addOnExtra) * qty;
  const soldOut = !!item?.availability && item.availability !== 'AVAILABLE';
  const image = assetUrl(item?.imageUrls?.[0]);

  const submit = () => {
    if (!item) return;
    const chosen = (item.addOns ?? []).find((x) => x.id === addOnId);
    add({
      menuItemId: item.id,
      branchId,
      branchName: branchName ?? undefined,
      name: item.name,
      unitPrice: unit + variantExtra,
      quantity: qty,
      variantOptionId: optionId,
      variantLabel: optionLabel,
      addOns: chosen ? [{ id: chosen.id, name: chosen.name, price: num(chosen.price, 0) }] : [],
      specialInstructions: notes.trim() || undefined,
      image: item.imageUrls?.[0] ?? undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {!!image && <Image source={{ uri: image }} style={styles.hero} resizeMode="cover" />}

            <View style={styles.headRow}>
              <Text style={[styles.name, { color: theme.text }]}>{item?.name}</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" style={styles.close}>
                <Ionicons name="close" size={20} color={theme.subtext} />
              </Pressable>
            </View>

            <View style={styles.metaRow}>
              {!!item?.prepTimeMinutes && (
                <Text style={[styles.meta, { color: theme.subtext }]}>⏱ {item.prepTimeMinutes} min</Text>
              )}
              {!!item?.calories && <Text style={[styles.meta, { color: theme.subtext }]}>🔥 {item.calories} kcal</Text>}
              {(item?.tags ?? []).slice(0, 3).map((t) => (
                <Text key={t} style={[styles.tag, { backgroundColor: theme.inputBg, color: theme.subtext }]}>
                  {t}
                </Text>
              ))}
            </View>

            {!!item?.description && (
              <Text style={[styles.desc, { color: theme.subtext }]}>{item.description}</Text>
            )}

            {soldOut && (
              <View style={styles.soldOut}>
                <Text style={styles.soldOutText}>This dish is currently unavailable.</Text>
              </View>
            )}

            {(item?.variants ?? []).map((v) => (
              <View key={v.id} style={styles.group}>
                <Text style={[styles.groupTitle, { color: theme.text }]}>{v.name}</Text>
                {(v.options ?? []).map((o) => {
                  const active = o.id === optionId;
                  return (
                    <Pressable
                      key={o.id}
                      accessibilityRole="radio"
                      onPress={() => {
                        setOptionId(active ? null : o.id);
                        setOptionLabel(active ? null : o.label);
                      }}
                      style={[
                        styles.option,
                        { borderColor: active ? palette.brand : theme.border, backgroundColor: active ? palette.brandSoft + '66' : 'transparent' },
                      ]}
                    >
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={17}
                        color={active ? palette.brand : theme.subtext}
                      />
                      <Text style={{ flex: 1, color: theme.text, fontWeight: active ? '800' : '500' }}>{o.label}</Text>
                      {num(o.priceModifier) !== 0 && (
                        <Text style={{ color: palette.brandDark, fontWeight: '800' }}>
                          {num(o.priceModifier) > 0 ? '+' : '−'}
                          {formatPrice(Math.abs(num(o.priceModifier)))}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}

            {(item?.addOns ?? []).length > 0 && (
              <View style={styles.group}>
                <Text style={[styles.groupTitle, { color: theme.text }]}>Add-on</Text>
                {(item?.addOns ?? []).map((a) => {
                  const active = a.id === addOnId;
                  const locked = !!a.isRequired;
                  return (
                    <Pressable
                      key={a.id}
                      accessibilityRole="radio"
                      disabled={locked}
                      onPress={() => setAddOnId(a.id)}
                      style={[
                        styles.option,
                        { borderColor: active ? palette.brand : theme.border, opacity: locked ? 0.85 : 1 },
                      ]}
                    >
                      <Ionicons
                        name={active ? 'checkbox' : 'square-outline'}
                        size={17}
                        color={active ? palette.brand : theme.subtext}
                      />
                      <Text style={{ flex: 1, color: theme.text, fontWeight: active ? '800' : '500' }}>
                        {a.name}
                        {locked ? ' (required)' : ''}
                      </Text>
                      <Text style={{ color: palette.brandDark, fontWeight: '800' }}>+{formatPrice(a.price)}</Text>
                    </Pressable>
                  );
                })}
                {(item?.addOns ?? []).some((a) => !a.isRequired) && (
                  <Pressable
                    accessibilityRole="radio"
                    onPress={() => setAddOnId(null)}
                    style={[styles.option, { borderColor: theme.border }]}
                  >
                    <Ionicons name={addOnId ? 'square-outline' : 'checkbox'} size={17} color={theme.subtext} />
                    <Text style={{ flex: 1, color: theme.subtext }}>No add-on</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Input
              label="Notes for the kitchen"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.notes}
              placeholder="Allergies, no ice, extra napkins…"
            />
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <QtyStepper value={qty} onChange={setQty} min={1} />
            <Button
              title={soldOut ? 'Sold out' : `Add · ${formatPrice(lineTotal)}`}
              onPress={submit}
              disabled={soldOut}
              style={{ flex: 1 }}
              size="lg"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginTop: 10 },
  scroll: { padding: 16, paddingBottom: 8 },
  hero: { width: '100%', height: 180, borderRadius: radius.card, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, fontSize: 20, fontWeight: '900' },
  close: { padding: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 6 },
  meta: { fontSize: 12.5, fontWeight: '600' },
  tag: { fontSize: 11, fontWeight: '700', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  desc: { fontSize: 13.5, lineHeight: 20, marginTop: 10 },
  soldOut: { backgroundColor: '#FEF2F2', borderRadius: radius.input, padding: 10, marginTop: 12 },
  soldOutText: { color: '#B91C1C', fontSize: 13, fontWeight: '700' },
  group: { marginTop: 16 },
  groupTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
});
