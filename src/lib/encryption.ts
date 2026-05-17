import crypto from "crypto";

/**
 * AES-256-GCM encryption utilities for storing sensitive data (passwords, credentials).
 * The encryption key must be a 32-byte hex string from process.env.ENCRYPTION_KEY.
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

  return {
    encrypted,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypt AES-256-GCM encrypted data.
 * Takes base64-encoded encrypted data, IV, and auth tag.
 */
export function decrypt(encrypted: string, iv: string, tag: string): string {
  const key = getKey();
  const ivBuffer = Buffer.from(iv, "base64");
  const tagBuffer = Buffer.from(tag, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer);
  decipher.setAuthTag(tagBuffer);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
