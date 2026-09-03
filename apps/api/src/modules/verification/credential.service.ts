import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditService } from '../../common/audit/audit.service';
import { AttachmentService, SignedLink } from '../../common/storage/attachment.service';
import { PG_POOL } from '../../database/db.module';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { FamilyManifestService } from '../domains/family-manifest.service';
import {
  credentialHasNoDocument,
  credentialNotFound,
  credentialTypeNotFound,
  credentialWrongStatus,
  unknownSkillCodes,
  unknownVerifier,
} from './errors';
import { AutomatedCheckResult, ProviderCredentialRow, ProviderCredentialStatus, SubmitCredentialInput } from './types';
import { CredentialVerifier, VerifierInputField } from './verifiers/verifier.interface';
import { DocumentReviewVerifier, SanctionDocumentVerifier } from './verifiers/manual-review.verifiers';
import { PublicResultListVerifier } from './verifiers/public-result-list.verifier';
import { displayNameFor } from '../../common/display-name';

interface CredentialDbRow {
  id: string;
  provider_id: string;
  credential_type_id: string;
  domain_code: string;
  verifier_data: Record<string, unknown>;
  automated_check_result: AutomatedCheckResult | null;
  status: ProviderCredentialStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  decision_note: string;
}

/**
 * The pipeline SPEC-PLATFORM.md §11 describes: submit -> automated
 * checks -> human review -> tier assignment -> periodic recheck (recheck
 * is a later milestone — nothing here expires a verification yet).
 *
 * Tier assignment happens ONLY in `decide('verified')`, writing
 * provider_skills. An automated check result is stored and shown to the
 * reviewer; it never assigns a tier by itself, matching the same
 * caution CLAUDE.md applies to AI-drafted output elsewhere.
 */
@Injectable()
export class CredentialService {
  private readonly verifiers: Map<string, CredentialVerifier>;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(FamilyManifestService) private readonly families: FamilyManifestService,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
    @Inject(PublicResultListVerifier) publicResultList: PublicResultListVerifier,
    @Inject(DocumentReviewVerifier) documentReview: DocumentReviewVerifier,
    @Inject(SanctionDocumentVerifier) sanctionDocument: SanctionDocumentVerifier,
  ) {
    this.verifiers = new Map<string, CredentialVerifier>([
      [publicResultList.code, publicResultList],
      [documentReview.code, documentReview],
      [sanctionDocument.code, sanctionDocument],
    ]);
  }

  /**
   * What a provider can submit in this domain, and what each kind needs.
   *
   * Joins the family's declared credential types to the verifier that
   * will actually check them, so a form can be rendered without any
   * client knowing that a result-list credential needs a roll number.
   * Nothing about the verifier's internals is exposed and nothing about
   * what gets PUBLISHED is decided here — that is `publicFields`, and it
   * defaults to empty (CLAUDE.md #30).
   */
  async submittableTypes(domainCode: string): Promise<
    Array<{
      code: string;
      labels: Record<string, string>;
      verifier: string;
      inputs: VerifierInputField[];
      requiresPaidWorkSanction: boolean;
      grantsPaidWorkSanction: boolean;
    }>
  > {
    const domain = await this.loader.getDomain(domainCode);
    return domain.family.credentialTypes.map((c) => ({
      code: c.code,
      labels: c.labels,
      verifier: c.verifier,
      // A type naming a verifier nobody registered asks for nothing
      // rather than throwing: an unknown verifier is an ops problem, not
      // a reason a provider cannot see the rest of the list.
      inputs: this.verifiers.get(c.verifier)?.inputs ?? [],
      requiresPaidWorkSanction: c.requiresPaidWorkSanction ?? false,
      grantsPaidWorkSanction: c.grantsPaidWorkSanction ?? false,
    }));
  }

  async submit(input: SubmitCredentialInput): Promise<ProviderCredentialRow> {
    const domain = await this.loader.getDomain(input.domainCode);
    const credentialType = await this.families.getCredentialTypeByCode(domain.familyCode, input.credentialTypeCode);
    if (!credentialType) throw credentialTypeNotFound(input.credentialTypeCode);

    const skillIdByCode = await this.families.getSkillIdsByCode(domain.familyCode, input.skillCodes);
    const missing = input.skillCodes.filter((c) => !skillIdByCode.has(c));
    if (missing.length > 0) throw unknownSkillCodes(missing);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<CredentialDbRow>(
        `INSERT INTO provider_credentials (provider_id, credential_type_id, domain_code, verifier_data)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING *`,
        [input.providerId, credentialType.id, input.domainCode, JSON.stringify(input.verifierData)],
      );
      const credential = res.rows[0];

      for (const skillId of skillIdByCode.values()) {
        await client.query(
          `INSERT INTO provider_credential_skills (credential_id, skill_id) VALUES ($1, $2)`,
          [credential.id, skillId],
        );
      }

      await client.query('COMMIT');
      return this.hydrate(credential);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * SPEC-PLATFORM.md §11: a verified requires-sanction credential (in
   * the exam family, serving_officer) blocks paid work unless the
   * provider also holds a verified grants-sanction credential
   * (departmental_sanction) — see the `provider_paid_work_blocked` view.
   * Other modules call this rather than querying that view directly.
   */
  async isPaidWorkBlocked(providerId: string): Promise<boolean> {
    const res = await this.pool.query(`SELECT 1 FROM provider_paid_work_blocked WHERE provider_id = $1`, [providerId]);
    return (res.rowCount ?? 0) > 0;
  }

  async get(credentialId: string): Promise<ProviderCredentialRow> {
    const res = await this.pool.query<CredentialDbRow>(`SELECT * FROM provider_credentials WHERE id = $1`, [credentialId]);
    if (!res.rows[0]) throw credentialNotFound(credentialId);
    return this.hydrate(res.rows[0]);
  }

  /** A provider's own credentials — the conclusion of each review, never the evidence behind it (#30). */
  async listForProvider(providerId: string): Promise<ProviderCredentialRow[]> {
    const res = await this.pool.query<CredentialDbRow>(
      // submitted_at again — the second of two in this file. A sweep of
      // every ORDER BY created_at against the tables that have no such
      // column found exactly these two (D40).
      `SELECT * FROM provider_credentials WHERE provider_id = $1 ORDER BY submitted_at DESC`,
      [providerId],
    );
    return Promise.all(res.rows.map((row) => this.hydrate(row)));
  }

  /** The admin review queue: everything a human still has to decide. */
  /**
   * A five-minute link to the document backing a credential, for the
   * reviewer who is about to decide it.
   *
   * The grant is created here rather than at submission because there is
   * no "the reviewer" until someone picks the credential up — granting
   * the whole admin role in advance would be exactly the membership
   * shortcut #29 rules out. Every issue is audit-logged with the
   * reviewer, so "who looked at this person's identity document" is
   * answerable.
   *
   * Note what this does NOT change: the document never reaches a public
   * profile. #30's allow-list is a separate mechanism, defaulting to
   * empty, and nothing here widens it.
   */
  async reviewerDocumentLink(credentialId: string, reviewer: { id: string; label: string }): Promise<SignedLink> {
    const credential = await this.get(credentialId);
    const attachmentId = (credential.verifierData as Record<string, unknown> | null)?.attachmentId;
    if (typeof attachmentId !== 'string' || attachmentId === '') {
      throw credentialHasNoDocument(credentialId);
    }

    await this.attachments.grant({
      attachmentId,
      granteeId: reviewer.id,
      // The platform granted this as part of the review workflow — not a
      // person choosing to share their document with this reviewer.
      grantedBy: null,
      reason: `credential_review:${credentialId}`,
    });

    return this.attachments.signedUrlFor(attachmentId, reviewer);
  }

  async listAwaitingReview(): Promise<ProviderCredentialRow[]> {
    const res = await this.pool.query<CredentialDbRow>(
      // submitted_at, not created_at: this table has no created_at, and
      // ordering by it made the whole endpoint throw. It went unnoticed
      // because nothing called it — there was no review screen — and no
      // test exercised the ordering.
      `SELECT * FROM provider_credentials
        WHERE status IN ('submitted', 'under_review')
        ORDER BY submitted_at ASC`,
    );
    return Promise.all(res.rows.map((row) => this.hydrate(row)));
  }

  /**
   * The same queue, with what a review screen shows.
   *
   * Additive. Three of these were never projected even though the
   * columns exist, and that absence is why a review screen could only
   * have been built against fixtures:
   *
   *  - **`submittedAt`** — the column has always been there and this
   *    query already orders by it; it just never reached the client.
   *  - **`providerDisplayName`** — derived from the address, never the
   *    address (#29/#30). A reviewer needs to tell two people apart, not
   *    a route to email one.
   *  - **`familyCode`** — a queue mixing families must say which each row
   *    belongs to, or the tier names rendered against it are wrong.
   *
   * `verifier_data` is deliberately NOT widened. It points at the
   * evidence, and a queue lists what is waiting; seeing a document goes
   * through `/admin/credentials/:id/context`, which is the route that
   * grants and audits that access (#29).
   */
  async listAwaitingReviewWithContext(): Promise<
    Array<
      ProviderCredentialRow & {
        submittedAt: string;
        providerDisplayName: string;
        familyCode: string | null;
        credentialTypeCode: string | null;
        credentialTypeLabels: Record<string, string> | null;
      }
    >
  > {
    const res = await this.pool.query<
      CredentialDbRow & {
        submitted_at: Date;
        provider_email: string;
        family_code: string | null;
        credential_type_code: string | null;
        credential_type_labels: Record<string, string> | null;
      }
    >(
      `SELECT pc.*,
              u.email   AS provider_email,
              d.family_code,
              ct.code   AS credential_type_code,
              ct.labels AS credential_type_labels
         FROM provider_credentials pc
         JOIN users u ON u.id = pc.provider_id
         LEFT JOIN domains d ON d.code = pc.domain_code
         LEFT JOIN credential_types ct ON ct.id = pc.credential_type_id
        WHERE pc.status IN ('submitted', 'under_review')
        ORDER BY pc.submitted_at ASC`,
    );

    return Promise.all(
      res.rows.map(async (row) => ({
        ...(await this.hydrate(row)),
        submittedAt: row.submitted_at.toISOString(),
        providerDisplayName: displayNameFor(row.provider_email),
        familyCode: row.family_code,
        credentialTypeCode: row.credential_type_code,
        credentialTypeLabels: row.credential_type_labels,
      })),
    );
  }


  /**
   * What a reviewer should know before deciding.
   *
   * NOT document forensics. SPEC-PLATFORM §8.3 asks for metadata
   * analysis, template matching and reverse image search, and none of
   * that exists — building it needs services this platform does not have,
   * and pretending otherwise on a review screen would be worse than
   * admitting the gap.
   *
   * What a reviewer CAN have is context, and it is the half that catches
   * the common case anyway: someone submitting the same claim repeatedly
   * after a rejection, or a person with one accepted credential quietly
   * adding a stronger one. A reviewer looking at a document in isolation
   * cannot see either.
   *
   * `waitingHours` is here because the 48-hour SLA is a promise nobody
   * could keep track of: the queue was ordered by submission and showed
   * no ages, so "how late is this" had no answer on screen.
   */
  async reviewContext(credentialId: string): Promise<{
    waitingHours: number;
    providerHistory: Array<{
      credentialTypeCode: string;
      status: string;
      decidedAt: Date | null;
      note: string | null;
    }>;
    sameTypeRejectedBefore: number;
    hasDocument: boolean;
  }> {
    const base = await this.pool.query<{
      provider_id: string;
      credential_type_id: string;
      submitted_at: Date;
      verifier_data: Record<string, unknown> | null;
    }>(
      `SELECT provider_id, credential_type_id, submitted_at, verifier_data
         FROM provider_credentials WHERE id = $1`,
      [credentialId],
    );
    const row = base.rows[0];
    if (!row) throw credentialNotFound(credentialId);

    const history = await this.pool.query<{
      code: string;
      status: string;
      reviewed_at: Date | null;
      decision_note: string;
      is_same_type: boolean;
    }>(
      `SELECT ct.code, pc.status::text, pc.reviewed_at, pc.decision_note,
              (pc.credential_type_id = $2) AS is_same_type
         FROM provider_credentials pc
         JOIN credential_types ct ON ct.id = pc.credential_type_id
        WHERE pc.provider_id = $1 AND pc.id <> $3
        ORDER BY pc.submitted_at DESC`,
      [row.provider_id, row.credential_type_id, credentialId],
    );

    const attachmentId = row.verifier_data?.attachmentId;

    return {
      waitingHours: Math.floor((Date.now() - row.submitted_at.getTime()) / 3_600_000),
      providerHistory: history.rows.map((h) => ({
        credentialTypeCode: h.code,
        status: h.status,
        decidedAt: h.reviewed_at,
        note: h.decision_note || null,
      })),
      // The signal worth surfacing: a claim already refused once and sent
      // back in unchanged.
      sameTypeRejectedBefore: history.rows.filter((h) => h.is_same_type && h.status === 'rejected')
        .length,
      hasDocument: typeof attachmentId === 'string' && attachmentId.length > 0,
    };
  }

  /** Advisory only — always leaves the credential at 'under_review' for a human, whatever the result. */
  async runAutomatedCheck(credentialId: string): Promise<ProviderCredentialRow> {
    const res = await this.pool.query<CredentialDbRow & { verifier: string }>(
      `SELECT pc.*, ct.verifier
         FROM provider_credentials pc
         JOIN credential_types ct ON ct.id = pc.credential_type_id
        WHERE pc.id = $1`,
      [credentialId],
    );
    const row = res.rows[0];
    if (!row) throw credentialNotFound(credentialId);
    if (row.status !== 'submitted') throw credentialWrongStatus(credentialId, row.status, ['submitted']);

    const verifier = this.verifiers.get(row.verifier);
    if (!verifier) throw unknownVerifier(row.verifier);

    const result = await verifier.check({ domainCode: row.domain_code, verifierData: row.verifier_data });

    const updated = await this.pool.query<CredentialDbRow>(
      `UPDATE provider_credentials SET automated_check_result = $2::jsonb, status = 'under_review' WHERE id = $1 RETURNING *`,
      [credentialId, JSON.stringify(result)],
    );
    return this.hydrate(updated.rows[0]);
  }

  /**
   * The human ruling. Verifying grants tier on every skill the
   * credential was submitted for — never downgrading a tier a provider
   * already holds from an earlier, separate credential.
   */
  async decide(input: { credentialId: string; reviewerId: string; decision: 'verified' | 'rejected'; note?: string }): Promise<ProviderCredentialRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<CredentialDbRow>(
        `SELECT * FROM provider_credentials WHERE id = $1 FOR UPDATE`,
        [input.credentialId],
      );
      const credential = current.rows[0];
      if (!credential) throw credentialNotFound(input.credentialId);
      if (credential.status !== 'under_review') {
        throw credentialWrongStatus(input.credentialId, credential.status, ['under_review']);
      }

      const updated = await client.query<CredentialDbRow>(
        `UPDATE provider_credentials
            SET status = $2, reviewed_by = $3, reviewed_at = now(), decision_note = $4
          WHERE id = $1
          RETURNING *`,
        [input.credentialId, input.decision, input.reviewerId, input.note ?? ''],
      );

      if (input.decision === 'verified') {
        const typeRes = await client.query<{ min_tier_granted: string | null }>(
          `SELECT min_tier_granted FROM credential_types WHERE id = $1`,
          [credential.credential_type_id],
        );
        const tier = typeRes.rows[0]?.min_tier_granted;

        if (tier) {
          const skillsRes = await client.query<{ skill_id: string }>(
            `SELECT skill_id FROM provider_credential_skills WHERE credential_id = $1`,
            [input.credentialId],
          );
          for (const { skill_id: skillId } of skillsRes.rows) {
            await client.query(
              `INSERT INTO provider_skills (provider_id, skill_id, tier, verified_at, verified_by, credential_id, active)
               VALUES ($1, $2, $3, now(), $4, $5, true)
               ON CONFLICT (provider_id, skill_id) DO UPDATE
                 SET tier = GREATEST(provider_skills.tier, EXCLUDED.tier),
                     verified_at = now(), verified_by = EXCLUDED.verified_by,
                     credential_id = EXCLUDED.credential_id, active = true`,
              [credential.provider_id, skillId, tier, input.reviewerId, input.credentialId],
            );
          }
        }
      }

      // Inside the transaction: a verified credential and the record of
      // who verified it commit together or not at all. The tier this
      // grants is a claim the platform makes on someone's behalf, and
      // "who decided" is part of it (rule #14).
      await this.audit.recordIn(client, {
        actorId: input.reviewerId,
        actorRole: 'admin',
        action: `credential.${input.decision}`,
        subjectType: 'provider_credential',
        subjectId: input.credentialId,
        detail: {
          providerId: credential.provider_id,
          domainCode: credential.domain_code,
          note: input.note ?? '',
        },
      });

      await client.query('COMMIT');
      return this.hydrate(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async hydrate(row: CredentialDbRow): Promise<ProviderCredentialRow> {
    const skillsRes = await this.pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM provider_credential_skills WHERE credential_id = $1`,
      [row.id],
    );
    return {
      id: row.id,
      providerId: row.provider_id,
      credentialTypeId: row.credential_type_id,
      domainCode: row.domain_code,
      verifierData: row.verifier_data,
      automatedCheckResult: row.automated_check_result,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      decisionNote: row.decision_note,
      skillIds: skillsRes.rows.map((r) => r.skill_id),
    };
  }
}
