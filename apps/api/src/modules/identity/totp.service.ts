import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, no padding — what every authenticator app expects. */
function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * TOTP (RFC 6238), HMAC-SHA1, 6 digits, 30-second steps — the
 * interoperable defaults every authenticator app implements. Built on
 * node:crypto rather than a dependency: the algorithm is thirty lines and
 * a supply-chain surface on the 2FA path is a poor trade.
 *
 * CLAUDE.md #32 makes this mandatory for provider and admin accounts, and
 * 0026's trigger is what actually refuses a session without it.
 */
@Injectable()
export class TotpService {
  private readonly digits = 6;
  private readonly stepSeconds = 30;
  /** Accept the adjacent steps too: phone clocks drift, and locking a mentor out over 20 seconds of skew is its own failure. */
  private readonly windowSteps = 1;

  /** 20 bytes = 160 bits, the RFC 4226 recommendation. */
  generateSecret(): string {
    return base32Encode(randomBytes(20));
  }

  /** The `otpauth://` URI an authenticator app scans. Contains the secret — never log it. */
  provisioningUri(secret: string, accountLabel: string, issuer: string): string {
    const label = encodeURIComponent(`${issuer}:${accountLabel}`);
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(this.digits),
      period: String(this.stepSeconds),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  codeAt(secret: string, atMs: number = Date.now()): string {
    const counter = Math.floor(atMs / 1000 / this.stepSeconds);
    return this.hotp(secret, counter);
  }

  /**
   * Constant-time comparison against each accepted step, and the loop is
   * deliberately not short-circuited on a match: bailing early would leak
   * *which* step matched through timing.
   */
  verify(secret: string, code: string, atMs: number = Date.now()): boolean {
    const submitted = code.replace(/\s/g, '');
    if (!/^\d+$/.test(submitted) || submitted.length !== this.digits) return false;

    const counter = Math.floor(atMs / 1000 / this.stepSeconds);
    let matched = false;
    for (let offset = -this.windowSteps; offset <= this.windowSteps; offset++) {
      const expected = this.hotp(secret, counter + offset);
      const a = Buffer.from(expected);
      const b = Buffer.from(submitted);
      if (a.length === b.length && timingSafeEqual(a, b)) matched = true;
    }
    return matched;
  }

  private hotp(secret: string, counter: number): string {
    const key = base32Decode(secret);
    const counterBuf = Buffer.alloc(8);
    // Counter is a 64-bit big-endian integer; well within Number's safe
    // range for any date this platform will see.
    counterBuf.writeBigUInt64BE(BigInt(counter));

    const digest = createHmac('sha1', key).update(counterBuf).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    return String(binary % 10 ** this.digits).padStart(this.digits, '0');
  }
}
