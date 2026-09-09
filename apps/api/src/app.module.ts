import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from './common/audit/audit.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { AbsentAsNoContentInterceptor } from './common/serialization/absent.interceptor';
import { BigIntSerializerInterceptor } from './common/serialization/bigint.interceptor';
import { DbModule } from './database/db.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthGuard } from './modules/identity/auth.guard';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { BoardModule } from './modules/board/board.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { DomainsModule } from './modules/domains/domains.module';
import { EngagementsModule } from './modules/engagements/engagements.module';
import { MoneyModule } from './modules/money/money.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { SafetyModule } from './modules/safety/safety.module';
import { AgreementsModule } from './common/agreements/agreements.module';
import { StorageModule } from './common/storage/storage.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { VerificationModule } from './modules/verification/verification.module';

@Module({
  imports: [
    DbModule,
    IdempotencyModule,
    AuditModule,
    MoneyModule,
    DomainsModule,
    AdminModule,
    AgendaModule,
    EngagementsModule,
    AssessmentModule,
    VerificationModule,
    SessionsModule,
    SafetyModule,
    StorageModule,
    AgreementsModule,
    BoardModule,
    ReputationModule,
    DisputesModule,
    IdentityModule,
    NotificationsModule,
  ],
  providers: [
    // Authentication is the DEFAULT, opted out of per-route with
    // @Public(). The inverse — guarding routes one by one — fails open,
    // and the route someone forgets is the one that matters.
    { provide: APP_GUARD, useClass: AuthGuard },
    // Money is bigint paise everywhere; JSON.stringify throws on those.
    // Convert once at the boundary rather than per controller.
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
    // A GET whose honest answer is "nothing" replies 204, not an empty
    // 200 that no client can parse. See the interceptor for the crash
    // that prompted it.
    { provide: APP_INTERCEPTOR, useClass: AbsentAsNoContentInterceptor },
  ],
})
export class AppModule {}
