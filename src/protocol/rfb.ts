import { concatBytes, i32be, readI32, readU16, readU32, u16be, u32be, utf8 } from "./bytes";

export const SEC_NONE = 1;
export const SEC_VNC_AUTH = 2;
export const SEC_VENCRYPT = 19;
export const SEC_RA2 = 5;
export const SEC_RA2_256 = 129;
export const SEC_KINECT_RA2 = 192;

export const ENC_RAW = 0;
export const ENC_COPY_RECT = 1;
export const ENC_JPEG = 21;
export const ENC_DESKTOP_SIZE = -223;
export const ENC_LAST_RECT = -224;
export const ENC_POINTER_POS = -232;
export const ENC_CURSOR = -239;
export const ENC_KINECT_MARKER = -31999;
export const ENC_KINECT_ADAPTIVE = -31998;
export const ENC_KINECT_H264 = -31997;

export const CLIENT_SET_PIXEL_FORMAT = 0;
export const CLIENT_SET_ENCODINGS = 2;
export const CLIENT_FB_UPDATE_REQUEST = 3;
export const CLIENT_KEY_EVENT = 4;
export const CLIENT_POINTER_EVENT = 5;
export const CLIENT_CUT_TEXT = 6;
export const CLIENT_CHAT = 245;

export const SERVER_FB_UPDATE = 0;
export const SERVER_SET_COLOR_MAP = 1;
export const SERVER_BELL = 2;
export const SERVER_CUT_TEXT = 3;
export const SERVER_CHAT = 246;

export type PixelFormat = {
  bitsPerPixel: number;
  depth: number;
  bigEndian: boolean;
  trueColor: boolean;
  redMax: number;
  greenMax: number;
  blueMax: number;
  redShift: number;
  greenShift: number;
  blueShift: number;
};

export const CLIENT_PIXEL_FORMAT: PixelFormat = {
  bitsPerPixel: 32,
  depth: 24,
  bigEndian: false,
  trueColor: true,
  redMax: 255,
  greenMax: 255,
  blueMax: 255,
  redShift: 16,
  greenShift: 8,
  blueShift: 0,
};

export type DrawOp =
  | { kind: "jpeg"; x: number; y: number; width: number; height: number; jpeg: Uint8Array }
  | { kind: "raw"; x: number; y: number; width: number; height: number; rgba: Uint8Array }
  | { kind: "copy"; x: number; y: number; width: number; height: number; srcX: number; srcY: number }
  | { kind: "resize"; width: number; height: number }
  | { kind: "h264" };

export type ServerEvent =
  | { kind: "update"; ops: DrawOp[] }
  | { kind: "bell" }
  | { kind: "clipboard"; text: string }
  | { kind: "chat"; frame: Uint8Array }
  | { kind: "skip" };

export function clientProtocolVersion(serverVersion: string): string {
  if (serverVersion.startsWith("RFB 003.003")) return "RFB 003.003\n";
  if (serverVersion.startsWith("RFB 003.007")) return "RFB 003.007\n";
  return "RFB 003.008\n";
}

export function securityChoice(types: number[], accountSession: boolean): number {
  if (accountSession) {
    return types.includes(SEC_NONE) ? SEC_NONE : 0;
  }
  if (types.includes(SEC_NONE)) return SEC_NONE;
  if (types.includes(SEC_VNC_AUTH)) return SEC_VNC_AUTH;
  if (types.includes(SEC_VENCRYPT) || types.includes(SEC_KINECT_RA2) || types.includes(SEC_RA2) || types.includes(SEC_RA2_256)) {
    return types.find((type) => type === SEC_VENCRYPT || type === SEC_KINECT_RA2 || type === SEC_RA2 || type === SEC_RA2_256) ?? 0;
  }
  return 0;
}

export function unsupportedSecurityMessage(type: number): string {
  if (type === SEC_VENCRYPT || type === SEC_KINECT_RA2 || type === SEC_RA2 || type === SEC_RA2_256) {
    return "This address uses encrypted VNC. Connect with the computer's Device ID, or allow a direct password connection on that computer.";
  }
  return "This computer offered no security type this phone can use.";
}

export function setPixelFormatMessage(format: PixelFormat = CLIENT_PIXEL_FORMAT): Uint8Array {
  return Uint8Array.of(
    CLIENT_SET_PIXEL_FORMAT,
    0,
    0,
    0,
    format.bitsPerPixel,
    format.depth,
    format.bigEndian ? 1 : 0,
    format.trueColor ? 1 : 0,
    (format.redMax >> 8) & 0xff,
    format.redMax & 0xff,
    (format.greenMax >> 8) & 0xff,
    format.greenMax & 0xff,
    (format.blueMax >> 8) & 0xff,
    format.blueMax & 0xff,
    format.redShift,
    format.greenShift,
    format.blueShift,
    0,
    0,
    0
  );
}

export function viewerEncodings(chat: boolean): number[] {
  const encodings = [ENC_JPEG, ENC_COPY_RECT, ENC_RAW, ENC_DESKTOP_SIZE, ENC_KINECT_MARKER];
  if (chat) encodings.push(ENC_KINECT_ADAPTIVE);
  return encodings;
}

export function setEncodingsMessage(encodings: number[]): Uint8Array {
  const body = new Uint8Array(4 + encodings.length * 4);
  body[0] = CLIENT_SET_ENCODINGS;
  body[2] = (encodings.length >> 8) & 0xff;
  body[3] = encodings.length & 0xff;
  encodings.forEach((encoding, index) => {
    body.set(i32be(encoding), 4 + index * 4);
  });
  return body;
}

export function framebufferRequest(incremental: boolean, width: number, height: number): Uint8Array {
  return concatBytes([
    Uint8Array.of(CLIENT_FB_UPDATE_REQUEST, incremental ? 1 : 0),
    u16be(0),
    u16be(0),
    u16be(width),
    u16be(height),
  ]);
}

export function pointerEvent(x: number, y: number, mask: number): Uint8Array {
  const px = Math.max(0, Math.min(65535, Math.round(x)));
  const py = Math.max(0, Math.min(65535, Math.round(y)));
  return concatBytes([Uint8Array.of(CLIENT_POINTER_EVENT, mask & 0xff), u16be(px), u16be(py)]);
}

export function keyEvent(keysym: number, down: boolean, scan = 0): Uint8Array {
  return concatBytes([
    Uint8Array.of(CLIENT_KEY_EVENT, down ? 1 : 0, (scan >> 8) & 0xff, scan & 0xff),
    u32be(keysym >>> 0),
  ]);
}

export function cutTextMessage(text: string): Uint8Array {
  const payload = utf8(text);
  return concatBytes([Uint8Array.of(CLIENT_CUT_TEXT, 0, 0, 0), u32be(payload.length), payload]);
}

export function keysymForChar(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0xff) return code;
  return 0x01000000 + code;
}

export const KEY = {
  BackSpace: 0xff08,
  Tab: 0xff09,
  Return: 0xff0d,
  Escape: 0xff1b,
  Delete: 0xffff,
  Left: 0xff51,
  Up: 0xff52,
  Right: 0xff53,
  Down: 0xff54,
  Shift: 0xffe1,
  Control: 0xffe3,
  Alt: 0xffe9,
  Super: 0xffeb,
};

export function parsePixelFormat(bytes: Uint8Array): PixelFormat {
  return {
    bitsPerPixel: bytes[0],
    depth: bytes[1],
    bigEndian: bytes[2] !== 0,
    trueColor: bytes[3] !== 0,
    redMax: readU16(bytes, 4),
    greenMax: readU16(bytes, 6),
    blueMax: readU16(bytes, 8),
    redShift: bytes[10],
    greenShift: bytes[11],
    blueShift: bytes[12],
  };
}

export function rawToRgba(pixels: Uint8Array, format: PixelFormat): Uint8Array {
  const bpp = format.bitsPerPixel / 8;
  if (![1, 2, 4].includes(bpp) || pixels.length % bpp !== 0) {
    throw new Error("Unexpected pixel size");
  }
  const count = pixels.length / bpp;
  const out = new Uint8Array(count * 4);
  const channel = (value: number, max: number) => (max >= 255 ? value & 0xff : Math.round(((value & max) * 255) / Math.max(1, max)));
  for (let i = 0; i < count; i += 1) {
    const offset = i * bpp;
    let pixel = 0;
    if (format.bigEndian) {
      for (let b = 0; b < bpp; b += 1) pixel = pixel * 256 + pixels[offset + b];
    } else {
      for (let b = bpp - 1; b >= 0; b -= 1) pixel = pixel * 256 + pixels[offset + b];
    }
    out[i * 4] = channel(pixel >> format.redShift, format.redMax);
    out[i * 4 + 1] = channel(pixel >> format.greenShift, format.greenMax);
    out[i * 4 + 2] = channel(pixel >> format.blueShift, format.blueMax);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Length of one JPEG stream, including the EOI marker. FF 00 is a stuffed byte. */
export function jpegLength(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let i = 2; i < bytes.length - 1; i += 1) {
    if (bytes[i] !== 0xff) continue;
    const marker = bytes[i + 1];
    if (marker === 0xd9) return i + 2;
    if (marker === 0x00) i += 1;
  }
  return null;
}

export class ServerReader {
  private chunks: Uint8Array[] = [];
  private offset = 0;
  private waiters: Array<() => void> = [];
  closed = false;

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter();
  }

  end(): void {
    this.closed = true;
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter();
  }

  private available(): number {
    let size = 0;
    for (const chunk of this.chunks) size += chunk.length;
    return size - this.offset;
  }

  private async waitFor(n: number): Promise<void> {
    while (this.available() < n) {
      if (this.closed) throw new Error("The computer closed the connection.");
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  async readExact(n: number): Promise<Uint8Array> {
    await this.waitFor(n);
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      const chunk = this.chunks[0];
      const take = Math.min(chunk.length - this.offset, n - filled);
      out.set(chunk.subarray(this.offset, this.offset + take), filled);
      this.offset += take;
      filled += take;
      if (this.offset >= chunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }
    return out;
  }

  async u8(): Promise<number> {
    return (await this.readExact(1))[0];
  }

  async u16(): Promise<number> {
    return readU16(await this.readExact(2), 0);
  }

  async u32(): Promise<number> {
    return readU32(await this.readExact(4), 0);
  }

  async i32(): Promise<number> {
    return readI32(await this.readExact(4), 0);
  }

  async readJpeg(): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    let pending = concatBytes([]);
    while (jpegLength(pending) == null) {
      if (pending.length >= 2 && (pending[0] !== 0xff || pending[1] !== 0xd8)) {
        throw new Error("The picture was not a JPEG update.");
      }
      if (pending.length > 16 * 1024 * 1024) throw new Error("JPEG update is too large.");
      const more = await this.readSome(65536);
      pending = concatBytes([pending, more]);
    }
    const length = jpegLength(pending)!;
    parts.push(pending.subarray(0, length));
    if (length < pending.length) this.unshift(pending.subarray(length));
    return parts[0];
  }

  private unshift(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    if (this.offset === 0) {
      this.chunks.unshift(bytes);
      return;
    }
    const head = this.chunks[0].subarray(this.offset);
    this.chunks[0] = concatBytes([bytes, head]);
    this.offset = 0;
  }

  private async readSome(max: number): Promise<Uint8Array> {
    while (this.available() === 0) {
      if (this.closed) throw new Error("The computer closed the connection.");
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    return this.readExact(Math.min(max, this.available()));
  }

  async readServerMessage(format: PixelFormat): Promise<ServerEvent> {
    const type = await this.u8();
    if (type === SERVER_FB_UPDATE) return { kind: "update", ops: await this.readFramebuffer(format) };
    if (type === SERVER_BELL) return { kind: "bell" };
    if (type === SERVER_SET_COLOR_MAP) {
      await this.u8();
      await this.u16();
      const colors = await this.u16();
      await this.readExact(colors * 6);
      return { kind: "skip" };
    }
    if (type === SERVER_CUT_TEXT) {
      await this.readExact(3);
      const length = await this.i32();
      const extended = length < 0;
      const size = Math.abs(length);
      if (size > 16 * 1024 * 1024) throw new Error("Clipboard update is too large.");
      const payload = size ? await this.readExact(size) : new Uint8Array();
      if (extended) return { kind: "skip" };
      return { kind: "clipboard", text: new TextDecoder().decode(payload) };
    }
    if (type === SERVER_CHAT) {
      const length = await this.u32();
      if (length > 64 * 1024) throw new Error("Chat frame is too large.");
      return { kind: "chat", frame: await this.readExact(length) };
    }
    throw new Error(`This computer sent a message this phone does not use (${type}).`);
  }

  private async readFramebuffer(format: PixelFormat): Promise<DrawOp[]> {
    await this.u8();
    const count = await this.u16();
    const ops: DrawOp[] = [];
    for (let i = 0; i < count; i += 1) {
      const x = await this.u16();
      const y = await this.u16();
      const width = await this.u16();
      const height = await this.u16();
      const encoding = await this.i32();
      if (encoding === ENC_LAST_RECT) break;
      if (encoding === ENC_DESKTOP_SIZE || encoding === ENC_POINTER_POS) {
        if (encoding === ENC_DESKTOP_SIZE) ops.push({ kind: "resize", width, height });
        continue;
      }
      if (encoding === ENC_COPY_RECT) {
        ops.push({
          kind: "copy",
          x,
          y,
          width,
          height,
          srcX: await this.u16(),
          srcY: await this.u16(),
        });
        continue;
      }
      if (encoding === ENC_JPEG) {
        ops.push({ kind: "jpeg", x, y, width, height, jpeg: await this.readJpeg() });
        continue;
      }
      if (encoding === ENC_RAW) {
        const bpp = format.bitsPerPixel / 8;
        const raw = await this.readExact(width * height * bpp);
        ops.push({ kind: "raw", x, y, width, height, rgba: rawToRgba(raw, format) });
        continue;
      }
      if (encoding === ENC_CURSOR) {
        const bpp = format.bitsPerPixel / 8;
        await this.readExact(width * height * bpp);
        await this.readExact(height * Math.floor((width + 7) / 8));
        continue;
      }
      if (encoding === ENC_KINECT_H264) {
        await this.u8();
        await this.u32();
        await this.u16();
        const nal = await this.u32();
        if (nal > 8 * 1024 * 1024) throw new Error("Video frame is too large.");
        await this.readExact(nal);
        ops.push({ kind: "h264" });
        continue;
      }
      throw new Error(`This computer sent an encoding this phone cannot show (${encoding}).`);
    }
    return ops;
  }
}
