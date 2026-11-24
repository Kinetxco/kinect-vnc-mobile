import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export type RecentKind = "lan" | "relay";

export type RecentConnection = {
  kind: RecentKind;
  host: string;
  port: number;
  name?: string;
  computerName?: string;
  lastConnectedAt: string;
  pinned?: boolean;
};

const RECENTS_KEY = "kinect-vnc:recents";
const CHAT_KEY = "kinect-vnc:chat";
const MAX_RECENTS = 20;

export function recentId(entry: Pick<RecentConnection, "kind" | "host" | "port">): string {
  return entry.kind === "relay" ? `relay:${entry.host}` : `lan:${entry.host}:${entry.port}`;
}

export function recentTitle(entry: RecentConnection): string {
  return entry.computerName || entry.name || entry.host;
}

export function recentSubtitle(entry: RecentConnection): string {
  if (entry.kind === "relay") return "Device ID";
  return entry.port === 5900 ? entry.host : `${entry.host}:${entry.port}`;
}

export async function loadRecents(): Promise<RecentConnection[]> {
  const raw = await AsyncStorage.getItem(RECENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecent);
  } catch {
    return [];
  }
}

function isRecent(value: unknown): value is RecentConnection {
  if (!value || typeof value !== "object") return false;
  const entry = value as RecentConnection;
  return (
    (entry.kind === "lan" || entry.kind === "relay") &&
    typeof entry.host === "string" &&
    typeof entry.port === "number" &&
    typeof entry.lastConnectedAt === "string"
  );
}

export async function touchRecent(entry: RecentConnection): Promise<RecentConnection[]> {
  const current = await loadRecents();
  const id = recentId(entry);
  const without = current.filter((item) => recentId(item) !== id);
  const previous = current.find((item) => recentId(item) === id);
  const merged: RecentConnection = {
    ...previous,
    ...entry,
    pinned: entry.pinned ?? previous?.pinned,
  };
  const next = [merged, ...without].slice(0, MAX_RECENTS);
  next.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  return next;
}

export async function removeRecent(entry: RecentConnection): Promise<RecentConnection[]> {
  const next = (await loadRecents()).filter((item) => recentId(item) !== recentId(entry));
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  await forgetPassword(entry);
  return next;
}

export async function setRecentPinned(entry: RecentConnection, pinned: boolean): Promise<RecentConnection[]> {
  const next = (await loadRecents()).map((item) =>
    recentId(item) === recentId(entry) ? { ...item, pinned } : item
  );
  next.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  return next;
}

function passwordKey(entry: Pick<RecentConnection, "kind" | "host" | "port">): string {
  const safe = recentId(entry).replace(/[^A-Za-z0-9._-]/g, "_");
  return `kinect-pw-${safe}`.slice(0, 180);
}

export async function savePassword(
  entry: Pick<RecentConnection, "kind" | "host" | "port">,
  password: string
): Promise<void> {
  if (!password) {
    await forgetPassword(entry);
    return;
  }
  await SecureStore.setItemAsync(passwordKey(entry), password);
}

export async function loadPassword(
  entry: Pick<RecentConnection, "kind" | "host" | "port">
): Promise<string | null> {
  return SecureStore.getItemAsync(passwordKey(entry));
}

export async function forgetPassword(entry: Pick<RecentConnection, "kind" | "host" | "port">): Promise<void> {
  await SecureStore.deleteItemAsync(passwordKey(entry));
}

export async function loadChatEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(CHAT_KEY)) === "1";
}

export async function saveChatEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CHAT_KEY, enabled ? "1" : "0");
}
