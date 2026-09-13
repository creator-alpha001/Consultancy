import { createHash, createHmac, randomBytes } from 'crypto';

export type AccountTokenPurpose = 'password_reset' | 'email_verification';

/**
 * Emailed single-use tokens, derived rather than stored.
 *
 * The token is HMAC(secret, purpose:rowId). The database keeps only a
 * SHA-256 of it (`account_tokens.token_hash`), and the email is composed
 * at SEND time by deriving the token again from the row id — so the
 * token never sits in `outbox.payload`, in a log, or anywhere else a
 * database dump would reach. Without `ACCOUNT_TOKEN_SECRET` nobody can
 * turn a row into a working link.
 *
 * An unset secret falls back to a per-process random key, the same
 * choice `AttachmentService` makes: links break on restart, which
 * someone notices, rather than being signed with a default anyone
 * reading this repository could forge.
 */
const processFallbackSecret = randomBytes(32);

function secret(): Buffer {
  const configured = process.env.ACCOUNT_TOKEN_SECRET;
  return configured && configured.length >= 32 ? Buffer.from(configured, 'utf8') : processFallbackSecret;
}

export function deriveAccountToken(purpose: AccountTokenPurpose, rowId: string): string {
  return createHmac('sha256', secret()).update(`${purpose}:${rowId}`).digest('base64url');
}

export function hashAccountToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

