import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { AddressFormModal, type AddressDraft } from '@/components/address-form';
import { ME_FULL } from '@/lib/graphql/queries';
import {
  ADD_ADDRESS,
  DELETE_ADDRESS,
  SET_DEFAULT_ADDRESS,
  UPDATE_ADDRESS,
} from '@/lib/graphql/mutations';
import { useCart } from '@/lib/cart/store';
import { palette, radius, useTheme } from '@/lib/theme';

/** Saved delivery addresses: create, edit, delete and pick the default. */
export default function AddressesScreen() {
  const theme = useTheme();
  const { data, loading, refetch } = useQuery(ME_FULL, { fetchPolicy: 'cache-and-network' });
  const addresses: any[] = data?.me?.addresses ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const cartLines = useCart((s) => s.lines);

  const [addAddress, { loading: saving }] = useMutation(ADD_ADDRESS);
  const [updateAddress] = useMutation(UPDATE_ADDRESS);
  const [deleteAddress] = useMutation(DELETE_ADDRESS);
  const [setDefault] = useMutation(SET_DEFAULT_ADDRESS);

  const openNew = () => {
    setEditingId(null);
    setBanner(null);
    setModalOpen(true);
  };

  const openEdit = (a: any) => {
    setEditingId(a.id);
    setBanner(null);
    setModalOpen(true);
  };

  const submit = async (input: AddressDraft) => {
    setBanner(null);
    try {
      if (editingId) await updateAddress({ variables: { id: editingId, input } });
      else await addAddress({ variables: { input } });
      setModalOpen(false);
      setEditingId(null);
      await refetch();
    } catch (e: any) {
      setBanner(cleanError(e) || 'Could not save this address');
    }
  };

  const remove = (a: any) => {
    Alert.alert('Remove address?', `${a.line1}, ${a.city}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBanner(null);
          try {
            await deleteAddress({ variables: { id: a.id } });
            await refetch();
          } catch (e: any) {
            setBanner(cleanError(e) || 'Could not remove this address');
          }
        },
      },
    ]);
  };

  const makeDefault = async (a: any) => {
    if (a.isDefault) return;
    setBanner(null);
    try {
      await setDefault({ variables: { id: a.id } });
      await refetch();
    } catch (e: any) {
      setBanner(cleanError(e) || 'Could not change the default address');
    }
  };

  if (loading && !data) {
    return (
      <Screen back title="Addresses">
        <LoadingBlock label="Loading your addresses…" />
      </Screen>
    );
  }

  const initial: Partial<AddressDraft> | null = editingId
    ? (() => {
        const a = addresses.find((x) => x.id === editingId);
        if (!a) return null;
        return {
          label: a.label,
          fullName: a.fullName,
          phone: a.phone,
          line1: a.line1,
          line2: a.line2,
          city: a.city,
          state: a.state,
          country: a.country,
          postalCode: a.postalCode,
          lat: String(a.lat ?? ''),
          lng: String(a.lng ?? ''),
          isDefault: a.isDefault,
        };
      })()
    : null;

  return (
    <Screen
      back
      title="Addresses"
      subtitle={`${addresses.length} saved`}
      refresh={refetch}
      refreshing={loading && !!data}
      footer={
        <Button title="Add a delivery address" onPress={openNew} />
      }
    >
      {!!banner && (
        <View style={[styles.banner, { backgroundColor: '#FEF3C7' }]}>
          <Text style={{ color: '#B45309', fontSize: 12.5, flex: 1, lineHeight: 18 }}>{banner}</Text>
        </View>
      )}

      {addresses.length === 0 ? (
        <EmptyState
          icon="location-outline"
          title="No addresses yet"
          body="Add where you want your food delivered — you can label it Home, Work or anything else."
          ctaLabel="Add address"
          ctaOnPress={openNew}
        />
      ) : (
        <Section title="Saved addresses" subtitle="The default one is preselected at checkout">
          <Card>
            {addresses.map((a: any, index) => (
              <CardRow key={a.id}>
                <View style={styles.row}>
                  <View style={[styles.pin, { backgroundColor: a.isDefault ? palette.brandSoft : theme.inputBg }]}>
                    <Ionicons
                      name={a.isDefault ? 'star' : 'location-outline'}
                      size={16}
                      color={a.isDefault ? palette.brandDark : theme.subtext}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
                        {a.label || 'Address'}
                      </Text>
                      {!!a.isDefault && <Badge label="Default" tone="brand" />}
                    </View>
                    <Text style={[styles.line, { color: theme.subtext }]} numberOfLines={2}>
                      {[a.line1, a.line2].filter(Boolean).join(', ')}
                    </Text>
                    <Text style={[styles.line, { color: theme.subtext }]} numberOfLines={1}>
                      {[a.city, a.state, a.postalCode, a.country].filter(Boolean).join(', ')}
                    </Text>
                    {(!!a.fullName || !!a.phone) && (
                      <Text style={[styles.contact, { color: theme.subtext }]} numberOfLines={1}>
                        {[a.fullName, a.phone].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    <View style={styles.actions}>
                      <ActionLink icon="pencil-outline" label="Edit" onPress={() => openEdit(a)} theme={theme} />
                      {!a.isDefault && (
                        <ActionLink icon="star-outline" label="Make default" onPress={() => makeDefault(a)} theme={theme} />
                      )}
                      {index > 0 || addresses.length > 1 ? (
                        <ActionLink icon="trash-outline" label="Remove" danger onPress={() => remove(a)} theme={theme} />
                      ) : null}
                    </View>
                  </View>
                </View>
              </CardRow>
            ))}
          </Card>
        </Section>
      )}

      {cartLines.length > 0 && (
        <Pressable onPress={() => router.push('/checkout')} style={[styles.checkoutLink, { borderColor: theme.border }]}>
          <Ionicons name="bag-outline" size={17} color={palette.brand} />
          <Text style={{ color: palette.brand, fontWeight: '800', fontSize: 13.5, flex: 1 }}>
            Continue to checkout
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.subtext} />
        </Pressable>
      )}

      <AddressFormModal
        visible={modalOpen}
        title={editingId ? 'Edit address' : 'New address'}
        initial={initial}
        saving={saving}
        error={banner}
        onSubmit={submit}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
      />
    </Screen>
  );
}

function ActionLink({
  icon,
  label,
  onPress,
  danger,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  theme: { subtext: string };
}) {
  const color = danger ? palette.danger : palette.brand;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.action}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

function cleanError(e: any): string | undefined {
  const message: string | undefined = e?.message;
  return message ? message.replace('GraphQL error: ', '') : undefined;
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.input, padding: 11, marginBottom: 14, flexDirection: 'row' },
  row: { flexDirection: 'row', gap: 11, flex: 1 },
  pin: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 14.5, fontWeight: '900', flexShrink: 1 },
  line: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  contact: { fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 9 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkoutLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 14,
  },
});
