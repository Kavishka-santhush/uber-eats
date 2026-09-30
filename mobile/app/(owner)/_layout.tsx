import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth/store';

/** Restaurant owner group: branch dashboard, order board, menu, earnings. */
export default function OwnerLayout() {
  const user = useAuth((s) => s.user);
  const accessToken = useAuth((s) => s.accessToken);
  if (!accessToken || !user) return <Redirect href="/login" />;
  if (user.role !== 'RESTAURANT_OWNER' && user.role !== 'RESTAURANT_STAFF') {
    return <Redirect href={user.role === 'DRIVER' ? '/home' : '/tabs'} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      {/* Order board (named "board" so it never collides with the customer /orders tab) */}
      <Stack.Screen name="board" />
      <Stack.Screen name="menu" />
      <Stack.Screen name="earnings" />
    </Stack>
  );
}
