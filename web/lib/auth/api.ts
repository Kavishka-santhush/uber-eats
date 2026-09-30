import { gql } from '@apollo/client';
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

export const LOGIN_GOOGLE = gql`
  mutation GoogleLogin($input: GoogleLoginInput!) {
    loginWithGoogle(input: $input) {
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

interface SessionPayload {
  login: { accessToken: string; refreshToken: string; user: SessionUser };
}

function applySession(s: { accessToken: string; refreshToken: string; user: SessionUser }) {
  useAuth.getState().setSession({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken });
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

export async function loginWithGoogle(idToken: string): Promise<SessionUser> {
  const { data } = await apolloClient.mutate<{ loginWithGoogle: SessionPayload['login'] }>({
    mutation: LOGIN_GOOGLE,
    variables: { input: { idToken } },
  });
  return applySession(data!.loginWithGoogle);
}

/** Re-hydrate the session user after a hard refresh (validates the stored token). */
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
