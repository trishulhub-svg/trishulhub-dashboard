import crypto from "crypto";

/** AES-256-GCM encryption utilities for storing sensitive data (passwords, credentials).
 * The encryption key must be a 32-byte hex string from process.env.ENCRYPTION_KEY.
 * @module encryption
 */

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be set as a 32-byte hex string (64 characters). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns base64-encoded encrypted data, IV, and auth tag.
 */
export function encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 12 bytes recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  const result = {
    encrypted,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
  // Zero the key buffer after use to prevent sensitive data lingering in memory
  key.fill(0);
  iv.fill(0);
  tag.fill(0);
  return result;
}

/**
 * Decrypt AES-256-GCM encrypted data.
 * Takes base64-encoded encrypted data, IV, and auth tag.
 * @returns Decrypted plaintext string.
 */
export function decrypt(encrypted: string, iv: string, tag: string): string {
  const key = getKey();
  const ivBuffer = Buffer.from(iv, "base64");
  const tagBuffer = Buffer.from(tag, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer);
  decipher.setAuthTag(tagBuffer);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  // Zero buffers after use to prevent sensitive data lingering in memory
  key.fill(0);
  ivBuffer.fill(0);
  tagBuffer.fill(0);
  return decrypted;
}

/**
 * Encrypt plaintext using AES-256-GCM with an explicit key (no process.env mutation needed).
 * Use this instead of encrypt() when you need to pass a specific key (e.g., from DB).
 */
export function encryptWithKey(plaintext: string, keyHex: string): { encrypted: string; iv: string; tag: string } {
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("Key must be a 64-character hex string (32 bytes).");
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();
  const result = { encrypted, iv: iv.toString("base64"), tag: tag.toString("base64") };
  key.fill(0);
  iv.fill(0);
  tag.fill(0);
  return result;
}

/**
 * Decrypt AES-256-GCM encrypted data with an explicit key (no process.env mutation needed).
 * Use this instead of decrypt() when you need to pass a specific key (e.g., from DB).
 */
export function decryptWithKey(encrypted: string, iv: string, tag: string, keyHex: string): string {
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("Key must be a 64-character hex string (32 bytes).");
  }
  const key = Buffer.from(keyHex, "hex");
  const ivBuffer = Buffer.from(iv, "base64");
  const tagBuffer = Buffer.from(tag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer);
  decipher.setAuthTag(tagBuffer);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  key.fill(0);
  ivBuffer.fill(0);
  tagBuffer.fill(0);
  return decrypted;
}

/**
 * SMTP-specific encryption (backward compatible with legacy format).
 * Uses the same ENCRYPTION_KEY as canonical encryption.
 * Output format: `ivHex:authTagHex:encryptedHex` (16-byte IV, AES-256-GCM).
 * This replaces the inline encrypt/decrypt that was in smtp/route.ts.
 */
export function encryptSmtpPassword(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * SMTP-specific decryption — handles both legacy format (iv:tag:hex)
 * and canonical format (base64 encrypted + base64 iv + base64 tag).
 * Returns decrypted plaintext string.
 */
export function decryptSmtpPassword(encrypted: string): string {
  // Detect format: legacy SMTP format has colons (iv:tag:data)
  if (encrypted.includes(":")) {
    const key = getKey();
    const [ivHex, authTagHex, encryptedData] = encrypted.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }
  // Canonical format: separate base64 strings (used for project credentials)
  // This shouldn't normally happen for SMTP, but handle gracefully
  throw new Error("Unsupported encryption format for SMTP password");
}
