export type ParsedTarget =
  | { kind: "lan"; host: string; port: number }
  | { kind: "relay"; deviceId: string; guestCode?: string };

function validPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** Classify one connection field as a LAN address or a relay Device ID. */
export function parseConnectTarget(raw: string): ParsedTarget | null {
  const text = raw.trim();
  if (!text) return null;
  const match = text.match(/^(\S+)(?:\s+(\S+))?$/);
  if (!match) return null;
  const primary = match[1];
  const extra = match[2];

  if (primary.startsWith("[")) {
    const end = primary.indexOf("]");
    if (end > 1) {
      const host = primary.slice(1, end);
      const rest = primary.slice(end + 1);
      const port = rest.startsWith(":") ? Number(rest.slice(1)) : 5900;
      if (host && validPort(port)) return { kind: "lan", host, port };
    }
    return null;
  }

  const colon = primary.lastIndexOf(":");
  if (colon > 0) {
    const host = primary.slice(0, colon);
    const port = Number(primary.slice(colon + 1));
    if (host && !host.includes(":") && validPort(port)) return { kind: "lan", host, port };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(primary)) {
    return { kind: "lan", host: primary, port: 5900 };
  }

  if (/^[0-9a-fA-F]{8,64}$/.test(primary)) {
    return {
      kind: "relay",
      deviceId: primary.toLowerCase(),
      guestCode: extra,
    };
  }

  if (
    /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(primary) &&
    (primary.includes(".") || /^[A-Za-z][A-Za-z0-9-]{0,62}$/.test(primary))
  ) {
    return { kind: "lan", host: primary, port: 5900 };
  }

  return null;
}

export function targetLabel(target: ParsedTarget): string {
  if (target.kind === "relay") return target.deviceId;
  return target.port === 5900 ? target.host : `${target.host}:${target.port}`;
}
