import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { FeeScheduleService } from './fee-schedule.service';
import { LedgerAccountsService } from './ledger-accounts.service';
import { LedgerService } from './ledger.service';
import { AuditModule } from '../../common/audit/audit.module';
import { EarningsService } from './earnings.service';
import {
  MoneyController,
  PackagesController,
  ProviderMoneyController,
  SeekerMoneyController,
} from './money.controller';
import { PackageService } from './package.service';
import { PayoutDestinationService } from './payout-destination.service';
import { SettlementController } from './settlement.controller';
import { PayoutDispatchService } from './payout-dispatch.service';
import { SettlementService } from './settlement.service';
import { OutboxService } from './outbox.service';
import { CashfreeEasySplitSandbox } from './pa/cashfree-easy-split.sandbox';
import { PAYMENT_AGGREGATOR } from './pa/payment-aggregator.interface';
import { RazorpayRouteSandbox } from './pa/razorpay-route.sandbox';

/**
 * Only this module writes to ledger_*, escrows, payouts, refunds
 * (CLAUDE.md — "Only money/ writes to ledger_*, escrows, payouts,
 * refunds. Every other module calls it."). Everything exported here is
 * the surface other modules are meant to call.
 */
@Module({
  imports: [AuditModule],
  controllers: [
    MoneyController,
    ProviderMoneyController,
    SeekerMoneyController,
    PackagesController,
    SettlementController,
  ],
  providers: [
    LedgerAccountsService,
    LedgerService,
    FeeScheduleService,
    OutboxService,
    EscrowService,
    SettlementService,
    PayoutDispatchService,
    EarningsService,
    PayoutDestinationService,
    PackageService,
    RazorpayRouteSandbox,
    CashfreeEasySplitSandbox,
    {
      provide: PAYMENT_AGGREGATOR,
      useExisting: process.env.MONEY_PA_PROVIDER === 'cashfree_easy_split' ? CashfreeEasySplitSandbox : RazorpayRouteSandbox,
    },
  ],
  exports: [LedgerService, LedgerAccountsService, FeeScheduleService, OutboxService, EscrowService, SettlementService, PayoutDispatchService, PayoutDestinationService, EarningsService, PackageService],
})
export class MoneyModule {}
