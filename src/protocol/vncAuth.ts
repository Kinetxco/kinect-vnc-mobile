import { desEncryptBlock, reverseBits } from "./des";

/** VNC auth: DES-ECB of the 16-byte challenge, with each key byte bit-reversed. */
export function vncAuthResponse(challenge: Uint8Array, password: string): Uint8Array {
  if (challenge.length !== 16) throw new Error("VNC challenge must be 16 bytes");
  const key = new Uint8Array(8);
  const passwordBytes = new TextEncoder().encode(password);
  for (let i = 0; i < 8 && i < passwordBytes.length; i += 1) key[i] = passwordBytes[i];
  for (let i = 0; i < 8; i += 1) key[i] = reverseBits(key[i]);
  const out = new Uint8Array(16);
  out.set(desEncryptBlock(key, challenge.subarray(0, 8)), 0);
  out.set(desEncryptBlock(key, challenge.subarray(8, 16)), 8);
  return out;
}
