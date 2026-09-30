import { gql } from '@apollo/client';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apolloClient } from '@/lib/apollo/client';
import { useAuth, type SessionUser } from './store';
import { config } from '@/lib/config';
import { disconnectSocket } from '@/lib/socket';

const USER_FIELDS = `
  id
  fullName
  email
  phone
  role
  avatarUrl
  status
`;

export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      user { ${USER_FIELDS} }
    }
  }
`;

export const REGISTER_CUSTOMER = gql`
  mutation RegisterCustomer($input: RegisterCustomerInput!) {
    registerCustomer(input: $input) {
      accessToken
      refreshToken
      user { ${USER_FIELDS} }
    }
  }
`;

export const ME = gql`
  query Me {
    me { ${USER_FIELDS} }
  }
`;

export const REGISTER_DEVICE_TOKEN = gql`
  mutation RegisterDeviceToken($token: String!, $platform: String!) {
    registerDeviceToken(token: $token, platform: $platform)
  }
`;

export const REMOVE_DEVICE_TOKEN = gql`
  mutation RemoveDeviceToken($token: String!) { removeDeviceToken(token: $token) }
`;

interface SessionPayload {
  login: { accessToken: string; refreshToken: string; user: SessionUser };
}

/** Best-effort: hand the Expo push token to the API so order updates reach the device. */
export async function registerPushToken() {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;
    const expoPushToken = await Notifications.getExpoPushTokenAsync();
    await apolloClient.mutate({
      mutation: REGISTER_DEVICE_TOKEN,
      variables: { token: expoPushToken.token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
  } catch {
    /* push is optional — never block a login on it */
  }
}

function applySession(s: { accessToken: string; refreshToken: string; user: SessionUser }) {
  useAuth.getState().setSession({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken });
  registerPushToken();
  return s.user;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const { data } = await apolloClient.mutate<SessionPayload>({
    mutation: LOGIN,
    variables: { input: { email, password } },
  });
  return applySession(data!.login);
}

export async function registerCustomer(input: {
  fullName: string; email: string; phone?: string; password: string;
}): Promise<SessionUser> {
  const { data } = await apolloClient.mutate<{ registerCustomer: SessionPayload['login'] }>({
    mutation: REGISTER_CUSTOMER,
    variables: { input },
  });
  return applySession(data!.registerCustomer);
}

/** Re-hydrate the session user on cold start (validates the persisted token). */
export async function fetchMe(): Promise<SessionUser | null> {
  if (!useAuth.getState().accessToken) return null;
  try {
    const { data } = await apolloClient.query<{ me: SessionUser | null }>({
      query: ME,
      fetchPolicy: 'network-only',
    });
    if (data.me) useAuth.getState().patchUser(data.me);
    return data.me ?? null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  const rt = useAuth.getState().refreshToken;
  if (rt) {
    try {
      const token = await Notifications.getExpoPushTokenAsync().catch(() => null);
      if (token?.token) {
        await apolloClient.mutate({ mutation: REMOVE_DEVICE_TOKEN, variables: { token: token.token } }).catch(() => undefined);
      }
      await fetch(`${config.apiUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
    } catch {
      /* best effort */
    }
  }
  useAuth.getState().clear();
  disconnectSocket();
  await apolloClient.clearStore();
}
