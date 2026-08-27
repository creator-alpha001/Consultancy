import { BadRequestException, Body, Controller, Inject, Param, Post, UseInterceptors } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { EscrowRow } from './types';

/**
 * Internal/ops-triggered endpoints for M1. In the real product, holding
 * an escrow happens as part of awarding a proposal (engagements/ +
 * agenda/, both M3) and release happens on engagement completion — this
 * controller exists so the money spine has an exercisable HTTP surface
 * (and a real Idempotency-Key test) before that lifecycle exists.
 * Expect it to be superseded, not extended, once M3 lands.
 */
@Controller('internal/escrows')
export class MoneyController {
  constructor(@Inject(EscrowService) private readonly escrows: EscrowService) {}

  @Post(':engagementId/hold')
  @UseInterceptors(IdempotencyInterceptor)
  async hold(
    @Param('engagementId') engagementId: string,
    @Body() body: { seekerId?: string; providerId?: string; currency?: string; amountPaise?: number },
  ): Promise<SerializedEscrow> {
    const { seekerId, providerId, currency, amountPaise } = requireHoldBody(body);
    const escrow = await this.escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency,
      amountPaise: BigInt(amountPaise),
      idempotencyKey: `hold:${engagementId}`,
    });
    return serializeEscrow(escrow);
  }

  @Post(':escrowId/release')
  @UseInterceptors(IdempotencyInterceptor)
  async release(
    @Param('escrowId') escrowId: string,
    @Body() body: { bankAccountLast4?: string; bankIfsc?: string },
  ): Promise<SerializedEscrow> {
    const escrow = await this.escrows.release({
      escrowId,
      idempotencyKey: `release:${escrowId}`,
      bankAccountLast4: body.bankAccountLast4,
      bankIfsc: body.bankIfsc,
    });
    return serializeEscrow(escrow);
  }

  @Post(':escrowId/refund')
  @UseInterceptors(IdempotencyInterceptor)
  async refund(
    @Param('escrowId') escrowId: string,
    @Body() body: { reason?: string },
  ): Promise<SerializedEscrow> {
    if (!body.reason) throw new BadRequestException('reason is required');
    const escrow = await this.escrows.refund({
      escrowId,
      idempotencyKey: `refund:${escrowId}`,
      reason: body.reason,
    });
    return serializeEscrow(escrow);
  }
}

function requireHoldBody(body: {
  seekerId?: string;
  providerId?: string;
  currency?: string;
  amountPaise?: number;
}): { seekerId: string; providerId: string; currency: string; amountPaise: number } {
  const { seekerId, providerId, currency, amountPaise } = body;
  if (!seekerId || !providerId || !currency) {
    throw new BadRequestException('seekerId, providerId and currency are required');
  }
  if (typeof amountPaise !== 'number' || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new BadRequestException('amountPaise must be a positive integer number of paise');
  }
  return { seekerId, providerId, currency, amountPaise };
}

type SerializedEscrow = Omit<EscrowRow, 'amountPaise' | 'platformFeePaise'> & {
  amountPaise: string;
  platformFeePaise: string | null;
};

function serializeEscrow(escrow: EscrowRow): SerializedEscrow {
  return {
    ...escrow,
    amountPaise: escrow.amountPaise.toString(),
    platformFeePaise: escrow.platformFeePaise === null ? null : escrow.platformFeePaise.toString(),
  };
}
