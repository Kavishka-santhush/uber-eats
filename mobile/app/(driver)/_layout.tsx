import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth/store';

/** Driver group: online toggle, request feed, active run, earnings. */
export default function DriverLayout() {
  const user = useAuth((s) => s.user);
  const accessToken = useAuth((s) => s.accessToken);
  if (!accessToken || !user) return <Redirect href="/login" />;
  if (user.role !== 'DRIVER') return <Redirect href={user.role === 'CUSTOMER' ? '/tabs' : '/tabs/profile'} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="run" />
      <Stack.Screen name="income" />
      <Stack.Screen name="history" />
    </Stack>
  );
}
