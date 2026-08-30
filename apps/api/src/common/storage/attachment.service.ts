import { Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AuditService } from '../audit/audit.service';
import {
  attachmentAccessDenied,
  attachmentGrantToOwner,
  attachmentLinkExpired,
  attachmentLinkInvalid,
  attachmentNotFound,
  attachmentTooLarge,
  attachmentTypeNotAllowed,
} from './errors';
import { OBJECT_STORAGE, ObjectStorage } from './object-storage.interface';

/** CLAUDE.md #29 says five minutes. It is not a tuning parameter. */
export const SIGNED_URL_TTL_SECONDS = 300;

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * What may be uploaded. An allow-list, never a block-list: a block-list
 * is a promise to have thought of everything.
 */
const ALLOWED_TYPES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
];

export interface AttachmentRow {
  id: string;
  ownerId: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string | null;
  createdAt: Date;
}

interface AttachmentDbRow {
  id: string;
  owner_id: string;
  storage_key: string;
  content_type: string;
  byte_size: string;
  sha256: string;
  original_filename: string | null;
  created_at: Date;
}

function mapAttachment(row: AttachmentDbRow): AttachmentRow {
  return {
    id: row.id,
    ownerId: row.owner_id,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    originalFilename: row.original_filename,
    createdAt: row.created_at,
  };
}

export interface SignedLink {
  url: string;
  expiresAt: Date;
  /** Rendered over the document by a viewer that can. See the note on watermarking. */
  watermark: string;
}

/**
 * Private uploads and who may read them (CLAUDE.md #29, #30).
 *
 * Three rules, none of which is negotiable and all of which are checked
 * on every read rather than at issue time only:
 *
 * 1. **`attachment_grants` only.** The owner, or someone holding a live
 *    grant. There is no public flag, no "unlisted" mode, and no
 *    membership shortcut — a reviewer sees a credential document because
 *    a grant says so, not because they are an admin.
 * 2. **Signed URLs expire in five minutes**, and are bound to the person
 *    they were issued to. A link forwarded to someone else does not
 *    work for them even inside those five minutes: the viewer is inside
 *    the signature.
 * 3. **The grant is re-checked when the link is redeemed**, not only
 *    when it was issued. Otherwise revoking access would leave a working
 *    link in the world for up to five minutes — which is exactly the
 *    window that matters when access is revoked in a hurry.
 *
 * Every issued link is audit-logged with the viewer, because "who looked
 * at this document" is the question that gets asked after something goes
 * wrong, and it cannot be answered retrospectively.
 *
 * **On watermarking.** #29 also asks for the viewer's identity to be
 * watermarked into what they see. The identity binding is done here and
 * `watermark` carries the text to stamp, but nothing in this service
 * re-renders a PDF or an image to burn it in — that needs a render step
 * per content type. Recorded in TRACKER.md rather than quietly treated
 * as done: a screenshot of a document served by this code is not yet
 * traceable to the viewer by looking at it.
 */
@Injectable()
export class AttachmentService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * The key that signs download links.
   *
   * Read at call time rather than cached in a field so a deployment that
   * sets it after import order still gets it. Falls back to a random
   * per-process value, which fails closed in the way you want: links
   * stop working across a restart instead of being signed by a
   * well-known constant.
   */
  private signingKey(): Buffer {
    const configured = process.env.ATTACHMENT_SIGNING_KEY;
    if (configured && configured.length >= 16) return Buffer.from(configured, 'utf8');
    return processFallbackKey;
  }

  async upload(input: {
    ownerId: string;
    bytes: Buffer;
    contentType: string;
    originalFilename?: string;
  }): Promise<AttachmentRow> {
    if (input.bytes.byteLength > MAX_BYTES) throw attachmentTooLarge(input.bytes.byteLength, MAX_BYTES);
    if (!ALLOWED_TYPES.includes(input.contentType)) {
      throw attachmentTypeNotAllowed(input.contentType, [...ALLOWED_TYPES]);
    }

    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    // Random, not derived from the id or the hash: a key anyone can
    // compute from something they already know is not a private key.
    const storageKey = `${new Date().toISOString().slice(0, 10)}/${randomBytes(24).toString('hex')}`;

    await this.storage.put(storageKey, input.bytes, input.contentType);

    try {
      const res = await this.pool.query<AttachmentDbRow>(
        `INSERT INTO attachments (owner_id, storage_key, content_type, byte_size, sha256, original_filename)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.ownerId,
          storageKey,
          input.contentType,
          input.bytes.byteLength,
          sha256,
          input.originalFilename ?? null,
        ],
      );
      return mapAttachment(res.rows[0]);
    } catch (err) {
      // The row is the record; an object with no row is unreachable
      // rubbish holding someone's document. Clean it up.
      await this.storage.remove(storageKey).catch(() => undefined);
      throw err;
    }
  }

  async get(id: string): Promise<AttachmentRow> {
    const res = await this.pool.query<AttachmentDbRow>(`SELECT * FROM attachments WHERE id = $1`, [id]);
    if (!res.rows[0]) throw attachmentNotFound(id);
    return mapAttachment(res.rows[0]);
  }

  /**
   * Gives one person access to one attachment.
   *
   * **A person can only share what they can already read.** Without that
   * check, any caller who learned an attachment id could mint a grant on
   * a stranger's document for a confederate — every route that reaches
   * here takes the id from a request body, and authorising the *caller*
   * (as the engagement's seeker, as a session participant) says nothing
   * about the *file* they named. The check lives here rather than at
   * each call site so that a future third caller is covered by
   * construction.
   *
   * `grantedBy: null` is the platform granting as part of a workflow —
   * a credential going to whichever reviewer picks it up — and is
   * reachable only from admin-gated routes.
   *
   * `client` lets a caller do this inside its own transaction, so there
   * is never a submitted document nobody can open.
   */
  async grant(
    input: {
      attachmentId: string;
      granteeId: string;
      grantedBy?: string | null;
      reason: string;
      expiresAt?: Date | null;
    },
    client?: PoolClient,
  ): Promise<void> {
    const q = client ?? this.pool;
    const owner = await q.query<{ owner_id: string }>(`SELECT owner_id FROM attachments WHERE id = $1`, [
      input.attachmentId,
    ]);
    if (!owner.rows[0]) throw attachmentNotFound(input.attachmentId);
    if (owner.rows[0].owner_id === input.granteeId) throw attachmentGrantToOwner();

    if (input.grantedBy && !(await this.mayReadWith(q, input.attachmentId, input.grantedBy))) {
      // 404, not 403: confirming the file exists is itself a disclosure.
      throw attachmentAccessDenied(input.attachmentId);
    }

    await q.query(
      `INSERT INTO attachment_grants (attachment_id, grantee_id, granted_by, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (attachment_id, grantee_id) WHERE revoked_at IS NULL DO NOTHING`,
      [input.attachmentId, input.granteeId, input.grantedBy ?? null, input.reason, input.expiresAt ?? null],
    );
  }

  async revoke(attachmentId: string, granteeId: string, revokedBy: string): Promise<void> {
    await this.pool.query(
      `UPDATE attachment_grants SET revoked_at = now()
        WHERE attachment_id = $1 AND grantee_id = $2 AND revoked_at IS NULL`,
      [attachmentId, granteeId],
    );
    await this.audit.record({
      actorId: revokedBy,
      action: 'attachment.access_revoked',
      subjectType: 'attachment',
      subjectId: attachmentId,
      detail: { granteeId },
    });
  }

  /** Owner, or a live unexpired grant. Nothing else — not even an admin role. */
  private async mayRead(attachmentId: string, viewerId: string): Promise<boolean> {
    return this.mayReadWith(this.pool, attachmentId, viewerId);
  }

  /**
   * The single predicate for "may this person read this file".
   *
   * One implementation on purpose: the read path and the share path must
   * agree about what access means, and two copies of this would
   * eventually disagree in the direction that grants too much.
   */
  private async mayReadWith(
    q: Pool | PoolClient,
    attachmentId: string,
    viewerId: string,
  ): Promise<boolean> {
    const res = await q.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM attachments a WHERE a.id = $1 AND a.owner_id = $2
         UNION ALL
         SELECT 1 FROM attachment_grants g
          WHERE g.attachment_id = $1 AND g.grantee_id = $2
            AND g.revoked_at IS NULL
            AND (g.expires_at IS NULL OR g.expires_at > now())
       ) AS allowed`,
      [attachmentId, viewerId],
    );
    return res.rows[0].allowed;
  }

  /**
   * Issues a five-minute link, bound to this viewer.
   *
   * The signature covers the viewer as well as the attachment and the
   * expiry, so forwarding the URL to somebody else hands them a link
   * that refuses them.
   */
  async signedUrlFor(attachmentId: string, viewer: { id: string; label: string }): Promise<SignedLink> {
    const attachment = await this.get(attachmentId);
    if (!(await this.mayRead(attachmentId, viewer.id))) throw attachmentAccessDenied(attachmentId);

    const expiresAtMs = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    const token = this.sign(attachmentId, viewer.id, expiresAtMs);

    await this.audit.record({
      actorId: viewer.id,
      action: 'attachment.link_issued',
      subjectType: 'attachment',
      subjectId: attachmentId,
      detail: { ownerId: attachment.ownerId, ttlSeconds: SIGNED_URL_TTL_SECONDS },
    });

    return {
      url: `/attachments/${attachmentId}/download?token=${token}`,
      expiresAt: new Date(expiresAtMs),
      watermark: `${viewer.label} · ${new Date().toISOString()}`,
    };
  }

  private sign(attachmentId: string, viewerId: string, expiresAtMs: number): string {
    const payload = `${attachmentId}.${viewerId}.${expiresAtMs}`;
    const mac = createHmac('sha256', this.signingKey()).update(payload).digest('base64url');
    return `${Buffer.from(payload, 'utf8').toString('base64url')}.${mac}`;
  }

  /**
   * Redeems a link.
   *
   * Verifies the signature over the raw bytes before trusting anything
   * in the payload, then re-checks the grant — a link issued five
   * minutes ago must not still work if access was revoked one minute
   * ago.
   */
  async resolveToken(attachmentId: string, token: string): Promise<{ attachment: AttachmentRow; bytes: Buffer; viewerId: string }> {
    const parts = token.split('.');
    if (parts.length !== 2) throw attachmentLinkInvalid();
    const [payloadB64, mac] = parts;

    let payload: string;
    try {
      payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    } catch {
      throw attachmentLinkInvalid();
    }

    const expected = createHmac('sha256', this.signingKey()).update(payload).digest('base64url');
    const givenBuf = Buffer.from(mac, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (givenBuf.length !== expectedBuf.length || !timingSafeEqual(givenBuf, expectedBuf)) {
      throw attachmentLinkInvalid();
    }

    const [signedAttachmentId, viewerId, expiresAtRaw] = payload.split('.');
    // The URL's own id must match the signed one, or a valid signature
    // for one document would serve another.
    if (signedAttachmentId !== attachmentId) throw attachmentLinkInvalid();

    const expiresAtMs = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) throw attachmentLinkExpired();

    if (!(await this.mayRead(attachmentId, viewerId))) throw attachmentAccessDenied(attachmentId);

    const attachment = await this.get(attachmentId);
    const bytes = await this.storage.get(
      (await this.pool.query<{ storage_key: string }>(`SELECT storage_key FROM attachments WHERE id = $1`, [attachmentId]))
        .rows[0].storage_key,
    );
    return { attachment, bytes, viewerId };
  }
}

/**
 * Per-process fallback signing key.
 *
 * Random on purpose. An unset `ATTACHMENT_SIGNING_KEY` in production
 * should mean links break on restart, which someone notices, rather than
 * links signed with a default that anyone reading this repository could
 * forge.
 */
const processFallbackKey = randomBytes(32);
