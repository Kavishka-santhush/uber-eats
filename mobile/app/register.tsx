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
import { homePathForRole } from '@/lib/auth/store';
import { registerCustomer } from '@/lib/auth/api';
import { config } from '@/lib/config';
import { palette, radius, useTheme } from '@/lib/theme';

export default function RegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!form.fullName.trim()) return setError('Your full name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (!accepted) return setError('Please accept the terms to continue');
    setBusy(true);
    try {
      const user = await registerCustomer({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      router.replace(homePathForRole(user.role));
    } catch (e: any) {
      setError(e?.message?.replace('GraphQL error: ', '') || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.text }]}>
          Join <Text style={{ color: palette.brand }}>{config.appName}</Text>
        </Text>
        <Text style={[styles.sub, { color: theme.subtext }]}>Create your customer account in seconds.</Text>

        <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Input label="Full name" value={form.fullName} onChangeText={set('fullName')} placeholder="Jane Doe" autoComplete="name" />
          <Input label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
          <Input label="Phone (optional)" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+1 555 0100" />
          <Input label="Password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" />

          <Pressable style={styles.terms} onPress={() => setAccepted((a) => !a)}>
            <View
              style={[
                styles.checkbox,
                { borderColor: accepted ? palette.brand : theme.border, backgroundColor: accepted ? palette.brand : 'transparent' },
              ]}
            >
              {accepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={{ color: theme.subtext, flex: 1 }}>I agree to the terms of service and privacy policy.</Text>
          </Pressable>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button title={busy ? 'Creating account…' : 'Create account'} onPress={submit} loading={busy} size="lg" />

          <View style={styles.linkRow}>
            <Text style={{ color: theme.subtext }}>Already registered? </Text>
            <Link href="/login" asChild>
              <Pressable>
                <Text style={{ color: palette.brand, fontWeight: '700' }}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        <Text style={[styles.sub, { color: theme.subtext, textAlign: 'center' }]}>
          Want to deliver or sell food? Sign up here, then apply as a driver or restaurant partner from your profile.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  title: { textAlign: 'center', fontSize: 26, fontWeight: '900' },
  sub: { textAlign: 'center', marginTop: 6, marginBottom: 18, fontSize: 13 },
  form: { borderRadius: radius.card, borderWidth: 1, padding: 20 },
  terms: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '900' },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: radius.input, padding: 10, marginBottom: 12 },
  errorText: { color: '#B91C1C', fontSize: 13, fontWeight: '600' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
});
