import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatPrice } from '@/components/price';
import { cartCount, cartItemsTotal, useCart } from '@/lib/cart/store';
import { palette, radius } from '@/lib/theme';

/**
 * Floating basket pill shown on browsing surfaces (home feed, restaurant
 * menu). Only appears once there is at least one line.
 */
export function CartFab({ bottom = 84 }: { bottom?: number }) {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const branchName = useCart((s) => s.branchName);
  const units = cartCount(lines);
  if (units === 0) return null;

  return (
    <View style={[styles.wrap, { bottom }]}>
      <Pressable
        onPress={() => router.push('/cart')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={styles.iconBox}>
          <Ionicons name="cart" size={17} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.strong} numberOfLines={1}>
            {units} {units === 1 ? 'item' : 'items'} · {formatPrice(cartItemsTotal(lines))}
          </Text>
          {!!branchName && (
            <Text style={styles.sub} numberOfLines={1}>
              from {branchName}
            </Text>
          )}
        </View>
        <Text style={styles.cta}>View cart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'stretch' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.brand,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  strong: { color: '#fff', fontWeight: '900', fontSize: 14.5 },
  sub: { color: '#FFFFFFCC', fontSize: 11.5, marginTop: 1 },
  cta: { color: '#fff', fontWeight: '900', fontSize: 13.5 },
});
