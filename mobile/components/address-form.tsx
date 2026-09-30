import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLazyQuery } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GEOCODE } from '@/lib/graphql/queries';
import { getCurrentCoords } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';

/** Shape mirrors the server AddressInput (coords stay strings for Decimal). */
export interface AddressDraft {
  label?: string;
  fullName?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
  lat: string;
  lng: string;
  notes?: string;
  isDefault?: boolean;
}

const EMPTY: AddressDraft = {
  label: 'Home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  country: 'US',
  postalCode: '',
  lat: '',
  lng: '',
  notes: '',
  isDefault: false,
};

interface Props {
  visible: boolean;
  title?: string;
  initial?: Partial<AddressDraft> | null;
  saving?: boolean;
  error?: string | null;
  onSubmit: (input: AddressDraft) => void;
  onClose: () => void;
}

/**
 * Address editor used by both the addresses screen and checkout. Coordinates are
 * mandatory (delivery distance is computed from them), so the form offers a GPS
 * grab and a server-side geocode lookup on top of manual entry.
 */
export function AddressFormModal({ visible, title = 'Delivery address', initial, saving, error, onSubmit, onClose }: Props) {
  const theme = useTheme();
  const [form, setForm] = useState<AddressDraft>(EMPTY);
  const [localError, setLocalError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [geocode, { loading: geocoding }] = useLazyQuery(GEOCODE, { fetchPolicy: 'network-only' });

  useEffect(() => {
    if (!visible) return;
    setForm({ ...EMPTY, ...(initial ?? {}) } as AddressDraft);
    setLocalError(null);
  }, [visible, initial]);

  const set = (patch: Partial<AddressDraft>) => setForm((f) => ({ ...f, ...patch }));

  const useGps = async () => {
    setLocating(true);
    setLocalError(null);
    const coords = await getCurrentCoords();
    setLocating(false);
    if (!coords) {
      setLocalError('Could not read your location. Allow location access or type the coordinates.');
      return;
    }
    set({ lat: coords.lat.toFixed(7), lng: coords.lng.toFixed(7) });
  };

  const lookup = async () => {
    const query = [form.line1, form.city, form.postalCode, form.country].filter(Boolean).join(', ');
    if (query.length < 6) {
      setLocalError('Type the street address first, then look it up.');
      return;
    }
    setLocalError(null);
    const { data } = await geocode({ variables: { address: query } });
    const found = data?.geocode;
    if (!found) {
      setLocalError('That address was not found. Check the spelling or enter coordinates manually.');
      return;
    }
    set({ line1: found.formattedAddress, lat: String(found.lat), lng: String(found.lng) });
  };

  const submit = () => {
    if (!form.line1.trim() || !form.city.trim() || !form.country.trim()) {
      setLocalError('Street, city and country are required.');
      return;
    }
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      setLocalError('Coordinates are required — use GPS, look the address up, or type them in.');
      return;
    }
    onSubmit({
      ...form,
      label: form.label?.trim() || undefined,
      fullName: form.fullName?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      line2: form.line2?.trim() || undefined,
      state: form.state?.trim() || undefined,
      postalCode: form.postalCode?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      lat: lat.toFixed(7),
      lng: lng.toFixed(7),
    });
  };

  const shown = localError || error;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Pressable hitSlop={10} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={theme.subtext} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {!!shown && (
              <View style={[styles.errorBox, { backgroundColor: '#FEE2E2' }]}>
                <Text style={{ color: '#B91C1C', fontSize: 12.5, flex: 1 }}>{shown}</Text>
              </View>
            )}

            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Input label="Label" value={form.label} onChangeText={(v) => set({ label: v })} placeholder="Home, Work…" />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Input
                  label="Recipient"
                  value={form.fullName}
                  onChangeText={(v) => set({ fullName: v })}
                  placeholder="Who is receiving"
                />
              </View>
            </View>
            <Input
              label="Contact phone"
              value={form.phone}
              onChangeText={(v) => set({ phone: v })}
              keyboardType="phone-pad"
              placeholder="+1 555 0100"
            />
            <Input label="Street address *" value={form.line1} onChangeText={(v) => set({ line1: v })} placeholder="12 Market St" />
            <Input label="Apartment, floor" value={form.line2} onChangeText={(v) => set({ line2: v })} placeholder="Apt 4B" />
            <View style={styles.pair}>
              <View style={{ flex: 1.4 }}>
                <Input label="City *" value={form.city} onChangeText={(v) => set({ city: v })} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Input label="State" value={form.state} onChangeText={(v) => set({ state: v })} />
              </View>
            </View>
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Input label="Country *" value={form.country} onChangeText={(v) => set({ country: v })} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Input
                  label="Postal code"
                  value={form.postalCode}
                  onChangeText={(v) => set({ postalCode: v })}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            <View style={styles.helpers}>
              <Pressable
                onPress={useGps}
                disabled={locating}
                style={[styles.helperBtn, { borderColor: theme.border, opacity: locating ? 0.6 : 1 }]}
                accessibilityRole="button"
              >
                <Ionicons name="navigate-outline" size={15} color={palette.brandDark} />
                <Text style={{ color: palette.brandDark, fontWeight: '800', fontSize: 12.5 }}>
                  {locating ? 'Locating…' : 'Use my GPS'}
                </Text>
              </Pressable>
              <Pressable
                onPress={lookup}
                disabled={geocoding}
                style={[styles.helperBtn, { borderColor: theme.border, opacity: geocoding ? 0.6 : 1 }]}
                accessibilityRole="button"
              >
                <Ionicons name="search-outline" size={15} color={palette.brandDark} />
                <Text style={{ color: palette.brandDark, fontWeight: '800', fontSize: 12.5 }}>
                  {geocoding ? 'Searching…' : 'Look up address'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Latitude *"
                  value={form.lat}
                  onChangeText={(v) => set({ lat: v })}
                  keyboardType="numbers-and-punctuation"
                  placeholder="40.7128000"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Input
                  label="Longitude *"
                  value={form.lng}
                  onChangeText={(v) => set({ lng: v })}
                  keyboardType="numbers-and-punctuation"
                  placeholder="-74.0060000"
                />
              </View>
            </View>

            <Input
              label="Notes for the courier"
              value={form.notes}
              onChangeText={(v) => set({ notes: v })}
              placeholder="Buzzer 12, leave at the door…"
              multiline
              style={styles.notes}
            />

            <View style={[styles.switchRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Default address</Text>
                <Text style={{ color: theme.subtext, fontSize: 11.5, marginTop: 1 }}>Pre-selected at checkout</Text>
              </View>
              <Switch
                value={!!form.isDefault}
                onValueChange={(v) => set({ isDefault: v })}
                trackColor={{ true: palette.brandSoft, false: theme.border }}
                thumbColor={form.isDefault ? palette.brand : theme.subtext}
              />
            </View>
          </ScrollView>

          <View style={[styles.foot, { borderTopColor: theme.border }]}>
            <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <View style={{ width: 10 }} />
            <Button title={saving ? 'Saving…' : 'Save address'} onPress={submit} loading={saving} style={{ flex: 1.4 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0F172AAA', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16 },
  title: { fontSize: 18, fontWeight: '900' },
  body: { padding: 18, paddingTop: 6 },
  pair: { flexDirection: 'row' },
  errorBox: { borderRadius: radius.input, padding: 10, marginBottom: 12, flexDirection: 'row' },
  helpers: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  helperBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingVertical: 10,
  },
  notes: { minHeight: 68, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: 14 },
  foot: { flexDirection: 'row', padding: 18, paddingTop: 12, borderTopWidth: 1 },
});
