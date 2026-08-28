import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * Password hashing, argon2id, at OWASP's recommended parameters
 * (m = 19 MiB, t = 3, p = 1). Measured at ~100ms per hash on this
 * machine — slow enough to matter to an attacker, fast enough not to be
 * its own denial-of-service surface.
 *
 * `hash-wasm` is used rather than a native binding deliberately: it needs
 * no compiler at install time, so a deploy cannot fail on a missing
 * build toolchain and quietly tempt someone into a weaker fallback.
 *
 * There is no "compare in constant time" helper here because there is no
 * place that compares hashes by hand — `argon2Verify` does it.
 */
@Injectable()
export class PasswordService {
  // OWASP Password Storage Cheat Sheet, Argon2id minimum configuration.
  private readonly memorySizeKib = 19_456;
  private readonly iterations = 3;
  private readonly parallelism = 1;

  async hash(plaintext: string): Promise<string> {
    return argon2id({
      password: plaintext,
      salt: randomBytes(16),
      memorySize: this.memorySizeKib,
      iterations: this.iterations,
      parallelism: this.parallelism,
      hashLength: 32,
      outputType: 'encoded',
    });
  }

  /**
   * Returns false rather than throwing for a malformed or absent hash: a
   * user row with no password_hash simply cannot authenticate, and that
   * is a normal outcome, not an error condition.
   */
  async verify(plaintext: string, encodedHash: string | null): Promise<boolean> {
    if (!encodedHash) return false;
    try {
      return await argon2Verify({ password: plaintext, hash: encodedHash });
    } catch {
      return false;
    }
  }
}
