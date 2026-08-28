import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { FeeScheduleService } from './fee-schedule.service';
import { LedgerAccountsService } from './ledger-accounts.service';
import { LedgerService } from './ledger.service';
import { MoneyController } from './money.controller';
import { SettlementController } from './settlement.controller';
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
  controllers: [MoneyController, SettlementController],
  providers: [
    LedgerAccountsService,
    LedgerService,
    FeeScheduleService,
    OutboxService,
    EscrowService,
    SettlementService,
    RazorpayRouteSandbox,
    CashfreeEasySplitSandbox,
    {
      provide: PAYMENT_AGGREGATOR,
      useExisting: process.env.MONEY_PA_PROVIDER === 'cashfree_easy_split' ? CashfreeEasySplitSandbox : RazorpayRouteSandbox,
    },
  ],
  exports: [LedgerService, LedgerAccountsService, FeeScheduleService, OutboxService, EscrowService, SettlementService],
})
export class MoneyModule {}
