import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Encryption at rest for second-factor secrets (TRACKER D18).
 *
 * A TOTP secret is a key that mints valid codes forever. Stored as plain
 * text, a database dump defeats #32 for every provider and admin at once.
 * Encrypted with a key the database never sees, the dump holds nothing
 * usable.
 *
 * **Format.** `v1:<keyId>:<base64url(iv ‖ tag ‖ ciphertext)>`, AES-256-GCM
 * with a random 12-byte IV. `keyId` is the first 8 hex characters of
 * SHA-256(key), so a value names the key that sealed it and rotation is
 * possible: set the new key as `MFA_ENCRYPTION_KEY` and the old one as
 * `MFA_ENCRYPTION_KEY_PREVIOUS`; values sealed with the old key still
 * open, and are re-sealed with the new one on the next successful use.
 *
 * **Keys.** Either 32 bytes as base64, or a passphrase of at least 32
 * characters (hashed with SHA-256 to 32 bytes). Where the key lives is an
 * ops decision — an environment variable filled from a secrets manager or
 * KMS is the expected shape; this code only needs the bytes.
 *
 * **Legacy values.** A value without the `v1:` prefix is a secret written
 * before this existed. It is still readable, and is re-sealed on its next
 * use when a key is configured, so no migration has to decrypt anything.
 */

interface Key {
  id: string;
  bytes: Buffer;
}

function parseKey(raw: string | undefined): Key | null {
  if (!raw) return null;
  let bytes: Buffer | null = null;
  const b64 = Buffer.from(raw, 'base64');
  if (/^[A-Za-z0-9+/=_-]+$/.test(raw) && b64.length === 32) bytes = b64;
  else if (raw.length >= 32) bytes = createHash('sha256').update(raw, 'utf8').digest();
  if (!bytes) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes as base64, or a passphrase of 32+ characters');
  return { id: createHash('sha256').update(bytes).digest('hex').slice(0, 8), bytes };
}

export class SecretBox {
  private readonly current: Key | null;
  private readonly previous: Key | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.current = parseKey(env.MFA_ENCRYPTION_KEY);
    this.previous = parseKey(env.MFA_ENCRYPTION_KEY_PREVIOUS);
    if (!this.current && env.NODE_ENV === 'production') {
      // Refused at boot rather than silently storing plain text: in
      // production an unencrypted second factor is the exact exposure
      // D18 describes.
      throw new Error('MFA_ENCRYPTION_KEY is required in production');
    }
  }

  get enabled(): boolean {
    return this.current !== null;
  }

  /** Seals a secret. Without a key (development only) the value is stored as written. */
  seal(plaintext: string): string {
    if (!this.current) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.current.bytes, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${this.current.id}:${Buffer.concat([iv, tag, ciphertext]).toString('base64url')}`;
  }

  /** Opens a sealed value, or returns a legacy plain value as it is. Throws if the sealing key is not available. */
  open(stored: string): string {
    if (!stored.startsWith('v1:')) return stored;
    const [, keyId, payload] = stored.split(':');
    const key = [this.current, this.previous].find((k) => k?.id === keyId);
    if (!key || !payload) throw new Error(`no key available to open a secret sealed with ${keyId}`);
    const raw = Buffer.from(payload, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key.bytes, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }

  /** Whether a stored value should be re-sealed: legacy plain text, or sealed with a key that is no longer current. */
  needsReseal(stored: string): boolean {
    if (!this.current) return false;
    if (!stored.startsWith('v1:')) return true;
    return stored.split(':')[1] !== this.current.id;
  }
}
