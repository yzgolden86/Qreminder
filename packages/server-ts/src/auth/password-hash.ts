/**
 * Workers-friendly password hashing using Web Crypto PBKDF2.
 *
 * Web Crypto operations don't count against Cloudflare Workers CPU time limit,
 * unlike bcrypt which runs in the V8 isolate and easily exceeds the 10ms/50ms cap.
 *
 * Format: `pbkdf2:iterations:base64(salt):base64(hash)`
 * Backward-compatible verify: detects bcrypt hashes ($2a$/$2b$) and attempts
 * verification via the crypto module (best-effort, may still hit CPU limit on free tier).
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

function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

async function verifyBcrypt(password: string, hash: string): Promise<boolean> {
  try {
    const { compare } = await import("bcryptjs");
    return await compare(password, hash);
  } catch {
    return false;
  }
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const { hash, password } = data;

  if (hash.startsWith("pbkdf2:")) {
    const parts = hash.split(":");
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1]!, 10);
    const salt = fromBase64(parts[2]!);
    const storedHash = fromBase64(parts[3]!);
    const derived = new Uint8Array(await deriveKey(password, salt, iterations));
    return timingSafeEqual(derived, storedHash);
  }

  if (isBcryptHash(hash)) {
    return verifyBcrypt(password, hash);
  }

  return false;
}
