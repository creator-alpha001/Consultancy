import { createHash } from 'crypto';

/**
 * The numeric identity the cloud recorder joins a room as.
 *
 * Kept outside the range `mediaUidFor` produces, so a participant can
 * never collide with the recorder.
 */
export const RECORDER_MEDIA_UID = 2_147_483_647;

/**
 * A stable numeric media identity for a user.
 *
 * Vendors that identify participants by integer need one per user. It is
 * derived rather than stored: deterministic, so a reconnect rejoins as the
 * same participant, and needing no column. Kept to 1..2^31-2 because the
 * Android SDK represents uids as a signed 32-bit int. A collision between
 * the two people in one session is roughly one in two billion, and would
 * surface as a join refusal rather than as one person hearing another's
 * room.
 */
export function mediaUidFor(userId: string): number {
  const n = createHash('sha256').update(userId).digest().readUInt32BE(0);
  return (n % (RECORDER_MEDIA_UID - 1)) + 1;
}
