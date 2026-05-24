/**
 * 客户端 AES-GCM 加密工具（用户主密钥派生）。
 *
 * 设计要点：
 * - 服务端**永远拿不到**主密钥；密钥仅存在浏览器 sessionStorage（关浏览器即失效）。
 * - 加密产物用 `enc:v1:<base64-iv>:<base64-ciphertext>` 前缀标记，渲染层可识别。
 * - 派生用 PBKDF2 + 100k 轮 + 用户独立 salt（来自 settings JSON），符合 OWASP 推荐。
 * - 用 AES-256-GCM（含认证标签），防止密文被改还能"成功解密"成乱码的情况。
 *
 * 不保证的事：
 * - 服务端 / 备份链路里看到的就是密文；丢主密钥 = 数据彻底丢失。
 * - 这不替代 HTTPS / 后端鉴权；只是给"如果数据库泄露，密码字段不应明文"的额外防护。
 */

const ENC_PREFIX = "enc:v1:";

/** 判断一个字符串是否是加密后的密文。 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(ENC_PREFIX);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  // Allocate a dedicated ArrayBuffer (not the shared one Uint8Array may default
  // to in some lib targets) so the Uint8Array is assignable to BufferSource
  // under TypeScript's stricter DOM lib.
  const buf = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function makeBuffer(bytes: Uint8Array): ArrayBuffer {
  // Copy into a fresh ArrayBuffer to satisfy lib.dom's BufferSource definition
  // when the input might be backed by SharedArrayBuffer.
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/**
 * Derive an AES-GCM key from a user-supplied master password + user-specific salt.
 * Salt should be stable per user (stored in settings JSON) so the same master
 * password always derives the same key.
 */
export async function deriveKey(masterPassword: string, saltBase64: string): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(masterPassword);
  const saltBytes = base64ToBytes(saltBase64);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    makeBuffer(passwordBytes),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: makeBuffer(saltBytes), iterations: 100_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: makeBuffer(ivBytes) },
    key,
    makeBuffer(new TextEncoder().encode(plaintext)),
  );
  return `${ENC_PREFIX}${bytesToBase64(ivBytes)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decrypt(ciphertextWithPrefix: string, key: CryptoKey): Promise<string> {
  if (!isEncrypted(ciphertextWithPrefix)) return ciphertextWithPrefix;
  const payload = ciphertextWithPrefix.slice(ENC_PREFIX.length);
  const [ivB64, ctB64] = payload.split(":");
  if (!ivB64 || !ctB64) throw new Error("malformed ciphertext");
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ctB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: makeBuffer(iv) },
    key,
    makeBuffer(ct),
  );
  return new TextDecoder().decode(plaintext);
}

/** Generate a fresh per-user salt (16 random bytes, base64). One-time setup. */
export function generateSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}
