export const SESSION_ID_PREFIX = "__KINECT_SESSION__:";
export const HOST_ANNOUNCEMENT_PREFIX = "__KINECT_HOST__:";

export function sanitizeRemoteName(raw: string): string {
  let out = "";
  let pendingSpace = false;
  for (const ch of raw) {
    if (/\s/u.test(ch)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (ch.charCodeAt(0) < 32 || ch === "\u007f" || ch === "\ufffd") continue;
    if (pendingSpace) {
      out += " ";
      pendingSpace = false;
    }
    out += ch;
    if ([...out].length >= 80) break;
  }
  return out;
}

export type HostAnnouncement = {
  computer: string;
  hostname: string;
  continuous: boolean;
};

export function parseHostAnnouncement(body: string): HostAnnouncement | null {
  const lines = body.split(/\r?\n/);
  const version = lines[0]?.trim();
  if (version !== "1" && version !== "2") return null;
  let continuous = version === "2";
  for (const line of lines.slice(3)) {
    const split = line.indexOf("=");
    if (split <= 0) continue;
    const key = line.slice(0, split).trim();
    const value = line.slice(split + 1).trim();
    if (key.toLowerCase() === "continuous") {
      continuous = value === "1" || value === "true" || value === "yes";
    }
  }
  return {
    computer: sanitizeRemoteName(lines[1] ?? ""),
    hostname: sanitizeRemoteName(lines[2] ?? ""),
    continuous,
  };
}

export function formatLastSeen(unixSeconds: number, nowMs = Date.now()): string {
  if (!unixSeconds) return "No recent check-in";
  const delta = Math.max(0, nowMs - unixSeconds * 1000);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
