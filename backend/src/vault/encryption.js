import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive a 32-byte key from the master secret using PBKDF2.
 * @param {string} secret
 * @returns {Buffer}
 */
function deriveKey(secret) {
  return crypto.pbkdf2Sync(secret, "atp-vault-salt", 100_000, KEY_LENGTH, "sha256");
}

/**
 * Encrypt a string value using AES-256-GCM.
 * @param {string} plaintext
 * @param {string} secret  — master vault secret
 * @returns {string}       — hex-encoded iv:tag:ciphertext
 */
export function encrypt(plaintext, secret) {
  const key = deriveKey(secret);
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypt a value produced by encrypt().
 * @param {string} encoded  — hex iv:tag:ciphertext
 * @param {string} secret
 * @returns {string}        — original plaintext
 */
export function decrypt(encoded, secret) {
  const [ivHex, tagHex, dataHex] = encoded.split(":");
  const key = deriveKey(secret);
  const iv  = Buffer.from(ivHex,  "hex");
  const tag  = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
