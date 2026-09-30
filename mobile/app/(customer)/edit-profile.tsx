import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen, Section } from '@/components/screen';
import { UPDATE_PROFILE, CHANGE_PASSWORD } from '@/lib/graphql/mutations';
import { useAuth } from '@/lib/auth/store';
import { assetUrl } from '@/lib/config';
import { palette, radius, useTheme } from '@/lib/theme';

/**
 * Edit profile — the mobile counterpart of the web "Account" tab.
 * Everything here is driven by the session user: updateProfile returns the
 * fresh row, which we write straight back into the auth store so the header
 * avatar and the profile tab re-render without another round trip.
 */
export default function EditProfileScreen() {
  const theme = useTheme();
  const session = useAuth((s) => s.user);
  const patchUser = useAuth((s) => s.patchUser);

  const [updateProfile, savingProfile] = useMutation(UPDATE_PROFILE);
  const [changePassword, savingPassword] = useMutation(CHANGE_PASSWORD);

  const [name, setName] = useState(session?.fullName ?? '');
  const [phone, setPhone] = useState(session?.phone ?? '');
  const [avatar, setAvatar] = useState(session?.avatarUrl ?? '');
  const [nameErr, setNameErr] = useState<string | undefined>();
  const [avatarEditing, setAvatarEditing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwErr, setPwErr] = useState<string | undefined>();

  // The session can hydrate from AsyncStorage after this screen mounts.
  useEffect(() => {
    if (!session) return;
    setName(session.fullName ?? '');
    setPhone(session.phone ?? '');
    setAvatar(session.avatarUrl ?? '');
  }, [session]);

  const dirty = useMemo(
    () =>
      name.trim() !== (session?.fullName ?? '') ||
      (phone.trim() || null) !== (session?.phone || null) ||
      avatar.trim() !== (session?.avatarUrl ?? ''),
    [name, phone, avatar, session],
  );

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameErr('Please enter your full name');
      return;
    }
    setNameErr(undefined);
    setBanner(null);
    try {
      const res = await updateProfile({
        variables: {
          input: {
            fullName: trimmed,
            phone: phone.trim() || null,
            avatarUrl: avatar.trim() || null,
          },
        },
      });
      const u = res.data?.updateProfile;
      patchUser({
        fullName: u?.fullName ?? trimmed,
        phone: u?.phone ?? (phone.trim() || null),
        avatarUrl: u?.avatarUrl ?? (avatar.trim() || null),
      });
      setAvatarEditing(false);
    } catch (e: any) {
      setBanner(cleanError(e) || 'Could not save your profile');
    }
  };

  const savePassword = async () => {
    if (newPw.length < 8) {
      setPwErr('New password must be at least 8 characters');
      return;
    }
    if (newPw !== confirmPw) {
      setPwErr('The two new passwords do not match');
      return;
    }
    if (!oldPw) {
      setPwErr('Enter your current password');
      return;
    }
    setPwErr(undefined);
    setBanner(null);
    try {
      await changePassword({ variables: { oldPassword: oldPw, newPassword: newPw } });
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      setBanner(
        'Password changed. For safety every other device was signed out — sign in again there when you can.',
      );
    } catch (e: any) {
      setPwErr(cleanError(e) || 'Could not change your password');
    }
  };

  return (
    <Screen
      back
      keyboardAvoiding
      title="Edit profile"
      subtitle="How you appear to restaurants and couriers"
      footer={
        <View style={styles.footer}>
          <Button title="Save changes" size="lg" onPress={save} loading={savingProfile} disabled={!dirty} />
        </View>
      }
    >
      {!!banner && (
        <View style={[styles.notice, { backgroundColor: '#EFF6FF' }]}>
          <Ionicons name="information-circle" size={16} color={palette.brandDark} />
          <Text style={[styles.noticeText, { color: palette.brandDark }]}>{banner}</Text>
        </View>
      )}

      <Section title="Photo">
        <Card>
          <CardRow
            right={
              <Pressable hitSlop={8} accessibilityRole="button" onPress={() => setAvatarEditing((v) => !v)}>
                <Text style={{ color: palette.brand, fontWeight: '800', fontSize: 13 }}>
                  {avatarEditing ? 'Cancel' : 'Change'}
                </Text>
              </Pressable>
            }
          >
            <View style={styles.photoRow}>
              {avatar ? (
                <Image source={{ uri: assetUrl(avatar) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>
                    {(name.trim() || session?.fullName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{session?.fullName || 'Your name'}</Text>
                <Text style={[styles.rowHint, { color: theme.subtext }]}>
                  Couriers and restaurant staff see this name on their pickup and drop-off cards.
                </Text>
              </View>
            </View>
          </CardRow>
          {avatarEditing && (
            <View style={styles.avatarEditor}>
              <Input
                label="Avatar image URL"
                value={avatar}
                onChangeText={setAvatar}
                autoCapitalize="none"
                placeholder="https://…/me.jpg"
                hint="Paste a link to an image — this build has no in-app camera picker, so we ask for a URL instead of pretending to."
              />
              <View style={styles.inlineRow}>
                <Button title="Save photo" size="sm" onPress={() => setAvatarEditing(false)} />
                {!!avatar && (
                  <Button
                    title="Remove"
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      setAvatar('');
                      setAvatarEditing(false);
                    }}
                  />
                )}
              </View>
            </View>
          )}
        </Card>
      </Section>

      <Section title="Your details">
        <Card style={{ padding: 16 }}>
          <Input
            label="Full name"
            value={name}
            onChangeText={setName}
            error={nameErr}
            autoCapitalize="words"
            placeholder="Nimal Perera"
          />
          <Input
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+94 77 123 4567"
            hint="Your courier uses this if they cannot find the gate"
          />
          <Input
            label="Email"
            value={session?.email ?? ''}
            editable={false}
            hint="Email is your login, so it cannot be changed here"
          />
        </Card>
      </Section>

      <Section title="Password" subtitle="Changing it signs out your other devices">
        <Card style={{ padding: 16 }}>
          <Input
            label="Current password"
            value={oldPw}
            onChangeText={setOldPw}
            secureTextEntry
            autoCapitalize="none"
          />
          <Input
            label="New password"
            value={newPw}
            onChangeText={setNewPw}
            secureTextEntry
            autoCapitalize="none"
            error={pwErr}
            hint="At least 8 characters"
          />
          <Input
            label="Confirm new password"
            value={confirmPw}
            onChangeText={setConfirmPw}
            secureTextEntry
            autoCapitalize="none"
          />
          <View style={{ marginTop: 2 }}>
            <Button
              title="Update password"
              variant="secondary"
              onPress={savePassword}
              loading={savingPassword}
              disabled={!oldPw || !newPw || !confirmPw}
            />
          </View>
        </Card>
      </Section>

      <Section title="Account">
        <Card>
          <CardRow>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Role</Text>
              <Text style={[styles.rowHint, { color: theme.subtext }]}>
                Only an administrator can change what kind of account you have.
              </Text>
            </View>
            <Badge label={roleLabel(session?.role)} tone="neutral" />
          </CardRow>
          <CardRow>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Account status</Text>
              <Text style={[styles.rowHint, { color: theme.subtext }]}>
                {session?.status === 'ACTIVE'
                  ? 'Active — you can order as usual.'
                  : 'This account is not active; contact support if you cannot order.'}
              </Text>
            </View>
            <Badge
              label={session?.status === 'ACTIVE' ? 'Active' : session?.status ? 'Restricted' : 'Unknown'}
              tone={session?.status === 'ACTIVE' ? 'brand' : 'warning'}
            />
          </CardRow>
        </Card>
      </Section>
    </Screen>
  );
}

function roleLabel(role?: string | null) {
  switch (role) {
    case 'CUSTOMER':
      return 'Customer';
    case 'DRIVER':
      return 'Driver';
    case 'RESTAURANT_OWNER':
      return 'Restaurant owner';
    case 'RESTAURANT_STAFF':
      return 'Restaurant staff';
    case 'SUPPORT_AGENT':
      return 'Support agent';
    case 'OPS_MANAGER':
      return 'Operations manager';
    case 'ADMIN':
      return 'Admin';
    case 'SUPER_ADMIN':
      return 'Super admin';
    default:
      return 'Account';
  }
}

function cleanError(e: any): string | undefined {
  const message: string | undefined = e?.message;
  return message ? message.replace('GraphQL error: ', '') : undefined;
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: 16, paddingTop: 10 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.input,
    padding: 11,
    marginBottom: 14,
  },
  noticeText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  rowHint: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarFallback: { backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  avatarEditor: { paddingHorizontal: 16, paddingBottom: 14 },
  inlineRow: { flexDirection: 'row', gap: 10 },
});
