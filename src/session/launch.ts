export type LaunchRequest =
  | { kind: "lan"; host: string; port: number; password?: string; name?: string }
  | { kind: "relay"; deviceId: string; guestCode?: string; name?: string };

let pending: LaunchRequest | null = null;

export function armLaunch(request: LaunchRequest): void {
  pending = request;
}

export function peekLaunch(): LaunchRequest | null {
  return pending;
}
