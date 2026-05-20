/**
 * Workers-friendly password hashing using Web Crypto PBKDF2.
 *
 * Why PBKDF2 (not Better Auth's default scrypt or bcrypt):
 *   - bcrypt and pure-JS scrypt run in the V8 isolate and easily exceed the
 *     Workers CPU time limit (10ms free / 50ms paid), causing sign-in to fail
 *     with "Worker exceeded CPU time limit".
 *   - Web Crypto's PBKDF2 is implemented natively by the runtime and does NOT
 *     count against Workers CPU time, so it scales to 100k iterations safely.
 *
 * Format: `pbkdf2:iterations:base64(salt):base64(hash)`
 *
 * Legacy scrypt hashes (Better Auth default, format `hex(salt):hex(key)`) are
 * NOT verifiable here. The bootstrap migration resets the default admin's
 * scrypt hash to PBKDF2; other users with legacy hashes need an admin password
 * reset or a forgot-password flow.
 */

const ALGORITHM = "PBKDF2";
const HASH_FUNCTION = "SHA-256";
const ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: ALGORITHM, salt: salt.buffer as ArrayBuffer, iterations, hash: HASH_FUNCTION },
    keyMaterial,
    KEY_LENGTH * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveKey(password, salt, ITERATIONS);
  return `pbkdf2:${ITERATIONS}:${toBase64(salt.buffer as ArrayBuffer)}:${toBase64(hash)}`;
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const { hash, password } = data;

  if (!hash.startsWith("pbkdf2:")) return false;

  const parts = hash.split(":");
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1]!, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = fromBase64(parts[2]!);
  const storedHash = fromBase64(parts[3]!);
  const derived = new Uint8Array(await deriveKey(password, salt, iterations));
  return timingSafeEqual(derived, storedHash);
}
