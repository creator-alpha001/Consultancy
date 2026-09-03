import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Post, UseInterceptors } from '@nestjs/common';
import { CurrentActor } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import {
  EarningsLine,
  EarningsService,
  EarningsSummary,
  SeekerMoney,
  SeekerMoneyLine,
} from './earnings.service';
import { PackagePurchase, PackageService, ProviderPackage } from './package.service';
import { PayoutDestination, PayoutDestinationService } from './payout-destination.service';
import { EscrowService } from './escrow.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { Roles } from '../identity/auth.guard';
import { EscrowRow } from './types';

/**
 * Internal/ops-triggered endpoints for M1. In the real product, holding
 * an escrow happens as part of awarding a proposal (engagements/ +
 * agenda/, both M3) and release happens on engagement completion — this
 * controller exists so the money spine has an exercisable HTTP surface
 * (and a real Idempotency-Key test) before that lifecycle exists.
 * Expect it to be superseded, not extended, once M3 lands.
 *
 * Admin-only, and therefore 2FA-only (#32). These routes move real money
 * on someone else's behalf; before identity/ existed they were reachable
 * by anyone who could set a header.
 */
@Controller('internal/escrows')
@Roles('admin')
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

  /**
   * Separate from /refund on purpose: this one also pays the provider
   * from reserve (CLAUDE.md #23). Keeping it a distinct route means
   * "the platform broke" can never be actioned by accident as an
   * ordinary refund, which would silently cost the provider their fee.
   */
  @Post(':escrowId/platform-failure')
  @UseInterceptors(IdempotencyInterceptor)
  async platformFailure(
    @Param('escrowId') escrowId: string,
    @Body() body: { failureDetail?: string; bankAccountLast4?: string; bankIfsc?: string },
  ): Promise<SerializedEscrow> {
    if (!body.failureDetail) throw new BadRequestException('failureDetail is required');
    const escrow = await this.escrows.resolvePlatformFailure({
      escrowId,
      idempotencyKey: `platform-failure:${escrowId}`,
      failureDetail: body.failureDetail,
      bankAccountLast4: body.bankAccountLast4,
      bankIfsc: body.bankIfsc,
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

/**
 * A provider's own money: what they have earned, and where it goes.
 *
 * Every route is scoped to the caller and takes no provider id — there is
 * no way to ask this controller about anyone else's earnings (#28). That
 * is why it is a separate class from `MoneyController`, which is
 * `@Roles('admin')` at class level: one file, two visibilities, and no
 * route that inherits the wrong default.
 */
@Controller('me')
export class ProviderMoneyController {
  constructor(
    @Inject(EarningsService) private readonly earnings: EarningsService,
    @Inject(PayoutDestinationService) private readonly destinations: PayoutDestinationService,
  ) {}

  @Get('earnings')
  @Roles('provider')
  async summary(@CurrentActor() actor: Actor): Promise<{
    summary: EarningsSummary;
    lines: EarningsLine[];
    destination: PayoutDestination | null;
  }> {
    const [summary, lines, destination] = await Promise.all([
      this.earnings.summary(actor.userId),
      this.earnings.lines(actor.userId),
      this.destinations.get(actor.userId),
    ]);
    return { summary, lines, destination };
  }

  @Get('payout-destination')
  @Roles('provider')
  async destination(@CurrentActor() actor: Actor): Promise<PayoutDestination | null> {
    return this.destinations.get(actor.userId);
  }

  /**
   * Set where payouts go.
   *
   * `accountNumber` is the one field on this platform that is accepted and
   * never stored — it is exchanged with the aggregator for a token. See
   * PayoutDestinationService.
   */
  @Post('payout-destination')
  @Roles('provider')
  async setDestination(
    @CurrentActor() actor: Actor,
    @Body() body: { accountHolderName?: string; accountNumber?: string; ifsc?: string },
  ): Promise<PayoutDestination> {
    if (!body.accountHolderName || !body.accountNumber || !body.ifsc) {
      throw new BadRequestException('accountHolderName, accountNumber and ifsc are all required');
    }
    return this.destinations.set({
      providerId: actor.userId,
      accountHolderName: body.accountHolderName,
      accountNumber: body.accountNumber,
      ifsc: body.ifsc,
    });
  }
}

/**
 * Packages — several sessions bought at once.
 *
 * Publishing is the provider's; buying and listing what you own is the
 * seeker's. Split by role at the route rather than branching inside one
 * handler, so no route inherits a visibility it did not ask for.
 */
@Controller()
export class PackagesController {
  constructor(@Inject(PackageService) private readonly packages: PackageService) {}

  @Get('me/packages')
  @Roles('provider')
  async mine(@CurrentActor() actor: Actor): Promise<ProviderPackage[]> {
    return this.packages.listForProvider(actor.userId);
  }

  @Post('me/packages')
  @Roles('provider')
  async publish(
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      engagementType?: string;
      skillId?: string | null;
      title?: string;
      sessionCount?: number;
      amountPaise?: string;
      commitment?: number | null;
    },
  ): Promise<ProviderPackage> {
    if (!body.engagementType) throw new BadRequestException('engagementType is required');
    if (!body.title) throw new BadRequestException('title is required');
    if (!body.sessionCount) throw new BadRequestException('sessionCount is required');
    if (!body.amountPaise) throw new BadRequestException('amountPaise is required');
    return this.packages.publish({
      providerId: actor.userId,
      engagementType: body.engagementType,
      skillId: body.skillId ?? null,
      title: body.title,
      sessionCount: body.sessionCount,
      amountPaise: body.amountPaise,
      commitment: body.commitment ?? null,
    });
  }

  @Post('me/packages/:id/withdraw')
  @Roles('provider')
  async withdraw(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<{ ok: true }> {
    await this.packages.withdraw(actor.userId, id);
    return { ok: true };
  }

  /** What this seeker has bought, and how many sessions are left on each. */
  @Get('me/package-purchases')
  @Roles('seeker')
  async purchases(@CurrentActor() actor: Actor): Promise<PackagePurchase[]> {
    return this.packages.purchasesFor(actor.userId);
  }

  /**
   * Buy a package.
   *
   * One capture into the seeker's wallet. Nothing is escrowed here —
   * escrow is per session, held when each is drawn, because escrow means
   * "held against agreed goals" and no goals exist for session four yet.
   */
  @Post('packages/:id/purchase')
  @Roles('seeker')
  @UseInterceptors(IdempotencyInterceptor)
  async purchase(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<PackagePurchase> {
    return this.packages.purchase({ packageId: id, seekerId: actor.userId, idempotencyKey });
  }
}

/**
 * A seeker's own money.
 *
 * Scoped to the caller, with no user id in any route (#28). Split from
 * ProviderMoneyController because the two answer different questions —
 * "what am I owed" against "what have I got left" — and a single
 * controller branching on role is one missing branch away from answering
 * the wrong one.
 */
@Controller('me')
export class SeekerMoneyController {
  constructor(
    @Inject(EarningsService) private readonly earnings: EarningsService,
    @Inject(PackageService) private readonly packages: PackageService,
  ) {}

  @Get('money')
  @Roles('seeker')
  async summary(@CurrentActor() actor: Actor): Promise<{
    summary: SeekerMoney;
    lines: SeekerMoneyLine[];
    packages: PackagePurchase[];
  }> {
    const [summary, lines, packages] = await Promise.all([
      this.earnings.seekerSummary(actor.userId),
      this.earnings.seekerLines(actor.userId),
      this.packages.purchasesFor(actor.userId),
    ]);
    return { summary, lines, packages };
  }
}
