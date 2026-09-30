import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Providers } from '@/components/providers';
import { useAuth } from '@/lib/auth/store';
import { fetchMe } from '@/lib/auth/api';
import * as Notifications from 'expo-notifications';

// Keep the splash visible until the first auth rehydration settles.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const hasHydrated = useAuth((s) => s.hasHydrated);
  const accessToken = useAuth((s) => s.accessToken);

  useEffect(() => {
    // Validate the persisted token on cold start; a rejected token clears itself
    // via the refresh path the next time a query runs.
    if (hasHydrated && accessToken) fetchMe();
  }, [hasHydrated, accessToken]);

  useEffect(() => {
    if (hasHydrated) SplashScreen.hideAsync().catch(() => undefined);
  }, [hasHydrated]);

  if (!hasHydrated) return null;

  return (
    <SafeAreaProvider>
      <Providers>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(customer)" />
          <Stack.Screen name="(driver)" />
          <Stack.Screen name="(owner)" />
        </Stack>
      </Providers>
    </SafeAreaProvider>
  );
}
