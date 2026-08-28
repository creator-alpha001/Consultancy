import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Roles } from '../identity/auth.guard';
import { ReconciliationReport, ReconciliationService } from './reconciliation.service';

/**
 * The ops surface for M9's reconciliation. Admin-only, and therefore
 * 2FA-only (#32) — this exposes the shape of the platform's money.
 *
 * Read-only by design: there is no "fix it" endpoint. A correction to a
 * money table is a reversing entry made by a human who has understood
 * what happened, not a button.
 */
@Controller('admin/reconciliation')
@Roles('admin')
export class ReconciliationController {
  constructor(@Inject(ReconciliationService) private readonly reconciliation: ReconciliationService) {}

  @Get()
  async run(@Query('staleAfterHours') staleAfterHours?: string): Promise<ReconciliationReport> {
    const parsed = staleAfterHours ? Number(staleAfterHours) : undefined;
    return this.reconciliation.run({
      staleAfterHours: Number.isFinite(parsed) && parsed! > 0 ? parsed : undefined,
    });
  }
}
