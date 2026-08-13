import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * AES-256-GCM encryption for secrets that must be stored (OAuth access/
 * refresh tokens in CloudConnection) rather than hashed — bcrypt-style
 * hashing (used for passwords) is irreversible and wrong here since the
 * app needs the plaintext token back to call Google/Dropbox APIs.
 *
 * Key source: TOKEN_ENCRYPTION_KEY (recommended: `openssl rand -base64 32`).
 * Falls back to a key derived from NEXTAUTH_SECRET so local dev never
 * blocks on a missing env var — production should set a dedicated key.
 */
function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY (or NEXTAUTH_SECRET as a fallback) must be set to store cloud OAuth tokens.");
  }
  // scrypt derives a stable 32-byte key from whatever string was provided,
  // so both a base64 random key and a plain passphrase work.
  return scryptSync(raw, "wmi-cloud-token-encryption", 32);
}

const IV_LENGTH = 12; // recommended for GCM

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload.");
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Signed, self-contained OAuth `state` payload — carries the wedding to
 * return to after the provider's consent screen, and is HMAC-signed so a
 * callback can't be forged with an arbitrary weddingId/organizationId
 * (CSRF / cross-tenant protection for the OAuth redirect).
 */
export function signOAuthState(payload: Record<string, string>): string {
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = process.env.NEXTAUTH_SECRET || "dev-secret";
  const sig = createHmac("sha256", secret).update(raw).digest("base64url");
  return `${raw}.${sig}`;
}

export function verifyOAuthState<T = Record<string, string>>(state: string): T | null {
  const [raw, sig] = state.split(".");
  if (!raw || !sig) return null;
  const secret = process.env.NEXTAUTH_SECRET || "dev-secret";
  const expected = createHmac("sha256", secret).update(raw).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
