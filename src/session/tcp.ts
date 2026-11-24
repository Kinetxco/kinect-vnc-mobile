import { Buffer } from "buffer";
import type { ByteStream } from "./stream";
import { bytesFromData } from "./stream";

type TcpSocket = {
  write: (data: Uint8Array | Buffer) => void;
  destroy: () => void;
  on: (event: string, listener: (value?: unknown) => void) => void;
};

type TcpFactory = {
  createConnection: (
    options: {
      host: string;
      port: number;
      tls?: boolean;
      tlsCheckValidity?: boolean;
    },
    callback: () => void
  ) => TcpSocket;
};

function factory(): TcpFactory {
  let loaded: { default?: TcpFactory } & TcpFactory;
  try {
    loaded = require("react-native-tcp-socket") as { default?: TcpFactory } & TcpFactory;
  } catch {
    throw new Error(
      "This install cannot open a network socket. Run npx expo run:android or npx expo run:ios to build Kinect VNC."
    );
  }
  const candidate = loaded.default ?? loaded;
  if (typeof candidate.createConnection !== "function") {
    throw new Error(
      "This install cannot open a network socket. Run npx expo run:android or npx expo run:ios to build Kinect VNC."
    );
  }
  return candidate;
}

export function openTcp(options: { host: string; port: number; tls: boolean }): Promise<ByteStream> {
  const { host, port, tls } = options;
  const tcp = factory();
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: TcpSocket;
    try {
      socket = tcp.createConnection(
        {
          host,
          port,
          tls,
          tlsCheckValidity: tls,
        },
        () => {
          settled = true;
          resolve(wrap(socket));
        }
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Could not open the connection."));
      return;
    }
    socket.on("error", (value) => {
      const error = value instanceof Error ? value : new Error(String(value ?? "Connection failed"));
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function wrap(socket: TcpSocket): ByteStream {
  const data: Array<(chunk: Uint8Array) => void> = [];
  const closers: Array<() => void> = [];
  const errors: Array<(error: Error) => void> = [];
  socket.on("data", (value) => {
    const chunk = bytesFromData(value);
    for (const listener of data) listener(chunk);
  });
  socket.on("close", () => {
    for (const listener of closers) listener();
  });
  socket.on("error", (value) => {
    const error = value instanceof Error ? value : new Error(String(value ?? "Connection failed"));
    for (const listener of errors) listener(error);
  });
  return {
    write: (chunk) => socket.write(Buffer.from(chunk)),
    close: () => socket.destroy(),
    onData: (listener) => data.push(listener),
    onClose: (listener) => closers.push(listener),
    onError: (listener) => errors.push(listener),
  };
}
