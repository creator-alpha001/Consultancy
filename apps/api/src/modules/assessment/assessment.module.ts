import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { EvaluationService } from './evaluation.service';
import { SubmissionService } from './submission.service';

/** Templates (defined in domains/), submissions, annotations, scores. */
@Module({
  imports: [DomainsModule],
  providers: [SubmissionService, EvaluationService],
  exports: [SubmissionService, EvaluationService],
})
export class AssessmentModule {}
