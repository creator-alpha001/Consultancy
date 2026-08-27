import { Module } from '@nestjs/common';
import { ScreeningService } from './screening.service';

/**
 * Reports, distress escalation, contact-leak detection. Only screening
 * exists so far (M6, as board/'s dependency); the escalation-queue
 * workflow and reports table are not built — see TRACKER.md.
 */
@Module({
  providers: [ScreeningService],
  exports: [ScreeningService],
})
export class SafetyModule {}
