import { Module } from '@nestjs/common';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { DbModule } from './database/db.module';
import { AdminModule } from './modules/admin/admin.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { DomainsModule } from './modules/domains/domains.module';
import { EngagementsModule } from './modules/engagements/engagements.module';
import { MoneyModule } from './modules/money/money.module';
import { VerificationModule } from './modules/verification/verification.module';

@Module({
  imports: [
    DbModule,
    IdempotencyModule,
    MoneyModule,
    DomainsModule,
    AdminModule,
    AgendaModule,
    EngagementsModule,
    AssessmentModule,
    VerificationModule,
  ],
})
export class AppModule {}
