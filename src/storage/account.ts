import * as SecureStore from "expo-secure-store";
import { fetchEntitlement, refreshTokens, signIn, type AccountTokens } from "../account/api";

const ACCOUNT_KEY = "kinect-vnc-account";

export type StoredAccount = {
  userJwt: string;
  refreshToken: string;
  jwtExpiresAt: number;
  email: string | null;
  entitlement: string | null;
};

function fromTokens(tokens: AccountTokens, previous: StoredAccount | null): StoredAccount {
  const lifetime = tokens.jwtExpiresIn && tokens.jwtExpiresIn > 0 ? tokens.jwtExpiresIn : 600;
  return {
    userJwt: tokens.userJwt,
    refreshToken: tokens.refreshToken,
    jwtExpiresAt: Date.now() + lifetime * 1000,
    email: tokens.email ?? previous?.email ?? null,
    entitlement: previous?.entitlement ?? null,
  };
}

export async function loadAccount(): Promise<StoredAccount | null> {
  const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAccount;
    if (!parsed.refreshToken || !parsed.userJwt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveAccount(account: StoredAccount): Promise<void> {
  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(account));
}

export async function clearAccount(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCOUNT_KEY);
}

export async function signInAndStore(email: string, password: string): Promise<StoredAccount> {
  const tokens = await signIn(email, password);
  const account = fromTokens(tokens, null);
  account.email = tokens.email ?? email.trim();
  account.entitlement = await fetchEntitlement(account.refreshToken);
  await saveAccount(account);
  return account;
}

export async function currentJwt(): Promise<StoredAccount | null> {
  const account = await loadAccount();
  if (!account) return null;
  if (account.jwtExpiresAt - Date.now() > 60_000) return account;
  try {
    const tokens = await refreshTokens(account.refreshToken);
    const next = fromTokens(tokens, account);
    next.entitlement = (await fetchEntitlement(next.refreshToken)) ?? account.entitlement;
    await saveAccount(next);
    return next;
  } catch {
    await clearAccount();
    return null;
  }
}
