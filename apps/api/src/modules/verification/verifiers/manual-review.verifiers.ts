import { Injectable } from '@nestjs/common';
import { AutomatedCheckResult } from '../types';
import { CredentialVerifier } from './verifier.interface';

/**
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

  async check(): Promise<AutomatedCheckResult> {
    return {
      verifier: this.code,
      passed: null,
      detail: { note: 'no automated check — requires a human to review the sanction document' },
    };
  }
}
