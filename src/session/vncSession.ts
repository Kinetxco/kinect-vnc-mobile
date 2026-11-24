import { ascii, decodeLatin1, decodeUtf8 } from "../protocol/bytes";
import {
  chatAckFrame,
  chatMessageFrame,
  chatText,
  decodeChatFrame,
  CHAT_KIND_MESSAGE,
} from "../protocol/chat";
import { HOST_ANNOUNCEMENT_PREFIX, parseHostAnnouncement, SESSION_ID_PREFIX } from "../protocol/names";
import {
  CLIENT_CHAT,
  CLIENT_PIXEL_FORMAT,
  DrawOp,
  SEC_NONE,
  SEC_VNC_AUTH,
  ServerReader,
  clientProtocolVersion,
  cutTextMessage,
  framebufferRequest,
  keyEvent,
  parsePixelFormat,
  pointerEvent,
  securityChoice,
  setEncodingsMessage,
  setPixelFormatMessage,
  unsupportedSecurityMessage,
  viewerEncodings,
} from "../protocol/rfb";
import { u32be } from "../protocol/bytes";
import { concatBytes } from "../protocol/bytes";
import { vncAuthResponse } from "../protocol/vncAuth";
import type { ByteStream } from "./stream";

export type SessionPhase = "connecting" | "authenticating" | "starting" | "connected";

export type SessionHandlers = {
  accountSession?: boolean;
  password?: string;
  chat?: boolean;
  onPhase?: (phase: SessionPhase) => void;
  onPassword?: () => Promise<string>;
  onDesktop?: (info: { width: number; height: number; name: string }) => void;
  onDraw?: (ops: DrawOp[]) => void;
  onClipboard?: (text: string) => void;
  onChat?: (text: string, mine: boolean) => void;
  onHost?: (info: { computer: string; hostname: string }) => void;
  onClose?: (message: string | null) => void;
};

export class VncSession {
  private reader = new ServerReader();
  private socket: ByteStream | null = null;
  private width = 0;
  private height = 0;
  private format = CLIENT_PIXEL_FORMAT;
  private viewOnly = false;
  private stopped = false;
  private chatSeq = 0;
  private handlers: SessionHandlers = {};

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  get isClosed(): boolean {
    return this.stopped;
  }

  setViewOnly(enabled: boolean): void {
    this.viewOnly = enabled;
  }

  async start(socket: ByteStream, handlers: SessionHandlers): Promise<void> {
    if (this.stopped) return;
    this.socket = socket;
    this.handlers = handlers;
    socket.onData((chunk) => this.reader.push(chunk));
    socket.onClose(() => this.fail("The computer closed the connection."));
    socket.onError((error) => this.fail(error.message));
    try {
      await this.handshake(handlers.password ?? "", Boolean(handlers.accountSession), Boolean(handlers.chat));
      this.handlers.onPhase?.("connected");
      await this.readLoop();
    } catch (error) {
      if (this.stopped) return;
      const message = error instanceof Error ? error.message : "The connection failed.";
      this.fail(message);
    }
  }

  private fail(message: string): void {
    if (this.stopped) return;
    this.stopped = true;
    this.reader.end();
    this.handlers.onClose?.(message);
    this.socket?.close();
  }

  pointer(x: number, y: number, mask: number): void {
    if (this.viewOnly || this.stopped) return;
    this.send(pointerEvent(x, y, mask));
  }

  key(keysym: number, down: boolean): void {
    if (this.viewOnly || this.stopped) return;
    this.send(keyEvent(keysym, down));
  }

  text(value: string): void {
    for (const char of value) {
      const keysym = char.codePointAt(0) ?? 0;
      const symbol = keysym >= 0x20 && keysym <= 0xff ? keysym : 0x01000000 + keysym;
      this.key(symbol, true);
      this.key(symbol, false);
    }
  }

  clipboard(text: string): void {
    if (this.stopped) return;
    this.send(cutTextMessage(text));
  }

  sendChat(text: string): void {
    const trimmed = text.replace(/\r\n/g, "\n").trim();
    if (!trimmed || this.stopped) return;
    this.chatSeq += 1;
    const frame = chatMessageFrame(trimmed, this.chatSeq);
    this.send(concatBytes([Uint8Array.of(CLIENT_CHAT), u32be(frame.length), frame]));
    this.handlers.onChat?.(trimmed, true);
  }

  refresh(): void {
    if (!this.width || !this.height) return;
    this.send(framebufferRequest(false, this.width, this.height));
  }

  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.reader.end();
    this.socket?.close();
  }

  private send(data: Uint8Array): void {
    this.socket?.write(data);
  }

  private async handshake(password: string, accountSession: boolean, chat: boolean): Promise<void> {
    this.handlers.onPhase?.("connecting");
    const versionBytes = await this.reader.readExact(12);
    const serverVersion = decodeLatin1(versionBytes);
    if (!serverVersion.startsWith("RFB ")) throw new Error("That address did not answer as a VNC computer.");
    const clientVersion = clientProtocolVersion(serverVersion);
    this.send(ascii(clientVersion));
    const legacy = clientVersion.startsWith("RFB 003.003");
    let selected = 0;
    if (legacy) {
      selected = await this.reader.u32();
      if (selected === 0) throw new Error(await this.readReason());
    } else {
      const count = await this.reader.u8();
      if (count === 0) throw new Error(await this.readReason());
      const types: number[] = [];
      for (let i = 0; i < count; i += 1) types.push(await this.reader.u8());
      selected = securityChoice(types, accountSession);
      if (!selected) {
        throw new Error(
          accountSession
            ? "This computer is on your account, so it opens with your sign-in. Update Kinect VNC Server on that computer."
            : unsupportedSecurityMessage(types[0] ?? 0)
        );
      }
      if (selected !== SEC_NONE && selected !== SEC_VNC_AUTH) {
        throw new Error(unsupportedSecurityMessage(selected));
      }
    }
    this.handlers.onPhase?.("authenticating");
    if (selected === SEC_VNC_AUTH && !password) {
      password = await this.askPassword();
    }
    if (!legacy) this.send(Uint8Array.of(selected));
    if (selected === SEC_VNC_AUTH) {
      if (!password) throw new Error("Password is required for VNC authentication");
      const challenge = await this.reader.readExact(16);
      this.send(vncAuthResponse(challenge, password));
    } else if (selected !== SEC_NONE) {
      throw new Error(unsupportedSecurityMessage(selected));
    }
    const result = await this.reader.u32();
    if (result !== 0) {
      let reason = "Authentication failed";
      try {
        reason = await this.readReason();
      } catch {
        // Some servers close immediately after a rejected password.
      }
      throw new Error(reason);
    }
    this.send(Uint8Array.of(1));
    this.width = await this.reader.u16();
    this.height = await this.reader.u16();
    this.format = parsePixelFormat(await this.reader.readExact(16));
    const nameLength = await this.reader.u32();
    if (nameLength > 1024 * 1024) throw new Error("The computer name is too large.");
    const name = decodeUtf8(await this.reader.readExact(nameLength));
    this.handlers.onDesktop?.({ width: this.width, height: this.height, name });
    this.format = CLIENT_PIXEL_FORMAT;
    this.handlers.onPhase?.("starting");
    this.send(setPixelFormatMessage(this.format));
    this.send(setEncodingsMessage(viewerEncodings(chat)));
    this.send(framebufferRequest(false, this.width, this.height));
  }

  private async askPassword(): Promise<string> {
    if (!this.handlers.onPassword) throw new Error("Password is required for VNC authentication");
    const password = await Promise.race([
      this.handlers.onPassword(),
      new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for the VNC password")), 60_000);
      }),
    ]);
    if (!password.trim()) throw new Error("Password is required for VNC authentication");
    return password;
  }

  private async readReason(): Promise<string> {
    const length = await this.reader.u32();
    if (!length) return "The computer rejected the connection.";
    if (length > 64 * 1024) return "The computer rejected the connection.";
    const text = decodeUtf8(await this.reader.readExact(length)).trim();
    return text || "The computer rejected the connection.";
  }

  private async readLoop(): Promise<void> {
    while (!this.stopped) {
      const message = await this.reader.readServerMessage(this.format);
      if (this.stopped) return;
      if (message.kind === "update") {
        let full = false;
        for (const op of message.ops) {
          if (op.kind === "resize" && op.width > 0 && op.height > 0) {
            this.width = op.width;
            this.height = op.height;
            full = true;
          }
        }
        this.handlers.onDraw?.(message.ops);
        if (this.width > 0 && this.height > 0) {
          this.send(framebufferRequest(!full, this.width, this.height));
        }
      } else if (message.kind === "clipboard") {
        this.takeClipboard(message.text);
      } else if (message.kind === "chat") {
        this.takeChat(message.frame);
      }
    }
  }

  private takeClipboard(text: string): void {
    if (text.startsWith(SESSION_ID_PREFIX)) return;
    if (text.startsWith(HOST_ANNOUNCEMENT_PREFIX)) {
      const host = parseHostAnnouncement(text.slice(HOST_ANNOUNCEMENT_PREFIX.length));
      if (host) this.handlers.onHost?.(host);
      return;
    }
    if (text) this.handlers.onClipboard?.(text);
  }

  private takeChat(bytes: Uint8Array): void {
    const frame = decodeChatFrame(bytes);
    if (!frame || frame.kind !== CHAT_KIND_MESSAGE) return;
    const text = chatText(frame);
    if (!text || frame.role === 1) return;
    const ack = chatAckFrame(frame.messageId, frame.serverSeq);
    this.send(concatBytes([Uint8Array.of(CLIENT_CHAT), u32be(ack.length), ack]));
    this.handlers.onChat?.(text, false);
  }
}
