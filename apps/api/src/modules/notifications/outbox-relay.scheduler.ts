import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';

/**
 * Ticks the relay.
 *
 * Deliberately the simplest thing that makes money actually move: an
 * interval, off unless `OUTBOX_RELAY_INTERVAL_MS` is set. The stack
 * calls for Redis + BullMQ and that worker is still unbuilt (D14/D23) —
 * this is not a substitute for it, and it is separate from the relay so
 * that swapping in a real worker changes nothing about how dispatch
 * behaves.
 *
 * What it does get right, because these bite immediately: ticks never
 * overlap (a slow batch is not joined by the next one), and a thrown
 * batch is logged rather than left as an unhandled rejection that takes
 * the process down.
 */
@Injectable()
export class OutboxRelayScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxRelayScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly relay: OutboxRelayService) {}

  onModuleInit(): void {
    const raw = process.env.OUTBOX_RELAY_INTERVAL_MS;
    const interval = raw ? Number(raw) : 0;
    if (!Number.isFinite(interval) || interval <= 0) {
      this.log.log('outbox relay interval not set — dispatch only via POST /admin/outbox/relay');
      return;
    }
    this.timer = setInterval(() => void this.tick(), interval);
    // Never hold the process open for a background poll.
    this.timer.unref?.();
    this.log.log(`outbox relay ticking every ${interval}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.relay.runOnce();
      if (result.claimed > 0) {
        this.log.log(
          `relay: claimed ${result.claimed}, dispatched ${result.dispatched}, failed ${result.failed}, dead-lettered ${result.deadLettered}`,
        );
      }
    } catch (err) {
      this.log.error(`relay tick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
