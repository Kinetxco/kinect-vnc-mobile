import { SignalBuffer, helloFrame, signalFrame } from "../protocol/signal";
import type { ByteStream } from "./stream";

export const SIGNAL_HOST = "kinectvnc.com";
export const SIGNAL_PORT = 2053;

export type RelayDevice = {
  deviceId: string;
  name: string;
  online: boolean;
  lastSeen: number;
  revoked: boolean;
  presence: string;
};

export type OpenSocket = (options: { host: string; port: number; tls: boolean }) => Promise<ByteStream>;

type SignalRecord = Record<string, unknown>;

class SignalReader {
  private buffer = new SignalBuffer();
  private waiters: Array<() => void> = [];
  private failed: Error | null = null;
  private ignore = false;

  constructor(private socket: ByteStream) {
    socket.onData((chunk) => {
      if (this.ignore) return;
      this.buffer.push(chunk);
      this.wake();
    });
    socket.onError((error) => {
      this.failed = error;
      this.wake();
    });
    socket.onClose(() => {
      this.failed ??= new Error("The connection closed.");
      this.wake();
    });
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter();
  }

  async read(timeoutMs: number): Promise<SignalRecord> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const frame = this.buffer.nextFrame();
      if (frame && typeof frame === "object") return frame as SignalRecord;
      if (this.failed && this.buffer.nextFrame() == null) throw this.failed;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("The connection timed out.");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.waiters = this.waiters.filter((waiter) => waiter !== done);
          resolve();
        }, remaining);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        this.waiters.push(done);
      });
    }
  }

  detach(): Uint8Array {
    this.ignore = true;
    return this.buffer.drain();
  }
}

function messageOf(frame: SignalRecord, fallback: string): string {
  return typeof frame.message === "string" && frame.message.trim() ? frame.message : fallback;
}

async function readHello(reader: SignalReader): Promise<SignalRecord> {
  const hello = await reader.read(10_000);
  if (hello.ok === false) throw new Error(messageOf(hello, "Kinect could not start this connection."));
  return hello;
}

export async function listRelayDevices(open: OpenSocket, jwt: string): Promise<RelayDevice[]> {
  const socket = await open({ host: SIGNAL_HOST, port: SIGNAL_PORT, tls: true });
  try {
    const reader = new SignalReader(socket);
    socket.write(helloFrame({ role: "viewer_control", userJwt: jwt }));
    await readHello(reader);
    socket.write(signalFrame({ type: "list_devices" }));
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const frame = await reader.read(deadline - Date.now());
      if (frame.type === "devices" && Array.isArray(frame.devices)) {
        return frame.devices.map(mapDevice);
      }
      if (frame.type === "presence") continue;
      if (frame.type === "error") throw new Error(messageOf(frame, "Could not load computers."));
    }
    throw new Error("Could not load computers.");
  } finally {
    socket.close();
  }
}

function mapDevice(value: unknown): RelayDevice {
  const device = (value ?? {}) as SignalRecord;
  const online = device.online === true;
  return {
    deviceId: String(device.device_id ?? ""),
    name: String(device.name ?? "Computer"),
    online,
    lastSeen: Number(device.last_seen ?? 0),
    revoked: device.revoked === true,
    presence: String(device.presence ?? (online ? "online" : "offline")),
  };
}

export async function openRelaySession(
  open: OpenSocket,
  options: {
    deviceId: string;
    jwt?: string;
    guestCode?: string;
    entitlement?: string | null;
    onPhase?: (phase: "lookup" | "approval" | "connecting") => void;
  }
): Promise<ByteStream> {
  options.onPhase?.("lookup");
  const control = await open({ host: SIGNAL_HOST, port: SIGNAL_PORT, tls: true });
  const reader = new SignalReader(control);
  const heartbeat = setInterval(() => {
    try {
      control.write(signalFrame({ type: "heartbeat" }));
    } catch {
      // The control socket can close as soon as the picture socket is up.
    }
  }, 10_000);
  try {
    control.write(
      helloFrame({
        role: "viewer_control",
        userJwt: options.jwt,
      })
    );
    await readHello(reader);
    if (options.entitlement) {
      control.write(signalFrame({ type: "present_entitlement", v: 1, token: options.entitlement }));
    }
    if (options.guestCode) {
      options.onPhase?.("approval");
      control.write(
        signalFrame({
          type: "request_guest_session",
          v: 1,
          device_id: options.deviceId,
          code: options.guestCode,
          display_name: "Kinect VNC",
        })
      );
    } else {
      control.write(signalFrame({ type: "connect", device_id: options.deviceId }));
    }

    let sessionId = "";
    let sessionToken = "";
    let generation = 0;
    const deadline = Date.now() + (options.guestCode ? 70_000 : 15_000);
    while (!sessionId && Date.now() < deadline) {
      const frame = await reader.read(Math.max(1, deadline - Date.now()));
      const type = String(frame.type ?? "");
      if (type === "session_ready" || type === "guest_session_approved") {
        sessionId = String(frame.session_id ?? "");
        sessionToken = String(frame.session_token ?? "");
        generation = Number(frame.generation ?? 0);
        break;
      }
      if (type === "guest_session_pending" || type === "request_pending") {
        options.onPhase?.("approval");
        continue;
      }
      if (type === "presence" || type === "guest_session_status" || type === "request_update") continue;
      if (type === "guest_session_denied") throw new Error("The computer denied this request.");
      if (type === "guest_session_expired") throw new Error("The request expired.");
      if (type === "guest_session_canceled") throw new Error("The request was canceled.");
      if (type === "device_unavailable") throw new Error("That computer is offline.");
      if (type === "rate_limited") throw new Error("Too many requests. Wait a moment and try again.");
      if (type === "error" || type === "guest_session_failed") {
        throw new Error(messageOf(frame, "Could not connect to that computer."));
      }
    }
    if (!sessionId || !sessionToken) throw new Error("The computer did not answer.");
    if (generation !== 0) {
      control.write(
        signalFrame({
          type: "open_viewer_data",
          v: 1,
          session_id: sessionId,
          session_token: sessionToken,
          generation,
        })
      );
    }

    options.onPhase?.("connecting");
    const data = await open({ host: SIGNAL_HOST, port: SIGNAL_PORT, tls: true });
    try {
      const dataReader = new SignalReader(data);
      data.write(helloFrame({ role: "viewer_data", sessionId, sessionToken }));
      await readHello(dataReader);
      return forwardAfter(data, dataReader.detach());
    } catch (error) {
      data.close();
      throw error;
    }
  } finally {
    clearInterval(heartbeat);
    control.close();
  }
}

function forwardAfter(socket: ByteStream, leftover: Uint8Array): ByteStream {
  const pending: Uint8Array[] = leftover.length ? [leftover] : [];
  const listeners: Array<(chunk: Uint8Array) => void> = [];
  const closers: Array<() => void> = [];
  const errors: Array<(error: Error) => void> = [];
  socket.onData((chunk) => {
    if (listeners.length === 0) pending.push(chunk);
    else for (const listener of listeners) listener(chunk);
  });
  socket.onClose(() => closers.forEach((listener) => listener()));
  socket.onError((error) => errors.forEach((listener) => listener(error)));
  return {
    write: (data) => socket.write(data),
    close: () => socket.close(),
    onData: (listener) => {
      listeners.push(listener);
      const queued = pending.splice(0, pending.length);
      for (const chunk of queued) listener(chunk);
    },
    onClose: (listener) => closers.push(listener),
    onError: (listener) => errors.push(listener),
  };
}
