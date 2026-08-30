import { Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../identity/auth.guard';
import { paWebhookMalformed } from './errors';
import { SettlementService, WebhookResult } from './settlement.service';

/**
 * The payment aggregator's settlement callback (TRACKER.md D4).
 *
 * `@Public()` because the caller is Razorpay/Cashfree, not a user — it
 * holds no session and never will. That makes the HMAC signature the
 * only authentication this route has, which is why `SettlementService`
 * verifies it before looking at the body at all.
 *
 * Deliberately NOT behind `IdempotencyInterceptor`: that enforces a
 * header WE require of OUR clients, scoped to an authenticated actor,
 * and there is no actor here. Replay safety comes instead from the
 * aggregator's own event id, unique in `pa_webhook_events`.
 */
@Controller('webhooks/payment-aggregator')
export class SettlementController {
  constructor(@Inject(SettlementService) private readonly settlement: SettlementService) {}

  @Post()
  @Public()
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-pa-signature') signature?: string,
  ): Promise<WebhookResult> {
    // Signature is over the bytes as sent; a re-serialised req.body is a
    // different string and would never verify.
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw paWebhookMalformed('raw request body was not captured');
    }
    return this.settlement.handleWebhook({ rawBody, signature: signature ?? null });
  }
}
