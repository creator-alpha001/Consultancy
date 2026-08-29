import { Controller, Inject, Post, Query } from '@nestjs/common';
import { Roles } from '../identity/auth.guard';
import { OutboxRelayService, RelayResult } from './outbox-relay.service';

/**
 * Running the relay on demand.
 *
 * Admin-only, and therefore 2FA-only (#32) — this instructs real money
 * movement at an aggregator.
 *
 * It exists for two reasons. Ops needs a way to push a batch through
 * after fixing whatever was making dispatch fail, without waiting for a
 * tick. And it makes the relay drivable in a test and in an environment
 * where no interval is configured, which is how it can be verified at
 * all rather than asserted about.
 *
 * Safe to call repeatedly: dispatch is idempotent per event, and a
 * concurrent tick claims different rows rather than the same ones.
 */
@Controller('admin/outbox')
@Roles('admin')
export class OutboxRelayController {
  constructor(@Inject(OutboxRelayService) private readonly relay: OutboxRelayService) {}

  @Post('relay')
  async relayNow(@Query('batchSize') batchSize?: string): Promise<RelayResult & { handles: string[] }> {
    const parsed = batchSize ? Number(batchSize) : undefined;
    const size = Number.isFinite(parsed) && parsed! > 0 ? Math.min(parsed!, 200) : undefined;
    const result = await this.relay.runOnce(size);
    return { ...result, handles: this.relay.handledEventTypes() };
  }
}
