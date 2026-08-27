import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { CredentialService } from './credential.service';
import { MatchingService } from './matching.service';
import { DocumentReviewVerifier, SanctionDocumentVerifier } from './verifiers/manual-review.verifiers';
import { PublicResultListVerifier } from './verifiers/public-result-list.verifier';

/** Credential pipeline, verifiers, tiers. */
@Module({
  imports: [DomainsModule],
  providers: [
    CredentialService,
    MatchingService,
    PublicResultListVerifier,
    DocumentReviewVerifier,
    SanctionDocumentVerifier,
  ],
  exports: [CredentialService, MatchingService],
})
export class VerificationModule {}
