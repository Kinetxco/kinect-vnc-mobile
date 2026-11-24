import { concatBytes, readU32, u32be } from "./bytes";

export const CHAT_VERSION = 1;
export const CHAT_HEADER = 64;
export const CHAT_KIND_CAPABILITIES = 1;
export const CHAT_KIND_MESSAGE = 2;
export const CHAT_KIND_ACK = 3;
export const CHAT_KIND_TYPING = 4;
export const CHAT_ROLE_VIEWER = 1;
export const CHAT_ACK_DELIVERED = 2;

export type ChatFrame = {
  version: number;
  kind: number;
  role: number;
  flags: number;
  sessionId: Uint8Array;
  messageId: Uint8Array;
  senderSeq: number;
  serverSeq: number;
  generation: number;
  payload: Uint8Array;
};

function u64be(value: number): Uint8Array {
  const out = new Uint8Array(8);
  let rest = Math.max(0, Math.floor(value));
  for (let i = 7; i >= 0; i -= 1) {
    out[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return out;
}

function readU64(bytes: Uint8Array, offset: number): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) value = value * 256 + bytes[offset + i];
  return value;
}

export function randomId(): Uint8Array {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

export function encodeChatFrame(frame: ChatFrame): Uint8Array {
  const header = new Uint8Array(CHAT_HEADER);
  header[0] = frame.version;
  header[1] = frame.kind;
  header[2] = frame.role;
  header[3] = frame.flags;
  header.set(frame.sessionId.subarray(0, 16), 4);
  header.set(frame.messageId.subarray(0, 16), 20);
  header.set(u64be(frame.senderSeq), 36);
  header.set(u64be(frame.serverSeq), 44);
  header.set(u64be(frame.generation), 52);
  header.set(u32be(frame.payload.length), 60);
  return concatBytes([header, frame.payload]);
}

export function decodeChatFrame(bytes: Uint8Array): ChatFrame | null {
  if (bytes.length < CHAT_HEADER || bytes[0] !== CHAT_VERSION) return null;
  const payloadLen = readU32(bytes, 60);
  if (bytes.length !== CHAT_HEADER + payloadLen || payloadLen > 8192) return null;
  return {
    version: bytes[0],
    kind: bytes[1],
    role: bytes[2],
    flags: bytes[3],
    sessionId: bytes.slice(4, 20),
    messageId: bytes.slice(20, 36),
    senderSeq: readU64(bytes, 36),
    serverSeq: readU64(bytes, 44),
    generation: readU64(bytes, 52),
    payload: bytes.slice(64),
  };
}

export function chatMessageFrame(text: string, senderSeq: number): Uint8Array {
  return encodeChatFrame({
    version: CHAT_VERSION,
    kind: CHAT_KIND_MESSAGE,
    role: CHAT_ROLE_VIEWER,
    flags: 0,
    sessionId: new Uint8Array(16),
    messageId: randomId(),
    senderSeq,
    serverSeq: 0,
    generation: 0,
    payload: new TextEncoder().encode(text),
  });
}

export function chatAckFrame(messageId: Uint8Array, serverSeq: number): Uint8Array {
  return encodeChatFrame({
    version: CHAT_VERSION,
    kind: CHAT_KIND_ACK,
    role: CHAT_ROLE_VIEWER,
    flags: 0,
    sessionId: new Uint8Array(16),
    messageId,
    senderSeq: 0,
    serverSeq,
    generation: 0,
    payload: Uint8Array.of(CHAT_ACK_DELIVERED),
  });
}

export function chatText(frame: ChatFrame): string | null {
  if (frame.kind !== CHAT_KIND_MESSAGE) return null;
  const text = new TextDecoder().decode(frame.payload).replace(/\u0000/g, "");
  return text.trim() ? text : null;
}
