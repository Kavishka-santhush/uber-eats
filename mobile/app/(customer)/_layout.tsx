import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth/store';

/** Customer group: tabs + menu/cart/checkout/tracking + account stack. */
export default function CustomerLayout() {
  const user = useAuth((s) => s.user);
  const accessToken = useAuth((s) => s.accessToken);
  if (!accessToken || !user) return <Redirect href="/login" />;
  if (user.role === 'DRIVER') return <Redirect href="/home" />;
  if (user.role === 'RESTAURANT_OWNER' || user.role === 'RESTAURANT_STAFF') return <Redirect href="/dashboard" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Tabs group: /tabs (home feed), /search, /orders, /profile */}
      <Stack.Screen name="tabs" />
      <Stack.Screen name="restaurant/[slug]" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="checkout" />
      {/* Live order tracking (kept off /orders/[id] so the tab bar route stays unique) */}
      <Stack.Screen name="track/[id]" />
      <Stack.Screen name="review/[id]" />
      {/* Account area, all pushed from /tabs/profile or /settings */}
      <Stack.Screen name="wallet" />
      <Stack.Screen name="promos" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="favorites" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="support" />
      <Stack.Screen name="ticket/[id]" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="edit-profile" />
    </Stack>
  );
}
