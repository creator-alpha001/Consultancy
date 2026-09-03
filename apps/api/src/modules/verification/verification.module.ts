import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { DomainsModule } from '../domains/domains.module';
import { CredentialService } from './credential.service';
import { ProviderLanguageService } from './provider-language.service';
import { RatesService } from './rates.service';
import { ReadinessService } from './readiness.service';
import { TrainingService } from './training.service';
import { VerificationController } from './verification.controller';
import { MatchingService } from './matching.service';
import { DocumentReviewVerifier, SanctionDocumentVerifier } from './verifiers/manual-review.verifiers';
import { PublicResultListVerifier } from './verifiers/public-result-list.verifier';

/** Credential pipeline, verifiers, tiers. */
@Module({
  imports: [DomainsModule, AuditModule],
  controllers: [VerificationController],
  providers: [
    CredentialService,
    ProviderLanguageService,
    RatesService,
    ReadinessService,
    TrainingService,
    MatchingService,
    PublicResultListVerifier,
    DocumentReviewVerifier,
    SanctionDocumentVerifier,
  ],
  exports: [CredentialService,
    ProviderLanguageService, MatchingService, RatesService, ReadinessService, TrainingService],
})
export class VerificationModule {}
