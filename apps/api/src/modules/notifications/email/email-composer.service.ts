import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../../database/db.module';
import { displayNameFor } from '../../../common/display-name';
import { AccountTokenPurpose, deriveAccountToken } from '../../identity/account-token';
import { EmailKey, publicWebUrl, renderEmail } from './catalogue';
import { EmailMessage } from './email-transport';

/** The outbox event types that become emails, and nothing else. */
export const EMAIL_EVENTS = [
  'identity.password_reset',
  'identity.email_verification',
  'verification.decided',
] as const;
export type EmailEvent = (typeof EMAIL_EVENTS)[number];

export interface OutboxEmailRow {
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}

/** Thrown for a row that should not be retried — nothing to send, and never will be. */
export class NothingToSend extends Error {}

/**
 * Turns an outbox row into an email, at SEND time.
 *
 * Composed late on purpose. The link in a reset email is derived from
 * the token row's id and a server secret right here, so no working link
 * was ever written to the database. And the recipient's address and
 * language are read now, so a changed language setting is respected.
 *
 * Read-only: this reads users, tokens and credentials, and writes
 * nothing. The relay records delivery.
 */
@Injectable()
export class EmailComposerService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async compose(row: OutboxEmailRow): Promise<EmailMessage> {
    switch (row.event_type as EmailEvent) {
      case 'identity.password_reset':
        return this.accountLink(row.aggregate_id, 'password_reset', 'reset-password');
      case 'identity.email_verification':
        return this.accountLink(row.aggregate_id, 'email_verification', 'verify-email');
      case 'verification.decided':
        return this.credentialDecision(row.aggregate_id);
      default:
        throw new NothingToSend(`no email for ${row.event_type}`);
    }
  }

  private async accountLink(tokenId: string, purpose: AccountTokenPurpose, page: string): Promise<EmailMessage> {
    const res = await this.pool.query<{
      email: string;
      display_name: string | null;
      preferred_lang: string;
      live: boolean;
    }>(
      `SELECT u.email, u.display_name, u.preferred_lang,
              (t.used_at IS NULL AND t.expires_at > now()) AS live
         FROM account_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.id = $1 AND t.purpose = $2::account_token_purpose`,
      [tokenId, purpose],
    );
    const r = res.rows[0];
    // A link that was superseded, used, or has expired while the email
    // waited is not sent: it would arrive dead.
    if (!r || !r.live) throw new NothingToSend(`token ${tokenId} is no longer usable`);

    // In the fragment, not the query string: a fragment is never sent to
    // a server, so the token stays out of access logs and Referer headers.
    const link = `${publicWebUrl()}/${page}#token=${deriveAccountToken(purpose, tokenId)}`;
    const key: EmailKey = purpose;
    const { subject, text } = renderEmail(key, r.preferred_lang, {
      name: displayNameFor(r.email, r.display_name),
      link,
    });
    return { to: r.email, subject, text, sensitive: true };
  }

  private async credentialDecision(credentialId: string): Promise<EmailMessage> {
    const res = await this.pool.query<{
      email: string;
      display_name: string | null;
      preferred_lang: string;
      status: string;
      decision_note: string | null;
    }>(
      `SELECT u.email, u.display_name, u.preferred_lang, pc.status::text AS status, pc.decision_note
         FROM provider_credentials pc JOIN users u ON u.id = pc.provider_id
        WHERE pc.id = $1`,
      [credentialId],
    );
    const r = res.rows[0];
    if (!r || (r.status !== 'verified' && r.status !== 'rejected')) {
      throw new NothingToSend(`credential ${credentialId} has no decision to report`);
    }
    const key: EmailKey = r.status === 'verified' ? 'credential_verified' : 'credential_rejected';
    const { subject, text } = renderEmail(key, r.preferred_lang, {
      name: displayNameFor(r.email, r.display_name),
      link: `${publicWebUrl()}/provider/readiness`,
      note: r.decision_note?.trim() || '—',
    });
    return { to: r.email, subject, text, sensitive: false };
  }
}
