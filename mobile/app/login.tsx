import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth, homePathForRole } from '@/lib/auth/store';
import { login as loginApi } from '@/lib/auth/api';
import { config } from '@/lib/config';
import { palette, radius, useTheme } from '@/lib/theme';
import { useServerHealth } from '@/lib/react-query';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const health = useServerHealth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError('Enter your email and password');
    setBusy(true);
    try {
      const user = await loginApi(email.trim().toLowerCase(), password);
      useAuth.getState().patchUser(user);
      router.replace(homePathForRole(user.role));
    } catch (e: any) {
      setError(e?.message?.replace('GraphQL error: ', '') || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.logo, { color: palette.brand }]}>{config.appName}</Text>
        <Text style={[styles.tagline, { color: theme.subtext }]}>Food, fast — from local kitchens to your door.</Text>

        <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="Your password"
            onSubmitEditing={submit}
          />

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {health.isError && (
            <Text style={[styles.hint, { color: palette.warning }]}>
              API unreachable at {config.apiUrl} — check the server is running (real devices need your LAN IP).
            </Text>
          )}

          <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} loading={busy} size="lg" />

          <View style={styles.linkRow}>
            <Text style={{ color: theme.subtext }}>New here? </Text>
            <Link href="/register" asChild>
              <Pressable>
                <Text style={{ color: palette.brand, fontWeight: '700' }}>Create an account</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        <Text style={[styles.hint, { color: theme.subtext, textAlign: 'center' }]}>
          Restaurant partners and drivers use the same login — the app routes you to the right workspace.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  logo: { textAlign: 'center', fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  tagline: { textAlign: 'center', marginTop: 6, marginBottom: 24, fontSize: 14 },
  form: { borderRadius: radius.card, borderWidth: 1, padding: 20 },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: radius.input, padding: 10, marginBottom: 12 },
  errorText: { color: '#B91C1C', fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 8 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
});
