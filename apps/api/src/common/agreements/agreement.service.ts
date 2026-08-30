import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AppError } from '../errors/app-error';
import { HttpStatus } from '@nestjs/common';
import { DomainLoaderService } from '../../modules/domains/domain-loader.service';

export interface AgreementRecord {
  id: string;
  documentCode: string;
  documentVersion: string;
  textShown: string;
  lang: string;
  subjectType: string | null;
  subjectId: string | null;
  acceptedAt: Date;
}

export function agreementDocumentNotFound(familyCode: string, code: string): AppError {
  return new AppError(
    'AGREEMENT_DOCUMENT_NOT_FOUND',
    `family ${familyCode} declares no agreement document "${code}"`,
    { status: HttpStatus.BAD_REQUEST, detail: { familyCode, code } },
  );
}

/**
 * What people agreed to, and in what words.
 *
 * The platform asks for agreement in several places. Before this, two of
 * them stored a bare timestamp — a boolean saying somebody agreed, with
 * no record of what the screen said at the time. That is worth nothing
 * the moment the wording is revised, which is exactly when it is asked
 * about.
 *
 * So an acceptance stores **the full text that was on the screen**, its
 * hash, its version, and the language it was read in. Not a reference to
 * a document that can later be edited: "you accepted v1" is only
 * evidence if v1 is still what it was, and a hash alone cannot be read
 * back to a person in a dispute.
 *
 * The wording itself lives in the family pack, so revising it is a
 * business and legal act rather than a deploy.
 */
@Injectable()
export class AgreementService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
  ) {}

  /** The text a person is about to be shown, in their language. */
  async documentFor(
    familyCode: string,
    code: string,
    lang: string,
  ): Promise<{ code: string; version: string; text: string; lang: string }> {
    const family = await this.loader.getFamily(familyCode);
    const doc = family.agreementDocuments.find((d) => d.code === code);
    if (!doc) throw agreementDocumentNotFound(familyCode, code);
    // Falls back to English rather than failing: being shown the
    // agreement in a second language is worse than not being shown it,
    // and the language actually read is recorded either way.
    const text = doc.text[lang] ?? doc.text.en ?? Object.values(doc.text)[0];
    const usedLang = doc.text[lang] !== undefined ? lang : doc.text.en !== undefined ? 'en' : Object.keys(doc.text)[0];
    return { code: doc.code, version: doc.version, text, lang: usedLang };
  }

  /**
   * Records an acceptance.
   *
   * The text is resolved here, from the pack, rather than taken from the
   * caller — a client that supplied the wording it claims to have shown
   * could claim anything (#28 applied to consent rather than identity).
   */
  async accept(
    input: {
      userId: string;
      familyCode: string;
      documentCode: string;
      lang: string;
      subjectType?: string | null;
      subjectId?: string | null;
      ipPrefix?: string | null;
    },
    client?: PoolClient,
  ): Promise<AgreementRecord> {
    const doc = await this.documentFor(input.familyCode, input.documentCode, input.lang);
    const hash = createHash('sha256').update(`${doc.code}\n${doc.version}\n${doc.lang}\n${doc.text}`).digest('hex');

    const q = client ?? this.pool;
    const res = await q.query<{
      id: string;
      document_code: string;
      document_version: string;
      text_shown: string;
      lang: string;
      subject_type: string | null;
      subject_id: string | null;
      accepted_at: Date;
    }>(
      `INSERT INTO agreements
         (user_id, document_code, document_version, text_shown, text_hash, lang, subject_type, subject_id, ip_prefix)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.userId,
        doc.code,
        doc.version,
        doc.text,
        hash,
        doc.lang,
        input.subjectType ?? null,
        input.subjectId ?? null,
        input.ipPrefix ?? null,
      ],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      documentCode: row.document_code,
      documentVersion: row.document_version,
      textShown: row.text_shown,
      lang: row.lang,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      acceptedAt: row.accepted_at,
    };
  }

  /**
   * Everything this person has agreed to.
   *
   * Scoped to the caller and readable by them: someone should be able to
   * see what they signed up to, in the words they were shown, without
   * asking anyone.
   */
  async listFor(userId: string): Promise<AgreementRecord[]> {
    const res = await this.pool.query<{
      id: string;
      document_code: string;
      document_version: string;
      text_shown: string;
      lang: string;
      subject_type: string | null;
      subject_id: string | null;
      accepted_at: Date;
    }>(`SELECT * FROM agreements WHERE user_id = $1 ORDER BY accepted_at DESC`, [userId]);
    return res.rows.map((row) => ({
      id: row.id,
      documentCode: row.document_code,
      documentVersion: row.document_version,
      textShown: row.text_shown,
      lang: row.lang,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      acceptedAt: row.accepted_at,
    }));
  }
}
