import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { EngagementsModule } from '../engagements/engagements.module';
import { AssessmentController } from './assessment.controller';
import { EvaluationService } from './evaluation.service';
import { ProgressService } from './progress.service';
import { SubmissionService } from './submission.service';

/** Templates (defined in domains/), submissions, annotations, scores. */
@Module({
  imports: [DomainsModule, EngagementsModule],
  controllers: [AssessmentController],
  providers: [SubmissionService, EvaluationService, ProgressService],
  exports: [SubmissionService, EvaluationService, ProgressService],
})
export class AssessmentModule {}
