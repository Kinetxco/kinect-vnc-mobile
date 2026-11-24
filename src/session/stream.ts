export interface ByteStream {
  write(data: Uint8Array): void;
  close(): void;
  onData(listener: (chunk: Uint8Array) => void): void;
  onClose(listener: () => void): void;
  onError(listener: (error: Error) => void): void;
}

export function bytesFromData(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (typeof data === "string") return Uint8Array.from(data, (char) => char.charCodeAt(0) & 0xff);
  if (data && typeof data === "object" && "buffer" in data) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return new Uint8Array();
}
