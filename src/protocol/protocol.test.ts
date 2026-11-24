import assert from "node:assert/strict";
import test from "node:test";
import { accountHeadline, accountView } from "./accountView.ts";
import { ascii, concatBytes } from "./bytes.ts";
import { chatText, decodeChatFrame, encodeChatFrame } from "./chat.ts";
import { parseConnectTarget } from "./connectTarget.ts";
import { desEncryptBlock, reverseBits } from "./des.ts";
import { parseHostAnnouncement, sanitizeRemoteName } from "./names.ts";
import {
  CLIENT_PIXEL_FORMAT,
  SEC_NONE,
  SEC_VNC_AUTH,
  jpegLength,
  rawToRgba,
  securityChoice,
  unsupportedSecurityMessage,
  type DrawOp,
} from "./rfb.ts";
import { SignalBuffer, helloFrame, signalFrame } from "./signal.ts";
import { vncAuthResponse } from "./vncAuth.ts";
import { listRelayDevices, openRelaySession } from "../session/relayClient.ts";
import type { ByteStream } from "../session/stream.ts";
import { VncSession } from "../session/vncSession.ts";

test("DES matches the standard single-block vector", () => {
  const key = hex("133457799BBCDFF1");
  const plain = hex("0123456789ABCDEF");
  assert.equal(toHex(desEncryptBlock(key, plain)), "85e813540f0ab405");
  assert.equal(reverseBits(0b10000000), 0b00000001);
});

test("VNC auth is stable for one challenge", () => {
  const challenge = new Uint8Array(16).fill(0x11);
  const first = vncAuthResponse(challenge, "secret");
  const second = vncAuthResponse(challenge, "secret");
  assert.equal(first.length, 16);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, vncAuthResponse(challenge, "other"));
});

test("connect targets match the desktop viewer", () => {
  assert.deepEqual(parseConnectTarget("192.168.1.20"), { kind: "lan", host: "192.168.1.20", port: 5900 });
  assert.deepEqual(parseConnectTarget("office.local:5901"), { kind: "lan", host: "office.local", port: 5901 });
  assert.deepEqual(parseConnectTarget("[fe80::1]:5902"), { kind: "lan", host: "fe80::1", port: 5902 });
  assert.deepEqual(parseConnectTarget("AbCDEF12 secret"), {
    kind: "relay",
    deviceId: "abcdef12",
    guestCode: "secret",
  });
  assert.equal(parseConnectTarget(""), null);
  assert.equal(parseConnectTarget("not a target with spaces"), null);
});

test("account copy follows sign-in state", () => {
  assert.equal(accountView(null).kind, "checking");
  assert.equal(accountHeadline(accountView(null)), "Checking sign-in…");
  const signedIn = accountView({ paired: true, revoked: false, accountEmail: "a@kinectvnc.com" });
  assert.equal(signedIn.kind, "signed-in");
  assert.match(accountHeadline(signedIn), /a@kinectvnc.com/);
  assert.equal(accountView({ paired: false, revoked: true }).kind, "revoked");
});

test("host announcement ignores the session clipboard prefix", () => {
  assert.equal(sanitizeRemoteName("  Office\nPC  "), "Office PC");
  const host = parseHostAnnouncement("2\nOffice\nhost\ncontinuous=1");
  assert.deepEqual(host, { computer: "Office", hostname: "host", continuous: true });
  assert.equal(parseHostAnnouncement("9\nOffice"), null);
});

test("JPEG scan stops at EOI and keeps stuffed FF bytes", () => {
  const stuffed = Uint8Array.of(0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9, 0x01);
  assert.equal(jpegLength(stuffed), 6);
  assert.equal(jpegLength(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)), 4);
  assert.equal(jpegLength(Uint8Array.of(0x00, 0x01)), null);
});

test("raw pixels become RGBA for the client format", () => {
  const rgba = rawToRgba(Uint8Array.of(10, 20, 30, 0), CLIENT_PIXEL_FORMAT);
  assert.deepEqual([...rgba], [30, 20, 10, 255]);
});

test("chat frames round-trip a message", () => {
  const encoded = encodeChatFrame({
    version: 1,
    kind: 2,
    role: 2,
    flags: 0,
    sessionId: new Uint8Array(16),
    messageId: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16),
    senderSeq: 4,
    serverSeq: 9,
    generation: 1,
    payload: new TextEncoder().encode("hello"),
  });
  const decoded = decodeChatFrame(encoded);
  assert.equal(chatText(decoded!), "hello");
  assert.equal(decoded?.serverSeq, 9);
});

test("signal frames are length-prefixed JSON", () => {
  const bytes = helloFrame({ role: "viewer_control", userJwt: "token" });
  const buffer = new SignalBuffer();
  buffer.push(bytes.subarray(0, 3));
  assert.equal(buffer.nextFrame(), null);
  buffer.push(bytes.subarray(3));
  assert.deepEqual(buffer.nextFrame(), { v: 1, role: "viewer_control", user_jwt: "token" });
});

test("security choice stays on types this phone can finish", () => {
  assert.equal(securityChoice([SEC_VNC_AUTH, SEC_NONE], false), SEC_NONE);
  assert.equal(securityChoice([19], false), 19);
  assert.match(unsupportedSecurityMessage(19), /Device ID/);
  assert.equal(securityChoice([SEC_VNC_AUTH], true), 0);
});

test("a scripted server completes none-auth and a JPEG rectangle", async () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
  const socket = new QueueSocket();
  socket.server(
    concatBytes([
      ascii("RFB 003.008\n"),
      Uint8Array.of(1, SEC_NONE),
      u32(0),
      u16(2),
      u16(1),
      new Uint8Array(16),
      u32(2),
      ascii("PC"),
      Uint8Array.of(0, 0),
      u16(1),
      u16(0),
      u16(0),
      u16(2),
      u16(1),
      i32(21),
      jpeg,
    ])
  );
  const ops = await firstFrame(socket);
  assert.equal(ops[0]?.kind, "jpeg");
  if (ops[0]?.kind === "jpeg") assert.deepEqual([...ops[0].jpeg], [...jpeg]);
});

test("relay device list reads the session-ready style device frame", async () => {
  const devices = await listRelayDevices(async () => scriptedSocket((frame) => {
    if (frame.role === "viewer_control") return { ok: true };
    if (frame.type === "list_devices") {
      return {
        type: "devices",
        devices: [{ device_id: "abc", name: "Office", online: true, last_seen: 10, revoked: false }],
      };
    }
    return null;
  }), "jwt");
  assert.equal(devices[0]?.name, "Office");
  assert.equal(devices[0]?.online, true);
});

test("an account relay opens the picture socket after session_ready", async () => {
  let opened = 0;
  const stream = await openRelaySession(
    async () => {
      opened += 1;
      const which = opened;
      return scriptedSocket((frame) => {
        if (frame.role) return { ok: true, heartbeat_secs: 30 };
        if (which === 1 && frame.type === "connect") {
          return { type: "session_ready", session_id: "s", session_token: "t" };
        }
        return null;
      });
    },
    { deviceId: "abc", jwt: "jwt" }
  );
  assert.equal(opened, 2);
  stream.close();
});

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hex(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function i32(value: number): Uint8Array {
  return u32(value >>> 0);
}

class QueueSocket implements ByteStream {
  sent: Uint8Array[] = [];
  private listeners: Array<(chunk: Uint8Array) => void> = [];
  private pending: Uint8Array[] = [];
  write(data: Uint8Array): void {
    this.sent.push(data);
  }
  close(): void {}
  onData(listener: (chunk: Uint8Array) => void): void {
    this.listeners.push(listener);
    for (const chunk of this.pending.splice(0, this.pending.length)) listener(chunk);
  }
  onClose(): void {}
  onError(): void {}
  server(data: Uint8Array): void {
    if (this.listeners.length === 0) this.pending.push(data);
    else for (const listener of this.listeners) listener(data);
  }
}

function firstFrame(socket: QueueSocket): Promise<DrawOp[]> {
  const session = new VncSession();
  return new Promise((resolve, reject) => {
    void session
      .start(socket, {
        onDraw: (ops) => {
          session.close();
          resolve(ops);
        },
        onClose: (message) => reject(new Error(message ?? "closed")),
      })
      .catch(reject);
  });
}

function scriptedSocket(reply: (frame: Record<string, unknown>) => unknown): ByteStream {
  const buffer = new SignalBuffer();
  const listeners: Array<(chunk: Uint8Array) => void> = [];
  return {
    write(data: Uint8Array) {
      buffer.push(data);
      for (;;) {
        const frame = buffer.nextFrame();
        if (!frame || typeof frame !== "object") break;
        const response = reply(frame as Record<string, unknown>);
        if (response) {
          const bytes = signalFrame(response);
          for (const listener of listeners) listener(bytes);
        }
      }
    },
    close() {},
    onData(listener) {
      listeners.push(listener);
    },
    onClose() {},
    onError() {},
  };
}
