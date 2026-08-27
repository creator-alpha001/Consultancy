import { Module } from '@nestjs/common';

/**
 * Outbox relay, push, SMS, WhatsApp, email. M1 only writes to `outbox`
 * (see money module) — the relay worker that dispatches it is built here
 * in a later milestone.
 */
@Module({})
export class NotificationsModule {}
