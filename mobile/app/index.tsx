import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth, homePathForRole } from '@/lib/auth/store';
import { config } from '@/lib/config';
import { palette } from '@/lib/theme';

/** Entry route: waits for the persisted session, then lands on the role home. */
export default function Index() {
  const { hasHydrated, accessToken, user } = useAuth();

  if (!hasHydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.brand} />
        <Text style={styles.brand}>{config.appName}</Text>
      </View>
    );
  }

  if (!accessToken || !user) return <Redirect href="/login" />;
  return <Redirect href={homePathForRole(user.role)} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#06060b', gap: 12 },
  brand: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
});
