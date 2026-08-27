import { Module } from '@nestjs/common';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { DbModule } from './database/db.module';
import { AdminModule } from './modules/admin/admin.module';
import { DomainsModule } from './modules/domains/domains.module';
import { MoneyModule } from './modules/money/money.module';

@Module({
  imports: [DbModule, IdempotencyModule, MoneyModule, DomainsModule, AdminModule],
})
export class AppModule {}
