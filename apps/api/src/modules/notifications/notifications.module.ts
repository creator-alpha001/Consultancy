import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { OutboxRelayController } from './outbox-relay.controller';
import { OutboxRelayScheduler } from './outbox-relay.scheduler';
import { OutboxRelayService } from './outbox-relay.service';
import { EmailComposerService } from './email/email-composer.service';
import { EMAIL_TRANSPORT, emailTransportFromEnv } from './email/email-transport';

/**
 * Outbox relay, push, SMS, WhatsApp, email.
 *
 * The relay is built, and so is email (Amazon SES, or a logging
 * transport in development). Push, SMS and WhatsApp are not: `escrow.held` and the
 * settlement notifications still have nowhere to go, so the relay leaves
 * them pending rather than marking them delivered, and reconciliation
 * reports them (D14).
 *
 * It imports MoneyModule rather than touching `payouts` itself — only
 * money/ writes to the money tables.
 */
@Module({
  imports: [MoneyModule],
  controllers: [OutboxRelayController],
  providers: [
    OutboxRelayService,
    OutboxRelayScheduler,
    EmailComposerService,
    { provide: EMAIL_TRANSPORT, useFactory: emailTransportFromEnv },
  ],
  exports: [OutboxRelayService, EMAIL_TRANSPORT],
})
export class NotificationsModule {}
