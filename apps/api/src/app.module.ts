import { Module } from '@nestjs/common';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { DbModule } from './database/db.module';
import { AdminModule } from './modules/admin/admin.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { BoardModule } from './modules/board/board.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { DomainsModule } from './modules/domains/domains.module';
import { EngagementsModule } from './modules/engagements/engagements.module';
import { MoneyModule } from './modules/money/money.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { SafetyModule } from './modules/safety/safety.module';
import { SessionsModule } from './modules/sessions/sessions.module';
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
    SessionsModule,
    SafetyModule,
    BoardModule,
    ReputationModule,
    DisputesModule,
  ],
})
export class AppModule {}
