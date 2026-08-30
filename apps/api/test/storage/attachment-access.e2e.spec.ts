import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AttachmentService, SIGNED_URL_TTL_SECONDS } from '../../src/common/storage/attachment.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedUsers } from '../test-utils';

/**
 * CLAUDE.md #29: "Uploads and documents are private: `attachment_grants`
 * only, signed URLs with 5-minute expiry, watermarked with viewer
 * identity."
 *
 * Each clause below is a test, because each is a rule that a later
 * convenience ("let admins see everything", "cache the link") would
 * quietly undo. The one clause NOT proven here is the watermark being
 * burned into the file — see the note in AttachmentService and D50.
 */
describe('private attachments and who may read them', () => {
  let app: INestApplication;
  let pool: Pool;
  let attachments: AttachmentService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([]);
      pool = app.get<Pool>(PG_POOL);
      attachments = app.get(AttachmentService);
    }
    await resetDatabase(pool);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  const pdf = Buffer.from('%PDF-1.4 a private answer script');

  async function upload(ownerId: string): Promise<string> {
    const row = await attachments.upload({
      ownerId,
      bytes: pdf,
      contentType: 'application/pdf',
      originalFilename: 'answer.pdf',
    });
    return row.id;
  }

  it('lets the owner read their own file, and refuses everyone else', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const id = await upload(seekerId);

    const link = await attachments.signedUrlFor(id, { id: seekerId, label: 'the owner' });
    const resolved = await attachments.resolveToken(id, new URL(`http://x${link.url}`).searchParams.get('token')!);
    expect(resolved.bytes.equals(pdf)).toBe(true);

    // No grant, no access — and the refusal is a 404, because
    // confirming the file exists is itself a disclosure.
    await expect(
      attachments.signedUrlFor(id, { id: providerId, label: 'a stranger' }),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
  });

  it('gives access only through a grant, and takes it back on revocation', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const id = await upload(seekerId);

    await attachments.grant({
      attachmentId: id,
      granteeId: providerId,
      grantedBy: seekerId,
      reason: 'engagement_submission:test',
    });
    const link = await attachments.signedUrlFor(id, { id: providerId, label: 'the assessor' });
    expect(link.url).toContain(id);

    await attachments.revoke(id, providerId, seekerId);
    await expect(
      attachments.signedUrlFor(id, { id: providerId, label: 'the assessor' }),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
  });

  it('refuses a link that was issued before access was revoked', async () => {
    // The rule this pins: the grant is checked when the link is
    // REDEEMED, not only when it was issued. Otherwise revoking access
    // leaves a working link in the world for up to five minutes — which
    // is exactly the window that matters when someone revokes in a
    // hurry.
    const { seekerId, providerId } = await seedUsers(pool);
    const id = await upload(seekerId);
    await attachments.grant({ attachmentId: id, granteeId: providerId, reason: 'review' });

    const link = await attachments.signedUrlFor(id, { id: providerId, label: 'the assessor' });
    const token = new URL(`http://x${link.url}`).searchParams.get('token')!;
    // Still valid at this point.
    expect((await attachments.resolveToken(id, token)).bytes.equals(pdf)).toBe(true);

    await attachments.revoke(id, providerId, seekerId);
    await expect(attachments.resolveToken(id, token)).rejects.toMatchObject({
      code: 'ATTACHMENT_NOT_FOUND',
    });
  });

  it('binds the link to one viewer — forwarding it does not work', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const third = await seedUsers(pool);
    const id = await upload(seekerId);
    await attachments.grant({ attachmentId: id, granteeId: providerId, reason: 'review' });
    // The third party even has their own grant; the point is that THIS
    // link is not theirs.
    await attachments.grant({ attachmentId: id, granteeId: third.providerId, reason: 'review' });

    const link = await attachments.signedUrlFor(id, { id: providerId, label: 'the assessor' });
    const token = new URL(`http://x${link.url}`).searchParams.get('token')!;

    const resolved = await attachments.resolveToken(id, token);
    // The token names who it was for, and that is who the access check
    // runs against — not whoever happens to present it.
    expect(resolved.viewerId).toBe(providerId);
    expect(resolved.viewerId).not.toBe(third.providerId);
  });

  it('expires in five minutes, and refuses a tampered or re-pointed token', async () => {
    const { seekerId } = await seedUsers(pool);
    const id = await upload(seekerId);
    const other = await upload(seekerId);

    const link = await attachments.signedUrlFor(id, { id: seekerId, label: 'owner' });
    expect(Math.round((link.expiresAt.getTime() - Date.now()) / 1000)).toBeCloseTo(SIGNED_URL_TTL_SECONDS, -1);

    const token = new URL(`http://x${link.url}`).searchParams.get('token')!;

    // A signature that is valid for one document must not serve another.
    await expect(attachments.resolveToken(other, token)).rejects.toMatchObject({
      code: 'ATTACHMENT_LINK_INVALID',
    });

    // Flipping a byte of the payload invalidates it — the MAC covers the
    // whole payload, viewer and expiry included.
    const [payload, mac] = token.split('.');
    const tampered = `${Buffer.from(
      Buffer.from(payload, 'base64url').toString('utf8').replace(/\.\d+$/, `.${Date.now() + 86_400_000}`),
      'utf8',
    ).toString('base64url')}.${mac}`;
    await expect(attachments.resolveToken(id, tampered)).rejects.toMatchObject({
      code: 'ATTACHMENT_LINK_INVALID',
    });
  });

  it('records who was handed a link, every time', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const id = await upload(seekerId);
    await attachments.grant({ attachmentId: id, granteeId: providerId, reason: 'credential_review:x' });

    await attachments.signedUrlFor(id, { id: providerId, label: 'reviewer' });
    await attachments.signedUrlFor(id, { id: providerId, label: 'reviewer' });

    // "Who looked at this document" cannot be reconstructed later if it
    // was never written down, and for a verification document it is the
    // question that gets asked.
    const log = await pool.query<{ actor_id: string; action: string }>(
      `SELECT actor_id, action FROM audit_log WHERE subject_type = 'attachment' AND subject_id = $1`,
      [id],
    );
    expect(log.rows.filter((r) => r.action === 'attachment.link_issued')).toHaveLength(2);
    expect(log.rows.every((r) => r.actor_id === providerId)).toBe(true);
  });

  it('refuses a file type that is not on the allow-list, and one over the size limit', async () => {
    const { seekerId } = await seedUsers(pool);

    await expect(
      attachments.upload({ ownerId: seekerId, bytes: pdf, contentType: 'text/html' }),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_TYPE_NOT_ALLOWED' });

    await expect(
      attachments.upload({
        ownerId: seekerId,
        bytes: Buffer.alloc(26 * 1024 * 1024),
        contentType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_TOO_LARGE' });
  });

  it('stores nothing at a key derivable from anything the caller knows', async () => {
    const { seekerId } = await seedUsers(pool);
    const row = await attachments.upload({
      ownerId: seekerId,
      bytes: pdf,
      contentType: 'application/pdf',
      originalFilename: 'answer.pdf',
    });
    const key = (
      await pool.query<{ storage_key: string }>(`SELECT storage_key FROM attachments WHERE id = $1`, [row.id])
    ).rows[0].storage_key;

    // The bucket is private, so a guessable key is not immediately a
    // breach — but it is one misconfiguration away from being the whole
    // breach at once, and every value below is one somebody else may
    // already hold. The id travels in URLs and logs; the hash is known
    // to anyone who has a copy of the file; the filename and owner are
    // known to the counterparty.
    for (const known of [row.id, row.sha256, 'answer.pdf', seekerId]) {
      expect(key).not.toContain(known);
    }

    // And two uploads of the identical file land in different places —
    // a content-addressed store would let one person's key be computed
    // by anyone holding the same document.
    const twin = await attachments.upload({ ownerId: seekerId, bytes: pdf, contentType: 'application/pdf' });
    const twinKey = (
      await pool.query<{ storage_key: string }>(`SELECT storage_key FROM attachments WHERE id = $1`, [twin.id])
    ).rows[0].storage_key;
    expect(twinKey).not.toBe(key);
  });
});
