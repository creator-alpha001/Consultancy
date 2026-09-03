import { Injectable } from '@nestjs/common';
import { AutomatedCheckResult } from '../types';
import { CredentialVerifier } from './verifier.interface';

/**
 * The declared input key is `attachmentId`, and that is not cosmetic.
 * `reviewerDocumentLink` reads `verifierData.attachmentId` to mint the
 * reviewer's signed link — so while these verifiers asked for
 * `documentRef`, a credential submitted through the real form produced a
 * field the reviewer could never open, and every document that DID work
 * had been written by the seed under the other name. The form and the
 * reader now name the same thing.
 *
 * `documentRef` was an honest name while it held free text. It holds an
 * attachment id now, and a name that describes the old shape is worse
 * than no name.
 *
 * `document_review` and `sanction_document` (SPEC-PLATFORM.md §11) have
 * no automation — a marksheet or a sanction letter needs a human to
 * actually look at it. `passed: null` is not a failure, it's "there is
 * nothing to automate here"; CredentialService always routes to human
 * review regardless, so this only exists to make that explicit rather
 * than silently skip the automated-check step.
 */
@Injectable()
export class DocumentReviewVerifier implements CredentialVerifier {
  readonly code = 'document_review';
  readonly inputs = [{ key: 'attachmentId', kind: 'document' as const, required: true }];

  async check(): Promise<AutomatedCheckResult> {
    return {
      verifier: this.code,
      passed: null,
      detail: { note: 'no automated check — requires a human to review the uploaded document' },
    };
  }
}

@Injectable()
export class SanctionDocumentVerifier implements CredentialVerifier {
  readonly code = 'sanction_document';
  readonly inputs = [{ key: 'attachmentId', kind: 'document' as const, required: true }];

  async check(): Promise<AutomatedCheckResult> {
    return {
      verifier: this.code,
      passed: null,
      detail: { note: 'no automated check — requires a human to review the sanction document' },
    };
  }
}
