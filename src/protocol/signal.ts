import { concatBytes, decodeUtf8, readU32, u32be, utf8 } from "./bytes";

export const SIGNAL_HOST = "kinectvnc.com";
export const SIGNAL_PORT = 2053;
export const WEBSITE_URL = "https://kinectvnc.com";
export const MAX_SIGNAL_FRAME = 64 * 1024;

export type SignalHello = {
  role: "viewer_control" | "viewer_data";
  userJwt?: string;
  sessionId?: string;
  sessionToken?: string;
};

export function signalFrame(value: unknown): Uint8Array {
  const body = utf8(JSON.stringify(value));
  if (body.length > MAX_SIGNAL_FRAME) throw new Error("signal frame too large");
  return concatBytes([u32be(body.length), body]);
}

export function helloFrame(hello: SignalHello): Uint8Array {
  const body: Record<string, unknown> = { v: 1, role: hello.role };
  if (hello.userJwt) body.user_jwt = hello.userJwt;
  if (hello.sessionId) body.session_id = hello.sessionId;
  if (hello.sessionToken) body.session_token = hello.sessionToken;
  return signalFrame(body);
}

export class SignalBuffer {
  private chunks: Uint8Array[] = [];
  private offset = 0;

  push(chunk: Uint8Array): void {
    if (chunk.length) this.chunks.push(chunk);
  }

  private available(): number {
    return this.chunks.reduce((sum, chunk) => sum + chunk.length, 0) - this.offset;
  }

  take(n: number): Uint8Array | null {
    if (this.available() < n) return null;
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

  nextFrame(): unknown | null {
    const header = this.peek(4);
    if (!header) return null;
    const length = readU32(header, 0);
    if (length === 0 || length > MAX_SIGNAL_FRAME) throw new Error(`invalid signal frame length ${length}`);
    if (this.available() < 4 + length) return null;
    this.take(4);
    const body = this.take(length);
    if (!body) return null;
    return JSON.parse(decodeUtf8(body));
  }

  private peek(n: number): Uint8Array | null {
    if (this.available() < n) return null;
    const out = new Uint8Array(n);
    let filled = 0;
    let index = 0;
    let offset = this.offset;
    while (filled < n) {
      const chunk = this.chunks[index];
      const take = Math.min(chunk.length - offset, n - filled);
      out.set(chunk.subarray(offset, offset + take), filled);
      filled += take;
      index += 1;
      offset = 0;
    }
    return out;
  }

  drain(): Uint8Array {
    if (this.chunks.length === 0) return new Uint8Array();
    const parts = [this.chunks[0].subarray(this.offset), ...this.chunks.slice(1)];
    this.chunks = [];
    this.offset = 0;
    return concatBytes(parts);
  }
}
