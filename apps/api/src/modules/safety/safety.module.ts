import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { ReportService } from './report.service';
import { ReportsController } from './reports.controller';
import { ScreeningService } from './screening.service';

/**
 * Reports, distress escalation, contact-leak detection — the three
 * things CLAUDE.md scopes this module to.
 *
 * Screening (the classifier's hold on the way in) and reporting (a
 * person deciding for themselves that something is wrong) are two
 * directions onto the same held state, which is why a reported question
 * reuses `held_for_review` rather than getting a second vocabulary.
 */
@Module({
  imports: [DomainsModule],
  controllers: [ReportsController],
  providers: [ScreeningService, ReportService],
  exports: [ScreeningService, ReportService],
})
export class SafetyModule {}
