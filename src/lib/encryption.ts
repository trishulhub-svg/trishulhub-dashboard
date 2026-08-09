import crypto from "crypto";

/** AES-256-GCM encryption utilities for storing sensitive data (passwords, credentials).
 * Preferred key: process.env.ENCRYPTION_KEY (64-char hex).
 * Fallback: derive from NEXTAUTH_SECRET so Drive OAuth / vault can still save
 * when ENCRYPTION_KEY is missing or invalid on the host.
 * @module encryption
 */

let warnedDerivedKey = false

function normalizeHexKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const key = raw.trim().replace(/^["']|["']$/g, "")
  if (!/^[0-9a-fA-F]{64}$/.test(key)) return null
  return key
}

/** True when ENCRYPTION_KEY is a valid 64-char hex string (preferred). */
export function hasDedicatedEncryptionKey(): boolean {
  return Boolean(normalizeHexKey(process.env.ENCRYPTION_KEY))
}

/** True when encrypt/decrypt can run (dedicated key or NEXTAUTH_SECRET fallback). */
export function isEncryptionConfigured(): boolean {
  if (hasDedicatedEncryptionKey()) return true
  const secret = process.env.NEXTAUTH_SECRET?.trim()
  return Boolean(secret && secret.length >= 16)
}

function getKey(): Buffer {
  const dedicated = normalizeHexKey(process.env.ENCRYPTION_KEY)
  if (dedicated) {
    return Buffer.from(dedicated, "hex")
  }

  const secret = process.env.NEXTAUTH_SECRET?.trim()
  if (secret && secret.length >= 16) {
    if (!warnedDerivedKey) {
      console.warn(
        "[encryption] ENCRYPTION_KEY missing/invalid — deriving AES-256 key from NEXTAUTH_SECRET. " +
          "Set ENCRYPTION_KEY to a 64-char hex string on Vercel for a dedicated key."
      )
      warnedDerivedKey = true
    }
    return crypto.createHash("sha256").update(`trishulhub:aes256:${secret}`).digest()
  }

  throw new Error(
    "ENCRYPTION_KEY must be set as a 32-byte hex string (64 characters). " +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  )
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

// ━━ Project Credential Encryption (separate key from SMTP/Git) ━━

/**
 * Get the credential encryption key.
 * Priority: explicit dbKey param > CREDENTIAL_ENCRYPTION_KEY env > ENCRYPTION_KEY env
 * @throws Error if no valid key is found
 */
export function getCredentialKey(dbKey?: string): Buffer {
  // 1. DB-stored key (from AppSetting table, managed via Access Hub)
  if (dbKey && dbKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(dbKey)) {
    return Buffer.from(dbKey, "hex");
  }
  // 2. Dedicated env var (optional, set in Vercel)
  const credEnvKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (credEnvKey && credEnvKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(credEnvKey)) {
    return Buffer.from(credEnvKey, "hex");
  }
  // 3. Fallback to general ENCRYPTION_KEY
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, "hex");
  }
  throw new Error(
    "No credential encryption key configured. " +
    "Set CREDENTIAL_ENCRYPTION_KEY (or ENCRYPTION_KEY) as a 64-char hex env var."
  );
}

/**
 * Encrypt a project credential password.
 * Uses a separate key from SMTP/Git encryption.
 */
export function encryptCredential(plaintext: string, dbKey?: string): { encrypted: string; iv: string; tag: string } {
  const key = getCredentialKey(dbKey);
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
 * Decrypt a project credential password.
 * Uses a separate key from SMTP/Git encryption.
 */
export function decryptCredential(encrypted: string, iv: string, tag: string, dbKey?: string): string {
  const key = getCredentialKey(dbKey);
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

// ━━ JSON-envelope helpers ━━
// These wrap encrypt()/decrypt() (and encryptCredential()/decryptCredential())
// so the encrypted payload (enc + iv + tag) can be stored in a single DB column
// as a JSON string. This avoids needing schema migrations for keyValue.
//
// Stored format: `{"enc":"...","iv":"...","tag":"..."}`
//
// Backward compat: decryptFromJson() and decryptCredentialFromJson() gracefully
// handle legacy plaintext values — if the stored string is not valid JSON in
// the envelope shape, it is returned as-is.

interface EncryptedEnvelope {
  enc: string;
  iv: string;
  tag: string;
}

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EncryptedEnvelope).enc === "string" &&
    typeof (value as EncryptedEnvelope).iv === "string" &&
    typeof (value as EncryptedEnvelope).tag === "string"
  );
}

/**
 * Encrypt plaintext and return a JSON envelope string `{"enc","iv","tag"}`.
 * Uses the general ENCRYPTION_KEY env var (via encrypt()).
 * Store this string directly in a DB text column.
 */
export function encryptToJson(plaintext: string): string {
  const { encrypted, iv, tag } = encrypt(plaintext);
  return JSON.stringify({ enc: encrypted, iv, tag });
}

/**
 * Decrypt a value that may be in JSON envelope form (encrypted with encryptToJson)
 * OR a legacy plaintext string. Returns the plaintext.
 *
 * - Empty string → empty string
 * - JSON envelope `{"enc","iv","tag"}` → decrypted plaintext
 * - Anything else (legacy plaintext) → returned as-is
 */
export function decryptFromJson(stored: string): string {
  if (!stored) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    // Not JSON — it's a legacy plaintext value, return as-is
    return stored;
  }
  // It IS valid JSON — check if it's an encrypted envelope
  if (isEncryptedEnvelope(parsed)) {
    // It's an encrypted envelope — decrypt it
    // If decryption fails, return empty string (NOT the raw envelope)
    // because sending the raw envelope as an API key would cause auth failures
    try {
      return decrypt((parsed as { enc: string; iv: string; tag: string }).enc, (parsed as { enc: string; iv: string; tag: string }).iv, (parsed as { enc: string; iv: string; tag: string }).tag);
    } catch (e) {
      console.error("[encryption] decryptFromJson: decryption failed — returning empty string to avoid sending garbage as API key:", e instanceof Error ? e.message : e);
      return "";
    }
  }
  // Valid JSON but not an envelope — treat as legacy plaintext
  return stored;
}

/**
 * Encrypt plaintext using the credential key (CREDENTIAL_ENCRYPTION_KEY env or
 * DB-stored key) and return a JSON envelope string.
 */
export function encryptCredentialToJson(plaintext: string, dbKey?: string): string {
  const { encrypted, iv, tag } = encryptCredential(plaintext, dbKey);
  return JSON.stringify({ enc: encrypted, iv, tag });
}

/**
 * Decrypt a value that may be in JSON envelope form (encrypted with
 * encryptCredentialToJson) OR a legacy plaintext string.
 * Uses the credential key.
 */
export function decryptCredentialFromJson(stored: string, dbKey?: string): string {
  if (!stored) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    // Not JSON — it's a legacy plaintext value, return as-is
    return stored;
  }
  if (isEncryptedEnvelope(parsed)) {
    try {
      return decryptCredential((parsed as { enc: string; iv: string; tag: string }).enc, (parsed as { enc: string; iv: string; tag: string }).iv, (parsed as { enc: string; iv: string; tag: string }).tag, dbKey);
    } catch (e) {
      console.error("[encryption] decryptCredentialFromJson: decryption failed — returning empty string:", e instanceof Error ? e.message : e);
      return "";
    }
  }
  return stored;
}
